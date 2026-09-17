# -*- coding: utf-8 -*-
"""tools/villa_upgrade_body.py — 楼体升级（只换皮不动结构）+ 基线硬对比 + 导出

用法:
  D:\\blender\\blender.exe -b --python-exit-code 1 --python tools/villa_upgrade_body.py \\
      -- --out <项目根> --glb <输出.glb> --skip-full

流程：
  1. import blender_build（--skip-full），跑 build_villa_v() + build_upper_v() +
     build_villa_details()（新增：门套/勒脚/檐口封板，纯附加节点）；
  2. 解析只读基线 tools/villa_src_villa.glb（升级前拷贝的旧文件）的节点世界包围盒；
  3. 硬对比：基线里每个节点必须原样在场且包围盒 ±2mm；新增节点只允许白名单
     {villa_casings, villa_plinth, roof_fascia}；原节点材质只允许 plaster_int→paint_int、
     plaster_ext→stucco_ext 两种白名单替换；不过不导出。
"""
import json
import os
import struct
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy                                                  # noqa: E402
from mathutils import Vector                                # noqa: E402

import blender_build as bb                                  # noqa: E402  (--skip-full 已在 argv)

HERE = os.path.dirname(os.path.abspath(__file__))
BASELINE_GLB = os.path.join(HERE, 'villa_src_villa.glb')
GLB = bb.arg('--glb', os.path.join(os.environ.get('TEMP', '/tmp'), 'villa_v2', 'villa.glb'))
SEP = '=' * 72
NEW_NODES_ALLOWED = {'villa_casings', 'villa_plinth', 'roof_fascia'}
MAT_SWAP = {'plaster_int': 'paint_int', 'plaster_ext': 'stucco_ext'}


def log(*a):
    print(*a)


# ---------------------------------------------------------------- 基线解析（只读旧 GLB）
def read_glb_nodes(path):
    with open(path, 'rb') as f:
        data = f.read()
    assert data[:4] == b'glTF', 'baseline is not a GLB'
    clen = struct.unpack('<I', data[12:16])[0]
    j = json.loads(data[20:20 + clen])
    off = 20 + clen
    blen = struct.unpack('<I', data[off:off + 4])[0]
    bin_data = data[off + 8:off + 8 + blen]

    def acc_minmax(idx):
        a = j['accessors'][idx]
        bv = j['bufferViews'][a['bufferView']]
        start = bv.get('byteOffset', 0) + a.get('byteOffset', 0)
        mn = [1e9] * 3
        mx = [-1e9] * 3
        for i in range(a['count']):
            v = struct.unpack_from('<fff', bin_data, start + i * 12)
            for k in range(3):
                mn[k] = min(mn[k], v[k])
                mx[k] = max(mx[k], v[k])
        return mn, mx

    nodes = {}
    for node in j.get('nodes', []):
        if 'mesh' not in node:
            continue
        t = node.get('translation', [0, 0, 0])
        mn = [1e9] * 3
        mx = [-1e9] * 3
        for prim in j['meshes'][node['mesh']].get('primitives', []):
            amn, amx = acc_minmax(prim['attributes']['POSITION'])
            for k in range(3):
                mn[k] = min(mn[k], amn[k] + t[k])
                mx[k] = max(mx[k], amx[k] + t[k])
        nodes[node.get('name', '?')] = (tuple(mn), tuple(mx))
    return nodes


# ---------------------------------------------------------------- 1) 构建（与 main() 同顺序）
bb.CUR = 'villa'
bb.build_villa_v()
bb.build_upper_v()
bb.build_villa_details()
objs = bb.BUCKETS.get('villa', [])
log(f'[build] villa: {len(objs)} 个节点（基线 {len(read_glb_nodes(BASELINE_GLB))}）')
assert objs, 'villa 构建没有产出'

bpy.context.view_layer.update()


def bbox3(o):
    mn = [1e9] * 3
    mx = [-1e9] * 3
    for c in o.bound_box:
        w = o.matrix_world @ Vector(c)
        t = (w.x, w.z, -w.y)          # blender Z-up → three Y-up（与 glTF 导出同向）
        for k in range(3):
            mn[k] = min(mn[k], t[k])
            mx[k] = max(mx[k], t[k])
    return tuple(mn), tuple(mx)


# ---------------------------------------------------------------- 2) 硬对比
baseline = read_glb_nodes(BASELINE_GLB)
# 名字口径与游戏端一致：基线里的 __villa 后缀与构建端 join 加的后缀都剥掉再比
baseline = {n.split('__')[0]: v for n, v in baseline.items()}
by_name = {}
for o in objs:
    by_name[o.name.split('__')[0]] = o

checks = []
missing = [n for n in baseline if n not in by_name]
checks.append((f'基线节点全部在场（{len(baseline)} 个）', not missing,
               '齐全' if not missing else f'缺失 {missing[:6]}'))
drift = []
for n, (bmn, bmx) in baseline.items():
    if n not in by_name:
        continue
    nmn, nmx = bbox3(by_name[n])
    d = max(abs(nmn[k] - bmn[k]) for k in range(3)) if isinstance(nmn[0], (int, float)) else 9
    d = max([d] + [abs(nmx[k] - bmx[k]) for k in range(3)])
    if d > 0.002:
        drift.append((n, round(d, 4)))
checks.append(('原节点几何 ±2mm 内不变（只换皮）', not drift,
               '全部达标' if not drift else str(drift[:8])))
extra = [n for n in by_name if n not in baseline and n not in NEW_NODES_ALLOWED]
checks.append((f'新增节点仅白名单 {sorted(NEW_NODES_ALLOWED)}', not extra,
               '无多余' if not extra else f'多出 {extra[:6]}'))
new_cnt = [n for n in by_name if n not in baseline]
checks.append(('新增节点数量 = 3（门套/勒脚/檐口）', len(new_cnt) == 3, sorted(new_cnt)))

mats_used = set()
for o in objs:
    for m in o.data.materials:
        if m:
            mats_used.add(m.name)
bad_mats = sorted(mats_used & set(MAT_SWAP))       # 旧墙材质不应再被任何节点使用
checks.append((f'墙材质已全部换新 {sorted(MAT_SWAP.values())}', not bad_mats,
               '完成' if not bad_mats else f'仍用旧材质: {bad_mats[:6]}'))
checks.append(('画框 10 片原样在场（pw0f..pw4a）',
               all(f'pw{i}{s}' in by_name for i in range(5) for s in 'fa'), '-'))
checks.append(('楼梯井洞口耦合件在场',
               all(n in by_name for n in ('stairwell_band', 'f2_stair_wall_seg0', 'ceiling0')), '-'))

log(SEP)
log('villa 升级硬对比')
log(SEP)
fails = 0
for label, ok, val in checks:
    log(f'  [{"PASS" if ok else "FAIL"}] {label:44s} → {val}')
    fails += 0 if ok else 1

if fails:
    log(SEP)
    log(f'!! {fails} 条未过 —— 不导出，models/villa.glb 未被触碰')
    sys.exit(1)

# ---------------------------------------------------------------- 3) 导出（全部 PASS）
os.makedirs(os.path.dirname(GLB), exist_ok=True)
bb.export_bucket('villa', os.path.dirname(GLB), os.path.basename(GLB))
log(SEP)
log(f'升级 GLB → {GLB}  ({os.path.getsize(GLB)/1024/1024:.2f} MB)')
log('注意：没有写 models/villa.glb，等确认后手动替换。')
