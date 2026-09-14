// slots.js — 槽位类型定义与"能不能藏进去"的校验规则
// 槽位类型：interior=容器内部 under=家具底下 pages=书页间(需paper)
//           drawer=抽屉 soil=花盆土里 top=台面
// cap: 槽位能容纳的最大尺寸[三轴]，校验时按三轴降序对比（方向无关）

export const SLOT_LABELS = {
  interior: '内部', under: '底下', pages: '书页间',
  drawer: '抽屉', soil: '土里', top: '台面上',
};

// 校验：返回 { ok, why }
export function canHide(item, slot) {
  if (slot.needsTag && !(item.tags || []).includes(slot.needsTag)) {
    return { ok: false, why: '形状不适合这个位置' };
  }
  const dims = [...item.size].sort((a, b) => b - a);
  // 纸类在允许折叠的槽位里可对折一次（最长边减半）
  if (slot.allowFold && (item.tags || []).includes('paper')) dims[0] /= 2;
  const cap = [...slot.cap].sort((a, b) => b - a);
  for (let i = 0; i < 3; i++) {
    if (dims[i] > cap[i] + 1e-6) return { ok: false, why: '放不下，尺寸超出' };
  }
  return { ok: true, why: '' };
}
