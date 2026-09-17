// netlify/functions/room.mjs — 联机房间状态中转（方案①：HTTP 状态中转，无长连接）
//
// 设计要点（对应可行性分析的风险对策）：
//   · 藏点真相只在服务端：找家的客户端永远收不到 hides[]，只能逐槽位问"这里有没有"；
//   · 计时在服务端：start_seek 时写死 deadline，客户端改内存改不了截止时间；
//   · 房间 24h TTL 自动清理；创建接口做每 IP 小时级频率限制（尽力而为）；
//   · 不做任何服务端 URL 抓取（无 SSRF 面）；所有输入做 schema/长度/大小校验。
//
// action:
//   create     {hides:[{pieceId,slotKey,itemId}], seekTime}  → {code}
//   start_seek {code}        → {deadline, seekTime, total}    （藏点不下发！）
//   check      {code, pieceId, slotKey} → {hit, itemId?, done?, expired?}
//   status     {code}       → {state, total, foundCount, deadline?, hides?, foundKeys?}
//                               （state=done 时才下发完整 hides 用于结算揭示）
import { getStore } from '@netlify/blobs';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // 去掉易混的 I/O/0/1
const CODE_LEN = 6;
const ROOM_TTL = 86400;          // 秒：房间 24 小时自动过期
const MAX_HIDE = 8;
const SEEK_MAX = 1800;           // 秒：搜索时长上限 30 分钟
const ID_RE = /^[a-zA-Z0-9_]{1,48}$/;
const SLOT_RE = /^[a-z0-9_:]{1,48}$/;

// ---- 存储适配：生产用 Netlify Blobs；本地 dev 若 Blobs 环境不可用则降级进程内存 ----
// （内存模式重启 dev 即清空，仅够联调；线上 Blobs 不受影响）
const memRooms = new Map();
function memoryStore() {
  const sweep = () => {
    const cut = Date.now() - ROOM_TTL * 1000;
    for (const [k, v] of memRooms) if ((v.createdAt || 0) < cut) memRooms.delete(k);
  };
  return {
    kind: 'memory',
    async get(key) { sweep(); return memRooms.get(key) || null; },
    async set(key, val) { sweep(); memRooms.set(key, val); },
  };
}

let blobsBroken = false;
const IS_LOCAL_DEV = process.env.NETLIFY_DEV === 'true' || process.env.NETLIFY_DEV === '1';
async function withStore(fn) {
  // 本地 netlify dev：直接用进程内存（实测本地 Blobs 沙箱连接不可靠且错误绕过 async 捕获）；
  // 生产环境走 Netlify Blobs（24h TTL）。任何一次 Blobs 失败 → 本进程内永久降级内存。
  if (!blobsBroken && !IS_LOCAL_DEV) {
    try {
      const s = getStore('hide_rooms');
      return await fn({
        kind: 'blobs',
        async get(key) { return s.get(key, { type: 'json' }); },
        async set(key, val) { return s.setJSON(key, val, { ttl: ROOM_TTL }); },
      });
    } catch (e) {
      blobsBroken = true;
      console.log(`[room] blobs unavailable (${e && e.message ? e.message : e}), fallback to memory`);
    }
  }
  return fn(memoryStore());
}

const json = (obj, status = 200) => new Response(JSON.stringify(obj), {
  status,
  headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
});

// 尽力而为的创建频率限制（内存计数，isolate 重建即清零——挡脚本小子足够）
const createLog = new Map();     // ip -> [timestamps]
function rateLimited(ip) {
  const now = Date.now();
  const arr = (createLog.get(ip) || []).filter(t => now - t < 3600_000);
  arr.push(now);
  createLog.set(ip, arr);
  if (createLog.size > 5000) createLog.clear();
  return arr.length > 20;
}

function validHides(hides) {
  if (!Array.isArray(hides) || hides.length < 1 || hides.length > MAX_HIDE) return false;
  const seen = new Set();
  for (const h of hides) {
    if (!h || typeof h !== 'object') return false;
    if (!ID_RE.test(h.pieceId) || !SLOT_RE.test(h.slotKey) || !ID_RE.test(h.itemId)) return false;
    const key = `${h.pieceId}:${h.slotKey}`;
    if (seen.has(key)) return false;           // 同一槽位只允许藏一件
    seen.add(key);
  }
  return true;
}

function genCode() {
  let s = '';
  for (let i = 0; i < CODE_LEN; i++) s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return s;
}

async function getRoom(store, code) {
  if (typeof code !== 'string' || !/^[A-Z0-9]{6}$/.test(code)) return null;
  return store.get(`room:${code}`);
}

async function saveRoom(store, room) {
  await store.set(`room:${room.code}`, room);
}

export default async (req, context) => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'bad_json' }, 400);
  }
  const { action, code } = body || {};
  const ip = (context && context.ip) || '0.0.0.0';
  return withStore(async (store) => {

  // ---- 创建房间（藏家藏完调用）----
  if (action === 'create') {
    if (rateLimited(ip)) return json({ error: 'rate_limited' }, 429);
    const { hides, seekTime } = body;
    if (!validHides(hides)) return json({ error: 'bad_hides' }, 400);
    const st = Number(seekTime);
    if (!Number.isInteger(st) || st < 0 || st > SEEK_MAX) return json({ error: 'bad_seek_time' }, 400);
    let codeNew = null;
    for (let i = 0; i < 5; i++) {
      const c = genCode();
      if (!(await store.get(`room:${c}`))) { codeNew = c; break; }
    }
    if (!codeNew) return json({ error: 'code_exhausted' }, 500);
    const room = {
      code: codeNew,
      state: 'hidden',             // hidden → seeking → done
      hides,                       // 藏点真相，只在 done 后随结算下发
      seekTime: st,
      deadline: null,
      foundKeys: [],               // 已找到的 "pieceId:slotKey"
      createdAt: Date.now(),
    };
    await saveRoom(store, room);
    return json({ code: codeNew });
  }

  // ---- 找家开始搜索（服务端落deadline）----
  if (action === 'start_seek') {
    const room = await getRoom(store, code);
    if (!room) return json({ error: 'room_not_found' }, 404);
    if (room.state !== 'hidden') return json({ error: 'bad_state' }, 409);
    room.state = 'seeking';
    room.deadline = room.seekTime > 0 ? Date.now() + room.seekTime * 1000 : null;
    await saveRoom(store, room);
    return json({ state: 'seeking', deadline: room.deadline, seekTime: room.seekTime, total: room.hides.length });
  }

  // ---- 逐槽位搜查（藏点不下发，只答中/不中）----
  if (action === 'check') {
    const room = await getRoom(store, code);
    if (!room) return json({ error: 'room_not_found' }, 404);
    if (room.state === 'hidden') return json({ error: 'not_started' }, 409);
    if (room.state !== 'seeking') return json({ state: 'done', expired: true });
    if (room.deadline && Date.now() > room.deadline) {
      room.state = 'done';
      room.reason = 'timeout';
      await saveRoom(store, room);
      return json({ expired: true, state: 'done' });
    }
    const pieceId = String(body.pieceId || '');
    const slotKey = String(body.slotKey || '');
    if (!ID_RE.test(pieceId) || !SLOT_RE.test(slotKey)) return json({ error: 'bad_slot' }, 400);
    const key = `${pieceId}:${slotKey}`;
    if (room.foundKeys.includes(key)) return json({ hit: false, already: true });
    const hit = room.hides.find(h => h.pieceId === pieceId && h.slotKey === slotKey);
    if (!hit) return json({ hit: false });
    room.foundKeys.push(key);
    const done = room.foundKeys.length >= room.hides.length;
    if (done) { room.state = 'done'; room.reason = 'all_found'; }
    await saveRoom(store, room);
    return json({ hit: true, itemId: hit.itemId, done });
  }

  // ---- 状态轮询（藏家等结果 / 找家同步 / 结算揭示）----
  if (action === 'status') {
    const room = await getRoom(store, code);
    if (!room) return json({ error: 'room_not_found' }, 404);
    if (room.state === 'seeking' && room.deadline && Date.now() > room.deadline) {
      room.state = 'done';
      room.reason = 'timeout';
      await saveRoom(store, room);
    }
    const base = {
      state: room.state,
      total: room.hides.length,
      foundCount: room.foundKeys.length,
      seekTime: room.seekTime,
    };
    if (room.state === 'seeking') {
      return json({ ...base, deadline: room.deadline, now: Date.now() });
    }
    if (room.state === 'hidden') return json(base);
    // done：结算揭示（全部藏点 + 已找到清单）
    return json({
      ...base,
      reason: room.reason || 'all_found',
      hides: room.hides,
      foundKeys: room.foundKeys,
    });
  }

    return json({ error: 'unknown_action' }, 400);
  });    // ← withStore 结束
};

export const config = { path: '/api/room' };
