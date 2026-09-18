// core/room-core.mjs — 联机房间逻辑核心（Netlify / Cloudflare 双平台共用，规则单一来源）
// 平台薄壳只需提供：
//   roomHandler(req, { ip, store, fallback })
//     store:    { get(key) → obj|null, set(key, obj) }（TTL 由各平台适配器自己带上）
//     fallback: 可选备用存储（如 Netlify 本地 dev 时 Blobs 不可用 → 内存）
// 内存存储也内建在这里，供本地联调与降级使用。

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // 去掉易混的 I/O/0/1
const CODE_LEN = 6;
export const ROOM_TTL = 86400;   // 秒：房间 24 小时自动过期
const MAX_HIDE = 8;
const SEEK_MAX = 1800;           // 秒：搜索时长上限 30 分钟
const ID_RE = /^[a-zA-Z0-9_]{1,48}$/;
const SLOT_RE = /^[a-zA-Z0-9_:]{1,48}$/;

export const ROOMS_PREFIX = 'room:';

// ---- 内存存储（本地联调 / 平台降级）----
export function memoryStore() {
  const mem = new Map();
  const sweep = () => {
    const cut = Date.now() - ROOM_TTL * 1000;
    for (const [k, v] of mem) if ((v.createdAt || 0) < cut) mem.delete(k);
  };
  return {
    kind: 'memory',
    async get(key) { sweep(); return mem.get(key) || null; },
    async set(key, val) { sweep(); mem.set(key, val); },
  };
}

// 带降级的存储解析：主存储任何一次操作抛错 → 本请求改用 fallback（若无则继续抛）
async function resolveStore(store, fallback) {
  try {
    await store.get(`${ROOMS_PREFIX}__probe`);
    return store;
  } catch (e) {
    if (fallback) return fallback;
    throw e;
  }
}

const json = (obj, status = 200) => new Response(JSON.stringify(obj), {
  status,
  headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
});

// 尽力而为的创建频率限制（内存计数，isolate 重建即清零——挡脚本小子足够）
const createLog = new Map();
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
    if (seen.has(key)) return false;
    seen.add(key);
  }
  return true;
}

function genCode() {
  // crypto 级随机（Workers 与 Node 18+ 均内置 globalThis.crypto）
  let s = '';
  for (let i = 0; i < CODE_LEN; i++) {
    const a = new Uint32Array(1);
    globalThis.crypto.getRandomValues(a);
    s += ALPHABET[a[0] % ALPHABET.length];
  }
  return s;
}

export async function roomHandler(req, { ip = '0.0.0.0', store, fallback = null } = {}) {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'bad_json' }, 400);
  }
  let st;
  try {
    st = await resolveStore(store, fallback);
  } catch (e) {
    return json({ error: 'storage_unavailable', detail: String(e && e.message || e) }, 500);
  }
  const { action, code } = body || {};

  // ---- 创建房间（藏家藏完调用）----
  if (action === 'create') {
    if (rateLimited(ip)) return json({ error: 'rate_limited' }, 429);
    const { hides, seekTime } = body;
    if (!validHides(hides)) return json({ error: 'bad_hides' }, 400);
    const dur = Number(seekTime);
    if (!Number.isInteger(dur) || dur < 0 || dur > SEEK_MAX) return json({ error: 'bad_seek_time' }, 400);
    let codeNew = null;
    for (let i = 0; i < 5; i++) {
      const c = genCode();
      if (!(await st.get(`${ROOMS_PREFIX}${c}`))) { codeNew = c; break; }
    }
    if (!codeNew) return json({ error: 'code_exhausted' }, 500);
    const room = {
      code: codeNew,
      state: 'hidden',             // hidden → seeking → done
      hides,                       // 藏点真相，只在 done 后随结算下发
      seekTime: dur,
      deadline: null,
      foundKeys: [],
      createdAt: Date.now(),
    };
    await st.set(`${ROOMS_PREFIX}${codeNew}`, room);
    return json({ code: codeNew });
  }

  // ---- 找家开始搜索（服务端落deadline）----
  if (action === 'start_seek') {
    const room = await st.get(`${ROOMS_PREFIX}${code}`);
    if (!room) return json({ error: 'room_not_found' }, 404);
    if (room.state !== 'hidden') return json({ error: 'bad_state' }, 409);
    room.state = 'seeking';
    room.deadline = room.seekTime > 0 ? Date.now() + room.seekTime * 1000 : null;
    await st.set(`${ROOMS_PREFIX}${code}`, room);
    return json({ state: 'seeking', deadline: room.deadline, seekTime: room.seekTime, total: room.hides.length });
  }

  // ---- 逐槽位搜查（藏点不下发，只答中/不中）----
  if (action === 'check') {
    const room = await st.get(`${ROOMS_PREFIX}${code}`);
    if (!room) return json({ error: 'room_not_found' }, 404);
    if (room.state === 'hidden') return json({ error: 'not_started' }, 409);
    if (room.state !== 'seeking') return json({ state: 'done', expired: true });
    if (room.deadline && Date.now() > room.deadline) {
      room.state = 'done';
      room.reason = 'timeout';
      await st.set(`${ROOMS_PREFIX}${code}`, room);
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
    await st.set(`${ROOMS_PREFIX}${code}`, room);
    return json({ hit: true, itemId: hit.itemId, done });
  }

  // ---- 状态轮询（藏家等结果 / 找家同步 / 结算揭示）----
  if (action === 'status') {
    const room = await st.get(`${ROOMS_PREFIX}${code}`);
    if (!room) return json({ error: 'room_not_found' }, 404);
    if (room.state === 'seeking' && room.deadline && Date.now() > room.deadline) {
      room.state = 'done';
      room.reason = 'timeout';
      await st.set(`${ROOMS_PREFIX}${code}`, room);
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
    return json({
      ...base,
      reason: room.reason || 'all_found',
      hides: room.hides,
      foundKeys: room.foundKeys,
    });
  }

  return json({ error: 'unknown_action' }, 400);
}
