// character.js — 和平精英风格特战队员（程序化低多边形建模，零外部资源）
// 结构：group(脚底原点, 面朝 -Z) > bodyRoot(步态起伏) > 各关节 Pivot
// userData.rig 暴露全部关节，供 player.js 做步行/奔跑/待机动画
import * as THREE from 'three';

// ---- 调色板：暖色休闲探险风，贴合别墅场景（奶油墙/暖木/嫩绿草坪/金色的UI） ----
const C = {
  skin:    0xE8B48F,   // 肤色
  hair:    0x4A3426,   // 暖棕短发
  jacket:  0xE07850,   // 陶土橙上衣（呼应木色与金色UI，草坪上醒目）
  jacketD: 0xC4633F,   // 上衣暗部
  vest:    0xF2E4CB,   // 奶油色装备背心
  pouch:   0xE0CDA8,   // 沙色附包
  pants:   0x6E88AC,   // 洗旧牛仔蓝（呼应天空）
  knee:    0x54616E,   // 蓝灰护膝/手套/腰带
  boot:    0x8A6244,   // 暖棕靴（呼应木家具）
  pack:    0xCBA35C,   // 芥末黄背包
  strap:   0x8A6244,   // 暖棕背带
  helmet:  0xEFE3C8,   // 奶油色探险头盔
  eye:     0x3A2E26,   // 暖深色眼睛/眉毛
};

const mat = (color, roughness = 0.85, metalness = 0) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness });

function mesh(geo, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  return m;
}

// 圆角感胶囊：默认沿 Y 轴
const cap = (r, len, matl, seg = 6) => new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 3, seg), matl);

export function buildCharacter() {
  const g = new THREE.Group();
  const bodyRoot = new THREE.Group();          // 步态上下起伏挂这里
  g.add(bodyRoot);

  const M = {
    skin: mat(C.skin, 0.62),
    hair: mat(C.hair, 0.92),
    jacket: mat(C.jacket, 0.88),
    jacketD: mat(C.jacketD, 0.9),
    vest: mat(C.vest, 0.88),
    pouch: mat(C.pouch, 0.8),
    pants: mat(C.pants, 0.9),
    knee: mat(C.knee, 0.65),
    boot: mat(C.boot, 0.6),
    pack: mat(C.pack, 0.85),
    strap: mat(C.strap, 0.8),
    helmet: mat(C.helmet, 0.5, 0.05),
    eye: mat(C.eye, 0.5),
  };

  // ============ 头部（头颈 Pivot 在 y1.48，方便待机微点头） ============
  const headPivot = new THREE.Group();
  headPivot.position.y = 1.48;
  bodyRoot.add(headPivot);

  const neck = mesh(new THREE.CylinderGeometry(0.048, 0.055, 0.09, 8), M.skin, 0, 0.03, 0);
  headPivot.add(neck);

  const skull = cap(0.115, 0.02, M.skin, 12);
  skull.scale.set(1, 1.05, 0.98);
  skull.position.y = 0.155;
  headPivot.add(skull);

  // 短发：只罩头顶+后脑（前檐后仰到眉上方，露出整张脸）
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.122, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), M.hair);
  hair.position.set(0, 0.155, 0.012);
  hair.rotation.x = 0.3;
  hair.scale.set(1.03, 0.95, 1.06);
  headPivot.add(hair);

  // 五官（面朝 -Z）
  for (const s of [-1, 1]) {
    headPivot.add(mesh(new THREE.SphereGeometry(0.02, 8, 6), M.eye, s * 0.045, 0.158, -0.103));
    headPivot.add(mesh(new THREE.BoxGeometry(0.045, 0.011, 0.012), M.eye, s * 0.046, 0.188, -0.102));  // 眉
    headPivot.add(mesh(new THREE.SphereGeometry(0.024, 8, 6), M.skin, s * 0.112, 0.15, 0.004));        // 耳
  }
  headPivot.add(mesh(new THREE.BoxGeometry(0.026, 0.042, 0.028), M.skin, 0, 0.135, -0.112));           // 鼻
  const mouthMat = mat(0x8A5A48, 0.7);
  headPivot.add(mesh(new THREE.BoxGeometry(0.04, 0.011, 0.01), mouthMat, 0, 0.105, -0.11));            // 嘴

  // 战术头盔（轻盔：抬高+后仰，露出眉眼）
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.132, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), M.helmet);
  helmet.position.set(0, 0.195, 0.02);
  helmet.rotation.x = -0.34;
  helmet.scale.set(1.05, 0.85, 1.0);
  headPivot.add(helmet);
  headPivot.add(mesh(new THREE.BoxGeometry(0.2, 0.02, 0.055), M.helmet, 0, 0.205, -0.082));            // 盔檐（在眉上方）

  // ============ 躯干 ============
  // 骨盆+腰带
  const pelvis = cap(0.135, 0.1, M.pants, 10);
  pelvis.scale.set(1.1, 1, 0.78);
  pelvis.position.y = 0.96;
  bodyRoot.add(pelvis);
  bodyRoot.add(mesh(new THREE.BoxGeometry(0.31, 0.055, 0.22), M.knee, 0, 1.03, 0));                    // 腰带
  bodyRoot.add(mesh(new THREE.BoxGeometry(0.05, 0.04, 0.02), M.eye, 0, 1.03, -0.115));                 // 卡扣

  // 夹克：胸(宽) + 腹(略窄) 两段胶囊
  const chest = cap(0.155, 0.16, M.jacket, 10);
  chest.scale.set(1.18, 1, 0.74);
  chest.position.y = 1.3;
  bodyRoot.add(chest);
  const abdomen = cap(0.14, 0.1, M.jacketD, 10);
  abdomen.scale.set(1.08, 1, 0.72);
  abdomen.position.y = 1.12;
  bodyRoot.add(abdomen);

  // 战术背心（胸前甲板）+ 双弹匣包（露出弹匣顶）+ 挂带
  const vest = mesh(new THREE.BoxGeometry(0.3, 0.24, 0.19), M.vest, 0, 1.27, -0.015);
  bodyRoot.add(vest);
  for (const s of [-1, 1]) {
    bodyRoot.add(mesh(new THREE.BoxGeometry(0.062, 0.085, 0.04), M.pouch, s * 0.07, 1.205, -0.112));   // 弹匣包
    bodyRoot.add(mesh(new THREE.BoxGeometry(0.04, 0.028, 0.03), M.jacketD, s * 0.07, 1.252, -0.122));  // 露头的弹匣
    bodyRoot.add(mesh(new THREE.BoxGeometry(0.045, 0.2, 0.028), M.strap, s * 0.093, 1.3, -0.102));     // 挂带
  }
  bodyRoot.add(mesh(new THREE.BoxGeometry(0.055, 0.065, 0.028), M.pouch, 0.115, 1.32, -0.105));        // 对讲机

  // ============ 三级背包（背后） ============
  const pack = mesh(new THREE.BoxGeometry(0.3, 0.4, 0.16), M.pack, 0, 1.22, 0.185);
  bodyRoot.add(pack);
  const packTop = mesh(new THREE.CylinderGeometry(0.09, 0.1, 0.3, 8), M.pack, 0, 1.46, 0.185);
  packTop.rotation.z = Math.PI / 2;
  packTop.scale.set(1, 1, 0.62);
  bodyRoot.add(packTop);
  for (const s of [-1, 1]) {
    bodyRoot.add(mesh(new THREE.BoxGeometry(0.07, 0.2, 0.09), M.pouch, s * 0.175, 1.16, 0.21));        // 侧袋（伸出两侧）
    bodyRoot.add(mesh(new THREE.BoxGeometry(0.035, 0.3, 0.012), M.strap, s * 0.085, 1.26, 0.268));     // 细背带压在包面
  }

  // ============ 四肢（肩/髋 Pivot + 肘/膝子 Pivot） ============
  const buildArm = (side) => {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 0.25, 1.415, 0);
    bodyRoot.add(shoulder);
    const pad = mesh(new THREE.SphereGeometry(0.068, 10, 8), M.jacket, 0, -0.005, 0);                  // 肩垫（贴肩）
    pad.scale.set(1.05, 0.82, 1);
    shoulder.add(pad);

    const upper = cap(0.058, 0.14, M.jacket, 8);
    upper.position.y = -0.12;
    shoulder.add(upper);

    const elbow = new THREE.Group();
    elbow.position.y = -0.24;
    shoulder.add(elbow);
    const fore = cap(0.05, 0.12, M.jacketD, 8);
    fore.position.y = -0.1;
    elbow.add(fore);
    const glove = mesh(new THREE.BoxGeometry(0.07, 0.1, 0.06), M.knee, 0, -0.21, -0.005);              // 手套
    glove.geometry.translate(0, -0.012, -0.012);
    elbow.add(glove);

    return { shoulder, elbow };
  };

  const buildLeg = (side) => {
    const hip = new THREE.Group();
    hip.position.set(side * 0.105, 0.9, 0);
    bodyRoot.add(hip);

    const thigh = cap(0.075, 0.22, M.pants, 8);
    thigh.position.y = -0.16;
    hip.add(thigh);
    hip.add(mesh(new THREE.BoxGeometry(0.06, 0.1, 0.03), M.pouch, side * 0.052, -0.18, -0.09));        // 腿侧工具包

    const kneeP = new THREE.Group();
    kneeP.position.y = -0.34;
    hip.add(kneeP);
    kneeP.add(mesh(new THREE.BoxGeometry(0.128, 0.1, 0.085), M.knee, 0, -0.005, -0.015));              // 护膝
    const calf = cap(0.058, 0.2, M.pants, 8);
    calf.position.y = -0.15;
    kneeP.add(calf);

    const boot = mesh(new THREE.BoxGeometry(0.115, 0.11, 0.19), M.boot, 0, -0.305, -0.028);            // 作战靴
    kneeP.add(boot);
    const toe = mesh(new THREE.BoxGeometry(0.105, 0.06, 0.07), M.boot, 0, -0.325, -0.125);             // 鞋头
    kneeP.add(toe);

    return { hip, knee: kneeP };
  };

  const armL = buildArm(-1), armR = buildArm(1);
  const legL = buildLeg(-1), legR = buildLeg(1);

  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });

  g.scale.setScalar(0.76);  // 整体身高 ≈1.36m：与旧版蓝胶囊小人同高，匹配别墅层高/家具比例

  g.userData.rig = {
    bodyRoot, headPivot,
    arms:  [armL.shoulder, armR.shoulder],
    elbows: [armL.elbow, armR.elbow],
    legs:  [legL.hip, legR.hip],
    knees: [legL.knee, legR.knee],
  };
  // 兼容旧接口（外部若有简单摆臂摆腿引用）
  g.userData.legs = [legL.hip, legR.hip];
  g.userData.arms = [armL.shoulder, armR.shoulder];
  return g;
}
