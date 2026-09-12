// realism.js — 建筑细部与软装（法式奶油风升级）：石膏线/踢脚线/灯槽/护墙板/拱门/窗帘/吊灯/相片墙
import * as THREE from 'three';

const mat = (color, opt = {}) => new THREE.MeshLambertMaterial({ color, ...opt });
const box = (scene, w, h, d, color, x, y, z, opt = {}) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), opt.mat || mat(color));
  m.position.set(x, y, z);
  m.castShadow = opt.castShadow ?? false;
  m.receiveShadow = true;
  scene.add(m);
  return m;
};

// 房间几何（与 villa.js ROOMS 一致）
export const ROOM_BOUNDS = [
  { id: 'living',  minX: -7.5, maxX: 0,   minZ: -5.5, maxZ: 0 },
  { id: 'kitchen', minX: 0,    maxX: 7.5, minZ: -5.5, maxZ: 0 },
  { id: 'bedroom', minX: -7.5, maxX: 0,   minZ: 0,    maxZ: 5.5 },
  { id: 'study',   minX: 0,    maxX: 7.5, minZ: 0,    maxZ: 5.5 },
];
const INSET = 0.05;   // 内墙面向屋内偏移
const WALL_H = 2.9;

// 门洞位置（用于踢脚线/石膏线断开）
const DOOR_GAPS = [
  { axis: 'x', at: 0, from: -3.75 - 0.55, to: -3.75 + 0.55 },  // 客厅↔卧室
  { axis: 'x', at: 0, from: 3.75 - 0.55, to: 3.75 + 0.55 },   // 厨房↔书房
  { axis: 'z', at: 0, from: -3 - 0.7, to: -3 + 0.7 },         // 客厅↔厨房（拱门，宽1.4）
  { axis: 'z', at: 0, from: 3 - 0.55, to: 3 + 0.55 },         // 卧室↔书房
  { axis: 'z', at: -7.5, from: -2.5 - 0.6, to: -2.5 + 0.6 },  // 正门
];

// 沿墙放长条（自动跳过门洞）；axis=x 表示墙沿x向延伸、位于z=at
function wallRun(scene, axis, at, from, to, y, h, depth, color, dir) {
  let segs = [];
  let cur = from;
  const gaps = DOOR_GAPS.filter(g => g.axis === axis && Math.abs(g.at - at) < 0.14)
    .map(g => [g.from, g.to]).sort((a, b) => a[0] - b[0]);
  for (const [g0, g1] of gaps) {
    if (g0 > cur) segs.push([cur, Math.min(g0, to)]);
    cur = Math.max(cur, g1);
  }
  if (cur < to) segs.push([cur, to]);
  for (const [a, b] of segs) {
    if (b - a < 0.05) continue;
    const mid = (a + b) / 2, len = b - a;
    if (axis === 'x') box(scene, len, h, depth, color, mid, y, at + dir * (depth / 2 + 0.01));
    else box(scene, depth, h, len, color, at + dir * (depth / 2 + 0.01), y, mid);
  }
}

export function addRealism(scene) {
  const trimColor = 0xf7f3ea;
  const MOLD_H = 0.1, BASE_H = 0.12;

  for (const r of ROOM_BOUNDS) {
    const cx = (r.minX + r.maxX) / 2, cz = (r.minZ + r.maxZ) / 2;
    // 石膏线（墙顶）
    wallRun(scene, 'x', r.minZ + INSET, r.minX, r.maxX, WALL_H - MOLD_H / 2 - 0.02, MOLD_H, 0.06, trimColor, +1);
    wallRun(scene, 'x', r.maxZ - INSET, r.minX, r.maxX, WALL_H - MOLD_H / 2 - 0.02, MOLD_H, 0.06, trimColor, -1);
    wallRun(scene, 'z', r.minX + INSET, r.minZ, r.maxZ, WALL_H - MOLD_H / 2 - 0.02, MOLD_H, 0.06, trimColor, +1);
    wallRun(scene, 'z', r.maxX - INSET, r.minZ, r.maxZ, WALL_H - MOLD_H / 2 - 0.02, MOLD_H, 0.06, trimColor, -1);
    // 踢脚线（跳过门洞）
    wallRun(scene, 'x', r.minZ + INSET, r.minX, r.maxX, BASE_H / 2, BASE_H, 0.04, trimColor, +1);
    wallRun(scene, 'x', r.maxZ - INSET, r.minX, r.maxX, BASE_H / 2, BASE_H, 0.04, trimColor, -1);
    wallRun(scene, 'z', r.minX + INSET, r.minZ, r.maxZ, BASE_H / 2, BASE_H, 0.04, trimColor, +1);
    wallRun(scene, 'z', r.maxX - INSET, r.minZ, r.maxZ, BASE_H / 2, BASE_H, 0.04, trimColor, -1);
    // 灯槽暖光带（吊顶内圈发光条）
    const glow = new THREE.MeshBasicMaterial({ color: 0xffe2ad });
    const in2 = 0.22;
    box(scene, r.maxX - r.minX - in2 * 2, 0.035, 0.04, 0, cx, WALL_H - 0.12, r.minZ + in2, { mat: glow });
    box(scene, r.maxX - r.minX - in2 * 2, 0.035, 0.04, 0, cx, WALL_H - 0.12, r.maxZ - in2, { mat: glow });
    box(scene, 0.04, 0.035, r.maxZ - r.minZ - in2 * 2, 0, r.minX + in2, WALL_H - 0.12, cz, { mat: glow });
    box(scene, 0.04, 0.035, r.maxZ - r.minZ - in2 * 2, 0, r.maxX - in2, WALL_H - 0.12, cz, { mat: glow });
  }

  // 护墙板（客厅沙发后墙 + 卧室南墙 + 卧室西墙）
  const panel = (axis, at, dir, from, to) => {
    const y0 = 0.98, y1 = 2.02, t = 0.035, depth = 0.028;
    const len = to - from, mid = (from + to) / 2;
    const put = (w, h, off, offY) => {
      if (axis === 'x') box(scene, w, h, depth, 0xe4ddcc, off, offY, at + dir * (INSET + depth / 2 - 0.005));
      else box(scene, depth, h, w, 0xe4ddcc, at + dir * (INSET + depth / 2 - 0.005), offY, off);
    };
    put(len, t, mid, y0);
    put(len, t, mid, y1);
    put(t, y1 - y0, from + t / 2, (y0 + y1) / 2);
    put(t, y1 - y0, to - t / 2, (y0 + y1) / 2);
  };
  panel('x', 0, -1, -7.3, -4.5);   // 客厅沙发后（左段）
  panel('x', 0, -1, -3.0, -0.4);   // 客厅沙发后（右段）
  panel('x', 5.5, -1, -6.9, -4.7); // 卧室南墙左
  panel('x', 5.5, -1, -2.8, -0.6); // 卧室南墙右
  panel('z', -7.5, 1, 0.6, 2.2);   // 卧室西墙

  // 拱形门洞填充（客厅↔厨房，x=0墙 z=-3，洞宽1.3，椭圆拱）
  const AW = 0.65, SPRING = 1.75, TOP = 2.15, RY = TOP - SPRING;
  for (let u = -0.6; u <= 0.61; u += 0.1) {
    const yTop = SPRING + RY * Math.sqrt(Math.max(0, 1 - (u / AW) ** 2));
    if (yTop < TOP - 0.005) {
      box(scene, 0.105, TOP - yTop, 0.12, 0xf2ede4, 0.005, (yTop + TOP) / 2, -3 + u);
    }
  }

  // 窗帘（spread=两片帘离窗中心的距离，shift=整体偏移避开家具）
  const curtain = (axis, wallAt, dir, centerAt, w = 1.4, spread = 0.65, shift = 0) => {
    const rodLen = w + 0.6 + Math.abs(shift), rodY = 2.32, off = INSET + 0.14;
    const c = centerAt + shift;
    const px = axis === 'x' ? c : wallAt + dir * off;
    const pz = axis === 'x' ? wallAt + dir * off : c;
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, rodLen, 10), mat(0x6b5138));
    if (axis === 'x') rod.rotation.z = Math.PI / 2; else rod.rotation.x = Math.PI / 2;
    rod.position.set(px, rodY, pz);
    rod.castShadow = true;
    scene.add(rod);
    for (const side of [-1, 1]) {
      const geo = new THREE.PlaneGeometry(0.42, 2.1, 20, 1);
      const pos = geo.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const lx = pos.getX(i);
        pos.setZ(i, Math.sin(lx * 22 + side * 2) * 0.05 + Math.sin(lx * 9) * 0.03);
      }
      geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, mat(0xf6f0e4, { side: THREE.DoubleSide }));
      const cp = axis === 'x' ? c + side * spread : wallAt + dir * (off + 0.05);
      const cz2 = axis === 'x' ? wallAt + dir * (off + 0.05) : c + side * spread;
      m.position.set(cp, rodY - 1.08, cz2);
      if (axis === 'z') m.rotation.y = Math.PI / 2;
      m.castShadow = true;
      scene.add(m);
    }
  };
  curtain('x', -5.5, 1, -3.75);                    // 北墙客厅窗
  // 北墙厨房窗不挂帘（楼梯从此经过）
  curtain('x', 5.5, -1, -3.75, 1.4, 0.85);         // 南墙卧室窗（避开衣柜区加宽）
  curtain('x', 5.5, -1, 3.75, 1.4, 0.85);          // 南墙书房窗（避开书桌）
  curtain('z', 7.5, -1, -2.75, 1.4, 0.28, 0.85);   // 东墙厨房窗（帘拢到南侧避开橱柜）
  curtain('z', 7.5, -1, 2.75);                     // 东墙书房窗
  curtain('z', -7.5, 1, -4.3);                     // 西墙客厅窗
  curtain('z', -7.5, 1, 2.75);                     // 西墙卧室窗

  // 相片墙（客厅沙发上方）
  const frames = [
    [-6.9, 1.72, 0.42, 0.52, 0x8a9b7a], [-6.3, 1.86, 0.3, 0.24, 0xc9b28a],
    [-5.75, 1.66, 0.36, 0.44, 0xa87d6a], [-5.1, 1.82, 0.26, 0.34, 0x7a8ba0],
    [-4.62, 1.62, 0.4, 0.3, 0xb8a67c],
  ];
  for (const [fx, fy, w, h, art] of frames) {
    box(scene, w + 0.05, h + 0.05, 0.03, 0x5a4632, fx, fy, -0.1);
    box(scene, w, h, 0.012, art, fx, fy, -0.082);
  }

  // 客厅奶油泡分子灯
  const chand = new THREE.Group();
  const bulbMat = new THREE.MeshBasicMaterial({ color: 0xfff0c8 });
  const armMat = mat(0x2e2a26);
  cyl(chand, 0.012, 0.5, 0x2e2a26, 0, 0.25, 0);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.014, 8, 24), armMat);
  ring.rotation.x = Math.PI / 2;
  chand.add(ring);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const bx = Math.cos(a) * 0.3, bz = Math.sin(a) * 0.3;
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.075, 12, 10), bulbMat);
    b.position.set(bx, -0.06 - (i % 2) * 0.09, bz);
    chand.add(b);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.14, 6), armMat);
    stem.position.set(bx, 0.02, bz);
    chand.add(stem);
  }
  chand.position.set(-3.75, WALL_H - 0.62, -2.75);
  scene.add(chand);

  // 厨房气泡吊灯（餐桌上方）
  const bubbles = new THREE.Group();
  const specs = [[-0.22, -0.34, 0.09], [0.1, -0.15, 0.07], [-0.05, 0.05, 0.12], [0.24, 0.18, 0.06], [-0.2, 0.3, 0.08]];
  for (const [bx, bz, r] of specs) {
    const dropH = 0.3 + Math.abs(bx) + Math.abs(bz);
    const drop = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, dropH, 6), armMat);
    drop.position.set(bx, dropH / 2, bz);
    const bb = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 10), bulbMat);
    bb.position.set(bx, 0, bz);
    bubbles.add(drop, bb);
  }
  bubbles.position.set(3.4, WALL_H - 0.55, -2.3);
  scene.add(bubbles);

  // 厨房挡水板
  box(scene, 0.03, 0.6, 2.4, 0xded8ca, 7.5 - INSET - 0.015, 1.2, -3.7);
}

function cyl(g, r, h, color, x, y, z) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 12), mat(color));
  m.position.set(x, y, z);
  g.add(m);
  return m;
}
