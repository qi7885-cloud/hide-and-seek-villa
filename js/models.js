// models.js — Blender 模型加载层（GLB）
// 每件家具一个 GLB（models/pieces/*.glb），别墅结构/庭院/角色/物品各自独立文件。
// 约定：GLB 内需要开合动画的节点以 part_ 命名且位于根级（导出时位置=three局部坐标），
// 加载时为每个部件包一层"代理组"，使 interact.js 的 slide/hinge/book/prop 动画
// 与旧程序化部件（furniture.js parts）行为完全一致。任一模型缺失时游戏端回退程序化建模。
import * as THREE from 'three';
import { GLTFLoader } from '../vendor/jsm/loaders/GLTFLoader.js';

// pieceId(目录 Catalog) -> GLB 文件名（同 builder 的实例共用）
const PIECE_MODEL = {
  sofa: 'sofa', sofa2: 'sofa',
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
  bookshelf: 'bookshelf', bookshelf2: 'bookshelf', pictureFrame: 'picture_frame',
  toyChest: 'chest', shelfUnit: 'shelf_unit', crate1: 'crate', crate2: 'crate',
  bench: 'bench', mailbox: 'mailbox', flowerbed: 'flowerbed',
  shoeCabinet: 'shoe_cabinet', sideTable: 'side_table', wallCabinet: 'wall_cabinet',
  fileCabinet: 'file_cabinet', beanBag: 'bean_bag', backpack: 'backpack',
  bucket: 'bucket', planter: 'planter', floorLamp2: 'floor_lamp', plant3: 'plant',
  rug2: 'rug_small', pictureFrame3: 'picture_frame',
};
const STATIC_MODEL = ['villa', 'yard', 'avatar'];
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
const NO_CAST = /^(ceiling|lawn|u_slab|floor_|u_floor_|roof|gable)/;
const ROOF_LAYER = /^(roof|gable|chimney)/;   // 坡屋顶挂 layer 2（画中画不可见）

function applyShadowRules(root3d) {
  root3d.traverse((o) => {
    if (!o.isMesh) return;
    o.receiveShadow = true;
    o.castShadow = !o.material?.transparent && !NO_CAST.test(o.name);
  });
}

export async function loadAllModels(onProgress) {
  const files = [...STATIC_MODEL, ...new Set(Object.values(PIECE_MODEL)),
    ...ITEM_IDS.map(id => `item_${id}`)];
  let done = 0;
  const jobs = files.map(async (file) => {
    const scene3d = await loadFile(urlOf(file));
    applyShadowRules(scene3d);
    masters.set(file, scene3d);
    done++;
    if (onProgress) onProgress(done, files.length);
  });
  await Promise.all(jobs);
}

export function hasModel(file) { return masters.has(file); }

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
    });
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
