// furniture.js — 程序化家具库：建造函数 + 全屋布局 + 槽位元数据
// 坐标约定：每件家具 Group 原点在占地中心、地面高度；正面朝局部 +z，放置时用 rotY 转向
import * as THREE from 'three';
import { rugTexture } from './textures.js';

// ---------- 调色板 ----------
const C = {
  wood: 0x9a6b3f, woodDark: 0x7a5230, woodLight: 0xcdaa7d,
  white: 0xf2f2f0, offWhite: 0xe8e6e0, metal: 0x9aa2ab, dark: 0x3a3d42,
  sofa: 0x6e8ca8,
  green: 0x5e8c4a, greenDark: 0x47703a, pot: 0xb0603c,
  red: 0xb5554d,
  mattress: 0xeae6dc, blanket: 0x7f9db8, pillow: 0xf7f4ec,
  gray: 0xb9bdb6, screen: 0x1c1e22,
  bookCols: [0xb5554d, 0x5e7ea8, 0x6e9a5e, 0xc9a227, 0x8a6ea8, 0xc97b4a, 0x5ea8a0],
};
const mat = (color, opt = {}) => new THREE.MeshLambertMaterial({ color, ...opt });

function box(g, w, h, d, color, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
  m.position.set(x, y, z);
  m.castShadow = true; m.receiveShadow = true;
  g.add(m);
  return m;
}
function cyl(g, r, h, color, x = 0, y = 0, z = 0, seg = 16) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), mat(color));
  m.position.set(x, y, z);
  m.castShadow = true; m.receiveShadow = true;
  g.add(m);
  return m;
}
function legs4(g, w, d, h, color, t = 0.06) {
  for (const sx of [-1, 1]) for (const sz of [-1, 1])
    box(g, t, h, t, color, sx * (w / 2 - t), h / 2, sz * (d / 2 - t));
}

// 抽屉：面板+真实箱体（底/左右侧/后板），滑动时不再悬空
function drawerBox(w, h, d, frontColor, x, y, z) {
  const dg = new THREE.Group();
  const body = 0x8a6a45;
  box(dg, w, h, 0.035, frontColor, 0, 0, d / 2 - 0.017);              // 前面板
  box(dg, w - 0.05, 0.02, d - 0.08, body, 0, -h / 2 + 0.025, -0.02);  // 底
  box(dg, 0.02, h - 0.05, d - 0.08, body, -w / 2 + 0.025, 0, -0.02);  // 左侧
  box(dg, 0.02, h - 0.05, d - 0.08, body, w / 2 - 0.025, 0, -0.02);   // 右侧
  box(dg, w - 0.05, h - 0.05, 0.02, body, 0, 0, -d / 2 + 0.03);       // 后板
  dg.position.set(x, y, z);
  return dg;
}

// ---------- 家具建造函数 ----------
// 每个 builder 返回 { group, parts } ；parts 里放需要开合动画的节点（M4 用）

function sofa() {
  // 法式圆扶手三人沙发（与 models/pieces/sofa.glb 同轮廓的兜底版，GLB 加载失败时使用）
  // 尺寸锚点：占地 1.90 x 0.85、总高 0.855、原点=占地中心+地面、正面朝 +z、底部净空 0.145
  const g = new THREE.Group(), P = {};
  const VELVET = 0x5e7a52, VELVET_D = 0x506a46, CREAM = 0xe8e2d2, CREAM_D = 0xd2c9b4;
  const SEAM = 0x37432b, WOOD = 0x4a3826, GOLD = 0xb99a4a;
  // 车木腿（铜脚套 0→0.014 + 柱身 0.014→0.145）
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    box(g, 0.062, 0.028, 0.062, GOLD, sx * 0.845, 0.014, sz * 0.345);
    box(g, 0.070, 0.117, 0.070, WOOD, sx * 0.845, 0.0865, sz * 0.345);
  }
  box(g, 1.90, 0.067, 0.84, VELVET_D, 0, 0.1785, 0);             // 围裙
  box(g, 1.86, 0.012, 0.82, SEAM, 0, 0.205, 0.01);               // 围裙下暗缝
  box(g, 1.90, 0.235, 0.85, VELVET, 0, 0.3225, 0);               // 坐箱
  for (const cx of [-0.494, 0, 0.494]) {
    box(g, 0.482, 0.140, 0.710, CREAM, cx, 0.516, 0.05);         // 坐垫
    box(g, 0.482, 0.022, 0.022, CREAM_D, cx, 0.578, -0.301);     // 后滚边
    box(g, 0.022, 0.022, 0.702, CREAM_D, cx - 0.235, 0.578, 0.05);
    box(g, 0.022, 0.022, 0.702, CREAM_D, cx + 0.235, 0.578, 0.05);
  }
  for (const sx of [-1, 1]) box(g, 0.012, 0.026, 0.70, SEAM, sx * 0.2465, 0.576, 0.05); // 垫间暗缝
  // 靠背：暗色背板 + 三块后倾 0.10 rad 的独立面板 + 腰枕圆枕
  box(g, 1.48, 0.46, 0.04, SEAM, 0, 0.65, -0.30).rotation.x = -0.10;
  for (const bx of [-0.497, 0, 0.497]) {
    const bp = box(g, 0.485, 0.40, 0.20, VELVET_D, bx, 0.635, -0.237);
    bp.rotation.x = -0.10;
  }
  const lum = cyl(g, 0.045, 1.46, VELVET_D, 0, 0.505, -0.212, 20);
  lum.rotation.z = Math.PI / 2;
  // 卷臂：侧板 + 前后向圆枕 + 前卷盘
  for (const sx of [-1, 1]) {
    box(g, 0.22, 0.36, 0.80, VELVET_D, sx * 0.840, 0.50, 0.0);
    const roll = cyl(g, 0.090, 0.80, VELVET_D, sx * 0.840, 0.650, 0.0, 20);
    roll.rotation.x = Math.PI / 2;
    const scroll = cyl(g, 0.102, 0.040, VELVET_D, sx * 0.840, 0.650, 0.390, 20);
    scroll.rotation.x = Math.PI / 2;
  }
  return { group: g, parts: P };
}

function coffeeTable() {
  // 与 coffee_table.glb v2 同尺寸：厚板桌面(顶0.45) + 四面围板(顶贴桌底0.408)
  // + 车木锥腿(足Ø52/下Ø44/上Ø62, 锚定±0.49/±0.24, 高0.40) + 低位隔板(顶0.155)
  const g = new THREE.Group();
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const lx = sx * 0.49, lz = sz * 0.24;
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.012, 16), C.woodDark);
    foot.position.set(lx, 0.006, lz);
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.031, 0.022, 0.388, 16), C.woodDark);
    shaft.position.set(lx, 0.206, lz);
    g.add(foot, shaft);
  }
  box(g, 1.1, 0.042, 0.6, C.wood, 0, 0.429, 0);                   // 桌面
  box(g, 0.98, 0.026, 0.016, C.woodDark, 0, 0.395, 0.235);        // 围板前
  box(g, 0.98, 0.026, 0.016, C.woodDark, 0, 0.395, -0.235);       // 围板后
  box(g, 0.016, 0.026, 0.454, C.woodDark, 0.482, 0.395, 0);       // 围板右
  box(g, 0.016, 0.026, 0.454, C.woodDark, -0.482, 0.395, 0);      // 围板左
  box(g, 0.94, 0.03, 0.44, C.woodDark, 0, 0.14, 0);               // 隔板
  return { group: g, parts: {} };
}

function tvCabinet() {
  const g = new THREE.Group(), P = {};
  legs4(g, 1.6, 0.42, 0.06, C.woodDark);
  box(g, 1.6, 0.44, 0.42, C.wood, 0, 0.28, 0);
  // 两扇柜门（M4 可打开）
  P.doorL = box(g, 0.72, 0.36, 0.03, C.woodLight, -0.4, 0.28, 0.215);
  P.doorR = box(g, 0.72, 0.36, 0.03, C.woodLight, 0.4, 0.28, 0.215);
  box(g, 0.05, 0.06, 0.05, C.dark, 0, 0.28, 0.235);              // 把手座
  return { group: g, parts: P };
}

function tv() {
  // 与 tv.glb 同尺寸: 屏宽1.45 总高1.09(含脚架) 厚0.26
  const g = new THREE.Group();
  box(g, 0.38, 0.26, 0.014, C.metal, 0, 0.007, 0);                // 拉铝底板
  box(g, 0.08, 0.05, 0.24, C.metal, 0, 0.13, 0);                  // 支架颈
  box(g, 1.45, 0.82, 0.04, C.dark, 0, 0.66, 0);                   // 机身
  box(g, 1.35, 0.72, 0.01, C.screen, 0, 0.66, 0.025);             // 屏面
  return { group: g, parts: {} };
}

function carpet(w = 2.6, d = 1.8) {
  // 掀开动画走 interact.js 的 __group 整体铰链，无需 parts
  const g = new THREE.Group();
  const base = new THREE.Mesh(
    new THREE.BoxGeometry(w, 0.022, d),
    new THREE.MeshLambertMaterial({ map: rugTexture(w, d) })
  );
  base.position.y = 0.035;   // 抬到地板视觉层之上，避免共面闪烁
  base.receiveShadow = true;
  g.add(base);
  return { group: g, parts: {} };
}

function plant() {
  const g = new THREE.Group();
  cyl(g, 0.16, 0.3, C.pot, 0, 0.15, 0);
  cyl(g, 0.14, 0.03, 0x5a4632, 0, 0.29, 0);                      // 土面
  cyl(g, 0.025, 0.34, 0x6b4f2e, 0, 0.47, 0);                     // 茎
  const s1 = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8), mat(C.green));
  s1.position.set(0, 0.68, 0); s1.castShadow = true; g.add(s1);
  const s2 = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), mat(C.greenDark));
  s2.position.set(0.1, 0.56, 0.06); s2.castShadow = true; g.add(s2);
  return { group: g, parts: {} };
}

function floorLamp() {
  const g = new THREE.Group();
  cyl(g, 0.16, 0.03, C.dark, 0, 0.015, 0);
  cyl(g, 0.02, 1.3, C.metal, 0, 0.68, 0);
  const shade = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.24, 12, 1, true), mat(0xf0e0b8, { side: THREE.DoubleSide }));
  shade.position.y = 1.42; g.add(shade);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), mat(0xfff2c8, { emissive: 0x554422 }));
  bulb.position.y = 1.36; g.add(bulb);
  return { group: g, parts: {} };
}

function counter() {
  // 厨房橱柜：2抽屉 + 1柜门 + 开放格，台面含水槽龙头
  const g = new THREE.Group(), P = {};
  box(g, 2.4, 0.82, 0.62, C.woodLight, 0, 0.41, 0);
  box(g, 2.44, 0.05, 0.66, C.offWhite, 0, 0.875, 0);             // 台面
  // 水槽
  box(g, 0.5, 0.02, 0.4, C.metal, -0.6, 0.9, 0);
  box(g, 0.44, 0.06, 0.34, 0x8b929a, -0.6, 0.865, 0);
  cyl(g, 0.02, 0.24, C.metal, -0.6, 1.0, -0.22);
  // 抽屉（滑出式，含真实箱体）
  P.drawer1 = drawerBox(0.72, 0.2, 0.58, C.wood, -0.6, 0.68, 0.02);
  P.drawer2 = drawerBox(0.72, 0.2, 0.58, C.wood, 0.25, 0.68, 0.02);
  // 柜门（下翻门简化为左开门）
  P.cabDoor = box(g, 0.72, 0.5, 0.03, C.wood, -0.6, 0.25, 0.315);
  box(g, 0.72, 0.5, 0.56, C.woodDark, 0.25, 0.25, 0);            // 开放格内腔
  return { group: g, parts: P };
}

function fridge() {
  const g = new THREE.Group(), P = {};
  box(g, 0.75, 1.78, 0.7, C.offWhite, 0, 0.89, 0);
  P.door = box(g, 0.73, 1.74, 0.05, 0xdcdcd6, 0, 0.89, 0.35);    // 单门（M4可开）
  box(g, 0.04, 0.5, 0.04, C.metal, -0.28, 1.1, 0.39);            // 把手
  box(g, 0.02, 0.3, 0.02, C.metal, -0.28, 0.55, 0.39);
  return { group: g, parts: P };
}

function diningTable() {
  // 圆形实木餐桌（中心柱脚）
  const g = new THREE.Group();
  cyl(g, 0.09, 0.68, C.woodDark, 0, 0.34, 0);                    // 中心柱
  cyl(g, 0.32, 0.05, C.woodDark, 0, 0.025, 0);                   // 底盘
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 0.05, 28), mat(C.wood));
  top.position.y = 0.73;
  top.castShadow = true; top.receiveShadow = true;
  g.add(top);
  return { group: g, parts: {} };
}

function armchair() {
  // 泰迪绒单人休闲椅
  const g = new THREE.Group();
  const FUR = 0xd9c9ae;
  cyl(g, 0.4, 0.26, FUR, 0, 0.2, 0);                             // 坐墩
  const back = new THREE.Mesh(
    new THREE.CylinderGeometry(0.42, 0.42, 0.55, 20, 1, true, -Math.PI * 0.92, Math.PI * 0.92),
    mat(FUR, { side: THREE.DoubleSide })
  );
  back.position.y = 0.5;
  back.castShadow = true;
  g.add(back);
  cyl(g, 0.36, 0.07, 0xcfb99a, 0, 0.36, 0).castShadow = true; // 坐垫
  return { group: g, parts: {} };
}

function chair() {
  const g = new THREE.Group();
  legs4(g, 0.42, 0.42, 0.44, C.woodDark, 0.04);
  box(g, 0.45, 0.05, 0.45, C.wood, 0, 0.465, 0);
  box(g, 0.45, 0.5, 0.04, C.wood, 0, 0.74, -0.2);
  return { group: g, parts: {} };
}

function cup() {
  // 真实空心杯：开口向上，能直接看到内部
  const g = new THREE.Group();
  const wall = new THREE.Mesh(
    new THREE.CylinderGeometry(0.045, 0.04, 0.11, 16, 1, true),
    mat(C.white, { side: THREE.DoubleSide })
  );
  wall.position.y = 0.055; wall.castShadow = true; g.add(wall);
  cyl(g, 0.04, 0.008, 0xdad8d2, 0, 0.006, 0);                    // 杯底
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.028, 0.007, 8, 14, Math.PI), mat(C.white));
  handle.position.set(0.05, 0.06, 0);
  handle.rotation.z = -Math.PI / 2;
  g.add(handle);
  return { group: g, parts: {} };
}

function fruitBowl() {
  // 空心果盘
  const g = new THREE.Group();
  const wall = new THREE.Mesh(
    new THREE.CylinderGeometry(0.15, 0.11, 0.07, 18, 1, true),
    mat(0x7fa88a, { side: THREE.DoubleSide })
  );
  wall.position.y = 0.035; wall.castShadow = true; g.add(wall);
  cyl(g, 0.12, 0.012, 0x688f72, 0, 0.012, 0).castShadow = false; // 盘底
  const f1 = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), mat(0xd97b4a));
  f1.position.set(0.08, 0.05, 0.03); f1.castShadow = true; g.add(f1);
  const f2 = new THREE.Mesh(new THREE.SphereGeometry(0.04, 10, 8), mat(0xc9403a));
  f2.position.set(-0.06, 0.045, -0.05); f2.castShadow = true; g.add(f2);
  return { group: g, parts: {} };
}

function microwave() {
  // 空心炉腔（内部可藏物）+ 可开门
  const g = new THREE.Group(), P = {};
  box(g, 0.5, 0.02, 0.38, C.dark, 0, 0.01, 0);
  box(g, 0.5, 0.02, 0.38, C.dark, 0, 0.29, 0);
  box(g, 0.02, 0.3, 0.38, C.dark, -0.24, 0.15, 0);
  box(g, 0.02, 0.3, 0.38, C.dark, 0.24, 0.15, 0);
  box(g, 0.5, 0.3, 0.02, C.dark, 0, 0.15, -0.18);
  P.door = new THREE.Group();
  box(P.door, 0.46, 0.26, 0.022, C.dark, 0, 0.15, 0.201);
  box(P.door, 0.34, 0.17, 0.01, 0x22252a, -0.03, 0.15, 0.209);
  box(P.door, 0.035, 0.16, 0.028, C.metal, 0.195, 0.15, 0.212);
  g.add(P.door);
  return { group: g, parts: P };
}

function kettle() {
  // 台面水壶（独立装饰件，可被瞄准命名）
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.16, 20), mat(C.metal));
  body.position.y = 0.08; body.castShadow = true; g.add(body);
  const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.02, 16), mat(C.gray));
  lid.position.y = 0.17; g.add(lid);
  const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.1, 10), mat(C.metal));
  spout.position.set(-0.08, 0.09, 0.06); g.add(spout);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.008, 10, 20), mat(0x2a2d33));
  handle.position.set(0.09, 0.12, 0); handle.rotation.y = Math.PI / 2; g.add(handle);
  return { group: g, parts: {} };
}

function board() {
  const g = new THREE.Group();
  box(g, 0.35, 0.018, 0.25, C.woodLight, 0, 0.009, 0);
  return { group: g, parts: {} };
}

function trashBin() {
  // 空心垃圾桶
  const g = new THREE.Group();
  const wall = new THREE.Mesh(
    new THREE.CylinderGeometry(0.155, 0.13, 0.42, 16, 1, true),
    mat(C.gray, { side: THREE.DoubleSide })
  );
  wall.position.y = 0.21; wall.castShadow = true; g.add(wall);
  cyl(g, 0.13, 0.015, 0x5a5d60, 0, 0.06, 0).castShadow = false;  // 桶底
  return { group: g, parts: {} };
}

function bed() {
  const g = new THREE.Group();
  legs4(g, 1.6, 2.1, 0.18, C.woodDark);
  box(g, 1.6, 0.14, 2.1, C.wood, 0, 0.25, 0);                    // 床板
  box(g, 1.6, 0.22, 2.0, C.mattress, 0, 0.43, 0.03);             // 床垫
  box(g, 1.6, 0.7, 0.1, C.woodDark, 0, 0.6, -1.05);              // 床头板
  box(g, 0.55, 0.1, 0.32, C.pillow, -0.4, 0.58, -0.72);          // 枕头
  box(g, 0.55, 0.1, 0.32, C.pillow, 0.4, 0.58, -0.72);
  box(g, 1.55, 0.06, 1.25, C.blanket, 0, 0.55, 0.4);             // 被子
  return { group: g, parts: {} };
}

function nightstand() {
  // 与 nightstand.glb v2 同尺寸：无框柜身（前脸平齐）+ 全覆盖抽屉面板（缝 3mm）。
  // 盒底锚点不变：上盒底 0.315 / 下盒底 0.125（drawer1/drawer2 槽位依赖）
  const g = new THREE.Group(), P = {};
  box(g, 0.016, 0.5, 0.4, C.wood, -0.217, 0.25, 0);              // 侧板左
  box(g, 0.016, 0.5, 0.4, C.wood, 0.217, 0.25, 0);               // 侧板右
  box(g, 0.418, 0.016, 0.4, C.wood, 0, 0.492, 0);                // 顶板
  box(g, 0.418, 0.016, 0.4, C.wood, 0, 0.008, 0);                // 底板
  box(g, 0.418, 0.468, 0.016, C.wood, 0, 0.25, -0.192);          // 背板
  P.drawer = drawerBox(0.4, 0.16, 0.36, C.woodLight, 0, 0.395, 0.205);
  box(g, 0.12, 0.03, 0.03, C.dark, 0, 0.374, 0.227);             // 把手（面板中线上）
  P.drawer2 = drawerBox(0.4, 0.16, 0.36, C.woodLight, 0, 0.205, 0.205);
  box(g, 0.12, 0.03, 0.03, C.dark, 0, 0.126, 0.227);             // 把手
  return { group: g, parts: P };
}

function wardrobe() {
  // 与 wardrobe.glb v2 同尺寸：五面板柜体（顶底板全深平齐）+ full-overlay 门板
  // （各盖一半前脸，统一 3mm 缝：门宽 (1.2-0.009)/2=0.5955，x 外缘 ±0.597）+ 19mm 铰链外凸
  const g = new THREE.Group(), P = {};
  box(g, 0.03, 2.0, 0.6, C.wood, -0.585, 1.0, 0);                // 侧板左
  box(g, 0.03, 2.0, 0.6, C.wood, 0.585, 1.0, 0);                 // 侧板右
  box(g, 1.14, 0.03, 0.6, C.wood, 0, 1.985, 0);                  // 顶板
  box(g, 1.14, 0.03, 0.6, C.wood, 0, 0.015, 0);                  // 底板
  box(g, 1.14, 1.94, 0.03, C.wood, 0, 1.0, -0.285);              // 背板
  P.doorL = box(g, 0.5955, 1.994, 0.02, C.woodLight, -0.29925, 1.0, 0.309);
  P.doorR = box(g, 0.5955, 1.994, 0.02, C.woodLight, 0.29925, 1.0, 0.309);
  box(g, 0.03, 0.24, 0.03, C.dark, -0.03925, 1.0, 0.333);        // 左门把手（自由缘）
  box(g, 0.03, 0.24, 0.03, C.dark, 0.03925, 1.0, 0.333);         // 右门把手
  box(g, 1.14, 0.03, 0.5, C.woodDark, 0, 1.7, 0);                // 顶隔板
  cyl(g, 0.015, 1.08, C.metal, 0, 1.4, -0.18).rotation.z = Math.PI / 2; // 挂衣杆
  return { group: g, parts: P };
}

function dresser() {
  // 与 dresser.glb v2 同尺寸：腿(0→0.06) + 无框柜身 + 两块全覆盖大面板（缝 3mm）。
  // 盒底锚点不变：0.475 / 0.195（drawer1/drawer2 槽位依赖）
  const g = new THREE.Group(), P = {};
  box(g, 0.016, 0.704, 0.45, C.wood, -0.442, 0.412, 0);          // 侧板左
  box(g, 0.016, 0.704, 0.45, C.wood, 0.442, 0.412, 0);           // 侧板右
  box(g, 0.9, 0.016, 0.45, C.wood, 0, 0.772, 0);                 // 顶板
  box(g, 0.868, 0.016, 0.45, C.wood, 0, 0.068, 0);               // 底板
  box(g, 0.868, 0.672, 0.016, C.wood, 0, 0.412, -0.217);         // 背板
  legs4(g, 0.9, 0.45, 0.06, C.woodDark);
  P.drawer1 = drawerBox(0.84, 0.28, 0.38, C.woodLight, 0, 0.615, 0.23);
  P.drawer2 = drawerBox(0.84, 0.28, 0.38, C.woodLight, 0, 0.335, 0.23);
  for (const y of [0.599, 0.241]) box(g, 0.16, 0.03, 0.03, C.dark, 0, y, 0.252);
  return { group: g, parts: P };
}

function desk() {
  const g = new THREE.Group(), P = {};
  box(g, 1.4, 0.05, 0.7, C.wood, 0, 0.735, 0);                   // 桌面
  box(g, 0.05, 0.7, 0.65, C.woodDark, -0.66, 0.36, 0);           // 侧板
  box(g, 0.05, 0.7, 0.65, C.woodDark, 0.66, 0.36, 0);
  P.drawer = drawerBox(0.5, 0.12, 0.5, C.woodLight, 0.35, 0.63, 0.05); // 悬空抽屉
  box(g, 0.14, 0.03, 0.03, C.dark, 0.35, 0.63, 0.32);
  return { group: g, parts: P };
}

function officeChair() {
  const g = new THREE.Group();
  cyl(g, 0.26, 0.04, C.dark, 0, 0.04, 0);
  cyl(g, 0.035, 0.34, C.metal, 0, 0.23, 0);
  box(g, 0.46, 0.06, 0.44, C.dark, 0, 0.42, 0);
  box(g, 0.44, 0.5, 0.06, C.dark, 0, 0.7, -0.19);
  return { group: g, parts: {} };
}

function computerCase() {
  const g = new THREE.Group(), P = {};
  box(g, 0.2, 0.45, 0.45, C.dark, 0, 0.225, 0);
  box(g, 0.02, 0.3, 0.02, 0x6a7280, 0.06, 0.3, 0.23);            // 电源灯条
  P.sidePanel = box(g, 0.015, 0.4, 0.4, 0x2b2e34, 0.1, 0.23, 0); // 侧板（M4可开）
  box(g, 0.015, 0.4, 0.4, 0x2b2e34, -0.1, 0.23, 0);
  return { group: g, parts: P };
}

function monitor() {
  const g = new THREE.Group();
  box(g, 0.3, 0.03, 0.2, C.dark, 0, 0.015, 0);
  box(g, 0.05, 0.24, 0.05, C.dark, 0, 0.14, -0.02);
  box(g, 0.56, 0.34, 0.03, C.screen, 0, 0.42, 0);
  box(g, 0.52, 0.3, 0.01, 0x33507a, 0, 0.42, 0.017);
  return { group: g, parts: {} };
}

function bookshelf() {
  const g = new THREE.Group(), P = {};
  box(g, 0.04, 1.9, 0.32, C.woodDark, -0.48, 0.95, 0);
  box(g, 0.04, 1.9, 0.32, C.woodDark, 0.48, 0.95, 0);
  box(g, 1.0, 0.04, 0.32, C.woodDark, 0, 1.88, 0);
  const shelfY = [0.08, 0.52, 0.96, 1.4];
  for (const y of shelfY) box(g, 0.92, 0.035, 0.3, C.wood, 0, y, 0);
  // 两排书（第2、3层）： books[i] 可被"翻开"（M4）
  P.books = [];
  let bi = 0;
  for (const row of [1, 2]) {
    const yBase = shelfY[row] + 0.018;
    let x = -0.42;
    while (x < 0.38) {
      const w = 0.032 + (bi % 3) * 0.012;
      const h = 0.24 + ((bi * 7) % 5) * 0.014;
      const b = box(g, w, h, 0.22, C.bookCols[bi % C.bookCols.length], x + w / 2, yBase + h / 2, 0);
      P.books.push(b);
      x += w + 0.006;
      bi++;
    }
  }
  return { group: g, parts: P };
}

// ---- M10 新增：二楼与庭院家具 ----
function chest() {
  // 玩具箱：铰链盖板（M4开合系统复用 hinge）
  const g = new THREE.Group(), P = {};
  box(g, 0.62, 0.36, 0.42, C.wood, 0, 0.18, 0);
  box(g, 0.6, 0.02, 0.4, 0x7a5230, 0, 0.06, 0);                  // 内底
  P.lid = box(g, 0.64, 0.05, 0.44, C.woodLight, 0, 0.385, 0);    // 盖（绕后沿翻开）
  box(g, 0.1, 0.03, 0.03, C.dark, 0, 0.37, 0.22);                // 把手
  return { group: g, parts: P };
}

function shelfUnit() {
  // 储物架：3格，2个内腔槽位
  const g = new THREE.Group();
  box(g, 0.05, 1.8, 0.34, C.woodDark, -0.46, 0.9, 0);
  box(g, 0.05, 1.8, 0.34, C.woodDark, 0.46, 0.9, 0);
  for (const y of [0.04, 0.62, 1.2, 1.78]) box(g, 0.92, 0.045, 0.32, C.wood, 0, y, 0);
  return { group: g, parts: {} };
}

function bench() {
  // 庭院长椅（座面下可藏）
  const g = new THREE.Group();
  legs4(g, 1.5, 0.48, 0.42, C.woodDark, 0.07);
  box(g, 1.55, 0.06, 0.5, C.wood, 0, 0.45, 0);                   // 座面
  box(g, 1.55, 0.5, 0.06, C.wood, 0, 0.73, -0.22);               // 靠背
  box(g, 1.55, 0.06, 0.06, C.wood, 0, 0.95, -0.22);
  return { group: g, parts: {} };
}

function mailbox() {
  // 庭院信箱
  const g = new THREE.Group(), P = {};
  cyl(g, 0.05, 1.0, C.woodDark, 0, 0.5, 0);                      // 立柱
  const body = box(g, 0.26, 0.24, 0.4, 0x5e7ea8, 0, 1.12, 0);
  P.door = box(g, 0.24, 0.2, 0.03, 0x4a6a8a, 0, 1.12, 0.2);      // 信箱门（可开）
  box(g, 0.03, 0.06, 0.03, C.dark, 0.08, 1.12, 0.225);
  return { group: g, parts: P };
}

function flowerbed() {
  // 花坛：木框 + 土面 + 小花
  const g = new THREE.Group();
  box(g, 1.7, 0.28, 0.06, C.woodDark, 0, 0.14, -0.42);
  box(g, 1.7, 0.28, 0.06, C.woodDark, 0, 0.14, 0.42);
  box(g, 0.06, 0.28, 0.9, C.woodDark, -0.82, 0.14, 0);
  box(g, 0.06, 0.28, 0.9, C.woodDark, 0.82, 0.14, 0);
  box(g, 1.58, 0.06, 0.78, 0x5a4632, 0, 0.24, 0);                // 土面
  for (let i = 0; i < 7; i++) {
    const fl = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6),
      mat([0xe86a8a, 0xf0c060, 0xd8704a][i % 3]));
    fl.position.set(-0.6 + i * 0.2, 0.36, (i % 2 ? 0.14 : -0.12));
    fl.castShadow = true;
    g.add(fl);
  }
  return { group: g, parts: {} };
}

// ---- M15 新增家具（GLB 优先，以下为模型缺失时的程序化回退）----
function shoeCabinet() {
  const g = new THREE.Group(), P = {};
  box(g, 0.9, 1.1, 0.35, C.woodLight, 0, 0.55, 0);
  P.door = box(g, 0.86, 1.04, 0.03, C.wood, 0, 0.55, 0.175);
  box(g, 0.03, 0.12, 0.03, C.dark, 0.3, 0.55, 0.2);
  return { group: g, parts: P };
}
function sideTable() {
  const g = new THREE.Group();
  cyl(g, 0.24, 0.04, C.wood, 0, 0.42, 0, 24);
  for (let i = 0; i < 3; i++) {
    const a = i / 3 * Math.PI * 2;
    cyl(g, 0.016, 0.42, C.woodDark, Math.cos(a) * 0.17, 0.21, Math.sin(a) * 0.17, 12);
  }
  cyl(g, 0.19, 0.015, C.wood, 0, 0.14, 0, 20);
  return { group: g, parts: {} };
}
function wallCabinet() {
  const g = new THREE.Group(), P = {};
  box(g, 1.0, 0.7, 0.33, C.white, 0, 0.35, 0);
  P.door = box(g, 0.94, 0.64, 0.028, C.woodLight, 0, 0.35, 0.165);
  box(g, 0.1, 0.025, 0.025, C.dark, 0.08, 0.35, 0.19);
  return { group: g, parts: P };
}
function fileCabinet() {
  const g = new THREE.Group(), P = {};
  box(g, 0.45, 0.6, 0.45, C.woodDark, 0, 0.3, 0);
  P.drawer = drawerBox(0.4, 0.18, 0.4, C.wood, 0, 0.42, 0.02);
  box(g, 0.14, 0.025, 0.025, C.metal, 0, 0.42, 0.24);
  P.drawer2 = drawerBox(0.4, 0.18, 0.4, C.wood, 0, 0.155, 0.02);
  box(g, 0.14, 0.025, 0.025, C.metal, 0, 0.155, 0.24);
  return { group: g, parts: P };
}
function beanBag() {
  const g = new THREE.Group();
  const b = new THREE.Mesh(new THREE.SphereGeometry(0.45, 24, 18), mat(0xd9c9ae));
  b.scale.set(1, 0.72, 1); b.position.y = 0.31; b.castShadow = true; g.add(b);
  const k = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 10), mat(0xcfb99a));
  k.position.y = 0.6; k.castShadow = true; g.add(k);
  return { group: g, parts: {} };
}
function backpack() {
  const g = new THREE.Group();
  box(g, 0.28, 0.36, 0.14, C.red, 0, 0.18, 0);
  box(g, 0.2, 0.14, 0.06, C.sofa, 0, 0.12, 0.09);
  box(g, 0.05, 0.3, 0.02, C.dark, -0.08, 0.2, -0.08);
  box(g, 0.05, 0.3, 0.02, C.dark, 0.08, 0.2, -0.08);
  cyl(g, 0.05, 0.03, C.dark, 0, 0.375, 0, 12);
  return { group: g, parts: {} };
}
function planter() {
  const g = new THREE.Group();
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.24, 0.42, 24), mat(C.pot));
  pot.position.y = 0.21; pot.castShadow = true; g.add(pot);
  cyl(g, 0.28, 0.03, C.greenDark, 0, 0.405, 0, 24);
  cyl(g, 0.03, 0.4, C.woodDark, 0, 0.6, 0, 12);
  const s1 = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 10), mat(C.green));
  s1.position.y = 0.85; s1.castShadow = true; g.add(s1);
  const s2 = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), mat(C.greenDark));
  s2.position.set(0.12, 0.7, 0.08); s2.castShadow = true; g.add(s2);
  return { group: g, parts: {} };
}

function treadmill() {
  // 跑步机：跑带朝后，立柱+控制台在局部 +z 前端
  const g = new THREE.Group();
  box(g, 0.8, 0.12, 1.75, C.dark, 0, 0.09, 0);
  box(g, 0.56, 0.03, 1.5, C.screen, 0, 0.165, -0.06).castShadow = false;   // 跑带
  box(g, 0.07, 0.07, 1.75, C.metal, -0.37, 0.17, 0);
  box(g, 0.07, 0.07, 1.75, C.metal, 0.37, 0.17, 0);
  box(g, 0.07, 0.92, 0.07, C.metal, -0.31, 0.62, 0.78);
  box(g, 0.07, 0.92, 0.07, C.metal, 0.31, 0.62, 0.78);
  box(g, 0.76, 0.36, 0.09, C.dark, 0, 1.18, 0.8);
  box(g, 0.52, 0.18, 0.02, C.screen, 0, 1.2, 0.74).castShadow = false;     // 显示屏
  box(g, 0.06, 0.05, 0.52, C.metal, -0.31, 0.98, 0.52);
  box(g, 0.06, 0.05, 0.52, C.metal, 0.31, 0.98, 0.52);
  return { group: g, parts: {} };
}

function flymachine() {
  // 飞鸟机（蝴蝶机）：座垫+靠背在 -z，两侧摆臂托盘朝内
  const g = new THREE.Group();
  box(g, 0.85, 0.1, 0.95, C.dark, 0, 0.05, 0);
  box(g, 0.09, 0.44, 0.09, C.metal, 0, 0.32, -0.12);
  box(g, 0.48, 0.1, 0.46, C.gray, 0, 0.58, -0.1);                 // 座垫
  box(g, 0.48, 0.54, 0.1, C.gray, 0, 0.9, -0.36);                 // 靠背
  for (const s of [-1, 1]) {
    box(g, 0.07, 0.66, 0.07, C.metal, s * 0.52, 0.72, 0.16);
    box(g, 0.52, 0.07, 0.07, C.metal, s * 0.31, 1.02, 0.16);
    const pad = cyl(g, 0.1, 0.12, C.red, s * 0.1, 1.02, 0.16, 14);
    pad.rotation.x = Math.PI / 2;
  }
  box(g, 1.14, 0.08, 0.08, C.metal, 0, 1.1, -0.42);
  return { group: g, parts: {} };
}

function dumbbellrack() {
  // 两层哑铃架 + 5 只哑铃
  const g = new THREE.Group();
  box(g, 1.0, 0.06, 0.42, C.dark, 0, 0.38, -0.02);
  box(g, 1.0, 0.06, 0.46, C.dark, 0, 0.08, 0);
  box(g, 0.06, 0.38, 0.42, C.metal, -0.47, 0.21, 0);
  box(g, 0.06, 0.38, 0.42, C.metal, 0.47, 0.21, 0);
  const bell = (x, y, col) => {
    const bar = cyl(g, 0.024, 0.24, C.metal, x, y, 0, 10);
    bar.rotation.z = Math.PI / 2;
    const s1 = new THREE.Mesh(new THREE.SphereGeometry(0.062, 10, 8), mat(col));
    s1.position.set(x - 0.11, y, 0); s1.castShadow = true; g.add(s1);
    const s2 = new THREE.Mesh(new THREE.SphereGeometry(0.062, 10, 8), mat(col));
    s2.position.set(x + 0.11, y, 0); s2.castShadow = true; g.add(s2);
  };
  bell(-0.3, 0.47, C.dark); bell(0, 0.47, C.red); bell(0.3, 0.47, C.dark);
  bell(-0.3, 0.17, C.red); bell(0.3, 0.17, C.dark);
  return { group: g, parts: {} };
}

function yogamat() {
  // 瑜伽垫：平铺 + 一端卷轴
  const g = new THREE.Group();
  box(g, 0.7, 0.025, 1.42, 0x7e6ea8, 0, 0.013, 0.09).castShadow = false;
  const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.7, 16), mat(0x6d5d96));
  roll.rotation.z = Math.PI / 2;
  roll.position.set(0, 0.06, -0.76);
  roll.castShadow = true; g.add(roll);
  return { group: g, parts: {} };
}

// ---------- 布局目录 ----------
// slots: key/type/name/cap/offset/allowFold/needsTag/openable(引用 parts 的键与动作)
export const CATALOG = [
  // —— 客厅 ——
  { id: 'sofa', name: '沙发', room: 'living', pos: [-5.3, 0, -0.5], rotY: Math.PI, build: sofa,
    slots: [{ key: 'under', type: 'under', name: '沙发底下', cap: [1.5, 0.11, 0.5], offset: [0, 0.07, 0.05] }] },
  { id: 'coffeeTable', name: '茶几', room: 'living', pos: [-5.3, 0, -2.0], rotY: 0, build: coffeeTable,
    slots: [
      { key: 'top', type: 'top', name: '桌面上', cap: [0.9, 0.2, 0.45], offset: [0, 0.475, 0] },
      { key: 'shelf', type: 'top', name: '隔板上', cap: [0.75, 0.12, 0.35], offset: [0, 0.175, 0] },
    ] },
  { id: 'carpetL', name: '地毯', room: 'living', pos: [-4.7, 0, -1.7], rotY: 0, build: () => carpet(), collide: false,
    slots: [{ key: 'under', type: 'under', name: '地毯下面', cap: [2.2, 0.018, 1.4], offset: [0, 0.008, 0] }] },
  { id: 'tvCabinet', name: '电视柜', room: 'living', pos: [-5.75, 0, -5.23], rotY: 0, build: tvCabinet,
    slots: [
      { key: 'cabL', type: 'interior', name: '左柜内', cap: [0.6, 0.18, 0.3], offset: [-0.4, 0.17, 0] },
      { key: 'cabR', type: 'interior', name: '右柜内', cap: [0.6, 0.18, 0.3], offset: [0.4, 0.17, 0] },
    ] },
  { id: 'tv', name: '电视', room: 'living', pos: [-5.75, 0.52, -5.23], rotY: 0, build: tv, collide: false, slots: [] },
  { id: 'plant', name: '盆栽', room: 'living', pos: [-0.7, 0, -4.9], rotY: 0, build: plant,
    slots: [{ key: 'soil', type: 'soil', name: '花盆土里', cap: [0.22, 0.05, 0.22], offset: [0, 0.285, 0] }] },
  { id: 'floorLamp', name: '落地灯', room: 'living', pos: [-1.25, 0, -0.3], rotY: 0, build: floorLamp, slots: [] },
  { id: 'shoeCabinet', name: '鞋柜', room: 'living', pos: [-7.3, 0, -0.8], rotY: Math.PI / 2, build: shoeCabinet,
    slots: [{ key: 'inner', type: 'interior', name: '鞋柜里', cap: [0.44, 0.95, 0.24], offset: [0, 0.505, 0] }] },
  { id: 'sideTable', name: '边几', room: 'living', pos: [-1.85, 0, -0.75], rotY: 0, build: sideTable,
    slots: [{ key: 'top', type: 'top', name: '几面上', cap: [0.34, 0.18, 0.34], offset: [0, 0.46, 0] }] },
  { id: 'armchair', name: '休闲椅', room: 'living', pos: [-0.85, 0, -1.05], rotY: Math.PI / 2 + 0.5, build: armchair, slots: [] },

  // —— 厨房 ——
  { id: 'counter', name: '橱柜', room: 'kitchen', pos: [7.13, 0, -3.7], rotY: -Math.PI / 2, build: counter,
    slots: [
      { key: 'drawer1', type: 'drawer', name: '左抽屉', cap: [0.6, 0.13, 0.42], offset: [-0.6, 0.68, 0] },
      { key: 'drawer2', type: 'drawer', name: '右抽屉', cap: [0.6, 0.13, 0.42], offset: [0.25, 0.68, 0] },
      { key: 'cab', type: 'interior', name: '柜门里', cap: [0.6, 0.42, 0.42], offset: [-0.6, 0.25, 0] },
    ] },
  { id: 'fridge', name: '冰箱', room: 'kitchen', pos: [7.06, 0, -0.5], rotY: -Math.PI / 2, build: fridge,
    slots: [
      { key: 'inner', type: 'interior', name: '冷藏室', cap: [0.5, 0.78, 0.4], offset: [0, 0.79, 0] },
      { key: 'freezer', type: 'interior', name: '冷冻室', cap: [0.5, 0.2, 0.4], offset: [0, 0.15, 0] },
    ] },
  { id: 'diningTable', name: '餐桌', room: 'kitchen', pos: [3.4, 0, -2.3], rotY: 0, build: diningTable,
    slots: [{ key: 'top', type: 'top', name: '桌面上', cap: [1.2, 0.25, 0.7], offset: [0, 0.79, 0] }] },
  { id: 'chair1', name: '餐椅', room: 'kitchen', pos: [2.5, 0, -2.3], rotY: Math.PI / 2, build: chair, slots: [] },
  { id: 'chair2', name: '餐椅', room: 'kitchen', pos: [4.3, 0, -2.3], rotY: -Math.PI / 2, build: chair, slots: [] },
  { id: 'chair3', name: '餐椅', room: 'kitchen', pos: [3.4, 0, -1.5], rotY: Math.PI, build: chair, slots: [] },
  { id: 'chair4', name: '餐椅', room: 'kitchen', pos: [3.4, 0, -3.1], rotY: 0, build: chair, slots: [] },
  { id: 'cup', name: '水杯', room: 'kitchen', pos: [7.13, 0.9, -4.4], rotY: 0, build: cup, collide: false,
    slots: [{ key: 'inner', type: 'interior', name: '杯子里', cap: [0.082, 0.1, 0.082], offset: [0, 0.06, 0], allowFold: true }] },
  { id: 'fruitBowl', name: '果盘', room: 'kitchen', pos: [3.4, 0.78, -2.3], rotY: 0, build: fruitBowl, collide: false,
    slots: [{ key: 'inner', type: 'interior', name: '果盘里', cap: [0.22, 0.1, 0.22], offset: [0, 0.068, 0] }] },
  { id: 'microwave', name: '微波炉', room: 'kitchen', pos: [7.13, 0.9, -3.1], rotY: -Math.PI / 2, build: microwave, collide: false,
    slots: [{ key: 'inner', type: 'interior', name: '炉腔里', cap: [0.3, 0.16, 0.26], offset: [0, 0.1, 0] }] },
  { id: 'kettle', name: '水壶', room: 'kitchen', pos: [6.85, 0.91, -2.7], rotY: 0, build: kettle, collide: false, slots: [] },
  { id: 'board', name: '砧板', room: 'kitchen', pos: [6.85, 0.902, -4.75], rotY: 0, build: board, collide: false, slots: [] },
  { id: 'trashBin', name: '垃圾桶', room: 'kitchen', pos: [5.8, 0, -0.6], rotY: 0, build: trashBin,
    slots: [{ key: 'inner', type: 'interior', name: '桶里', cap: [0.24, 0.32, 0.24], offset: [0, 0.228, 0] }] },
  { id: 'wallCabinet', name: '吊柜', room: 'kitchen', pos: [7.28, 1.2, -4.0], rotY: -Math.PI / 2, build: wallCabinet,
    slots: [{ key: 'inner', type: 'interior', name: '吊柜里', cap: [0.8, 0.56, 0.16], offset: [0, 0.31, 0] }] },

  // —— 卧室 ——
  { id: 'bed', name: '床', room: 'bedroom', pos: [-6.39, 0, 3.2], rotY: Math.PI / 2, build: bed,
    slots: [{ key: 'under', type: 'under', name: '床底下', cap: [1.3, 0.14, 1.7], offset: [0, 0.09, 0.1] }] },
  { id: 'nightstand', name: '床头柜', room: 'bedroom', pos: [-7.22, 0, 4.35], rotY: Math.PI / 2, build: nightstand,
    slots: [
      { key: 'drawer1', type: 'drawer', name: '上抽屉', cap: [0.34, 0.1, 0.28], offset: [0, 0.385, 0] },
      { key: 'drawer2', type: 'drawer', name: '下抽屉', cap: [0.34, 0.1, 0.28], offset: [0, 0.195, 0] },
    ] },
  { id: 'wardrobe', name: '衣柜', room: 'bedroom', pos: [-1.5, 0, 5.06], rotY: Math.PI, build: wardrobe,
    slots: [
      { key: 'hang', type: 'interior', name: '挂衣区', cap: [0.9, 1.35, 0.24], offset: [0, 0.715, 0] },
      { key: 'topShelf', type: 'interior', name: '顶隔板上', cap: [0.6, 0.25, 0.2], offset: [0, 1.845, 0] },
    ] },
  { id: 'dresser', name: '斗柜', room: 'bedroom', pos: [-2.2, 0, 0.33], rotY: 0, build: dresser,
    slots: [
      { key: 'drawer1', type: 'drawer', name: '上抽屉', cap: [0.74, 0.16, 0.32], offset: [0, 0.575, 0] },
      { key: 'drawer2', type: 'drawer', name: '下抽屉', cap: [0.74, 0.16, 0.32], offset: [0, 0.3, 0] },
    ] },
  { id: 'rugB', name: '床边毯', room: 'bedroom', pos: [-4.3, 0, 2.6], rotY: 0, build: () => carpet(1.6, 1.0), collide: false,
    slots: [{ key: 'under', type: 'under', name: '毯子下面', cap: [1.2, 0.018, 0.6], offset: [0, 0.008, 0] }] },

  // —— 书房 ——
  { id: 'desk', name: '书桌', room: 'study', pos: [3.75, 0, 5.09], rotY: Math.PI, build: desk,
    slots: [
      { key: 'top', type: 'top', name: '桌面上', cap: [1.1, 0.2, 0.45], offset: [0, 0.79, 0.02] },
      { key: 'drawer', type: 'drawer', name: '抽屉', cap: [0.4, 0.08, 0.36], offset: [0.35, 0.63, 0] },
    ] },
  { id: 'officeChair', name: '转椅', room: 'study', pos: [3.75, 0, 4.2], rotY: 0, build: officeChair, slots: [] },
  { id: 'fileCabinet', name: '文件柜', room: 'study', pos: [2.55, 0, 5.15], rotY: Math.PI, build: fileCabinet,
    slots: [
      { key: 'drawer1', type: 'drawer', name: '上抽屉', cap: [0.3, 0.12, 0.32], offset: [0, 0.41, 0] },
      { key: 'drawer2', type: 'drawer', name: '下抽屉', cap: [0.3, 0.12, 0.32], offset: [0, 0.145, 0] },
    ] },
  { id: 'rug2', name: '地毯', room: 'study', pos: [3.75, 0, 4.6], rotY: 0, build: () => carpet(1.6, 1.0), collide: false,
    slots: [{ key: 'under', type: 'under', name: '地毯下面', cap: [1.2, 0.018, 0.6], offset: [0, 0.008, 0] }] },
  { id: 'computerCase', name: '电脑主机', room: 'study', pos: [4.75, 0, 5.0], rotY: Math.PI, build: computerCase,
    slots: [{ key: 'inner', type: 'interior', name: '机箱内', cap: [0.13, 0.3, 0.32], offset: [0, 0.175, 0] }] },
  { id: 'monitor', name: '显示器', room: 'study', pos: [3.6, 0.76, 5.2], rotY: Math.PI, build: monitor, collide: false, slots: [] },
  { id: 'bookshelf', name: '书架', room: 'study', pos: [7.28, 0, 1.4], rotY: -Math.PI / 2, build: bookshelf,
    slots: [
      { key: 'shelf1', type: 'top', name: '第1层', cap: [0.8, 0.3, 0.22], offset: [0, 0.115, 0] },
      { key: 'shelf4', type: 'top', name: '第4层', cap: [0.8, 0.3, 0.22], offset: [0, 1.435, 0] },
      { key: 'pages1', type: 'pages', name: '书页间·上排', cap: [0.26, 0.3, 0.008], offset: [-0.2, 0.68, 0], needsTag: 'paper', allowFold: true },
      { key: 'pages2', type: 'pages', name: '书页间·下排', cap: [0.26, 0.3, 0.008], offset: [0.15, 1.12, 0], needsTag: 'paper', allowFold: true },
    ] },

  // —— 二楼 · 家庭厅（y=3.15）——
  { id: 'sofa2', name: '沙发', room: 'lounge2', pos: [-5.3, 3.15, -0.5], rotY: Math.PI, build: sofa,
    slots: [{ key: 'under', type: 'under', name: '沙发底下', cap: [1.5, 0.11, 0.5], offset: [0, 0.07, 0.05] }] },
  { id: 'coffeeTable2', name: '茶几', room: 'lounge2', pos: [-5.3, 3.15, -1.7], rotY: 0, build: coffeeTable,
    slots: [
      { key: 'top', type: 'top', name: '桌面上', cap: [0.9, 0.2, 0.45], offset: [0, 0.475, 0] },
      { key: 'shelf', type: 'top', name: '隔板上', cap: [0.75, 0.12, 0.35], offset: [0, 0.175, 0] },
    ] },
  { id: 'carpet2', name: '地毯', room: 'lounge2', pos: [-4.7, 3.15, -1.7], rotY: 0, build: () => carpet(), collide: false,
    slots: [{ key: 'under', type: 'under', name: '地毯下面', cap: [2.2, 0.018, 1.4], offset: [0, 0.008, 0] }] },
  { id: 'bookshelf2', name: '书架', room: 'lounge2', pos: [-7.28, 3.15, -1.4], rotY: Math.PI / 2, build: bookshelf,
    slots: [
      { key: 'shelf1', type: 'top', name: '第1层', cap: [0.8, 0.3, 0.22], offset: [0, 0.115, 0] },
      { key: 'shelf4', type: 'top', name: '第4层', cap: [0.8, 0.3, 0.22], offset: [0, 1.435, 0] },
      { key: 'pages1', type: 'pages', name: '书页间·上排', cap: [0.26, 0.3, 0.008], offset: [-0.2, 0.68, 0], needsTag: 'paper', allowFold: true },
      { key: 'pages2', type: 'pages', name: '书页间·下排', cap: [0.26, 0.3, 0.008], offset: [0.15, 1.12, 0], needsTag: 'paper', allowFold: true },
    ] },
  { id: 'plant2', name: '盆栽', room: 'lounge2', pos: [-0.7, 3.15, -4.9], rotY: 0, build: plant,
    slots: [{ key: 'soil', type: 'soil', name: '花盆土里', cap: [0.22, 0.05, 0.22], offset: [0, 0.285, 0] }] },
  { id: 'beanBag', name: '懒人沙发', room: 'lounge2', pos: [-3.0, 3.15, -2.6], rotY: 0.4, build: beanBag, slots: [] },

  // —— 二楼 · 储物间（楼梯西侧，注意避开门洞 x>4.6, z<-4.55）——
  { id: 'shelfUnit', name: '储物架', room: 'storage', pos: [7.32, 3.15, -2.2], rotY: -Math.PI / 2, build: shelfUnit,
    slots: [
      { key: 'low', type: 'interior', name: '下层格', cap: [0.8, 0.5, 0.26], offset: [0, 0.33, 0] },
      { key: 'mid', type: 'interior', name: '中层格', cap: [0.8, 0.5, 0.26], offset: [0, 0.91, 0] },
      { key: 'top', type: 'top', name: '顶板上', cap: [0.8, 0.25, 0.26], offset: [0, 1.82, 0] },
    ] },
  // —— 二楼 · 健身房（储物间改造，留空楼梯口与西侧门走道）——
  { id: 'treadmill', name: '跑步机', room: 'storage', pos: [1.5, 3.15, -0.78], rotY: -Math.PI / 2, build: treadmill, slots: [] },
  { id: 'flyMachine', name: '飞鸟机', room: 'storage', pos: [4.4, 3.15, -3.9], rotY: 0, build: flymachine, slots: [] },
  { id: 'dumbbellRack', name: '哑铃架', room: 'storage', pos: [2.1, 3.15, -4.05], rotY: 0, build: dumbbellrack, slots: [] },
  { id: 'yogaMat', name: '瑜伽垫', room: 'storage', pos: [3.6, 3.15, -2.3], rotY: 0.35, build: yogamat, collide: false, slots: [] },

  // —— 二楼 · 主卧 ——
  { id: 'bed2', name: '大床', room: 'master', pos: [-6.39, 3.15, 3.2], rotY: Math.PI / 2, build: bed,
    slots: [{ key: 'under', type: 'under', name: '床底下', cap: [1.3, 0.14, 1.7], offset: [0, 0.09, 0.1] }] },
  { id: 'wardrobe2', name: '衣柜', room: 'master', pos: [-1.5, 3.15, 5.06], rotY: Math.PI, build: wardrobe,
    slots: [
      { key: 'hang', type: 'interior', name: '挂衣区', cap: [0.9, 1.35, 0.24], offset: [0, 0.715, 0] },
      { key: 'topShelf', type: 'interior', name: '顶隔板上', cap: [0.6, 0.25, 0.2], offset: [0, 1.845, 0] },
    ] },
  { id: 'dresser2', name: '斗柜', room: 'master', pos: [-2.2, 3.15, 0.33], rotY: 0, build: dresser,
    slots: [
      { key: 'drawer1', type: 'drawer', name: '上抽屉', cap: [0.74, 0.16, 0.32], offset: [0, 0.575, 0] },
      { key: 'drawer2', type: 'drawer', name: '下抽屉', cap: [0.74, 0.16, 0.32], offset: [0, 0.3, 0] },
    ] },
  { id: 'nightstand2', name: '床头柜', room: 'master', pos: [-7.22, 3.15, 4.35], rotY: Math.PI / 2, build: nightstand,
    slots: [
      { key: 'drawer1', type: 'drawer', name: '上抽屉', cap: [0.34, 0.1, 0.28], offset: [0, 0.385, 0] },
      { key: 'drawer2', type: 'drawer', name: '下抽屉', cap: [0.34, 0.1, 0.28], offset: [0, 0.195, 0] },
    ] },
  { id: 'floorLamp2', name: '落地灯', room: 'master', pos: [-7.05, 3.15, 4.9], rotY: 0, build: floorLamp, slots: [] },

  // —— 二楼 · 儿童房 ——
  { id: 'bedKids', name: '儿童床', room: 'kids', pos: [6.4, 3.15, 3.9], rotY: -Math.PI / 2, build: bed,
    slots: [{ key: 'under', type: 'under', name: '床底下', cap: [1.3, 0.14, 1.7], offset: [0, 0.09, 0.1] }] },
  { id: 'toyChest', name: '玩具箱', room: 'kids', pos: [3.0, 3.15, 4.9], rotY: Math.PI, build: chest,
    slots: [{ key: 'inner', type: 'interior', name: '箱子里', cap: [0.52, 0.28, 0.34], offset: [0, 0.175, 0] }] },
  { id: 'desk2', name: '小书桌', room: 'kids', pos: [1.4, 3.15, 0.45], rotY: 0, build: desk,
    slots: [
      { key: 'top', type: 'top', name: '桌面上', cap: [1.1, 0.2, 0.45], offset: [0, 0.79, 0.02] },
      { key: 'drawer', type: 'drawer', name: '抽屉', cap: [0.4, 0.08, 0.36], offset: [0.35, 0.63, 0] },
    ] },
  { id: 'backpack', name: '书包', room: 'kids', pos: [4.8, 3.15, 2.8], rotY: 0.5, build: backpack,
    slots: [{ key: 'inner', type: 'interior', name: '书包里', cap: [0.22, 0.28, 0.1], offset: [0, 0.17, 0] }] },
  { id: 'plant3', name: '盆栽', room: 'kids', pos: [1.5, 3.15, 4.8], rotY: 0, build: plant,
    slots: [{ key: 'soil', type: 'soil', name: '花盆土里', cap: [0.22, 0.05, 0.22], offset: [0, 0.285, 0] }] },

  // —— 庭院 ——
  { id: 'bench', name: '长椅', room: 'yard', pos: [-11.15, 0, 0.55], rotY: Math.PI / 2, build: bench,
    slots: [{ key: 'under', type: 'under', name: '椅面下', cap: [1.2, 0.16, 0.4], offset: [0, 0.2, 0] }] },
  { id: 'mailbox', name: '信箱', room: 'yard', pos: [-10.9, 0, -0.8], rotY: Math.PI / 2, build: mailbox,
    slots: [{ key: 'inner', type: 'interior', name: '信箱里', cap: [0.16, 0.12, 0.28], offset: [0, 1.085, 0] }] },
  { id: 'flowerbed', name: '花坛', room: 'yard', pos: [5.5, 0, 6.9], rotY: 0, build: flowerbed,
    slots: [{ key: 'soil', type: 'soil', name: '花坛土里', cap: [1.4, 0.06, 0.6], offset: [0, 0.26, 0] }] },
  { id: 'planter', name: '大花盆', room: 'yard', pos: [7.6, 0, 6.5], rotY: 0, build: planter,
    slots: [{ key: 'soil', type: 'soil', name: '花盆土里', cap: [0.3, 0.08, 0.3], offset: [0, 0.42, 0] }] },
];

// ---------- 总装 ----------
// modelFactory: (def) => ({ group, parts }) | null —— 传入时优先用 Blender GLB 模型，
// 返回 null 的条目回退到程序化 build()（碰撞/槽位/动画逻辑两者完全一致）
export function buildFurniture(scene, colliders, modelFactory = null) {
  const pieces = [];
  const tmpBox = new THREE.Box3();
  for (const def of CATALOG) {
    const inst = modelFactory ? modelFactory(def) : null;
    const { group, parts } = inst || def.build();
    group.position.set(...def.pos);
    group.rotation.y = def.rotY;
    scene.add(group);

    // 静态碰撞体：整件家具的世界包围盒
    if (def.collide !== false) {
      tmpBox.setFromObject(group);
      colliders.push({
        minX: tmpBox.min.x, maxX: tmpBox.max.x,
        minZ: tmpBox.min.z, maxZ: tmpBox.max.z,
        minY: tmpBox.min.y, maxY: tmpBox.max.y,
        pieceId: def.id,
      });
    }

    // 槽位世界坐标
    group.updateMatrixWorld(true);
    const slots = (def.slots || []).map(s => {
      const wp = new THREE.Vector3(...s.offset).applyMatrix4(group.matrixWorld);
      return { ...s, pieceId: def.id, worldPos: wp };
    });

    pieces.push({ def, group, parts, slots });
  }
  return pieces;
}

