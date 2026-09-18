// functions/api/room.js — Cloudflare Pages Functions 薄壳：Workers KV 存储 + 共享核心
// 规则逻辑全部在 core/room-core.mjs（与 Netlify 版共用，单一来源）。
// 需要 KV 命名空间绑定：env.ROOMS（wrangler.toml kv_namespaces，24h TTL 由 put 时带上）。
import { roomHandler, memoryStore } from '../../core/room-core.mjs';

function kvStore(env) {
  return {
    kind: 'kv',
    async get(key) { return env.ROOMS.get(key, 'json'); },
    async set(key, val) {
      await env.ROOMS.put(key, JSON.stringify(val), { expirationTtl: 86400 });
    },
  };
}

const jresp = (obj, status = 200) => new Response(JSON.stringify(obj), {
  status,
  headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
});

export async function onRequestPost({ request, env }) {
  if (!env.ROOMS) {
    return jresp({ error: 'storage_unconfigured' }, 500);
  }
  const ip = request.headers.get('cf-connecting-ip') || '0.0.0.0';
  return roomHandler(request, {
    ip,
    store: kvStore(env),
    fallback: memoryStore(),   // KV 读探测失败时降级（每请求粒度）
  });
}
