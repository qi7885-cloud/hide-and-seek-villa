// furniture.js — 程序化家具库：建造函数 + 全屋布局 + 槽位元数据
// 坐标约定：每件家具 Group 原点在占地中心、地面高度；正面朝局部 +z，放置时用 rotY 转向
import * as THREE from 'three';
import { rugTexture } from './textures.js';

// ---------- 调色板 ----------
const C = {
  wood: 0x9a6b3f, woodDark: 0x7a5230, woodLight: 0xcdaa7d,
  white: 0xf2f2f0, offWhite: 0xe8e6e0, metal: 0x9aa2ab, dark: 0x3a3d42,
  sofa: 0x6e8ca8, sofaDark: 0x5a7392, cushion: 0x8aa6c0,
  green: 0x5e8c4a, greenDark: 0x47703a, pot: 0xb0603c,
  red: 0xb5554d, rug: 0xa8695c, rugBorder: 0x8a5045,
  mattress: 0xeae6dc, blanket: 0x7f9db8, pillow: 0xf7f4ec,
  gray: 0xb9bdb6, screen: 0x1c1e22, paper: 0xf5f1e6,
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

// ---------- 家具建造函数 ----------
// 每个 builder 返回 { group, parts } ；parts 里放需要开合动画的节点（M4 用）

function sofa() {
  // 绿色丝绒沙发 + 奶油抱枕 + 白色盖毯（参考法式客厅）
  const g = new THREE.Group(), P = {};
  const VELVET = 0x5e7a52, VELVET_D = 0x506a46, CREAM = 0xe8e2d2;
  legs4(g, 1.9, 0.85, 0.14, 0x4a3826);
  box(g, 1.9, 0.3, 0.85, VELVET, 0, 0.29, 0);                    // 底座
  box(g, 1.9, 0.45, 0.22, VELVET_D, 0, 0.62, -0.315);            // 靠背
  box(g, 0.22, 0.32, 0.8, VELVET_D, -0.84, 0.58, 0.02);          // 扶手左
  box(g, 0.22, 0.32, 0.8, VELVET_D, 0.84, 0.58, 0.02);           // 扶手右
  for (let i = 0; i < 3; i++) box(g, 0.55, 0.14, 0.7, CREAM, -0.6 + i * 0.6, 0.51, 0.05); // 坐垫
  // 丝绒竖向拉槽（坐垫分缝感）
  for (let i = 0; i < 3; i++) box(g, 0.56, 0.02, 0.71, VELVET, -0.6 + i * 0.6, 0.585, 0.05);
  // 靠枕
  box(g, 0.4, 0.36, 0.13, CREAM, -0.5, 0.72, -0.24).rotation.x = -0.15;
  box(g, 0.4, 0.36, 0.13, 0xd8cfba, 0.28, 0.72, -0.24).rotation.x = -0.15;
  // 白色针织盖毯（搭在扶手垂下来）
  box(g, 0.5, 0.04, 0.62, 0xf2ede0, 0.62, 0.76, 0.1).rotation.z = 0.06;
  box(g, 0.5, 0.3, 0.04, 0xf2ede0, 0.62, 0.58, 0.4);
  return { group: g, parts: P };
}

function coffeeTable() {
  const g = new THREE.Group();
  legs4(g, 1.1, 0.6, 0.4, C.woodDark);
  box(g, 1.1, 0.05, 0.6, C.wood, 0, 0.425, 0);                   // 桌面
  box(g, 0.95, 0.03, 0.45, C.wood, 0, 0.14, 0);                  // 隔板
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
  const g = new THREE.Group();
  box(g, 0.5, 0.04, 0.25, C.dark, 0, 0.02, 0);
  box(g, 0.08, 0.12, 0.08, C.dark, 0, 0.08, 0);
  box(g, 1.15, 0.66, 0.05, C.screen, 0, 0.46, 0);
  box(g, 1.05, 0.56, 0.01, 0x2e3a4a, 0, 0.46, 0.03);             // 屏幕
  return { group: g, parts: {} };
}

function carpet(w = 2.6, d = 1.8) {
  const g = new THREE.Group(), P = {};
  const base = new THREE.Mesh(
    new THREE.BoxGeometry(w, 0.022, d),
    new THREE.MeshLambertMaterial({ map: rugTexture(w, d) })
  );
  base.position.y = 0.011;
  base.receiveShadow = true;
  g.add(base);
  P.lift = base;
  return { group: g, parts: P };
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
  // 抽屉（滑出式）
  P.drawer1 = box(g, 0.72, 0.2, 0.58, C.wood, -0.6, 0.68, 0.02);
  P.drawer2 = box(g, 0.72, 0.2, 0.58, C.wood, 0.25, 0.68, 0.02);
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
  const g = new THREE.Group();
  box(g, 0.5, 0.3, 0.38, C.dark, 0, 0.15, 0);
  box(g, 0.4, 0.22, 0.02, 0x22252a, -0.03, 0.16, 0.195);
  box(g, 0.04, 0.16, 0.03, C.metal, 0.21, 0.16, 0.2);
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
  const g = new THREE.Group(), P = {};
  box(g, 0.45, 0.5, 0.4, C.wood, 0, 0.28, 0);
  legs4(g, 0.45, 0.4, 0.06, C.woodDark);
  P.drawer = box(g, 0.4, 0.16, 0.36, C.woodLight, 0, 0.38, 0.03);
  box(g, 0.12, 0.03, 0.03, C.dark, 0, 0.38, 0.22);               // 把手
  return { group: g, parts: P };
}

function wardrobe() {
  const g = new THREE.Group(), P = {};
  box(g, 1.2, 2.0, 0.6, C.wood, 0, 1.0, 0);
  P.doorL = box(g, 0.55, 1.9, 0.03, C.woodLight, -0.29, 1.0, 0.315);
  P.doorR = box(g, 0.55, 1.9, 0.03, C.woodLight, 0.29, 1.0, 0.315);
  box(g, 0.03, 0.24, 0.03, C.dark, -0.05, 1.0, 0.34);
  box(g, 0.03, 0.24, 0.03, C.dark, 0.05, 1.0, 0.34);
  box(g, 1.1, 0.03, 0.5, C.woodDark, 0, 1.7, 0);                 // 顶隔板
  cyl(g, 0.015, 1.0, C.metal, 0, 1.4, 0).rotation.z = Math.PI / 2; // 挂衣杆
  return { group: g, parts: P };
}

function dresser() {
  const g = new THREE.Group(), P = {};
  box(g, 0.9, 0.78, 0.45, C.wood, 0, 0.42, 0);
  legs4(g, 0.9, 0.45, 0.06, C.woodDark);
  P.drawer1 = box(g, 0.84, 0.26, 0.4, C.woodLight, 0, 0.58, 0.035);
  P.drawer2 = box(g, 0.84, 0.26, 0.4, C.woodLight, 0, 0.3, 0.035);
  for (const y of [0.58, 0.3]) box(g, 0.16, 0.03, 0.03, C.dark, 0, y, 0.245);
  return { group: g, parts: P };
}

function desk() {
  const g = new THREE.Group(), P = {};
  box(g, 1.4, 0.05, 0.7, C.wood, 0, 0.735, 0);                   // 桌面
  box(g, 0.05, 0.7, 0.65, C.woodDark, -0.66, 0.36, 0);           // 侧板
  box(g, 0.05, 0.7, 0.65, C.woodDark, 0.66, 0.36, 0);
  P.drawer = box(g, 0.5, 0.12, 0.5, C.woodLight, 0.35, 0.63, 0.05); // 悬空抽屉
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
      b.userData.bookIndex = bi;
      P.books.push(b);
      x += w + 0.006;
      bi++;
    }
  }
  return { group: g, parts: P };
}

function pictureFrame() {
  const g = new THREE.Group(), P = {};
  const fr = new THREE.Group();
  box(fr, 0.4, 0.3, 0.025, C.woodDark, 0, 0.15, 0);
  box(fr, 0.34, 0.24, 0.005, 0xd8e4ee, 0, 0.15, 0.014);          // 照片
  fr.position.y = 0;
  fr.rotation.x = -0.13;                                          // 斜靠
  P.tilt = fr;
  g.add(fr);
  return { group: g, parts: P };
}

// ---------- 布局目录 ----------
// slots: key/type/name/cap/offset/allowFold/needsTag/openable(引用 parts 的键与动作)
export const CATALOG = [
  // —— 客厅 ——
  { id: 'sofa', name: '沙发', room: 'living', pos: [-5.3, 0, -0.5], rotY: Math.PI, build: sofa,
    slots: [{ key: 'under', type: 'under', name: '沙发底下', cap: [1.5, 0.11, 0.5], offset: [0, 0.07, 0.05] }] },
  { id: 'coffeeTable', name: '茶几', room: 'living', pos: [-5.3, 0, -1.7], rotY: 0, build: coffeeTable,
    slots: [
      { key: 'top', type: 'top', name: '桌面上', cap: [0.9, 0.2, 0.45], offset: [0, 0.475, 0] },
      { key: 'shelf', type: 'top', name: '隔板上', cap: [0.75, 0.12, 0.35], offset: [0, 0.175, 0] },
    ] },
  { id: 'carpetL', name: '地毯', room: 'living', pos: [-4.7, 0, -1.7], rotY: 0, build: () => carpet(), collide: false,
    slots: [{ key: 'under', type: 'under', name: '地毯下面', cap: [2.2, 0.018, 1.4], offset: [0, 0.008, 0] }] },
  { id: 'tvCabinet', name: '电视柜', room: 'living', pos: [-4.4, 0, -5.23], rotY: 0, build: tvCabinet,
    slots: [
      { key: 'cabL', type: 'interior', name: '左柜内', cap: [0.6, 0.32, 0.3], offset: [-0.4, 0.28, 0] },
      { key: 'cabR', type: 'interior', name: '右柜内', cap: [0.6, 0.32, 0.3], offset: [0.4, 0.28, 0] },
    ] },
  { id: 'tv', name: '电视', room: 'living', pos: [-4.4, 0.56, -5.23], rotY: 0, build: tv, collide: false, slots: [] },
  { id: 'plant', name: '盆栽', room: 'living', pos: [-0.7, 0, -4.9], rotY: 0, build: plant,
    slots: [{ key: 'soil', type: 'soil', name: '花盆土里', cap: [0.22, 0.05, 0.22], offset: [0, 0.285, 0] }] },
  { id: 'floorLamp', name: '落地灯', room: 'living', pos: [-7.05, 0, -0.8], rotY: 0, build: floorLamp, slots: [] },
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
      { key: 'inner', type: 'interior', name: '冷藏室', cap: [0.5, 1.1, 0.4], offset: [0, 0.85, 0] },
      { key: 'freezer', type: 'interior', name: '冷冻室', cap: [0.5, 0.2, 0.4], offset: [0, 0.22, 0] },
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
  { id: 'microwave', name: '微波炉', room: 'kitchen', pos: [7.13, 0.9, -3.1], rotY: -Math.PI / 2, build: microwave, collide: false, slots: [] },
  { id: 'trashBin', name: '垃圾桶', room: 'kitchen', pos: [5.8, 0, -0.6], rotY: 0, build: trashBin,
    slots: [{ key: 'inner', type: 'interior', name: '桶里', cap: [0.24, 0.32, 0.24], offset: [0, 0.228, 0] }] },

  // —— 卧室 ——
  { id: 'bed', name: '床', room: 'bedroom', pos: [-6.39, 0, 3.2], rotY: Math.PI / 2, build: bed,
    slots: [{ key: 'under', type: 'under', name: '床底下', cap: [1.3, 0.14, 1.7], offset: [0, 0.09, 0.1] }] },
  { id: 'nightstand', name: '床头柜', room: 'bedroom', pos: [-7.22, 0, 4.35], rotY: Math.PI / 2, build: nightstand,
    slots: [{ key: 'drawer', type: 'drawer', name: '抽屉', cap: [0.34, 0.1, 0.28], offset: [0, 0.38, 0] }] },
  { id: 'wardrobe', name: '衣柜', room: 'bedroom', pos: [-1.5, 0, 5.06], rotY: Math.PI, build: wardrobe,
    slots: [
      { key: 'hang', type: 'interior', name: '挂衣区', cap: [0.9, 1.35, 0.4], offset: [0, 1.05, 0] },
      { key: 'topShelf', type: 'interior', name: '顶隔板上', cap: [0.9, 0.25, 0.4], offset: [0, 1.72, 0] },
    ] },
  { id: 'dresser', name: '斗柜', room: 'bedroom', pos: [-2.2, 0, 0.33], rotY: 0, build: dresser,
    slots: [
      { key: 'drawer1', type: 'drawer', name: '上抽屉', cap: [0.74, 0.16, 0.32], offset: [0, 0.58, 0] },
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
  { id: 'computerCase', name: '电脑主机', room: 'study', pos: [4.75, 0, 5.0], rotY: Math.PI, build: computerCase,
    slots: [{ key: 'inner', type: 'interior', name: '机箱内', cap: [0.13, 0.3, 0.32], offset: [0, 0.23, 0] }] },
  { id: 'monitor', name: '显示器', room: 'study', pos: [3.6, 0.76, 5.2], rotY: Math.PI, build: monitor, collide: false, slots: [] },
  { id: 'bookshelf', name: '书架', room: 'study', pos: [7.28, 0, 1.4], rotY: -Math.PI / 2, build: bookshelf,
    slots: [
      { key: 'shelf1', type: 'top', name: '第1层', cap: [0.8, 0.3, 0.22], offset: [0, 0.115, 0] },
      { key: 'shelf4', type: 'top', name: '第4层', cap: [0.8, 0.3, 0.22], offset: [0, 1.435, 0] },
      { key: 'pages1', type: 'pages', name: '书页间·上排', cap: [0.26, 0.3, 0.008], offset: [-0.2, 0.68, 0], needsTag: 'paper', allowFold: true, bookIndex: 3 },
      { key: 'pages2', type: 'pages', name: '书页间·下排', cap: [0.26, 0.3, 0.008], offset: [0.15, 1.12, 0], needsTag: 'paper', allowFold: true, bookIndex: 14 },
    ] },
  { id: 'pictureFrame', name: '相框', room: 'study', pos: [4.35, 0.76, 5.28], rotY: Math.PI, build: pictureFrame, collide: false,
    slots: [{ key: 'behind', type: 'behind', name: '相框后面', cap: [0.3, 0.22, 0.02], offset: [0, 0.16, -0.03], needsTag: 'thin' }] },
];

// ---------- 总装 ----------
export function buildFurniture(scene, colliders) {
  const pieces = [];
  const tmpBox = new THREE.Box3();
  for (const def of CATALOG) {
    const { group, parts } = def.build();
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

export function pieceById(pieces, id) { return pieces.find(p => p.def.id === id); }
