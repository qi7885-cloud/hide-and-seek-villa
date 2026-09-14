// textures.js — 程序化 Canvas 纹理：人字拼地板 / 木纹 / 瓷砖 / 地毯花纹
import * as THREE from 'three';

function makeCanvas(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return c;
}

function toTexture(canvas, repeatX = 1, repeatY = 1) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = 8;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// 素色木纹（家具/桌面）
export function woodTexture(base = '#8a5f36') {
  const c = makeCanvas(128), x = c.getContext('2d');
  x.fillStyle = base; x.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 26; i++) {
    x.strokeStyle = `rgba(${60 + Math.random() * 40},${40 + Math.random() * 25},20,${0.08 + Math.random() * 0.12})`;
    x.lineWidth = 1 + Math.random() * 2;
    x.beginPath();
    const y0 = Math.random() * 128;
    x.moveTo(0, y0);
    x.bezierCurveTo(40, y0 + (Math.random() - 0.5) * 10, 90, y0 + (Math.random() - 0.5) * 10, 128, y0 + (Math.random() - 0.5) * 6);
    x.stroke();
  }
  return toTexture(c, 1, 1);
}

// 厨房方砖
export function tileTexture(wMeters, dMeters) {
  const c = makeCanvas(128), x = c.getContext('2d');
  x.fillStyle = '#d8dcd9'; x.fillRect(0, 0, 128, 128);
  x.strokeStyle = 'rgba(140,145,142,.9)'; x.lineWidth = 3;
  x.strokeRect(0, 0, 128, 128);
  x.fillStyle = 'rgba(255,255,255,.25)';
  x.fillRect(6, 6, 116, 20);
  const cell = 0.6;
  return toTexture(c, wMeters / cell, dMeters / cell);
}

// 地毯：奶白底 + 点状边框（参考图款式）
export function rugTexture(wMeters, dMeters) {
  const c = makeCanvas(256), x = c.getContext('2d');
  x.fillStyle = '#e8e0d0'; x.fillRect(0, 0, 256, 256);
  // 细噪点（短绒质感）
  for (let i = 0; i < 2600; i++) {
    x.fillStyle = `rgba(${170 + Math.random() * 60},${160 + Math.random() * 55},${140 + Math.random() * 50},.25)`;
    x.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
  }
  // 虚线边框
  x.strokeStyle = '#b0a088'; x.lineWidth = 4; x.setLineDash([10, 8]);
  x.strokeRect(14, 14, 228, 228);
  x.setLineDash([]);
  x.strokeStyle = '#9a8a70'; x.lineWidth = 2;
  x.strokeRect(30, 30, 196, 196);
  // 四角小十字
  x.lineWidth = 3;
  for (const [px, py] of [[72, 72], [184, 72], [72, 184], [184, 184]]) {
    x.beginPath(); x.moveTo(px - 8, py); x.lineTo(px + 8, py); x.moveTo(px, py - 8); x.lineTo(px, py + 8); x.stroke();
  }
  const tex = toTexture(c, 1, 1);
  return tex;
}

// 墙面：极淡的乳胶漆肌理
export function wallTexture(base = '#f0ece2') {
  const c = makeCanvas(128), x = c.getContext('2d');
  x.fillStyle = base; x.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 900; i++) {
    x.fillStyle = `rgba(0,0,0,${Math.random() * 0.02})`;
    x.fillRect(Math.random() * 128, Math.random() * 128, 1.5, 1.5);
  }
  return toTexture(c, 4, 2);
}
