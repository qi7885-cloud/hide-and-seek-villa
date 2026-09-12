// main.js — 程序入口：组装场景、别墅、家具、玩家、交互、回合系统（M5）
import * as THREE from 'three';
import { createScene } from './scene.js';
import { buildVilla } from './villa.js';
import { buildFurniture } from './furniture.js';
import { FPPlayer } from './player.js';
import { Interaction } from './interact.js';
import { PlacementUI } from './placement.js';
import { GodCamera, createAvatar, SpectatorPiP } from './spectator.js';
import { Game } from './game.js';
import { canHide } from './slots.js';
import { itemById } from './items.js';
import { SFX } from './audio.js';

const container = document.getElementById('app');
const ctx = createScene(container);
const { scene, camera, tickHandlers } = ctx;

// ---- 别墅 ----
const colliders = [];
const villa = buildVilla(scene, colliders);

// ---- 家具与槽位 ----
const pieces = buildFurniture(scene, colliders);
for (const p of pieces) p.group.userData.pieceId = p.def.id;

// ---- 玩家（找家第一人称）----
const player = new FPPlayer(camera, ctx.renderer.domElement);
player.teleport(villa.spawn.seeker.pos, villa.spawn.seeker.yaw);
tickHandlers.push((dt) => player.update(dt, colliders));

// ---- 交互系统 ----
const interact = new Interaction(ctx, pieces, null, player);

// ---- 藏家放置 UI ----
const placement = new PlacementUI(interact, pieces, camera);
placement.initPick(THREE, ctx.renderer.domElement);

// ---- 上帝视角 / 角色替身 / 画中画观战 ----
const godCam = new GodCamera(camera, ctx.renderer.domElement);
tickHandlers.push(() => godCam.update());
const avatar = createAvatar();
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
  toastEl.textContent = msg;
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

// ---- 菜单与流程按钮 ----
document.getElementById('btn-start').onclick = () => {
  game.settings.rounds = +document.getElementById('opt-rounds').value;
  game.settings.seekTime = +document.getElementById('opt-time').value;
  game.settings.hints = document.getElementById('opt-hints').value === 'on';
  document.getElementById('screen-menu').classList.add('hidden');
  document.getElementById('hud').classList.remove('hidden');
  game.startRound();
};
document.getElementById('btn-cover-continue').onclick = () => game.beginSeek();
document.getElementById('btn-next-round').onclick = () => game.nextRound();

// 计时 tick 挂进主循环
tickHandlers.push((dt) => game.tick(dt));

// 调试接口（浏览器控制台可用 __game.pos 查看位置）
window.__game = { ctx, player, colliders, villa, pieces, interact, placement, game, godCam, pip, canHide, itemById };

ctx.start();
document.getElementById('loading').classList.add('hidden');
console.log('[HideSeek] game ready, three.js r' + THREE.REVISION);
