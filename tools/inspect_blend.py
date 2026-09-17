"""打印 .blend 文件的物体清单/尺寸/材质: blender -b --python tools/inspect_blend.py -- <file.blend>"""
import bpy
import sys
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:]
bpy.ops.wm.open_mainfile(filepath=argv[0])
print('=== OBJECTS ===')
for o in bpy.data.objects:
    bb = [o.matrix_world @ Vector(c) for c in o.bound_box]
    xs = [v.x for v in bb]
    ys = [v.y for v in bb]
    zs = [v.z for v in bb]
    mats = [m.name for m in o.data.materials] if o.type == 'MESH' and o.data else []
    print(f'{o.type:10s} {o.name:24s} dim=({o.dimensions.x:.3f},{o.dimensions.y:.3f},{o.dimensions.z:.3f}) '
          f'world_bbox x[{min(xs):.3f},{max(xs):.3f}] y[{min(ys):.3f},{max(ys):.3f}] z[{min(zs):.3f},{max(zs):.3f}] mats={mats}')
print('=== SCENE UNIT ===', bpy.context.scene.unit_settings.system, bpy.context.scene.unit_settings.scale_length)
