// cartoons.js — 一楼墙面简笔卡通画（CanvasTexture 运行时生成，GLB 无需重导出）
// 挂画位置：
//   pw0a~pw4a  客厅隔墙相片墙（沙发上方木相框内的原纯色板，隐藏后替换为卡通画）
//   wp2~wp5    白色护墙板空框（wp1 已被相片墙占用，跳过）
// 9 幅画各不重复。
import * as THREE from 'three';

const OUTLINE = '#41392e';

function pen(ctx, w = 6) {
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = w;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
}

function shape(ctx, fill, stroke = true) {
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) ctx.stroke();
}

function circ(ctx, x, y, r, fill, stroke = true) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  shape(ctx, fill, stroke);
}

function tri(ctx, x0, y0, x1, y1, x2, y2, fill, stroke = true) {
  ctx.beginPath();
  ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.lineTo(x2, y2);
  ctx.closePath();
  shape(ctx, fill, stroke);
}

function star(ctx, x, y, r, fill) {
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
    const rr = i % 2 === 0 ? r : r * 0.42;
    const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
    i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
  }
  ctx.closePath();
  pen(ctx, 3);
  shape(ctx, fill, true);
  pen(ctx);
}

// —— 9 幅简笔画 ——

function cat(ctx, w, h) {
  const cx = w / 2, cy = h / 2 + 24, r = 76;
  ctx.fillStyle = '#f6a950';
  tri(ctx, cx - 64, cy - 42, cx - 82, cy - 106, cx - 16, cy - 72, ctx.fillStyle);
  tri(ctx, cx + 64, cy - 42, cx + 82, cy - 106, cx + 16, cy - 72, ctx.fillStyle);
  circ(ctx, cx, cy, r, '#f6a950');
  ctx.fillStyle = OUTLINE;
  circ(ctx, cx - 27, cy - 12, 7, OUTLINE, false);
  circ(ctx, cx + 27, cy - 12, 7, OUTLINE, false);
  tri(ctx, cx - 8, cy + 14, cx + 8, cy + 14, cx, cy + 26, '#e8837a');
  ctx.beginPath();
  ctx.arc(cx, cy + 26, 24, 0.15 * Math.PI, 0.85 * Math.PI);
  ctx.stroke();
  pen(ctx, 4);
  for (const s of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(cx + s * 52, cy + 6 + i * 13);
      ctx.lineTo(cx + s * (104 + i * 4), cy - 2 + i * 15);
      ctx.stroke();
    }
  }
  circ(ctx, cx - 52, cy + 26, 11, '#f4b8c0', false);
  circ(ctx, cx + 52, cy + 26, 11, '#f4b8c0', false);
}

function house(ctx, w, h) {
  const cx = w / 2;
  circ(ctx, 66, 62, 30, '#f5c542');
  pen(ctx, 4);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(66 + Math.cos(a) * 40, 62 + Math.sin(a) * 40);
    ctx.lineTo(66 + Math.cos(a) * 52, 62 + Math.sin(a) * 52);
    ctx.stroke();
  }
  pen(ctx);
  ctx.fillStyle = '#efe3c2';
  ctx.fillRect(cx - 74, 122, 148, 112);
  ctx.strokeRect(cx - 74, 122, 148, 112);
  tri(ctx, cx - 92, 122, cx + 92, 122, cx, 52, '#d0704c');
  ctx.fillStyle = '#a9744a';
  ctx.fillRect(cx - 24, 162, 48, 72);
  ctx.strokeRect(cx - 24, 162, 48, 72);
  ctx.fillStyle = '#bcdcec';
  ctx.fillRect(cx - 62, 140, 34, 34);
  ctx.strokeRect(cx - 62, 140, 34, 34);
  ctx.beginPath();
  ctx.moveTo(24, 234);
  ctx.lineTo(w - 24, 234);
  ctx.stroke();
}

function fish(ctx, w, h) {
  const cy = h / 2 + 12;
  ctx.save();
  ctx.translate(w / 2 + 14, cy);
  ctx.beginPath();
  ctx.ellipse(0, 0, 84, 52, 0, 0, Math.PI * 2);
  shape(ctx, '#6fb5e7');
  tri(ctx, -74, -10, -74, 10, -124, -46, '#6fb5e7');
  tri(ctx, -74, -10, -74, 10, -124, 46, '#6fb5e7');
  tri(ctx, 8, -48, 44, -48, 34, -14, '#4f95c8');
  circ(ctx, 44, -10, 13, '#ffffff');
  ctx.fillStyle = OUTLINE;
  circ(ctx, 47, -10, 5, OUTLINE, false);
  ctx.beginPath();
  ctx.arc(70, 14, 16, Math.PI * 1.15, Math.PI * 1.75);
  ctx.stroke();
  ctx.restore();
  pen(ctx, 4);
  for (const [bx, by, br] of [[318, 74, 9], [338, 52, 6], [350, 34, 4]]) circ(ctx, bx, by, br, null);
  ctx.beginPath();
  ctx.moveTo(30, 250);
  ctx.quadraticCurveTo(70, 234, 110, 250);
  ctx.quadraticCurveTo(150, 266, 190, 250);
  ctx.stroke();
}

function rocket(ctx, w, h) {
  const cx = w / 2;
  pen(ctx);
  ctx.beginPath();
  ctx.moveTo(cx, 34);
  ctx.quadraticCurveTo(cx + 44, 92, cx + 40, 168);
  ctx.lineTo(cx - 40, 168);
  ctx.quadraticCurveTo(cx - 44, 92, cx, 34);
  shape(ctx, '#e9e4da');
  tri(ctx, cx - 40, 122, cx - 40, 178, cx - 78, 186, '#d0704c');
  tri(ctx, cx + 40, 122, cx + 40, 178, cx + 78, 186, '#d0704c');
  circ(ctx, cx, 106, 20, '#9ecbe8');
  ctx.fillStyle = '#d0704c';
  ctx.fillRect(cx - 40, 156, 80, 12);
  ctx.strokeRect(cx - 40, 156, 80, 12);
  tri(ctx, cx - 20, 172, cx + 20, 172, cx, 226, '#f5a63c');
  tri(ctx, cx - 11, 172, cx + 11, 172, cx, 204, '#f5c542');
  for (const [sx, sy, sr] of [[58, 62, 11], [322, 92, 13], [88, 208, 8], [330, 214, 10]]) star(ctx, sx, sy, sr, '#f5c542');
}

function flower(ctx, w, h) {
  const cx = w / 2, cy = 92;
  pen(ctx);
  ctx.beginPath();
  ctx.moveTo(cx, cy + 46);
  ctx.quadraticCurveTo(cx + 14, cy + 96, cx, 238);
  ctx.stroke();
  ctx.fillStyle = '#7fae5c';
  ctx.beginPath();
  ctx.ellipse(cx - 32, cy + 92, 30, 13, -0.5, 0, Math.PI * 2);
  shape(ctx, '#7fae5c');
  ctx.beginPath();
  ctx.ellipse(cx + 32, cy + 118, 30, 13, 0.5, 0, Math.PI * 2);
  shape(ctx, '#7fae5c');
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    ctx.beginPath();
    ctx.ellipse(cx + Math.cos(a) * 42, cy + Math.sin(a) * 42, 26, 26, 0, 0, Math.PI * 2);
    shape(ctx, '#ef8fb0');
  }
  circ(ctx, cx, cy, 26, '#f5c542');
  ctx.fillStyle = OUTLINE;
  circ(ctx, cx - 9, cy - 3, 3.5, OUTLINE, false);
  circ(ctx, cx + 9, cy - 3, 3.5, OUTLINE, false);
  ctx.beginPath();
  ctx.arc(cx, cy + 4, 9, 0.15 * Math.PI, 0.85 * Math.PI);
  ctx.stroke();
}

function boat(ctx, w, h) {
  const cx = w / 2;
  pen(ctx);
  ctx.beginPath();
  ctx.moveTo(cx, 52);
  ctx.lineTo(cx, 172);
  ctx.stroke();
  tri(ctx, cx + 6, 60, cx + 6, 164, cx + 96, 164, '#e9e4da');
  tri(ctx, cx - 6, 76, cx - 6, 164, cx - 72, 164, '#bcdcec');
  ctx.fillStyle = '#a9744a';
  ctx.beginPath();
  ctx.moveTo(cx - 96, 180);
  ctx.lineTo(cx + 96, 180);
  ctx.lineTo(cx + 62, 216);
  ctx.lineTo(cx - 62, 216);
  ctx.closePath();
  shape(ctx, '#a9744a');
  tri(ctx, cx, 30, cx, 52, cx + 30, 41, '#d0704c');
  pen(ctx, 4);
  for (const y of [240, 256]) {
    ctx.beginPath();
    for (let x = 24; x <= w - 24; x += 44) ctx.arc(x, y, 22, Math.PI, 0, false);
    ctx.stroke();
  }
}

function bird(ctx, w, h) {
  pen(ctx);
  ctx.beginPath();
  ctx.moveTo(30, 218);
  ctx.quadraticCurveTo(w / 2, 196, w - 30, 214);
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(w / 2 - 8, 152, 56, 44, -0.12, 0, Math.PI * 2);
  shape(ctx, '#7fc3e8');
  circ(ctx, w / 2 + 44, 108, 32, '#7fc3e8');
  tri(ctx, w / 2 + 72, 102, w / 2 + 72, 116, w / 2 + 96, 110, '#f5a63c');
  ctx.fillStyle = OUTLINE;
  circ(ctx, w / 2 + 50, 102, 5, OUTLINE, false);
  ctx.beginPath();
  ctx.ellipse(w / 2 - 4, 158, 30, 20, 0.5, 0, Math.PI * 2);
  shape(ctx, '#5da3cd');
  tri(ctx, w / 2 - 56, 148, w / 2 - 56, 170, w / 2 - 100, 186, '#5da3cd');
  pen(ctx, 4);
  for (const s of [-14, 4]) {
    ctx.beginPath();
    ctx.moveTo(w / 2 + s, 192);
    ctx.lineTo(w / 2 + s, 210);
    ctx.stroke();
  }
  star(ctx, 60, 62, 11, '#f5c542');
  star(ctx, 322, 88, 9, '#f5c542');
}

function moon(ctx, w, h) {
  ctx.fillStyle = '#31405e';
  ctx.fillRect(0, 0, w, h);
  const cx = w / 2, cy = h / 2 + 6;
  ctx.save();
  pen(ctx);
  ctx.fillStyle = '#f5e6a8';
  ctx.beginPath();
  ctx.arc(cx, cy, 74, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#31405e';
  ctx.beginPath();
  ctx.arc(cx + 34, cy - 20, 62, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = '#f5e6a8';
  circ(ctx, cx - 20, cy + 14, 6, '#f5e6a8', false);
  circ(ctx, cx - 40, cy - 26, 5, '#f5e6a8', false);
  circ(ctx, cx + 8, cy - 48, 4.5, '#f5e6a8', false);
  star(ctx, 64, 66, 12, '#f5e6a8');
  star(ctx, 318, 74, 10, '#f5e6a8');
  star(ctx, 92, 218, 9, '#f5e6a8');
  star(ctx, 300, 206, 12, '#f5e6a8');
  star(ctx, 196, 40, 8, '#f5e6a8');
}

function icecream(ctx, w, h) {
  const cx = w / 2;
  pen(ctx);
  tri(ctx, cx - 44, 148, cx + 44, 148, cx, 248, '#e0a35a');
  pen(ctx, 3);
  for (const o of [-24, -8, 8, 24]) {
    ctx.beginPath();
    ctx.moveTo(cx + o * 0.4, 156 + Math.abs(o) * 0.5);
    ctx.lineTo(cx + o, 244);
    ctx.stroke();
  }
  pen(ctx);
  circ(ctx, cx - 20, 122, 34, '#fdf3df');
  circ(ctx, cx + 22, 116, 32, '#f4b8c0');
  ctx.beginPath();
  ctx.arc(cx - 2, 72, 34, Math.PI, 0);
  shape(ctx, '#a9744a');
  circ(ctx, cx - 2, 30, 9, '#d9534f');
}

function robot(ctx, w, h) {
  const cx = w / 2;
  pen(ctx);
  ctx.beginPath(); ctx.moveTo(cx, 32); ctx.lineTo(cx, 58); ctx.stroke();
  circ(ctx, cx, 28, 8, '#f5c542');
  ctx.fillStyle = '#b9c4cf';
  ctx.fillRect(cx - 52, 58, 104, 66); ctx.strokeRect(cx - 52, 58, 104, 66);
  circ(ctx, cx - 22, 84, 12, '#ffffff'); circ(ctx, cx + 22, 84, 12, '#ffffff');
  ctx.fillStyle = OUTLINE;
  circ(ctx, cx - 22, 84, 5, OUTLINE, false); circ(ctx, cx + 22, 84, 5, OUTLINE, false);
  pen(ctx, 4);
  for (let i = 0; i < 4; i++) {
    ctx.beginPath(); ctx.moveTo(cx - 18 + i * 12, 106); ctx.lineTo(cx - 18 + i * 12, 114); ctx.stroke();
  }
  pen(ctx);
  ctx.fillStyle = '#9fb3c8';
  ctx.fillRect(cx - 64, 130, 128, 92); ctx.strokeRect(cx - 64, 130, 128, 92);
  ctx.fillStyle = '#d0704c'; ctx.fillRect(cx - 40, 146, 80, 22); ctx.strokeRect(cx - 40, 146, 80, 22);
  circ(ctx, cx - 22, 192, 9, '#f5c542'); circ(ctx, cx + 22, 192, 9, '#7fae5c');
  ctx.beginPath(); ctx.moveTo(cx - 64, 144); ctx.lineTo(cx - 96, 168); ctx.lineTo(cx - 96, 196); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx + 64, 144); ctx.lineTo(cx + 96, 168); ctx.lineTo(cx + 96, 196); ctx.stroke();
  circ(ctx, cx - 96, 204, 9, '#b9c4cf'); circ(ctx, cx + 96, 204, 9, '#b9c4cf');
  pen(ctx);
  ctx.beginPath(); ctx.moveTo(cx - 30, 222); ctx.lineTo(cx - 30, 244); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx + 30, 222); ctx.lineTo(cx + 30, 244); ctx.stroke();
  ctx.fillStyle = '#b9c4cf';
  ctx.fillRect(cx - 44, 244, 30, 12); ctx.strokeRect(cx - 44, 244, 30, 12);
  ctx.fillRect(cx + 14, 244, 30, 12); ctx.strokeRect(cx + 14, 244, 30, 12);
}

function whale(ctx, w, h) {
  const cx = w / 2, cy = h / 2 + 18;
  pen(ctx);
  ctx.beginPath();
  ctx.ellipse(cx, cy, 104, 56, 0, 0, Math.PI * 2);
  shape(ctx, '#5e8ca8');
  tri(ctx, cx - 92, cy - 8, cx - 92, cy + 16, cx - 142, cy - 26, '#5e8ca8');
  tri(ctx, cx - 92, cy + 6, cx - 92, cy + 26, cx - 140, cy + 36, '#5e8ca8');
  ctx.beginPath();
  ctx.ellipse(cx + 12, cy + 34, 30, 13, 0.4, 0, Math.PI * 2);
  shape(ctx, '#4a7590');
  pen(ctx, 4);
  ctx.beginPath(); ctx.moveTo(cx + 58, cy - 54); ctx.lineTo(cx + 58, cy - 84); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx + 58, cy - 84); ctx.lineTo(cx + 44, cy - 98); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx + 58, cy - 84); ctx.lineTo(cx + 72, cy - 98); ctx.stroke();
  pen(ctx);
  circ(ctx, cx + 62, cy - 16, 7, '#ffffff');
  ctx.fillStyle = OUTLINE; circ(ctx, cx + 64, cy - 16, 3.5, OUTLINE, false);
  ctx.beginPath(); ctx.arc(cx + 82, cy + 4, 13, Math.PI * 1.2, Math.PI * 1.8); ctx.stroke();
  pen(ctx, 4);
  ctx.beginPath(); ctx.moveTo(40, 254); ctx.quadraticCurveTo(80, 238, 120, 254);
  ctx.quadraticCurveTo(160, 270, 200, 254); ctx.stroke();
}

function kite(ctx, w, h) {
  const cx = w / 2 + 24;
  pen(ctx);
  ctx.fillStyle = '#e8837a';
  ctx.beginPath();
  ctx.moveTo(cx, 30); ctx.lineTo(cx + 62, 104); ctx.lineTo(cx, 190); ctx.lineTo(cx - 62, 104);
  ctx.closePath(); shape(ctx, '#e8837a');
  pen(ctx, 4);
  ctx.beginPath(); ctx.moveTo(cx, 30); ctx.lineTo(cx, 190); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx - 62, 104); ctx.lineTo(cx + 62, 104); ctx.stroke();
  pen(ctx);
  ctx.beginPath(); ctx.moveTo(cx, 190); ctx.quadraticCurveTo(cx - 84, 226, 56, 256); ctx.stroke();
  for (const [bx, by] of [[cx - 38, 214], [cx - 66, 234]]) {
    tri(ctx, bx - 12, by - 7, bx + 12, by - 7, bx, by, '#f5c542');
    tri(ctx, bx - 12, by + 7, bx + 12, by + 7, bx, by, '#f5c542');
  }
  star(ctx, 74, 66, 11, '#f5c542');
  star(ctx, 322, 56, 9, '#f5c542');
}

function dinosaur(ctx, w, h) {
  const cy = h / 2 + 26;
  pen(ctx);
  ctx.beginPath();
  ctx.ellipse(w / 2 + 20, cy, 82, 50, 0, 0, Math.PI * 2);
  shape(ctx, '#7fae5c');
  ctx.beginPath();
  ctx.moveTo(w / 2 - 36, cy - 28);
  ctx.quadraticCurveTo(w / 2 - 98, cy - 58, w / 2 - 94, cy - 108);
  ctx.quadraticCurveTo(w / 2 - 92, cy - 124, w / 2 - 68, cy - 120);
  ctx.quadraticCurveTo(w / 2 - 58, cy - 76, w / 2 - 12, cy - 42);
  ctx.closePath(); shape(ctx, '#7fae5c');
  ctx.fillStyle = OUTLINE; circ(ctx, w / 2 - 78, cy - 110, 4.5, OUTLINE, false);
  for (let i = 0; i < 4; i++) {
    tri(ctx, w / 2 - 8 + i * 34, cy - 46, w / 2 + 12 + i * 34, cy - 46, w / 2 + 2 + i * 34, cy - 70, '#5e8c4a');
  }
  ctx.fillStyle = '#7fae5c';
  ctx.fillRect(w / 2 - 36, cy + 32, 18, 44); ctx.strokeRect(w / 2 - 36, cy + 32, 18, 44);
  ctx.fillRect(w / 2 + 40, cy + 32, 18, 44); ctx.strokeRect(w / 2 + 40, cy + 32, 18, 44);
  pen(ctx, 4);
  ctx.beginPath(); ctx.arc(w / 2 + 20, cy + 4, 54, 0.25 * Math.PI, 0.75 * Math.PI); ctx.stroke();
}

function barbell(ctx, w, h) {
  const cy = h / 2 + 16;
  pen(ctx);
  ctx.fillStyle = '#9aa2ab';
  ctx.fillRect(64, cy - 7, w - 128, 14); ctx.strokeRect(64, cy - 7, w - 128, 14);
  for (const s of [-1, 1]) {
    const bx = w / 2 + s * 92;
    ctx.fillStyle = '#4a7590';
    ctx.fillRect(bx - 14, cy - 52, 28, 104); ctx.strokeRect(bx - 14, cy - 52, 28, 104);
    ctx.fillStyle = '#d0704c';
    ctx.fillRect(bx + (s > 0 ? 14 : -26), cy - 40, 12, 80); ctx.strokeRect(bx + (s > 0 ? 14 : -26), cy - 40, 12, 80);
  }
  star(ctx, 74, 64, 12, '#f5c542');
  star(ctx, 312, 64, 12, '#f5c542');
  pen(ctx, 4);
  ctx.beginPath(); ctx.moveTo(120, 246); ctx.lineTo(264, 246); ctx.stroke();
}

const DRAWINGS = { cat, house, fish, rocket, flower, boat, bird, moon, icecream, robot, whale, kite, dinosaur, barbell };

function cartoonTexture(kind) {
  const c = document.createElement('canvas');
  c.width = 384;
  c.height = 288;
  const ctx = c.getContext('2d');
  ctx.fillStyle = kind === 'moon' ? '#31405e' : '#fdf8ec';
  ctx.fillRect(0, 0, c.width, c.height);
  pen(ctx);
  DRAWINGS[kind](ctx, c.width, c.height);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function addPlane(root, name, pos, rotY, w, h, kind) {
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshStandardMaterial({ map: cartoonTexture(kind), roughness: 0.92 })
  );
  mesh.name = name;
  mesh.position.set(...pos);
  mesh.rotation.y = rotY;
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  root.add(mesh);
}

// 白色细框 + 框内卡通画（二楼空白墙用，与一楼护墙板框风格一致）
// pos 为框中心（墙内表面沿法线外移 2.2cm），rotY 决定画面朝向
function addFramedArt(root, name, pos, rotY, kind, fw = 1.9, fh = 0.95) {
  const g = new THREE.Group();
  g.name = name;
  g.position.set(...pos);
  g.rotation.y = rotY;
  const mk = (w, h, x, y) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.04),
      new THREE.MeshStandardMaterial({ color: 0xf3efe4, roughness: 0.9 }));
    m.position.set(x, y, 0);
    m.castShadow = false; m.receiveShadow = true;
    g.add(m);
  };
  mk(fw, 0.06, 0, fh / 2 - 0.03);
  mk(fw, 0.06, 0, -fh / 2 + 0.03);
  mk(0.06, fh - 0.12, -fw / 2 + 0.03, 0);
  mk(0.06, fh - 0.12, fw / 2 - 0.03, 0);
  const art = new THREE.Mesh(new THREE.PlaneGeometry(fw - 0.55, fh - 0.2),
    new THREE.MeshStandardMaterial({ map: cartoonTexture(kind), roughness: 0.92 }));
  art.position.z = 0.008;
  art.receiveShadow = true;
  g.add(art);
  root.add(g);
}

// villaRoot：staticModel('villa') 的克隆（根节点为单位变换，坐标即世界坐标）
export function addWallCartoons(villaRoot) {
  if (!villaRoot) return;
  // 相片墙：隐藏原纯色板（GLB 中被木背板盖住本就不可见），卡通画贴在背板外表面
  // （背板 z -0.12..-0.09，画置 -0.122 置于其前 2mm，正面朝客厅即 -z）
  villaRoot.traverse((o) => { if (/^pw[0-4]a$/.test(o.name)) o.visible = false; });
  const frames = [
    [-6.9, 1.72, 0.42, 0.52, 'cat'],
    [-6.3, 1.86, 0.30, 0.24, 'fish'],
    [-5.75, 1.66, 0.36, 0.44, 'house'],
    [-5.1, 1.82, 0.26, 0.34, 'flower'],
    [-4.62, 1.62, 0.40, 0.30, 'rocket'],
  ];
  for (const [x, y, w, h, kind] of frames) addPlane(villaRoot, 'art_' + kind, [x, y, -0.122], Math.PI, w, h, kind);
  // 白色护墙板空框（框内净空约 2.2×0.95，画略小居中）
  addPlane(villaRoot, 'art_boat', [-1.7, 1.5, -0.072], Math.PI, 1.35, 0.78, 'boat');        // wp2 客厅隔墙
  addPlane(villaRoot, 'art_bird', [-5.8, 1.5, 5.425], Math.PI, 1.35, 0.78, 'bird');         // wp3 卧室南墙西
  addPlane(villaRoot, 'art_moon', [-1.7, 1.5, 5.425], Math.PI, 1.35, 0.78, 'moon');         // wp4 卧室南墙东
  addPlane(villaRoot, 'art_icecream', [-7.425, 1.5, 1.4], Math.PI / 2, 1.35, 0.78, 'icecream'); // wp5 卧室西墙

  // 二楼空白墙（避开窗/门/家具，互不重复）
  addFramedArt(villaRoot, 'art2_robot', [-5.9, 4.45, -5.478], 0, 'robot');                  // 二楼客厅北墙西段
  addFramedArt(villaRoot, 'art2_whale', [-7.478, 4.85, 3.2], Math.PI / 2, 'whale');         // 主卧西墙大床头上方
  addFramedArt(villaRoot, 'art2_kite', [7.478, 4.45, 0.95], -Math.PI / 2, 'kite');          // 儿童房东墙南段
  addFramedArt(villaRoot, 'art2_dinosaur', [1.5, 4.45, 5.478], Math.PI, 'dinosaur');        // 儿童房南墙西段
  addFramedArt(villaRoot, 'art2_barbell', [0.082, 4.45, -1.15], Math.PI / 2, 'barbell');    // 健身房西墙（门南侧）
}
