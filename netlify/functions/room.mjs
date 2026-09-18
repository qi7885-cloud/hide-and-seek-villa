// netlify/functions/room.mjs — Netlify 薄壳：Blob 存储（含本地内存降级）+ 共享核心
// 规则逻辑全部在 core/room-core.mjs（与 Cloudflare 版共用，单一来源）。
import { getStore } from '@netlify/blobs';
import { roomHandler, memoryStore, ROOM_TTL } from '../../core/room-core.mjs';

let blobsBroken = false;
// 模块级单例内存存储：进程内存活期间房间持久（降级/本地 dev 共用同一份）
const persistentMemory = memoryStore();
const IS_LOCAL_DEV = process.env.NETLIFY_DEV === 'true' || process.env.NETLIFY_DEV === '1';

// Blob 存储适配：任何一次操作失败 → 本进程内永久降级内存（本地 dev 的 Blobs 沙箱
// 连接不可靠且 AggregateError 绕过 async catch——因此每次操作都套 try，失败即降级）
function makeStore() {
  const memory = persistentMemory;
  return {
    kind: 'blobs-or-memory',
    async get(key) {
      if (blobsBroken) return memory.get(key);
      try {
        return await getStore('hide_rooms').get(key, { type: 'json' });
      } catch (e) {
        blobsBroken = true;
        console.log(`[room] blobs unavailable (${e && e.message ? e.message : e}), fallback to memory`);
        return memory.get(key);
      }
    },
    async set(key, val) {
      if (blobsBroken) return memory.set(key, val);
      try {
        return await getStore('hide_rooms').setJSON(key, val, { ttl: ROOM_TTL });
      } catch (e) {
        blobsBroken = true;
        console.log(`[room] blobs unavailable (${e && e.message ? e.message : e}), fallback to memory`);
        return memory.set(key, val);
      }
    },
  };
}

const jresp = (obj, status = 200) => new Response(JSON.stringify(obj), {
  status,
  headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
});

export default async (req, context) => {
  if (req.method !== 'POST') return jresp({ error: 'method_not_allowed' }, 405);
  // 注意：不要在这里消费 req body——core 的 roomHandler 要自己解析一次
  const store = IS_LOCAL_DEV ? persistentMemory : makeStore();
  return roomHandler(req, {
    ip: (context && context.ip) || '0.0.0.0',
    store,
    fallback: persistentMemory,
  });
};

export const config = { path: '/api/room' };
