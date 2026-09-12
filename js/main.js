// main.js — 程序入口：组装场景、别墅、家具、玩家、交互（M4）
import * as THREE from 'three';
import { createScene } from './scene.js';
import { buildVilla } from './villa.js';
import { buildFurniture } from './furniture.js';
import { FPPlayer } from './player.js';
import { Interaction } from './interact.js';
import { PlacementUI } from './placement.js';
import { canHide } from './slots.js';
import { itemById } from './items.js';

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

// ---- 交互系统（拾取回调 M5 接入游戏逻辑）----
const interact = new Interaction(ctx, pieces, null, player);

// ---- 藏家放置 UI（M5 回合流程驱动 show/hide）----
const placement = new PlacementUI(interact, pieces, camera);
placement.initPick(THREE, ctx.renderer.domElement);

// 指针锁定提示
const lockHint = document.getElementById('interact-prompt');
ctx.renderer.domElement.addEventListener('pointerlockstate', (e) => {
  if (e.detail) {
    lockHint.classList.add('hidden');
  } else {
    lockHint.textContent = '点击画面锁定鼠标进行漫游';
    lockHint.classList.remove('hidden');
  }
});
lockHint.textContent = '点击画面锁定鼠标进行漫游';
lockHint.classList.remove('hidden');

// 调试接口（浏览器控制台可用 __game.pos 查看位置）
window.__game = { ctx, player, colliders, villa, pieces, interact, placement, canHide, itemById };

// 上帝视角调试：俯瞰全屋（藏家放置阶段 M5 会正式实现）
window.__game.godView = function (height = 13) {
  player.frozen = true;
  camera.position.set(0, height, 7.5);
  camera.lookAt(0, 0, 0);
};

ctx.start();
document.getElementById('loading').classList.add('hidden');
console.log('[HideSeek] villa ready, three.js r' + THREE.REVISION);
