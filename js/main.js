// main.js — 程序入口，组装各模块（M1：先跑起来）
import * as THREE from 'three';
import { createScene } from './scene.js';

const container = document.getElementById('app');
const ctx = createScene(container);
const { scene, camera } = ctx;

// —— 临时演示物体：确认渲染/阴影/循环都正常（M2 起替换为别墅）——
const demoBox = new THREE.Mesh(
  new THREE.BoxGeometry(1, 1, 1),
  new THREE.MeshLambertMaterial({ color: 0xd9773f })
);
demoBox.position.set(0, 0.5, 0);
demoBox.castShadow = true;
scene.add(demoBox);

// 临时相机漂移：让画面动起来，验证渲染循环
ctx.tickHandlers.push((dt) => {
  const t = ctx.clock.elapsedTime;
  camera.position.set(Math.sin(t * 0.2) * 8, 3.5, Math.cos(t * 0.2) * 8);
  camera.lookAt(0, 0.6, 0);
  demoBox.rotation.y += dt * 0.5;
});

// 启动
ctx.start();
document.getElementById('loading').classList.add('hidden');
console.log('[HideSeek] scene booted, three.js r' + THREE.REVISION);
