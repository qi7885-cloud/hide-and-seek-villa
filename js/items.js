// items.js — 可藏匿物品定义 + 网格工厂
import * as THREE from 'three';

// size: [宽, 高, 厚] 米。tags: paper=纸类可对折/夹页, thin=薄片, metal=金属, small=小件
export const ITEM_DEFS = [
  { id: 'note',   name: '小纸条', size: [0.12, 0.002, 0.08], tags: ['paper', 'thin'], color: 0xfff3c2, shape: 'box' },
  { id: 'card',   name: '扑克牌', size: [0.063, 0.001, 0.088], tags: ['paper', 'thin'], color: 0xf5f5f0, shape: 'box' },
  { id: 'key',    name: '钥匙',   size: [0.06, 0.008, 0.026], tags: ['metal', 'small'], color: 0xc9a227, shape: 'key' },
  { id: 'coin',   name: '硬币',   size: [0.024, 0.004, 0.024], tags: ['metal', 'small'], color: 0xb9b9c0, shape: 'coin' },
  { id: 'ring',   name: '戒指',   size: [0.021, 0.02, 0.02], tags: ['metal', 'small'], color: 0xd8d8e0, shape: 'ring' },
  { id: 'eraser', name: '橡皮',   size: [0.05, 0.02, 0.024], tags: ['small'], color: 0xe86a6a, shape: 'box' },
  { id: 'ball',   name: '乒乓球', size: [0.04, 0.04, 0.04], tags: ['small'], color: 0xffe9a8, shape: 'ball' },
  { id: 'remote', name: '遥控器', size: [0.05, 0.022, 0.16], tags: [], color: 0x33363c, shape: 'box' },
];

export function itemById(id) { return ITEM_DEFS.find(i => i.id === id); }

function mat(color) { return new THREE.MeshLambertMaterial({ color }); }

// 低多边形物品网格
export function createItemMesh(def) {
  const [w, h, d] = def.size;
  let geo;
  switch (def.shape) {
    case 'coin': geo = new THREE.CylinderGeometry(w / 2, w / 2, h, 14); break;
    case 'ball': geo = new THREE.SphereGeometry(w / 2, 12, 10); break;
    case 'ring': geo = new THREE.TorusGeometry(w / 2, 0.004, 8, 16); break;
    case 'key': {
      const g = new THREE.Group();
      const shaft = new THREE.Mesh(new THREE.BoxGeometry(w * 0.9, h, d * 0.35), mat(def.color));
      shaft.position.z = -d * 0.2;
      const head = new THREE.Mesh(new THREE.TorusGeometry(d * 0.42, 0.004, 6, 12), mat(def.color));
      head.position.z = d * 0.3;
      const tooth = new THREE.Mesh(new THREE.BoxGeometry(w * 0.25, h, d * 0.3), mat(def.color));
      tooth.position.set(w * 0.3, 0, -d * 0.42);
      g.add(shaft, head, tooth);
      g.traverse(o => { if (o.isMesh) o.castShadow = true; });
      return g;
    }
    default: geo = new THREE.BoxGeometry(w, h, d);
  }
  const mesh = new THREE.Mesh(geo, mat(def.color));
  mesh.castShadow = true;
  return mesh;
}
