// villa2.js — M10 扩建：二楼（4房间+楼梯）+ 坡屋顶 + 庭院（围栏/树木/长椅/信箱/花坛）
// M13：视觉层由 Blender 建模（villa.glb 二楼部分 + yard.glb）接管，
// visuals=false 时只生成碰撞体，玩法层（楼梯/围栏/楼板支撑）不变。
import * as THREE from 'three';

const F2 = 3.15;        // 二楼地面高度（楼板顶面）
const WALL_H = 2.9;
const EXT_T = 0.24, INT_T = 0.12;
const mat = (color, opt = {}) => new THREE.MeshLambertMaterial({ color, ...opt });

let VISUALS = true;                 // false = 仅碰撞骨架（GLB 接管视觉）
export function setUpperVisuals(v) { VISUALS = v; }

function box(scene, colliders, cx, cy, cz, sx, sy, sz, m, opts = {}) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), m);
  mesh.position.set(cx, cy, cz);
  mesh.castShadow = opts.castShadow !== false;
  mesh.receiveShadow = true;
  if (VISUALS) scene.add(mesh);
  if (opts.collide !== false) {
    colliders.push({ minX: cx - sx / 2, maxX: cx + sx / 2, minZ: cz - sz / 2, maxZ: cz + sz / 2, minY: cy - sy / 2, maxY: cy + sy / 2 });
  }
  return mesh;
}

// 带开口的直墙（yBase 为墙底高度）
function wall(scene, colliders, o) {
  const { axis, at, from, to, yBase = 0, thickness, m } = o;
  const openings = (o.openings || []).slice().sort((a, b) => a.at - b.at);
  const segs = [];
  let cur = from;
  for (const op of openings) {
    const a0 = op.at - op.w / 2, a1 = op.at + op.w / 2;
    if (a0 > cur) segs.push({ a: cur, b: a0, y0: 0, y1: WALL_H });
    const y0 = op.y0 ?? 0, y1 = op.y1 ?? WALL_H;
    if (y0 > 0) segs.push({ a: a0, b: a1, y0: 0, y1: y0 });
    if (y1 < WALL_H) segs.push({ a: a0, b: a1, y0: y1, y1: WALL_H });
    cur = a1;
  }
  if (cur < to) segs.push({ a: cur, b: to, y0: 0, y1: WALL_H });
  for (const s of segs) {
    const len = s.b - s.a;
    if (len <= 0.002) continue;
    const mid = (s.a + s.b) / 2, sy = s.y1 - s.y0, cy = (s.y0 + s.y1) / 2;
    if (axis === 'x') box(scene, colliders, mid, yBase + cy, at, len, sy, thickness, m);
    else box(scene, colliders, at, yBase + cy, mid, thickness, sy, len, m);
  }
  // 窗玻璃+框（GLB 模式由 Blender 提供）
  for (const op of openings) {
    if (!op.glass || !VISUALS) continue;
    const y0 = op.y0 ?? 0, y1 = op.y1 ?? WALL_H, gy = yBase + (y0 + y1) / 2;
    const glassMat = mat(0xbfe3f2, { transparent: true, opacity: 0.28, depthWrite: false });
    const fm = mat(0x6b5138);
    if (axis === 'x') {
      box(scene, colliders, op.at, gy, at, op.w - 0.1, y1 - y0 - 0.1, 0.03, glassMat, { collide: false, castShadow: false });
      box(scene, colliders, op.at, yBase + y0 + 0.03, at, op.w, 0.06, thickness + 0.06, fm, { collide: false });
      box(scene, colliders, op.at, yBase + y1 - 0.03, at, op.w, 0.06, thickness + 0.06, fm, { collide: false });
      box(scene, colliders, op.at - op.w / 2 + 0.03, gy, at, 0.06, y1 - y0, thickness + 0.06, fm, { collide: false });
      box(scene, colliders, op.at + op.w / 2 - 0.03, gy, at, 0.06, y1 - y0, thickness + 0.06, fm, { collide: false });
    } else {
      box(scene, colliders, at, gy, op.at, 0.03, y1 - y0 - 0.1, op.w - 0.1, glassMat, { collide: false, castShadow: false });
      box(scene, colliders, at, yBase + y0 + 0.03, op.at, thickness + 0.06, 0.06, op.w, fm, { collide: false });
      box(scene, colliders, at, yBase + y1 - 0.03, op.at, thickness + 0.06, 0.06, op.w, fm, { collide: false });
      box(scene, colliders, at, gy, op.at - op.w / 2 + 0.03, thickness + 0.06, y1 - y0, 0.06, fm, { collide: false });
      box(scene, colliders, at, gy, op.at + op.w / 2 - 0.03, thickness + 0.06, y1 - y0, 0.06, fm, { collide: false });
    }
  }
}

export const F2_ROOMS = [
  { id: 'lounge2', name: '家庭厅', y: F2, minX: -7.5, maxX: 0,   minZ: -5.5, maxZ: 0 },
  { id: 'storage', name: '储物间', y: F2, minX: 0,    maxX: 7.5, minZ: -5.5, maxZ: 0 },
  { id: 'master',  name: '主卧',   y: F2, minX: -7.5, maxX: 0,   minZ: 0,    maxZ: 5.5 },
  { id: 'kids',    name: '儿童房', y: F2, minX: 0,    maxX: 7.5, minZ: 0,    maxZ: 5.5 },
];

export function buildUpperFloor(scene, colliders) {
  const extMat = mat(0xe8e0d2), intMat = mat(0xf2ede4);

  // ---- 二楼外墙（每面一扇窗）----
  wall(scene, colliders, { axis: 'x', at: -5.5 - EXT_T / 2, from: -7.62, to: 7.62, yBase: F2, thickness: EXT_T, m: extMat, openings: [{ at: -3.75, w: 1.4, y0: 0.95, y1: 2.15, glass: true }] });
  wall(scene, colliders, { axis: 'x', at: 5.5 + EXT_T / 2, from: -7.62, to: 7.62, yBase: F2, thickness: EXT_T, m: extMat, openings: [{ at: 3.75, w: 1.4, y0: 0.95, y1: 2.15, glass: true }] });
  wall(scene, colliders, { axis: 'z', at: -7.5 - EXT_T / 2, from: -5.5, to: 5.5, yBase: F2, thickness: EXT_T, m: extMat, openings: [{ at: -2.75, w: 1.4, y0: 0.95, y1: 2.15, glass: true }] });
  wall(scene, colliders, { axis: 'z', at: 7.5 + EXT_T / 2, from: -5.5, to: 5.5, yBase: F2, thickness: EXT_T, m: extMat, openings: [{ at: 2.75, w: 1.4, y0: 0.95, y1: 2.15, glass: true }] });

  // ---- 二楼内墙（十字 + 四门洞）----
  wall(scene, colliders, { axis: 'x', at: 0, from: -7.5, to: 7.5, yBase: F2, thickness: INT_T, m: intMat, openings: [{ at: -3.75, w: 1.05, y1: 2.15 }, { at: 3.75, w: 1.05, y1: 2.15 }] });
  wall(scene, colliders, { axis: 'z', at: 0, from: -5.5, to: 5.5, yBase: F2, thickness: INT_T, m: intMat, openings: [{ at: -3, w: 1.05, y1: 2.15 }, { at: 3, w: 1.05, y1: 2.15 }] });

  // ---- 楼板（含楼梯口：x 4.6..7.5 × z -5.5..-4.55 留空）----
  const SLAB_T = 0.25, slabMat = mat(0xd8cdbb);
  const quads = [
    [-7.5, 0, -5.5, 0],       // 家庭厅
    [0, 7.5, -4.55, 0],       // 储物间（楼梯口贯穿整个楼梯段，保证头部空间）
    [-7.5, 0, 0, 5.5],        // 主卧
    [0, 7.5, 0, 5.5],         // 儿童房
  ];
  for (const [x0, x1, z0, z1] of quads) {
    box(scene, colliders, (x0 + x1) / 2, F2 - SLAB_T / 2, (z0 + z1) / 2, x1 - x0, SLAB_T, z1 - z0, slabMat, { castShadow: false });
  }

  // ---- 二楼地板（木色视觉层；GLB 模式由 Blender 提供）----
  if (VISUALS) {
    for (const r of F2_ROOMS) {
      const parts = r.id === 'storage'
        ? [[r.minX, r.maxX, -4.55, r.maxZ]]
        : [[r.minX, r.maxX, r.minZ, r.maxZ]];
      for (const [x0, x1, z0, z1] of parts) {
        const f = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), mat(0xc9a878));
        f.rotation.x = -Math.PI / 2;
        f.position.set((x0 + x1) / 2, F2 + 0.021, (z0 + z1) / 2);
        f.receiveShadow = true;
        scene.add(f);
      }
    }
  }
  // 楼梯口平台补板
  box(scene, colliders, 7.0, F2 - SLAB_T / 2, -5.02, 1.0, SLAB_T, 0.95, slabMat, { castShadow: false });

  // ---- 楼梯（厨房北墙，x 1.2 → 6.5 上升，宽0.9）----
  const STEPS = 18, RISE = F2 / STEPS, TREAD = 0.29;
  for (let i = 0; i < STEPS; i++) {
    box(scene, colliders, 1.2 + i * TREAD + TREAD / 2, (i + 1) * RISE / 2, -5.02, TREAD + 0.02, (i + 1) * RISE, 0.9, mat(0xb08d5f));
  }
  // 楼梯侧栏（开放侧 z=-4.57）
  for (let i = 0; i < STEPS; i += 3) {
    box(scene, colliders, 1.2 + i * TREAD + TREAD / 2, (i + 1) * RISE + 0.45, -4.53, 0.05, 0.9, 0.05, mat(0x8a6a45), { collide: false });
  }
  box(scene, colliders, 3.85, 2.72, -4.53, Math.hypot(5.22, 3.15), 0.07, 0.07, mat(0x8a6a45), { collide: false }).rotation.z = Math.atan2(3.15, 5.22); // 扶手斜梁（随坡度）

  // ---- 二楼楼梯口护栏（纯装饰：开孔四周均为同高层地板或墙体，无坠落风险）----
  box(scene, colliders, 1.07, F2 + 0.45, -5.02, 0.06, 0.9, 0.95, mat(0x8a6a45), { collide: false });
  box(scene, colliders, 7.53, F2 + 0.45, -5.02, 0.06, 0.9, 0.95, mat(0x8a6a45), { collide: false });
  box(scene, colliders, 4.25, F2 + 0.9, -4.53, 6.5, 0.06, 0.07, mat(0x8a6a45), { collide: false });
  box(scene, colliders, 4.25, F2 + 0.45, -4.53, 6.5, 0.9, 0.06, mat(0x8a6a45), { collide: false });

  // ---- 坡屋顶（layer 2：院内/一楼视角可见，菜单俯瞰自动隐藏；GLB 模式由 Blender 提供）----
  if (VISUALS) {
    const ROOF = 2, ridgeY = F2 + WALL_H + 2.15, eaveY = F2 + WALL_H;
    const EZ = 6.35, EX = 8.4;  // 出檐
    const roofMat = mat(0x9a5a48, { side: THREE.DoubleSide });
    for (const side of [-1, 1]) {
      const g = new THREE.BufferGeometry();
      const v = new Float32Array([
        -EX, eaveY, side * EZ,  EX, eaveY, side * EZ,  EX, ridgeY, 0,
        -EX, eaveY, side * EZ,  EX, ridgeY, 0,        -EX, ridgeY, 0,
      ]);
      g.setAttribute('position', new THREE.BufferAttribute(v, 3));
      g.computeVertexNormals();
      const m = new THREE.Mesh(g, roofMat);
      m.layers.set(ROOF);
      m.receiveShadow = true;
      scene.add(m);
    }
    // 屋脊
    const ridge = new THREE.Mesh(new THREE.BoxGeometry(EX * 2 + 0.2, 0.14, 0.32), mat(0x7a4638));
    ridge.position.set(0, ridgeY + 0.06, 0);
    ridge.layers.set(ROOF);
    scene.add(ridge);
    // 山墙（三角封板，东西端）
    for (const ex of [-7.5, 7.5]) {
      const shape = new THREE.Shape();
      shape.moveTo(-5.62, 0); shape.lineTo(5.62, 0); shape.lineTo(0, ridgeY - eaveY); shape.closePath();
      const g = new THREE.Mesh(new THREE.ShapeGeometry(shape), mat(0xe8e0d2, { side: THREE.DoubleSide }));
      g.rotation.y = Math.PI / 2;
      g.position.set(ex + (ex > 0 ? -EXT_T / 2 : EXT_T / 2) * 0 , eaveY - 0.01, 0);
      g.position.x = ex;
      scene.add(g);
    }
    // 烟囱
    const chim = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.7, 0.7), mat(0xb0876a));
    chim.position.set(4.5, ridgeY - 0.15, -1.7);
    chim.castShadow = true;
    scene.add(chim);
  }

  // ---- 二楼顶灯 ----
  for (const r of F2_ROOMS) {
    const l = new THREE.PointLight(0xffe3b8, 0.5, 9.5);
    l.position.set((r.minX + r.maxX) / 2, F2 + 2.55, (r.minZ + r.maxZ) / 2);
    scene.add(l);
  }
}

// ---------- 庭院 ----------
export function buildYard(scene, colliders) {
  const FX = 11.5, FZ = 8.5;   // 围栏范围 ±FX/±FZ
  const fenceMat = mat(0x9aa08e);

  // 围栏（南面正中留大门 x -1.2..1.2）
  const fenceRun = (axis, at, from, to) => {
    const gap = axis === 'x' && at > 0 ? [-1.2, 1.2] : null;
    const segs = gap ? [[from, gap[0]], [gap[1], to]] : [[from, to]];
    for (const [a, b] of segs) {
      if (b - a < 0.1) continue;
      const mid = (a + b) / 2, len = b - a;
      if (axis === 'x') box(scene, colliders, mid, 0.5, at, len, 1.0, 0.08, fenceMat);
      else box(scene, colliders, at, 0.5, mid, 0.08, 1.0, len, fenceMat);
    }
    // 栅栏柱
    for (let p = from; p <= to; p += 2) {
      if (gap && Math.abs(p) < 1.6) continue;
      if (axis === 'x') box(scene, colliders, p, 0.62, at, 0.14, 1.24, 0.14, mat(0x8a9080), { collide: false });
      else box(scene, colliders, at, 0.62, p, 0.14, 1.24, 0.14, mat(0x8a9080), { collide: false });
    }
  };
  fenceRun('x', -FZ, -FX, FX);
  fenceRun('x', FZ, -FX, FX);
  fenceRun('z', -FX, -FZ, FZ);
  fenceRun('z', FX, -FZ, FZ);
  // 门柱
  box(scene, colliders, -1.35, 0.7, FZ, 0.18, 1.4, 0.18, mat(0x7a806e));
  box(scene, colliders, 1.35, 0.7, FZ, 0.18, 1.4, 0.18, mat(0x7a806e));

  // 石板路（南门 → 正门，L形）
  const stone = mat(0xb5b0a4);
  for (let i = 0; i < 6; i++) box(scene, colliders, 0, 0.035, 7.4 - i * 0.62, 1.0, 0.05, 0.5, stone, { collide: false });
  for (let i = 0; i < 7; i++) box(scene, colliders, -0.8 - i * 0.75, 0.035, -2.5, 0.55, 0.05, 1.0, stone, { collide: false });

  // 树木×3（树干+双层树冠）
  const tree = (tx, tz, s = 1) => {
    box(scene, colliders, tx, 1.1 * s, tz, 0.34, 2.2 * s, 0.34, mat(0x6b4f2e));
    const c1 = new THREE.Mesh(new THREE.SphereGeometry(1.5 * s, 12, 10), mat(0x5e8c4a));
    c1.position.set(tx, 2.9 * s, tz); c1.castShadow = true; scene.add(c1);
    const c2 = new THREE.Mesh(new THREE.SphereGeometry(1.05 * s, 12, 10), mat(0x47703a));
    c2.position.set(tx + 0.5 * s, 2.4 * s, tz + 0.4 * s); c2.castShadow = true; scene.add(c2);
  };
  tree(-9.6, -6.4, 1.1);
  tree(9.8, 6.4, 1.0);
  tree(9.9, -6.2, 0.85);

  // 草地点缀花丛（无碰撞）
  for (let i = 0; i < 14; i++) {
    const fx = (Math.random() - 0.5) * 20, fz = (Math.random() - 0.5) * 14;
    if (Math.abs(fx) < 8.6 && Math.abs(fz) < 6.4) continue; // 避开别墅本体
    const fl = new THREE.Mesh(new THREE.SphereGeometry(0.09 + Math.random() * 0.07, 8, 6),
      mat([0xe86a8a, 0xf0c060, 0xd8704a, 0xc9a0dc][i % 4]));
    fl.position.set(fx, 0.12, fz);
    scene.add(fl);
  }
}
