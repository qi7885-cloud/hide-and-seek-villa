// main.js — 程序入口：加载 Blender 模型 → 组装场景、别墅、家具、玩家、交互、回合系统
import * as THREE from 'three';
import { createScene } from './scene.js';
import { buildVilla, setVillaVisuals } from './villa.js';
import { buildUpperFloor, buildYard, setUpperVisuals } from './villa2.js';
import { buildFurniture } from './furniture.js';
import { FPPlayer } from './player.js';
import { Interaction } from './interact.js';
import { PlacementUI } from './placement.js';
import { GodCamera } from './spectator.js';
import { Game, Phase } from './game.js';
import { canHide } from './slots.js';
import { itemById, setItemFactory } from './items.js';
import { SFX } from './audio.js';
import { addWallCartoons } from './cartoons.js';
import { loadAllModels, instantiatePiece, staticModel, instantiateItem } from './models.js';
import { netCreate, netStartSeek, netCheck, netStatus, isAvailable } from './net.js';

const container = document.getElementById('app');

async function init() {
  const ctx = createScene(container);
  const { scene, camera, tickHandlers } = ctx;
  camera.layers.enable(2);   // 主相机可见屋顶层（院内/院内视角）

  // ---- Blender 模型预加载（加载屏固定提示语）----
  await loadAllModels();

  // ---- 别墅：碰撞骨架由原代码生成（玩法不变），视觉交给 GLB ----
  const colliders = [];
  setVillaVisuals(false);
  setUpperVisuals(false);
  const villa = buildVilla(scene, colliders);
  buildUpperFloor(scene, colliders);   // 二楼+楼梯+屋顶碰撞
  buildYard(scene, colliders);         // 庭院碰撞
  const villaGlb = staticModel('villa');
  const yardGlb = staticModel('yard');
  if (villaGlb) {
    scene.add(villaGlb);
    addWallCartoons(villaGlb);   // 一楼墙面简笔卡通画（相片墙+白色空框）
  }
  if (yardGlb) scene.add(yardGlb);

  // ---- 家具与槽位（GLB 优先，缺失回退程序化）----
  const pieces = buildFurniture(scene, colliders, (def) => instantiatePiece(def.id));
  for (const p of pieces) p.group.userData.pieceId = p.def.id;
  setItemFactory((id) => instantiateItem(id));

  // ---- 玩家（找家第一人称）----
  const player = new FPPlayer(camera, ctx.renderer.domElement);
  player.teleport(villa.spawn.seeker.pos, villa.spawn.seeker.yaw);
  tickHandlers.push((dt) => player.update(dt, colliders));

  // ---- 交互系统 ----
  const interact = new Interaction(ctx, pieces, null, player);

  // ---- 藏家放置 UI ----
  const placement = new PlacementUI(interact, pieces, camera);
  interact.onHideInteract = (piece, entry) => placement.onAimE(piece, entry);
  interact.onHideBook = (piece, book) => placement.onAimBook(piece, book);
  tickHandlers.push(() => placement.update());

  // ---- 上帝视角（菜单背后的环绕展示） ----
  const godCam = new GodCamera(camera);
  tickHandlers.push(() => godCam.update());

  // ---- 回合系统 ----
  const game = new Game(ctx, villa, pieces, interact, placement, player, godCam);

  // ---- 通用 toast ----
  const toastEl = document.getElementById('toast');
  let toastTimer = null;
  function showToast(msg) {
    toastEl.innerHTML = msg;
    toastEl.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.add('hidden'), 2800);
  }
  game.onToast = showToast;
  placement.onToast = showToast;

  // ---- 音效接线 ----
  interact.onEntryToggle = (entry, open) => { if (open) SFX.open(); else SFX.close(); };
  const _place = interact.placeItem.bind(interact);
  interact.placeItem = (...a) => { const r = _place(...a); if (r.ok) SFX.place(); return r; };
  const _pickup = interact.onPickup;
  interact.onPickup = (u, m) => { SFX.pickup(); if (_pickup) _pickup(u, m); };

  // ---- 菜单背后的环绕展示 ----
  godCam.enabled = true;
  godCam.autoRotate = true;

  // ---- 下拉"自定义"选项：选中后显示配套输入框 ----
  for (const [selId, inputId] of [['opt-rounds', 'opt-rounds-custom'],
                                  ['opt-hidecount', 'opt-hidecount-custom']]) {
    const sel = document.getElementById(selId);
    const input = document.getElementById(inputId);
    sel.addEventListener('change', () => {
      const isCustom = sel.value === 'custom';
      input.classList.toggle('hidden', !isCustom);
      sel.classList.toggle('narrow', isCustom);
      if (isCustom) input.focus();
    });
  }

  // ---- 菜单与流程按钮 ----
  document.getElementById('btn-start').onclick = () => {
    const roundsSel = document.getElementById('opt-rounds').value;
    const roundsCustom = +document.getElementById('opt-rounds-custom').value;
    const hideSel = document.getElementById('opt-hidecount').value;
    const hideCustom = +document.getElementById('opt-hidecount-custom').value;
    game.settings.rounds = roundsSel === 'custom'
      ? Math.max(1, Math.min(20, roundsCustom || 1))
      : +roundsSel;
    game.settings.seekTime = +document.getElementById('opt-time').value;
    game.settings.hideCount = hideSel === 'custom'
      ? Math.max(1, Math.min(8, hideCustom || 1))
      : +hideSel;
    game.settings.hints = document.getElementById('opt-hints').value === 'on';
    document.getElementById('screen-menu').classList.add('hidden');
    document.getElementById('hud').classList.remove('hidden');
    godCam.enabled = false;
    godCam.autoRotate = false;
    game.startRound();
  };
  document.getElementById('btn-cover-continue').onclick = () => game.beginSeek();
  document.getElementById('btn-next-round').onclick = () => game.nextRound();
  document.getElementById('btn-exit').onclick = (e) => { e.stopPropagation(); game.quitToMenu(); };

  // ---- 联机模式（2026-09-18 方案①：房间号 + 状态中转） ----
  const onlineErr = (msg) => {
    const el = document.getElementById('online-error');
    el.textContent = msg;
    el.classList.remove('hidden');
    setTimeout(() => el.classList.add('hidden'), 6000);
  };
  document.getElementById('btn-online-create').onclick = async () => {
    if (!(await isAvailable())) { onlineErr('联机后端不可用：请用 node server.js / npx netlify dev 启动，或访问线上地址'); return; }
    // 联机沿用菜单里的 藏匿件数/搜索时间 设置；轮数固定 1、冷热提示关闭（物品未落客户端，提示无意义）
    const hideSel = document.getElementById('opt-hidecount').value;
    const hideCustom = +document.getElementById('opt-hidecount-custom').value;
    game.settings.hideCount = hideSel === 'custom'
      ? Math.max(1, Math.min(8, hideCustom || 1))
      : +hideSel;
    game.settings.seekTime = +document.getElementById('opt-time').value;
    game.settings.hints = false;
    game.startOnlineHost();
  };
  document.getElementById('btn-online-join').onclick = async () => {
    const input = document.getElementById('online-code');
    const code = input.value.trim().toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(code)) { onlineErr('房间号是 6 位字母数字'); return; }
    if (!(await isAvailable())) { onlineErr('联机后端不可用：请用 node server.js / npx netlify dev 启动，或访问线上地址'); return; }
    try {
      const st = await netStatus(code);
      if (st.state === 'done') { onlineErr('该房间已经结束了'); return; }
      game.guestJoin(code, st);
    } catch (e) { onlineErr(e.message); }
  };
  document.getElementById('btn-online-action').onclick = () => {
    if (game.onlineAction) game.onlineAction();
  };
  document.getElementById('btn-online-exit').onclick = () => game.quitToMenu();
  // URL 带 ?room=XXXXXX 时预填房号（A 发链接给 B 的场景）
  const roomParam = new URLSearchParams(location.search).get('room');
  if (roomParam) {
    const input = document.getElementById('online-code');
    input.value = roomParam.toUpperCase();
    input.focus();
  }

  // 联机找家：搜查回调（藏点在服务端，客户端只逐槽位问询）
  interact.onOnlineCheck = async (pieceId, slotKey) => {
    if (game.mode !== 'guest' || !game.online.code) return { hit: false };
    return netCheck(game.online.code, pieceId, slotKey);
  };
  interact.onOnlineExpired = () => {
    if (game.mode === 'guest') game._guestFinish('timeout');
  };
  interact.onOnlineToast = showToast;

  // 计时 tick 挂进主循环
  tickHandlers.push((dt) => game.tick(dt));

  // Esc 退出本局（游戏中按 Esc；指针锁定时浏览器会先解锁并派发该按键，多数情况一次生效）
  document.addEventListener('keydown', (e) => {
    if (e.code !== 'Escape') return;
    if (game.phase === Phase.HIDE || game.phase === Phase.SEEK) game.quitToMenu();
  });

  // 调试接口（浏览器控制台可用 __game.pos 查看位置）
  window.__game = { ctx, player, colliders, villa, pieces, interact, placement, game, godCam, canHide, itemById };

  ctx.start();
  document.getElementById('loading').classList.add('hidden');
  console.log('[HideSeek] game ready, three.js r' + THREE.REVISION + ' (models: Blender GLB)');
}

init().catch((err) => {
  console.error('[HideSeek] init failed:', err);
  window.__initStack = err.stack || String(err);
  const el = document.querySelector('#loading .screen-card');
  if (el) el.innerHTML = `<h1>加载失败</h1><p class="subtitle">${err?.message ?? err}</p>`;
});
