// models.js — Blender 模型加载层（GLB）
// 每件家具一个 GLB（models/pieces/*.glb），别墅结构/庭院/角色/物品各自独立文件。
// 约定：GLB 内需要开合动画的节点以 part_ 命名且位于根级（导出时位置=three局部坐标），
// 加载时为每个部件包一层"代理组"，使 interact.js 的 slide/hinge/book/prop 动画
// 与旧程序化部件（furniture.js parts）行为完全一致。任一模型缺失时游戏端回退程序化建模。
import * as THREE from 'three';
import { GLTFLoader } from '../vendor/jsm/loaders/GLTFLoader.js';

// pieceId(目录 Catalog) -> GLB 文件名（同 builder 的实例共用）
const PIECE_MODEL = {
  sofa: 'sofa', sofa2: 'sofa_lounge2',   // 一楼客厅=新款法式圆扶手；二楼休息区沿用旧款
  coffeeTable: 'coffee_table', coffeeTable2: 'coffee_table',
  carpetL: 'carpet', carpet2: 'carpet', rugB: 'rug_small',
  tvCabinet: 'tv_cabinet', tv: 'tv',
  plant: 'plant', plant2: 'plant', floorLamp: 'floor_lamp', armchair: 'armchair',
  counter: 'counter', fridge: 'fridge', diningTable: 'dining_table',
  chair1: 'chair', chair2: 'chair', chair3: 'chair', chair4: 'chair',
  cup: 'cup', fruitBowl: 'fruit_bowl', microwave: 'microwave', trashBin: 'trash_bin',
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

function applyShadowRules(root3d) {
  root3d.traverse((o) => {
    if (!o.isMesh) return;
    o.receiveShadow = true;
    o.castShadow = !o.material?.transparent && !NO_CAST.test(o.name);
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
