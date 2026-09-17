// net.js — 联机 API 客户端（方案①：HTTP 状态中转）
// 同源相对路径：本地 netlify dev 与线上 Netlify 都直接可用；
// 纯 node server.js 静态模式下接口 404，net.js.isAvailable() 会探明并给出提示。

const API = '/api/room';

async function post(action, payload = {}) {
  let res;
  try {
    res = await fetch(API, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action, ...payload }),
    });
  } catch (e) {
    throw new Error('NETWORK:无法连接服务器（联机需要 netlify dev 或线上环境）');
  }
  let data = null;
  try { data = await res.json(); } catch { /* ignore */ }
  if (!res.ok) {
    const MAP = {
      room_not_found: '房间不存在或已过期',
      bad_state: '房间状态不对，刷新后再试',
      not_started: '房主还没完成藏匿',
      rate_limited: '创建太频繁，稍后再试',
      bad_hides: '藏匿数据不合法',
      bad_seek_time: '搜索时长不合法',
    };
    throw new Error((data && data.error && MAP[data.error]) || `服务器错误 ${res.status}`);
  }
  return data;
}

export const netCreate = (hides, seekTime) => post('create', { hides, seekTime });
export const netStartSeek = (code) => post('start_seek', { code });
export const netCheck = (code, pieceId, slotKey) => post('check', { code, pieceId, slotKey });
export const netStatus = (code) => post('status', { code });

// 探测联机后端是否可用（菜单进入联机面板前调用）。
// 区分依据：静态服务器对 /api/room 也回 404，但 body 是 HTML 文本；
// 联机后端无论 404 还是 200 都回 JSON —— 能解析出 JSON 即后端在场。
export async function isAvailable() {
  try {
    const res = await fetch(API, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'status', code: 'AAAAAA' }),
    });
    const j = await res.json();
    return !!j;
  } catch {
    return false;
  }
}
