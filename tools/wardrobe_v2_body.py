# -*- coding: utf-8 -*-
"""tools/wardrobe_v2_body.py — 衣柜 v2 单件构建 + 校验 + 导出（修复闭门漏光见衣服）

用法（单件重建，绝不触碰 models/pieces/ 下的现有文件）:
  D:\\blender\\blender.exe -b --python-exit-code 1 --python tools/wardrobe_v2_body.py \\
      -- --out <项目根> --glb <输出.glb> --skip-full

与 coffee_table_v2_body.py 同一架构（import blender_build + --skip-full，无 exec）。
核心新增验收：光密性——闭门时两扇 full-overlay 门板的几何必须完全盖住柜体前脸，
只允许均匀 3mm 门缝；不达标不导出。
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy                                                  # noqa: E402
from mathutils import Vector                                # noqa: E402

import blender_build as bb                                  # noqa: E402  (--skip-full 已在 argv)

GLB = bb.arg('--glb', os.path.join(os.environ.get('TEMP', '/tmp'),
                                   'wardrobe_v2', 'wardrobe.glb'))
SEP = '=' * 72


def log(*a):
    print(*a)


# ---------------------------------------------------------------- 1) 只建衣柜一件
bb.CUR = 'wardrobe'
bb.b_wardrobe()
objs = bb.BUCKETS.get('wardrobe', [])
log(f'[build] wardrobe: {len(objs)} 个节点 {sorted(o.name for o in objs)}')
assert objs, 'b_wardrobe() 没有产出任何对象'

bpy.context.view_layer.update()


def bbox3(sel):
    lo, hi = [1e9] * 3, [-1e9] * 3
    for o in sel:
        for c in o.bound_box:
            w = o.matrix_world @ Vector(c)
            t = (w.x, w.z, -w.y)         # blender Z-up → three Y-up
            for k in range(3):
                lo[k] = min(lo[k], t[k])
                hi[k] = max(hi[k], t[k])
    return lo, hi


by_name = {o.name: o for o in objs}
lo, hi = bbox3(objs)
size = [hi[k] - lo[k] for k in range(3)]
lo_dl, hi_dl = bbox3([by_name['part_doorL']])
lo_dr, hi_dr = bbox3([by_name['part_doorR']])
lo_body, hi_body = bbox3([by_name['wd_body']])
lo_ts, hi_ts = bbox3([by_name['wd_topshelf']])

gap_mid = lo_dr[0] - hi_dl[0]            # 中缝宽（doorL 自由缘 → doorR 自由缘）
edge_l = abs((-lo_dl[0]) - 0.6)          # 左门外缘 vs 柜体外缘（reveal）
edge_top = 2.0 - hi_dl[1]                # 门顶 reveal
edge_bot = lo_dl[1]                      # 门底 reveal

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

mats_all = {m for o in objs for m in o.data.materials if m}

checks = [
    ('外形宽 1.2 ± 0.003', abs(size[0] - 1.2) <= 0.003, round(size[0], 4)),
    ('外形高 2.0 ± 0.003', abs(size[1] - 2.0) <= 0.003, round(size[1], 4)),
    ('柜体深 0.6 ± 0.003（锚点量柜体；把手可外凸）',
     abs(hi_body[2] - lo_body[2] - 0.6) <= 0.003, round(hi_body[2] - lo_body[2], 4)),
    ('总深 ≤ 0.66（门+把手外凸上界）', size[2] <= 0.66, round(size[2], 4)),
    ('底面落地 y=0 ± 0.002', abs(lo[1]) <= 0.002, round(lo[1], 4)),
    ('光密性·中缝 3mm ± 0.002（旧版 30mm 漏光）',
     0.001 <= gap_mid <= 0.005, round(gap_mid, 4)),
    ('光密性·左门外缘盖住柜体前沿（reveal ≤ 4mm）', edge_l <= 0.004, round(edge_l, 4)),
    ('光密性·门顶盖住柜体前沿（reveal ≤ 4mm）', edge_top <= 0.004, round(edge_top, 4)),
    ('光密性·门底盖住柜体前沿（reveal ≤ 4mm）', edge_bot <= 0.004, round(edge_bot, 4)),
    ('左右镜像（doorL↔doorR 外缘对称）',
     abs(lo_dl[0] + hi_dr[0]) <= 0.002 and abs(hi_dl[0] + lo_dr[0]) <= 0.002,
     f'外缘差 {abs(lo_dl[0]+hi_dr[0]):.4f} / 自由缘差 {abs(hi_dl[0]+lo_dr[0]):.4f}'),
    ('门把手前面 ≈ 0.348（门板面 0.319 + 把手厚 0.03）',
     abs(hi_dl[2] - 0.348) <= 0.002, round(hi_dl[2], 4)),
    ('槽位锚点·侧板内壁 x=±0.57 ± 0.002',
     abs(hi_body[0] - 0.6) <= 0.002 and abs(hi_ts[0] - 0.57) <= 0.002,
     f'柜体半宽 {hi_body[0]:.4f} / 隔板半宽 {hi_ts[0]:.4f}'),
    ('槽位锚点·顶隔板面 1.715 ± 0.002', abs(hi_ts[1] - 1.715) <= 0.002, round(hi_ts[1], 4)),
    ('part_doorL/part_doorR 在场（开合动画依赖）',
     'part_doorL' in by_name and 'part_doorR' in by_name, '-'),
    ('节点数 11（旧 23，draw call 只减不增）', len(objs) == 11, len(objs)),
    ('三角面 < 9000', tris < 9000, tris),
    ('材质名 ⊆ 现有库', mats <= set(bb.MATS), sorted(mats)),
]

log(SEP)
log('几何校验（three 坐标；旧版外形 1.2 × 2.0 × 0.6，门缝 30mm 漏光）')
log(SEP)
log(f'  bbox  X[{lo[0]:.4f},{hi[0]:.4f}]  Y[{lo[1]:.4f},{hi[1]:.4f}]  Z[{lo[2]:.4f},{hi[2]:.4f}]')
log(f'  尺寸  {size[0]:.4f} × {size[1]:.4f} × {size[2]:.4f}')
fails = 0
for label, ok, val in checks:
    log(f'  [{"PASS" if ok else "FAIL"}] {label:46s} → {val}')
    fails += 0 if ok else 1
log(f'  节点 {len(objs)}: {sorted(by_name)}')
log(f'  三角面 {tris}   顶点 {verts}')

if fails:
    log(SEP)
    log(f'!! {fails} 条校验未过 —— 不导出，models/pieces/ 未被触碰')
    sys.exit(1)

os.makedirs(os.path.dirname(GLB), exist_ok=True)
bb.export_bucket('wardrobe', os.path.dirname(GLB), os.path.basename(GLB))
log(SEP)
log(f'预览 GLB → {GLB}  ({os.path.getsize(GLB)/1024:.0f} KB)')
log('注意：没有写 models/pieces/wardrobe.glb，等校验确认后手动替换。')
