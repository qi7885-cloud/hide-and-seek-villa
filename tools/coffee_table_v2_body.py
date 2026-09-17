# -*- coding: utf-8 -*-
"""tools/coffee_table_v2_body.py — 茶几 v2 单件构建 + 校验 + 导出（写实重建流程第一件）

用法（单件重建，绝不触碰 models/pieces/ 下的现有文件）:
  D:\\blender\\blender.exe -b --python-exit-code 1 --python tools/coffee_table_v2_body.py \
      -- --out <项目根> --glb <输出.glb> --skip-full

工作方式：
  直接 import blender_build（argv 带 --skip-full，其 main() 全量导出自跳过），
  复用它的材质库、几何助手与 b_coffee_table()，只重建茶几一件 → 锚点校验 →
  全部 PASS 才导出到 --glb 指定的临时目录。替换由调用方在校验通过后手动拷贝
  （git 本身就是旧版备份）。

安全设计（对应"游戏数据不受损、不卡死、不死机"）：
  - blender -b 无头、无渲染，4 节点 ~1000 三角面，秒级完成，进程结束即退；
  - 唯一的磁盘写是 --glb 输出文件；校验任一条 FAIL 则退出码非 0 且不产出文件；
  - 全程无 exec / eval / 动态拼接 —— 无动态代码执行（Mimosa 对 exec 与 Bash 写源码的拦截）。
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy                                                  # noqa: E402
from mathutils import Vector                                # noqa: E402

import blender_build as bb                                  # noqa: E402  (--skip-full 已在 argv)

GLB = bb.arg('--glb', os.path.join(os.environ.get('TEMP', '/tmp'),
                                   'coffee_v2', 'coffee_table.glb'))
SEP = '=' * 72


def log(*a):
    print(*a)


# ---------------------------------------------------------------- 1) 只建茶几一件
bb.CUR = 'coffee_table'
bb.b_coffee_table()
objs = bb.BUCKETS.get('coffee_table', [])
log(f'[build] coffee_table: {len(objs)} 个节点 {sorted(o.name for o in objs)}')
assert objs, 'b_coffee_table() 没有产出任何对象'

bpy.context.view_layer.update()          # 读 matrix_world 前必须更新（HANDOFF 坑13）

# ---------------------------------------------------------------- 2) 校验（three 坐标 X宽/Y高/Z深）
def bbox3(sel):
    lo, hi = [1e9] * 3, [-1e9] * 3
    for o in sel:
        for c in o.bound_box:
            w = o.matrix_world @ Vector(c)
            t = (w.x, w.z, -w.y)         # blender Z-up → three Y-up（管线同款换算）
            for k in range(3):
                lo[k] = min(lo[k], t[k])
                hi[k] = max(hi[k], t[k])
    return lo, hi


lo, hi = bbox3(objs)
size = [hi[k] - lo[k] for k in range(3)]
by_name = {o.name: o for o in objs}
lo_top, hi_top = bbox3([by_name['top']])
lo_sh, hi_sh = bbox3([by_name['shelf']])

dg = bpy.context.evaluated_depsgraph_get()
tris = verts = 0
for o in objs:
    if o.type != 'MESH':
        continue
    me = o.evaluated_get(dg).to_mesh()
    tris += sum(len(p.vertices) - 2 for p in me.polygons)
    verts += len(me.vertices)
    o.evaluated_get(dg).to_mesh_clear()

mats = set()
for o in objs:
    for m in o.data.materials:
        if m:
            mats.add(m.name)

spans = sorted((round(min((o.matrix_world @ Vector(c)).x for c in o.bound_box), 3),
                round(max((o.matrix_world @ Vector(c)).x for c in o.bound_box), 3))
               for o in objs)
mirror_ok = all(abs(a + b) <= 0.003 for a, b in spans)

checks = [
    ('占地宽 1.10 ± 0.005', abs(size[0] - 1.10) <= 0.005, round(size[0], 4)),
    ('占地深 0.60 ± 0.005', abs(size[2] - 0.60) <= 0.005, round(size[2], 4)),
    ('桌面顶面 0.450 ± 0.002（top 槽锚点）', abs(hi_top[1] - 0.450) <= 0.002, round(hi_top[1], 4)),
    ('隔板顶面 0.155 ± 0.002（shelf 槽锚点）', abs(hi_sh[1] - 0.155) <= 0.002, round(hi_sh[1], 4)),
    ('总高 0.45 ± 0.003', abs(size[1] - 0.45) <= 0.003, round(size[1], 4)),
    ('底面落地 y=0 ± 0.002', abs(lo[1]) <= 0.002, round(lo[1], 4)),
    ('左右镜像（各节点 X 跨度对称）', mirror_ok, '完全镜像' if mirror_ok else str(spans)),
    ('桌面 ≥ top 槽 cap 0.9×0.45', size[0] >= 0.9 and (hi_top[0] - lo_top[0]) >= 0.9,
     round(hi_top[0] - lo_top[0], 3)),
    ('隔板 ≥ shelf 槽 cap 0.75×0.35',
     (hi_sh[0] - lo_sh[0]) >= 0.75 and (hi_sh[2] - lo_sh[2]) >= 0.35,
     f'{hi_sh[0]-lo_sh[0]:.3f}×{hi_sh[2]-lo_sh[2]:.3f}'),
    ('节点数 4（≤ 旧版 6，draw call 只减不增）', len(objs) == 4, len(objs)),
    ('无可动部件（parts={}，不该出现 part_*）',
     not any(n.startswith('part_') for n in by_name), '-'),
    ('三角面 < 3000', tris < 3000, tris),
    ('材质 ⊆ {wood, wood_dark}', mats <= {'wood', 'wood_dark'}, sorted(mats)),
]

log(SEP)
log('几何校验（three 坐标；旧版 1.10 × 0.45 × 0.60）')
log(SEP)
log(f'  bbox  X[{lo[0]:.4f},{hi[0]:.4f}]  Y[{lo[1]:.4f},{hi[1]:.4f}]  Z[{lo[2]:.4f},{hi[2]:.4f}]')
log(f'  尺寸  {size[0]:.4f} × {size[1]:.4f} × {size[2]:.4f}')
fails = 0
for label, ok, val in checks:
    log(f'  [{"PASS" if ok else "FAIL"}] {label:42s} → {val}')
    fails += 0 if ok else 1
log(f'  节点 {len(objs)}: {sorted(by_name)}   材质: {sorted(mats)}')
log(f'  三角面 {tris}   顶点 {verts}')

# ---------------------------------------------------------------- 3) 导出（仅全部 PASS）
if fails:
    log(SEP)
    log(f'!! {fails} 条校验未过 —— 不导出，models/pieces/ 未被触碰')
    sys.exit(1)

os.makedirs(os.path.dirname(GLB), exist_ok=True)
bb.export_bucket('coffee_table', os.path.dirname(GLB), os.path.basename(GLB))
log(SEP)
log(f'预览 GLB → {GLB}  ({os.path.getsize(GLB)/1024:.0f} KB)')
log('注意：没有写 models/pieces/coffee_table.glb，等确认后手动替换。')
