// villa.js — 别墅骨架：4 房间一层，墙体带门窗开口，全部静态碰撞体
// M13：视觉层由 Blender 建模（models/villa.glb）接管，本文件在 visuals=false 时
// 只生成碰撞体与灯光，保证玩法层（碰撞/出生点）不变。
import * as THREE from 'three';
import { tileTexture } from './textures.js';

export const WALL_H = 2.9;          // 墙高
export const EXT_T = 0.24;          // 外墙厚
export const INT_T = 0.12;          // 内墙厚

let VISUALS = true;                 // false = 仅碰撞骨架（GLB 接管视觉）
export function setVillaVisuals(v) { VISUALS = v; }

// 房间定义（俯视图，x 向右，z 向下/南）
export const ROOMS = [
  { id: 'living',  name: '客厅', minX: -7.5, maxX: 0,   minZ: -5.5, maxZ: 0,   floor: 0xc8a06b },
  { id: 'kitchen', name: '厨房', minX: 0,    maxX: 7.5, minZ: -5.5, maxZ: 0,   floor: 0xcfd8da },
  { id: 'bedroom', name: '卧室', minX: -7.5, maxX: 0,   minZ: 0,    maxZ: 5.5, floor: 0xd4b483 },
  { id: 'study',   name: '书房', minX: 0,    maxX: 7.5, minZ: 0,    maxZ: 5.5, floor: 0xb98d5e },
];

export const SPAWN = {
  seeker: { pos: new THREE.Vector3(-11.5, 0, -2.5), yaw: -Math.PI / 2 }, // 围墙西门门口，面向屋门(+X)
};

// ---------- 基础构件 ----------
function addBox(scene, colliders, cx, cy, cz, sx, sy, sz, mat, opts = {}) {
  if (VISUALS) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
    mesh.position.set(cx, cy, cz);
    mesh.castShadow = opts.castShadow !== false;
    mesh.receiveShadow = true;
    scene.add(mesh);
    if (opts.collide !== false) {
      colliders.push({
        minX: cx - sx / 2, maxX: cx + sx / 2,
        minZ: cz - sz / 2, maxZ: cz + sz / 2,
        minY: cy - sy / 2, maxY: cy + sy / 2,
      });
    }
    return mesh;
  }
  if (opts.collide !== false) {
    colliders.push({
      minX: cx - sx / 2, maxX: cx + sx / 2,
      minZ: cz - sz / 2, maxZ: cz + sz / 2,
      minY: cy - sy / 2, maxY: cy + sy / 2,
    });
  }
  return null;
}

// 带开口的墙：openings=[{at(沿墙轴坐标), w, y0=0, y1=WALL_H, glass?, frame?, doorLeaf?}]
function buildWall(scene, colliders, o) {
  const { axis, at, from, to, thickness, mat } = o;
  const openings = (o.openings || []).slice().sort((a, b) => a.at - b.at);
  const segs = [];
  let cur = from;
  for (const op of openings) {
    const a0 = op.at - op.w / 2, a1 = op.at + op.w / 2;
    if (a0 > cur) segs.push({ a: cur, b: a0, y0: 0, y1: WALL_H });
    const y0 = op.y0 ?? 0, y1 = op.y1 ?? WALL_H;
    if (y0 > 0) segs.push({ a: a0, b: a1, y0: 0, y1: y0 });       // 窗台墙
    if (y1 < WALL_H) segs.push({ a: a0, b: a1, y0: y1, y1: WALL_H }); // 窗楣/门楣
    cur = a1;
  }
  if (cur < to) segs.push({ a: cur, b: to, y0: 0, y1: WALL_H });

  for (const s of segs) {
    const len = s.b - s.a;
    if (len <= 0.002) continue;
    const mid = (s.a + s.b) / 2, sy = s.y1 - s.y0, cy = (s.y0 + s.y1) / 2;
    if (axis === 'x') addBox(scene, colliders, mid, cy, at, len, sy, thickness, mat);
    else addBox(scene, colliders, at, cy, mid, thickness, sy, len, mat);
  }

  // 开口装饰：窗玻璃+窗框 / 门框+门扇（GLB 模式下由 Blender 模型提供）
  for (const op of openings) {
    const y0 = op.y0 ?? 0, y1 = op.y1 ?? WALL_H;
    if (!VISUALS) continue;
    if (op.glass) {
      const glassMat = new THREE.MeshLambertMaterial({
        color: 0xbfe3f2, transparent: true, opacity: 0.28, depthWrite: false,
      });
      const gy = (y0 + y1) / 2;
      if (axis === 'x') {
        addBox(scene, colliders, op.at, gy, at, op.w - 0.1, y1 - y0 - 0.1, 0.03, glassMat, { collide: false, castShadow: false });
        addBox(scene, colliders, op.at, y0 + 0.03, at, op.w, 0.06, thickness + 0.06, o.frameMat, { collide: false });
        addBox(scene, colliders, op.at, y1 - 0.03, at, op.w, 0.06, thickness + 0.06, o.frameMat, { collide: false });
        addBox(scene, colliders, op.at - op.w / 2 + 0.03, gy, at, 0.06, y1 - y0, thickness + 0.06, o.frameMat, { collide: false });
        addBox(scene, colliders, op.at + op.w / 2 - 0.03, gy, at, 0.06, y1 - y0, thickness + 0.06, o.frameMat, { collide: false });
        addBox(scene, colliders, op.at, gy, at, 0.05, y1 - y0, thickness + 0.04, o.frameMat, { collide: false }); // 中梃
      } else {
        addBox(scene, colliders, at, gy, op.at, 0.03, y1 - y0 - 0.1, op.w - 0.1, glassMat, { collide: false, castShadow: false });
        addBox(scene, colliders, at, y0 + 0.03, op.at, thickness + 0.06, 0.06, op.w, o.frameMat, { collide: false });
        addBox(scene, colliders, at, y1 - 0.03, op.at, thickness + 0.06, 0.06, op.w, o.frameMat, { collide: false });
        addBox(scene, colliders, at, gy, op.at - op.w / 2 + 0.03, thickness + 0.06, y1 - y0, 0.06, o.frameMat, { collide: false });
        addBox(scene, colliders, at, gy, op.at + op.w / 2 - 0.03, thickness + 0.06, y1 - y0, 0.06, o.frameMat, { collide: false });
        addBox(scene, colliders, at, gy, op.at, thickness + 0.04, y1 - y0, 0.05, o.frameMat, { collide: false });
      }
    }
    if (op.doorLeaf) {
      // 门扇：绕铰链微微敞开（纯装饰，开口实际可通行）
      const hinge = new THREE.Group();
      const leaf = new THREE.Mesh(
        new THREE.BoxGeometry(op.w - 0.08, y1 - 0.06, 0.05),
        new THREE.MeshLambertMaterial({ color: 0x8a5a33 })
      );
      leaf.position.set((op.w - 0.08) / 2, (y1 - 0.06) / 2 + 0.03, 0);
      leaf.castShadow = true;
      hinge.add(leaf);
      const hx = axis === 'x' ? op.at - op.w / 2 : at;
      const hz = axis === 'x' ? at : op.at - op.w / 2;
      hinge.position.set(hx, 0, hz);
      const base = axis === 'x' ? 0 : -Math.PI / 2; // 先让门扇贴合墙线，再敞开
      hinge.rotation.y = base + (op.openAngle ?? 1.9);
      scene.add(hinge);
    }
  }
}

// ---------- 别墅主函数 ----------
export function buildVilla(scene, colliders) {
  const extMat = new THREE.MeshStandardMaterial({ color: 0xe6ddce, roughness: 0.9 });  // 米白外墙
  const intMat = new THREE.MeshStandardMaterial({ color: 0xf0ebe0, roughness: 0.95 }); // 内墙
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x5d4630, roughness: 0.6 }); // 门窗框

  const win = (at) => ({ at, w: 1.4, y0: 0.95, y1: 2.15, glass: true }); // 标准窗
  const door = (at, extra = {}) => ({ at, w: 1.05, y1: 2.15, ...extra }); // 标准门洞

  // 外墙（含正门与各窗；北墙厨房侧不留窗——楼梯贴墙而上）
  buildWall(scene, colliders, { axis: 'x', at: -5.5 - EXT_T / 2, from: -7.62, to: 7.62, thickness: EXT_T, mat: extMat, frameMat,
    openings: [win(-3.75)] });                                              // 北墙
  buildWall(scene, colliders, { axis: 'x', at: 5.5 + EXT_T / 2, from: -7.62, to: 7.62, thickness: EXT_T, mat: extMat, frameMat,
    openings: [win(-3.75), win(3.75)] });                                   // 南墙
  buildWall(scene, colliders, { axis: 'z', at: -7.5 - EXT_T / 2, from: -5.5, to: 5.5, thickness: EXT_T, mat: extMat, frameMat,
    openings: [win(-4.3), door(-2.5, { doorLeaf: true, y1: 2.2 })] });      // 西墙（正门）
  buildWall(scene, colliders, { axis: 'z', at: 7.5 + EXT_T / 2, from: -5.5, to: 5.5, thickness: EXT_T, mat: extMat, frameMat,
    openings: [win(-2.75), win(2.75)] });                                   // 东墙

  // 内墙：十字分隔 4 房间，各留门洞（客厅↔厨房为1.4宽拱门洞）
  buildWall(scene, colliders, { axis: 'x', at: 0, from: -7.5, to: 7.5, thickness: INT_T, mat: intMat, frameMat,
    openings: [door(-3.75), door(3.75)] });                                 // 横墙：客厅↔卧室、厨房↔书房
  buildWall(scene, colliders, { axis: 'z', at: 0, from: -5.5, to: 5.5, thickness: INT_T, mat: intMat, frameMat,
    openings: [{ at: -3, w: 1.4, y1: 2.15 }, door(3)] });                   // 竖墙：拱门 + 卧室↔书房

  // 拱形门洞上方的弧形填充（椭圆拱：宽1.4，起拱1.75，顶2.15）
  const AW = 0.7, SPRING = 1.75, ATOP = 2.15, RY = ATOP - SPRING;
  for (let u = -0.65; u <= 0.66; u += 0.09) {
    const yTop = SPRING + RY * Math.sqrt(Math.max(0, 1 - (u / AW) ** 2));
    if (yTop < ATOP - 0.004) {
      addBox(scene, colliders, 0, (yTop + ATOP) / 2, -3 + u, INT_T, ATOP - yTop, 0.095, intMat);
    }
  }

  // 各房间地板（Blender 模型模式跳过）
  if (VISUALS) {
    const woodLoader = new THREE.TextureLoader();
    for (const r of ROOMS) {
      const w = r.maxX - r.minX, d = r.maxZ - r.minZ;
      let matFloor;
      if (r.id === 'kitchen') {
        matFloor = new THREE.MeshStandardMaterial({ map: tileTexture(w, d), roughness: 0.55, metalness: 0 });
      } else {
        const tex = woodLoader.load('textures/wood_diff.jpg');
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(w / 2.2, d / 2.2);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = 8;
        matFloor = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.65, metalness: 0.02 });
      }
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, d), matFloor);
      floor.rotation.x = -Math.PI / 2;
      floor.position.set((r.minX + r.maxX) / 2, 0.012, (r.minZ + r.maxZ) / 2);
      floor.receiveShadow = true;
      scene.add(floor);
    }

    // 天花板（单面朝下：室内可见、上帝视角自动隐去，方便藏家俯瞰）
    // 用不受光材质，避免半球光把顶面染成暗棕色
    const ceil = new THREE.Mesh(
      new THREE.PlaneGeometry(15.4, 11.4),
      new THREE.MeshBasicMaterial({ color: 0xf0ede6 })
    );
    ceil.rotation.x = Math.PI / 2;
    ceil.position.set(0, WALL_H - 0.03, 0);   // 低于楼板底面2.9，避免共面闪烁
    ceil.receiveShadow = true;
    scene.add(ceil);

    // 门廊台阶（正门外）
    addBox(scene, colliders, -7.9, 0.06, -2.5, 1.6, 0.12, 1.6,
      new THREE.MeshLambertMaterial({ color: 0xb0aca4 }), { collide: false });
  }

  // 各房间暖色顶灯（无阴影，低成本补光）
  for (const r of ROOMS) {
    const l = new THREE.PointLight(0xffe3b8, 0.5, 9.5);
    l.position.set((r.minX + r.maxX) / 2, 2.55, (r.minZ + r.maxZ) / 2);
    scene.add(l);
  }

  return { rooms: ROOMS, spawn: SPAWN, wallHeight: WALL_H };
}
