// main.js — 程序入口：加载 Blender 模型 → 组装场景、别墅、家具、玩家、交互、回合系统
import * as THREE from 'three';
import { createScene } from './scene.js';
import { buildVilla, setVillaVisuals } from './villa.js';
import { buildUpperFloor, buildYard, setUpperVisuals } from './villa2.js';
import { buildFurniture } from './furniture.js';
import { FPPlayer } from './player.js';
import { Interaction } from './interact.js';
import { PlacementUI } from './placement.js';
import { GodCamera, createAvatar, SpectatorPiP } from './spectator.js';
import { Game } from './game.js';
import { canHide } from './slots.js';
import { itemById, setItemFactory } from './items.js';
import { SFX } from './audio.js';
import { loadAllModels, instantiatePiece, staticModel, instantiateItem } from './models.js';

const container = document.getElementById('app');

async function init() {
  const ctx = createScene(container);
  const { scene, camera, tickHandlers } = ctx;
  camera.layers.enable(2);   // 主相机可见屋顶层（院内/院内视角）

  // ---- Blender 模型预加载（进度写进加载屏）----
  const loadingTitle = document.querySelector('#loading h1');
  await loadAllModels((done, total) => {
    if (loadingTitle) loadingTitle.textContent = `加载模型 ${done}/${total}…`;
  });
  if (loadingTitle) loadingTitle.textContent = '加载中…';

  // ---- 别墅：碰撞骨架由原代码生成（玩法不变），视觉交给 GLB ----
  const colliders = [];
  setVillaVisuals(false);
  setUpperVisuals(false);
  const villa = buildVilla(scene, colliders);
  buildUpperFloor(scene, colliders);   // 二楼+楼梯+屋顶碰撞
  buildYard(scene, colliders);         // 庭院碰撞
  const villaGlb = staticModel('villa');
  const yardGlb = staticModel('yard');
  if (villaGlb) scene.add(villaGlb);
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
  interact.onHideInteract = (piece) => placement.onAimE(piece);
  tickHandlers.push(() => placement.update());

  // ---- 上帝视角 / 角色替身 / 画中画观战 ----
  const godCam = new GodCamera(camera, ctx.renderer.domElement);
  tickHandlers.push(() => godCam.update());
  const avatar = createAvatar(staticModel('avatar'));
  scene.add(avatar);
  tickHandlers.push(() => {
    avatar.position.set(player.pos.x, player.pos.y, player.pos.z);
    avatar.rotation.y = player.yaw + Math.PI;
  });
  const pip = new SpectatorPiP();
  tickHandlers.push((dt) => pip.update(player.pos, player.yaw, dt));
  ctx.hooks.pipRender = (r, s) => pip.render(r, s, window.innerWidth, window.innerHeight);

  // ---- 回合系统 ----
  const game = new Game(ctx, villa, pieces, interact, placement, player, godCam, avatar, pip);

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
  const _toggle = interact.togglePiece.bind(interact);
  interact.togglePiece = (id, open) => {
    const entries = interact.openEntries.filter(e => e.pieceId === id);
    const anyClosed = entries.some(e => e.target === 0);
    const ret = _toggle(id, open);
    if (entries.length) (open === null ? anyClosed : open) ? SFX.open() : SFX.close();
    return ret;
  };
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

  // 计时 tick 挂进主循环
  tickHandlers.push((dt) => game.tick(dt));

  // Esc 退出本局（游戏中按 Esc；指针锁定时浏览器会先解锁并派发该按键，多数情况一次生效）
  document.addEventListener('keydown', (e) => {
    if (e.code !== 'Escape') return;
    if (game.phase === 'hide' || game.phase === 'seek') game.quitToMenu();
  });

  // 调试接口（浏览器控制台可用 __game.pos 查看位置）
  window.__game = { ctx, player, colliders, villa, pieces, interact, placement, game, godCam, pip, canHide, itemById };

  ctx.start();
  document.getElementById('loading').classList.add('hidden');
  console.log('[HideSeek] game ready, three.js r' + THREE.REVISION + ' (models: Blender GLB)');
}

init().catch((err) => {
  console.error('[HideSeek] init failed:', err);
  const el = document.querySelector('#loading .screen-card');
  if (el) el.innerHTML = `<h1>加载失败</h1><p class="subtitle">${err.message}</p>`;
});
