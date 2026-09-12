// main.js — 程序入口：组装场景、别墅、玩家（M2）
import * as THREE from 'three';
import { createScene } from './scene.js';
import { buildVilla } from './villa.js';
import { FPPlayer } from './player.js';

const container = document.getElementById('app');
const ctx = createScene(container);
const { scene, camera, tickHandlers } = ctx;

// ---- 别墅 ----
const colliders = [];
const villa = buildVilla(scene, colliders);

// ---- 玩家（找家第一人称）----
const player = new FPPlayer(camera, ctx.renderer.domElement);
player.teleport(villa.spawn.seeker.pos, villa.spawn.seeker.yaw);
tickHandlers.push((dt) => player.update(dt, colliders));

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
window.__game = { ctx, player, colliders, villa };

ctx.start();
document.getElementById('loading').classList.add('hidden');
console.log('[HideSeek] villa ready, three.js r' + THREE.REVISION);
