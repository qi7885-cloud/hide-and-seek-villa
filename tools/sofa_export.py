# -*- coding: utf-8 -*-
"""从当前 Blender 会话的 SOFA 场景导出客厅沙发 GLB（只导出沙发本体，排除预览地面/灯）。
用法（经 Blender MCP execute_blender_code）：
    exec(compile(open(r'...\\tools\\sofa_export.py', encoding='utf-8').read(), 'sofa_export.py', 'exec'))
导出路径取自常量 OUT。
"""
import bpy
import os
from mathutils import Vector

OUT = os.path.join(os.environ['TEMP'], 'sofa_v2', 'sofa.glb')
SCENE = 'SOFA · 客厅沙发 v2'
EXCLUDE = ('preview_floor',)          # 场景里为预览临时加的物件，不进游戏资产

# ---------------------------------------------------------------- 环境
sc = bpy.data.scenes[SCENE]
prev_scene = bpy.context.scene
prev_sel = [o.name for o in bpy.context.selected_objects]
prev_active = bpy.context.view_layer.objects.active.name if bpy.context.view_layer.objects.active else None

# 切到 SOFA 场景（导出用的是当前场景 + 选择集）
try:
    bpy.context.window.scene = sc
except Exception:
    pass

targets = [o for o in sc.objects
           if o.type == 'MESH' and not o.name.startswith(EXCLUDE)]
assert targets, '没有可导出的沙发网格'

# ---------------------------------------------------------------- 校验（导出前）
lo = [1e9] * 3
hi = [-1e9] * 3
for o in targets:
    for c in o.bound_box:
        w = o.matrix_world @ Vector(c)
        for k in range(3):
            lo[k] = min(lo[k], w[k]); hi[k] = max(hi[k], w[k])
size = [hi[k] - lo[k] for k in range(3)]
print('[导出前校验] Blender 坐标 (Z 向上)')
print(f'  min {[round(v, 4) for v in lo]}')
print(f'  max {[round(v, 4) for v in hi]}')
print(f'  宽 X {size[0]:.4f}   深 Y {size[1]:.4f}   高 Z {size[2]:.4f}')
print(f'  原点落地面: {"OK" if abs(lo[2]) <= 0.002 else "FAIL " + str(round(lo[2], 4))}')
print(f'  左右对称  : {"OK" if abs(lo[0] + hi[0]) <= 0.002 else "FAIL"}')

# 沙发底净空（除腿以外最高的“底部构件”底面；腿以外的下部构件最矮底面）
legs = [o for o in targets if o.name.startswith('leg')]
body = [o for o in targets if not o.name.startswith('leg')]
clear = min(min((o.matrix_world @ Vector(c)).z for c in o.bound_box) for o in body)
print(f'  底部净空  : {clear:.4f} m（隐藏槽位要求 >= 0.13）')
print(f'  腿件      : {len(legs)} 条')

# ---------------------------------------------------------------- 导出
bpy.ops.object.select_all(action='DESELECT')
for o in targets:
    o.hide_set(False)
    o.select_set(True)
bpy.context.view_layer.objects.active = targets[0]

os.makedirs(os.path.dirname(OUT), exist_ok=True)
op = bpy.ops.export_scene.gltf
props = op.get_rna_type().properties.keys()
kw = {'filepath': OUT, 'export_format': 'GLB'}
for k, v in [('use_selection', True), ('export_selected_objects', True),
             ('export_apply', True), ('export_materials', 'EXPORT'),
             ('export_image_format', 'JPEG'), ('export_animations', False),
             ('export_cameras', False), ('export_lights', False),
             ('export_extras', False), ('export_yup', True)]:
    if k in props:
        kw[k] = v
op(**kw)
print(f'[导出] {OUT}  {os.path.getsize(OUT)/1024:.0f} KB')

# ---------------------------------------------------------------- 还原会话状态
bpy.ops.object.select_all(action='DESELECT')
for n in prev_sel:
    o = bpy.data.objects.get(n)
    if o:
        try:
            o.select_set(True)
        except Exception:
            pass
if prev_active:
    bpy.context.view_layer.objects.active = bpy.data.objects.get(prev_active)
try:
    bpy.context.window.scene = prev_scene
except Exception:
    pass
print(f'[还原] 场景={bpy.context.scene.name}  选择={len(bpy.context.selected_objects)}  '
      f'主文件未写={bpy.data.filepath}  is_dirty={bpy.data.is_dirty}')
