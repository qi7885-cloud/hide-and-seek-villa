// models.js — Blender 模型加载层（GLB）
// 每件家具一个 GLB（models/pieces/*.glb），别墅结构/庭院/角色/物品各自独立文件。
// 约定：GLB 内需要开合动画的节点以 part_ 命名且位于根级（导出时位置=three局部坐标），
// 加载时为每个部件包一层"代理组"，使 interact.js 的 slide/hinge/book/prop 动画
// 与旧程序化部件（furniture.js parts）行为完全一致。任一模型缺失时游戏端回退程序化建模。
import * as THREE from 'three';
import { GLTFLoader } from '../vendor/jsm/loaders/GLTFLoader.js';

// pieceId(目录 Catalog) -> GLB 文件名（同 builder 的实例共用）
const PIECE_MODEL = {
  sofa: 'sofa', sofa2: 'sofa',           // 一楼客厅+二楼休息区=新款法式圆扶手 v2（2026-09-17 用户要求统一）
  coffeeTable: 'coffee_table', coffeeTable2: 'coffee_table',
  carpetL: 'carpet', carpet2: 'carpet',
  tvCabinet: 'tv_cabinet', tv: 'tv',
  plant: 'plant', plant2: 'plant', floorLamp: 'floor_lamp', armchair: 'armchair',
  counter: 'counter', fridge: 'fridge', diningTable: 'dining_table',
  chair1: 'chair', chair2: 'chair', chair3: 'chair', chair4: 'chair',
  cup: 'cup', fruitBowl: 'fruit_bowl', microwave: 'microwave', trashBin: 'trash_bin',
  treadmill: 'treadmill', flyMachine: 'fly_machine', dumbbellRack: 'dumbbell_rack', yogaMat: 'yoga_mat',
  bed: 'bed', bed2: 'bed', bedKids: 'bed',
  nightstand: 'nightstand', nightstand2: 'nightstand',
  wardrobe: 'wardrobe', wardrobe2: 'wardrobe',
  dresser: 'dresser', dresser2: 'dresser',
  desk: 'desk', desk2: 'desk',
  officeChair: 'office_chair', computerCase: 'computer_case', monitor: 'monitor',
  bookshelf: 'bookshelf', bookshelf2: 'bookshelf',
  toyChest: 'chest', shelfUnit: 'shelf_unit',
  bench: 'bench', mailbox: 'mailbox', flowerbed: 'flowerbed',
  shoeCabinet: 'shoe_cabinet', sideTable: 'side_table', wallCabinet: 'wall_cabinet',
  fileCabinet: 'file_cabinet', beanBag: 'bean_bag', backpack: 'backpack',
  planter: 'planter', floorLamp2: 'floor_lamp', plant3: 'plant',
  kettle: 'kettle', board: 'board',
  rug2: 'rug_small',
};
const STATIC_MODEL = ['villa', 'yard'];
const ITEM_IDS = ['note', 'card', 'key', 'coin', 'ring', 'eraser', 'ball', 'remote'];

const loader = new GLTFLoader();
const masters = new Map();     // 文件名 -> gltf.scene

function loadFile(url) {
  return new Promise((resolve, reject) => {
    loader.load(url, (gltf) => resolve(gltf.scene), undefined,
      (err) => reject(new Error(`模型加载失败: ${url}`)));
  });
}

function urlOf(file) {
  return (STATIC_MODEL.includes(file) ? 'models/' : 'models/pieces/') + file + '.glb';
}

// 不投影的部件（与原程序化光照行为一致：楼板/屋顶/地板/天花板/草坪只接收阴影）
const NO_CAST = /^(ceiling|lawn|u_slab|floor_|floor2_|u_floor_|roof|gable)/;
const ROOF_LAYER = /^(roof|gable|chimney)/;   // 坡屋顶挂 layer 2（画中画不可见）
// 视觉裁剪（villa.glb 内按节点名取消）：
//   cur7_                一楼卧室床头窗帘（西墙床头上方）
//   bub_                 厨房吊球灯，视觉上悬在楼梯上方
//   rail15               楼梯扶手立柱，上段伸到二楼楼板(3.15)以上
//   trim_kitchen_mold00  厨房北墙石膏线，横穿楼梯上方像一条白色灯带
//   trim_*_cove[23]_0    旧版房间布局残留的灯槽，悬在楼梯井/房间半空（GLB 未随户型重生成）
//   frontdoor_grp        入户门扇（斜立门板，删除后门洞保持敞开）
const VILLA_HIDDEN = /^(cur7_|bub_|rail15$|trim_kitchen_mold00$|trim_\w+_cove[23]_0$|frontdoor_grp)/;

// 楼梯井北墙封带只盖住 x 2.85..6.6，西段（x 0..2.85）在一层墙顶(2.9)与二楼
// 楼板底(3.15)之间漏出一条能看到室外的缝 —— 补一段同材质同截面的封带
function patchStairwellBand(root3d) {
  let band = null;
  root3d.traverse((o) => { if (!band && o.name === 'stairwell_band') band = o; });
  if (!band) return;
  const patch = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.25, 0.24), band.material);
  patch.name = 'stairwell_band_patch';
  patch.position.set(1.4, 3.025, -5.62);
  patch.castShadow = band.castShadow;
  patch.receiveShadow = true;
  band.parent.add(patch);
}

// 二楼楼板以上是 f2_stair_wall 实体墙，原扶手斜穿墙体只在墙面露出一条木条；
// 在楼板下方沿原斜率截断重建扶手（原扶手沿 (1.345,1.145)→(5.695,3.745)，截面 0.07×0.07）
function trimHandrailAboveFloor(root3d) {
  let hr = null;
  root3d.traverse((o) => { if (!hr && o.name === 'handrail') hr = o; });
  if (!hr) return;
  const seg = new THREE.Mesh(new THREE.BoxGeometry(3.81, 0.07, 0.07), hr.material);
  seg.name = 'handrail_trimmed';
  seg.position.set(2.98, 2.1225, -4.53);   // 中心线 y=3.10 处截断（楼板下 5cm）
  seg.rotation.z = 0.538;
  seg.castShadow = true;
  seg.receiveShadow = true;
  hr.visible = false;
  hr.parent.add(seg);
}

// 二楼家庭厅西墙改落地窗：GLB 中原 u_wallW 墙段（小窗开口）+ u_winW 窗框/玻璃全部隐藏，
// 重建带 4m 宽落地窗开口的墙段 + 玻璃 + 窗框。命名延续 _seg 数字后缀以复用 fixWallUVs。
function patchUpperWestWindow(root3d) {
  const F2 = 3.15, WALL_H = 2.9, EXT_T = 0.24;
  const wallX = -7.5 - EXT_T / 2;
  const zFrom = -5.5, zTo = 5.5;
  const winZ0 = -4.5, winZ1 = -0.5, winY0 = 0.12, winY1 = 2.78;
  const winCz = (winZ0 + winZ1) / 2, winW = winZ1 - winZ0;
  const winCy = F2 + (winY0 + winY1) / 2, winH = winY1 - winY0;

  let wallMat = null, frameMat = null;
  const toHide = [];
  root3d.traverse((o) => {
    if (!o.isMesh) return;
    if (/^u_wallW_seg\d+$/.test(o.name)) {
      if (!wallMat) wallMat = o.material;
      toHide.push(o);
    } else if (/^u_winW_/.test(o.name)) {
      if (!frameMat && /_(fb|ft|fl|fr|mullion)$/.test(o.name)) frameMat = o.material;
      toHide.push(o);
    }
  });
  for (const o of toHide) o.visible = false;
  if (!wallMat) wallMat = new THREE.MeshStandardMaterial({ color: 0xe6ddce, roughness: 0.88 });
  if (!frameMat) frameMat = new THREE.MeshStandardMaterial({ color: 0x5c4630, roughness: 0.5 });
  const glassMat = new THREE.MeshLambertMaterial({
    color: 0xbfe3f2, transparent: true, opacity: 0.28, depthWrite: false,
  });

  const segs = [
    [zFrom, winZ0, 0, WALL_H],
    [winZ0, winZ1, 0, winY0],
    [winZ0, winZ1, winY1, WALL_H],
    [winZ1, zTo, 0, WALL_H],
  ];
  for (let i = 0; i < segs.length; i++) {
    const [a, b, y0, y1] = segs[i];
    if (b - a <= 0.002 || y1 - y0 <= 0.002) continue;
    const mid = (a + b) / 2, sy = y1 - y0, cy = F2 + (y0 + y1) / 2;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(EXT_T, sy, b - a), wallMat);
    mesh.name = `u_wallW_seg10${i}`;
    mesh.position.set(wallX, cy, mid);
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    root3d.add(mesh);
  }

  const glass = new THREE.Mesh(
    new THREE.BoxGeometry(0.02, winH - 0.1, winW - 0.1), glassMat);
  glass.name = 'u_winW_glass_f2c';
  glass.position.set(wallX, winCy, winCz);
  root3d.add(glass);

  const FT = 0.06, FD = EXT_T + 0.06;
  const mk = (w, h, d, x, y, z, name) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), frameMat);
    m.name = name;
    m.position.set(x, y, z);
    m.castShadow = false; m.receiveShadow = true;
    root3d.add(m);
  };
  mk(FD, FT, winW + 0.06, wallX, F2 + winY0 + 0.03, winCz, 'u_winW_fb_f2c');
  mk(FD, FT, winW + 0.06, wallX, F2 + winY1 - 0.03, winCz, 'u_winW_ft_f2c');
  mk(FD, winH, FT, wallX, winCy, winZ0 + 0.03, 'u_winW_fl_f2c');
  mk(FD, winH, FT, wallX, winCy, winZ1 - 0.03, 'u_winW_fr_f2c');
  for (const z of [winCz - winW / 6, winCz + winW / 6]) {
    mk(FD, winH - 0.1, 0.05, wallX, winCy, z, 'u_winW_mull_f2c');
  }
}

function applyShadowRules(root3d) {
  root3d.traverse((o) => {
    if (!o.isMesh) return;
    o.receiveShadow = true;
    o.castShadow = !o.material?.transparent && !NO_CAST.test(o.name);
  });
}

// 墙段 UV 按物理尺寸缩放：Blender 默认立方体 UV 为 0-1，墙被门窗分割成不同尺寸的段，
// 同一张 256px 纹理被拉伸/压缩成不同密度，导致墙面颜色纹理不一致。
// 按段的两条最大边长（墙长×墙高）缩放 UV，使纹纹理以每米一次的固定密度平铺。
function fixWallUVs(root3d) {
  root3d.traverse((o) => {
    if (!o.isMesh) return;
    if (!/_seg\d+$/.test(o.name)) return;
    const uv = o.geometry.attributes.uv;
    if (!uv || uv.itemSize !== 2) return;
    o.geometry.computeBoundingBox();
    const bb = o.geometry.boundingBox;
    const dims = [bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z]
      .sort((a, b) => b - a);
    const su = dims[0], sv = dims[1];
    for (let i = 0; i < uv.count; i++) {
      uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
    }
    uv.needsUpdate = true;
  });
}

// 单个模型加载失败只跳过该模型（回退程序化建模），不拖垮整个游戏
export async function loadAllModels() {
  const files = [...STATIC_MODEL, ...new Set(Object.values(PIECE_MODEL)),
    ...ITEM_IDS.map(id => `item_${id}`)];
  const jobs = files.map(async (file) => {
    try {
      const scene3d = await loadFile(urlOf(file));
      applyShadowRules(scene3d);
      masters.set(file, scene3d);
    } catch (err) {
      console.warn('[models] 加载失败，回退程序化建模:', urlOf(file));
    }
  });
  await Promise.all(jobs);
}

// ---------- 家具实例：clone 主模型 + 生成部件代理 ----------
export function instantiatePiece(pieceId) {
  const file = PIECE_MODEL[pieceId];
  const master = file && masters.get(file);
  if (!master) return null;
  const root = master.clone(true);
  const group = new THREE.Group();
  group.add(root);
  root.updateMatrixWorld(true);

  const parts = {};
  const partNodes = [];
  root.traverse((o) => { if (o.name.startsWith('part_')) partNodes.push(o); });
  for (const node of partNodes) {
    // 'part_doorL__wardrobe' -> 'part_doorL'；'part_book_03' -> 书籍数组
    const base = node.name.replace(/\.\d+$/, '').split('__')[0];
    const proxy = new THREE.Group();
    proxy.name = base;
    node.parent.add(proxy);
    proxy.position.copy(node.position);
    proxy.quaternion.copy(node.quaternion);
    proxy.scale.copy(node.scale);
    node.position.set(0, 0, 0);
    node.quaternion.identity();
    node.scale.set(1, 1, 1);
    proxy.add(node);
    if (base.startsWith('part_book_')) {
      const idx = parseInt(base.slice(10), 10);
      if (!parts.books) parts.books = [];
      parts.books[idx] = proxy;
    } else {
      parts[base.slice(5)] = proxy;   // part_doorL -> doorL
    }
  }
  return { group, parts };
}

// ---------- 别墅/庭院/角色 ----------
export function staticModel(file) {
  const m = masters.get(file);
  if (!m) return null;
  const root3d = m.clone(true);
  if (file === 'villa') {
    root3d.traverse((o) => {
      if (ROOF_LAYER.test(o.name)) o.layers.set(2);
      if (VILLA_HIDDEN.test(o.name)) o.visible = false;
    });
    trimHandrailAboveFloor(root3d);
    patchStairwellBand(root3d);
    patchUpperWestWindow(root3d);
    fixWallUVs(root3d);
  }
  if (file === 'yard') {
    // yard.glb 的石板路只建了 4 块（path0~3），西门到门廊之间缺 3 块 —— 按原几何/材质补齐
    let path0 = null;
    root3d.traverse((o) => { if (!path0 && o.name === 'path0') path0 = o; });
    if (path0) {
      for (const x of [-10.17, -9.39, -8.61]) {
        const s = new THREE.Mesh(path0.geometry, path0.material);
        s.name = 'path_extra';
        s.position.set(x, path0.position.y, path0.position.z);
        s.castShadow = path0.castShadow;
        s.receiveShadow = true;
        root3d.add(s);
      }
    }
  }
  return root3d;
}

// ---------- 藏匿物品实例 ----------
export function instantiateItem(itemId) {
  const master = masters.get(`item_${itemId}`);
  if (!master) return null;
  const root = master.clone(true);
  root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return root;
}
