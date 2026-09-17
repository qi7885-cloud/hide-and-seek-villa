"""从 tv.blend 提取电视模型并导出为游戏用 tv.glb。
用法: blender -b --python tools/convert_tv.py -- <tv.blend> <输出tv.glb>

只保留 'TV' 前缀物体，join 成单一 'body'，原点=包围盒底面中心，替换 models/pieces/tv.glb。

⚠️ 坑：品牌/标签文字在 Blender 里是 FONT 类型（不是 MESH），不参与 join。
   join 之后 body 的原点被移到包围盒底面中心（几何整体平移了 -中心），
   这些文字若不同步施加同一偏移，导出后会停在原始绝对坐标上 ——
   实测飘在电视左侧 1.06m 的空中（源文件里电视主体中心 x≈-1.059）。
"""
import bpy
import sys
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:]
src, dst = argv[0], argv[1]

bpy.ops.wm.open_mainfile(filepath=src)

# 1) 删除所有非 TV 物体（引擎部件等无关内容）
for o in list(bpy.data.objects):
    if not o.name.startswith('TV'):
        bpy.data.objects.remove(o, do_unlink=True)

# 1a) 按名单剔除：电源线（网格顶点在 60m 外的插座位置）、瞄准用空物体；
#     品牌/标签文字保留（电视上的精致小细节）
DROP_NAMES = {'TV power cable'}
DROP_PREFIXES = ('TV aim',)
for o in list(bpy.data.objects):
    if o.name in DROP_NAMES or o.name.startswith(DROP_PREFIXES):
        print('剔除:', o.name)
        bpy.data.objects.remove(o, do_unlink=True)

# 1b) 剔除远离主体的 TV 网格（如电源线被拉到几米外的插座位置）
meshes = [o for o in bpy.data.objects if o.type == 'MESH']
centers = []
for o in meshes:
    bb = [o.matrix_world @ Vector(c) for c in o.bound_box]
    centers.append(Vector((sum(v.x for v in bb) / 8, sum(v.y for v in bb) / 8, sum(v.z for v in bb) / 8)))
xs = sorted(c.x for c in centers)
ys = sorted(c.y for c in centers)
zs = sorted(c.z for c in centers)
mid = len(centers) // 2
med = Vector((xs[mid], ys[mid], zs[mid]))
for o, c in zip(list(meshes), centers):
    if (c - med).length > 3.0:
        print('剔除离群:', o.name, f'距主体中心 {(c - med).length:.1f}m')
        bpy.data.objects.remove(o, do_unlink=True)

# 1c) 材质兜底：源文件里 'TV-03 · Screen glass · dark mirror' 用的是
#     Fresnel + Glossy + Transparent 的 Mix Shader（不是 Principled BSDF），
#     glTF 导出器无法映射 —— 会退化成 baseColor 纯白 + metallic/roughness 默认 1，
#     游戏里整块屏幕糊成一片惨白。这里把"既没有 Principled、也没有 Emission"的
#     材质重建成深色镜面 Principled，还原"息屏深色镜面"的设计意图。
#     （纯 Emission 材质如电源灯导出正常，不动它。）
GLASS_BASE = (0.015, 0.016, 0.020, 1.0)


def _has_node(mat, node_type):
    return any(n.type == node_type for n in mat.node_tree.nodes)


for mat in list(bpy.data.materials):
    if not mat.use_nodes or not mat.node_tree:
        continue
    if _has_node(mat, 'BSDF_PRINCIPLED') or _has_node(mat, 'EMISSION'):
        continue
    print('材质兜底（无 Principled，导出会失真）:', mat.name)
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    bsdf = nt.nodes.new('ShaderNodeBsdfPrincipled')
    bsdf.inputs['Base Color'].default_value = GLASS_BASE
    bsdf.inputs['Metallic'].default_value = 0.0
    bsdf.inputs['Roughness'].default_value = 0.04
    if 'IOR' in bsdf.inputs:
        bsdf.inputs['IOR'].default_value = 1.5
    nt.links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])
    mat.blend_method = 'OPAQUE'

# 2) 剩余网格合并为单一物体（保留全部材质槽）
objs = [o for o in bpy.data.objects if o.type == 'MESH']
if not objs:
    raise SystemExit('没有找到 TV 物体')
bpy.ops.object.select_all(action='DESELECT')
for o in objs:
    o.select_set(True)
bpy.context.view_layer.objects.active = objs[0]
bpy.ops.object.join()
tv = bpy.context.active_object
tv.name = 'body'

# 3) 清父级/清变换，原点移到包围盒底面中心
bpy.ops.object.parent_clear(type='CLEAR_KEEP_TRANSFORM')
bb = [tv.matrix_world @ Vector(c) for c in tv.bound_box]
cx = sum(v.x for v in bb) / 8
cy = sum(v.y for v in bb) / 8
cz_min = min(v.z for v in bb)
bpy.context.scene.cursor.location = (cx, cy, cz_min)
bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
tv.location = (0, 0, 0)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

# 3a) 关键补偿：上一步把 body 的几何整体平移了 (-cx, -cy, -cz_min)。
#     非网格对象（FONT 文字、灯等）没参与 join，也没跟着动 —— 必须施加同一偏移，
#     否则导出后它们停在原始绝对坐标上，在游戏里飘到电视外面去。
delta = Vector((-cx, -cy, -cz_min))
shifted = []
for o in bpy.data.objects:
    if o is tv:
        continue
    if o.parent is not None:
        print('⚠️ 跳过带父级的对象（未做偏移，位置可能不准）:', o.name)
        continue
    o.location = o.location + delta      # root 对象：location 即世界平移
    shifted.append(o.name)
print(f'原点归零偏移 delta = ({delta.x:.4f}, {delta.y:.4f}, {delta.z:.4f})')
print('同步偏移的非网格对象:', shifted)

# 3b) 自检：整体世界包围盒应当左右对称、底面落在 z=0
#     （必须先 update，否则 matrix_world 还是旧值，自检会误报没生效）
bpy.context.view_layer.update()
allbb = []
for o in bpy.data.objects:
    if o.type in {'MESH', 'FONT', 'CURVE'}:
        allbb += [o.matrix_world @ Vector(c) for c in o.bound_box]
if allbb:
    ax = [v.x for v in allbb]; ay = [v.y for v in allbb]; az = [v.z for v in allbb]
    print(f'整体世界包围盒 x[{min(ax):.3f},{max(ax):.3f}] y[{min(ay):.3f},{max(ay):.3f}] '
          f'z[{min(az):.3f},{max(az):.3f}]')
    print(f'  宽 {max(ax) - min(ax):.3f}  高 {max(az) - min(az):.3f}  厚 {max(ay) - min(ay):.3f} '
          f'(blender Z-up；x 左右不对称度 {abs(max(ax) + min(ax)):.3f})')

# 4) 导出 GLB（材质随网格保留）
bpy.ops.export_scene.gltf(filepath=dst, export_format='GLB', use_selection=False)

dims = tv.dimensions
print(f'tv.glb 尺寸: {dims.x:.3f} x {dims.y:.3f} x {dims.z:.3f} (宽x厚x高, blender Z-up)')
