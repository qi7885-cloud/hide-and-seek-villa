# -*- coding: utf-8 -*-
"""tools/piece_v2_body.py — 通用单件构建 + 校验 + 导出（抽屉四件 + 健身四件 + 盆栽）

用法（一次只跑一件，绝不触碰 models/pieces/ 下的现有文件）:
  D:\\blender\\blender.exe -b --python-exit-code 1 --python tools/piece_v2_body.py \\
      -- --piece nightstand --out <项目根> --glb <输出.glb> --skip-full

与 coffee_table_v2_body.py 同一架构（import blender_build + --skip-full，无 exec）。
每件的期望尺寸/部件/槽位锚点写在 PIECE_SPECS；校验不过不导出。
通用纪律：外形±0.003、落地 y=0、part_* 在场、节点/三角面预算、材质白名单、
          抽屉件额外验"全覆盖面板+3mm 缝+盒底=槽位锚点"。
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy                                                  # noqa: E402
from mathutils import Vector                                # noqa: E402

import blender_build as bb                                  # noqa: E402  (--skip-full 已在 argv)

PIECE = bb.arg('--piece', '')
GLB = bb.arg('--glb', os.path.join(os.environ.get('TEMP', '/tmp'), 'piece_v2',
                                   f'{PIECE or "out"}.glb'))
SEP = '=' * 72

# 期望尺寸 [宽X, 高Y, 深Z]（±tol）；parts=必须存在的部件名；edges=部件包围盒锚定边
# （全覆盖面板的外缘是确定值：面板上下缘=缝位；被面板包住的抽屉盒用"盒顶=盒底+盒高"的
#   外露边间接锚定）；z_node=量深度用的柜身节点（前脸面板/把手可合法外凸，不计入锚点）；
# gap=两抽面板间缝（panel_h 从下面板 ymin 推算）
PIECE_SPECS = {
    'nightstand': dict(dims=[0.45, 0.5, None], parts=['part_drawer', 'part_drawer2'],
                       nodes=3, max_tris=4000, mirror=True,
                       edges={'part_drawer': [('ymin', 0.2515), ('ymax', 0.497)],
                              'part_drawer2': [('ymin', 0.0025), ('ymax', 0.265)]},
                       z_node='ns_body', z=0.4,
                       gap=dict(lower='part_drawer2', upper='part_drawer',
                                panel_h=0.2455, want=0.003)),
    'dresser': dict(dims=[0.9, 0.78, None], parts=['part_drawer1', 'part_drawer2'],
                    nodes=4, max_tris=4500, mirror=True,
                    edges={'part_drawer1': [('ymin', 0.4215), ('ymax', 0.777)],
                           'part_drawer2': [('ymin', 0.063), ('ymax', 0.455)]},
                    z_node='dr_body', z=0.45,
                    gap=dict(lower='part_drawer2', upper='part_drawer1',
                             panel_h=0.3555, want=0.003)),
    'desk': dict(dims=[1.4, 0.76, None], parts=['part_drawer'],
                 nodes=3, max_tris=3500, mirror=False,
                 edges={'part_drawer': [('ymin', 0.567), ('ymax', 0.707)]},
                 z_node='desk_top', z=0.7),
    'file_cabinet': dict(dims=[0.45, 0.6, None], parts=['part_drawer', 'part_drawer2'],
                         nodes=3, max_tris=4500, mirror=True,
                         edges={'part_drawer': [('ymin', 0.3015), ('ymax', 0.597)],
                                'part_drawer2': [('ymin', 0.003), ('ymax', 0.2985)]},
                         z_node='fc_body', z=0.45,
                         gap=dict(lower='part_drawer2', upper='part_drawer',
                                  panel_h=0.2955, want=0.003)),
    'treadmill': dict(dims=[0.8, None, 1.815], dims_tol=0.02, parts=[], nodes=3,
                      max_tris=4000, height_range=(1.05, 1.30), mirror=True),
    'fly_machine': dict(dims=[1.05, None, 0.95], dims_tol=0.03, parts=[], nodes=4,
                        max_tris=5000, height_range=(1.10, 1.30), mirror=False),
    'dumbbell_rack': dict(dims=[0.962, None, 0.322], dims_tol=0.02, parts=[], nodes=6,
                          max_tris=4000, height_range=(0.45, 0.60), mirror=True),
    'yoga_mat': dict(dims=[0.70, None, 1.5725], dims_tol=0.012, parts=[], nodes=2,
                     max_tris=1500, height_range=(0.10, 0.16), mirror=False),
    'plant': dict(dims=[0.45, None, 0.45], dims_tol=0.06, parts=[], nodes=4,
                  max_tris=4500, height_range=(0.70, 0.92), mirror=False,
                  soil_top=0.3025),
}


def log(*a):
    print(*a)


spec = PIECE_SPECS.get(PIECE)
assert spec, f'未知 piece: {PIECE}（可选: {", ".join(PIECE_SPECS)}）'

# ---------------------------------------------------------------- 1) 只建这一件
bb.CUR = PIECE
bb.PIECE_BUILDERS[PIECE]()
objs = bb.BUCKETS.get(PIECE, [])
log(f'[build] {PIECE}: {len(objs)} 个节点 {sorted(o.name for o in objs)}')
assert objs, f'b_{PIECE}() 没有产出任何对象'

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


lo, hi = bbox3(objs)
size = [hi[k] - lo[k] for k in range(3)]
# 名字归一（与游戏端同款：剥掉 join 加的 __桶名 后缀）
for o in objs:
    o.name = o.name.split('__')[0]
by_name = {o.name: o for o in objs}

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

tol = spec.get('dims_tol', 0.003)
checks = [('落地 y=0 ± 0.002', abs(lo[1]) <= 0.002, round(lo[1], 4))]
for k, (axis, expect) in enumerate(zip('XYZ', spec['dims'])):
    if expect is not None:
        checks.append((f'尺寸{axis} {expect} ± {tol}',
                       abs(size[k] - expect) <= tol, round(size[k], 4)))
if spec.get('height_range'):
    a, b = spec['height_range']
    checks.append((f'总高在 [{a},{b}]', a <= size[1] <= b, round(size[1], 4)))
if spec.get('soil_top') is not None:
    lo_soil, hi_soil = bbox3([by_name['pot_soil']])
    checks.append(('土面顶 0.3025 ± 0.002（soil 槽锚点）',
                   abs(hi_soil[1] - spec['soil_top']) <= 0.002, round(hi_soil[1], 4)))

names = set(by_name)
for p in spec['parts']:
    checks.append((f'部件 {p} 在场（开合动画依赖）', p in names, p in names))
checks.append((f'节点数 {spec["nodes"]}（≤ 旧版）', len(objs) == spec['nodes'], len(objs)))
checks.append((f'三角面 < {spec["max_tris"]}', tris < spec['max_tris'], tris))
checks.append(('材质 ⊆ 现有库', mats <= set(bb.MATS), sorted(mats)))

if spec.get('mirror'):
    # 集合级镜像：跨度集合取负后与原集合一致（允许成对平移件，如哑铃/门板）
    spans = sorted((round(min((o.matrix_world @ Vector(c)).x for c in o.bound_box), 3),
                    round(max((o.matrix_world @ Vector(c)).x for c in o.bound_box), 3))
                   for o in objs)
    mirrored = sorted((-b, -a) for a, b in spans)
    mirror_ok = spans == mirrored
    checks.append(('左右镜像（X 跨度集合取负一致）', mirror_ok,
                   '完全镜像' if mirror_ok else str(spans)))

# 深度锚点：量柜身/主体节点（前脸面板与把手可合法外凸，不计入）
if spec.get('z_node'):
    zlo, zhi = bbox3([by_name[spec['z_node']]])
    checks.append((f'柜身深度 {spec["z"]} ± 0.003（量 {spec["z_node"]}）',
                   abs(zhi[2] - zlo[2] - spec['z']) <= 0.003,
                   round(zhi[2] - zlo[2], 4)))

# 抽屉件专属：面板锚定边（缝位/覆盖）+ 两抽面板间缝
for pname, edge_list in (spec.get('edges') or {}).items():
    plo, phi = bbox3([by_name[pname]])
    for edge, want in edge_list:
        val = phi[1] if edge == 'ymax' else plo[1]
        checks.append((f'{pname}.{edge} = {want} ± 0.002', abs(val - want) <= 0.002,
                       round(val, 4)))
gp = spec.get('gap')
if gp:
    lo_l, _ = bbox3([by_name[gp['lower']]])
    lo_u, _ = bbox3([by_name[gp['upper']]])
    gap = lo_u[1] - (lo_l[1] + gp['panel_h'])     # 上面板底 - 下面板顶
    checks.append((f'抽屉面板间缝 {gp["want"]} ± 0.002（旧版 20mm 粗缝）',
                   abs(gap - gp['want']) <= 0.002, round(gap, 4)))

log(SEP)
log(f'{PIECE} 校验（three 坐标）')
log(SEP)
log(f'  bbox  X[{lo[0]:.4f},{hi[0]:.4f}]  Y[{lo[1]:.4f},{hi[1]:.4f}]  Z[{lo[2]:.4f},{hi[2]:.4f}]')
log(f'  尺寸  {size[0]:.4f} × {size[1]:.4f} × {size[2]:.4f}')
fails = 0
for label, ok, val in checks:
    log(f'  [{"PASS" if ok else "FAIL"}] {label:44s} → {val}')
    fails += 0 if ok else 1
log(f'  三角面 {tris}   顶点 {verts}')

if fails:
    log(SEP)
    log(f'!! {fails} 条校验未过 —— 不导出，models/pieces/ 未被触碰')
    sys.exit(1)

os.makedirs(os.path.dirname(GLB), exist_ok=True)
bb.export_bucket(PIECE, os.path.dirname(GLB), os.path.basename(GLB))
log(SEP)
log(f'预览 GLB → {GLB}  ({os.path.getsize(GLB)/1024:.0f} KB)')
log('注意：没有写 models/pieces/，等确认后手动替换。')
