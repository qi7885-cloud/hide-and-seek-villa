# -*- coding: utf-8 -*-
"""tools/sofa_v2.py — 在【已打开】的 Blender 里新建场景并生成沙发 v2（法式圆扶手）

为什么要这么绕：
  blender_build.py 第 27 行是 `bpy.ops.wm.read_factory_settings(use_empty=True)`，
  直接 exec 整个文件会把当前打开的工程（飞机.blend）清空。所以这里
  ① 先新建一个独立场景并切过去，② 再 exec blender_build.py 去掉清场与入口的前缀，
  这样既拿到它全部的材质库与几何 helper（B/CYL/CONE/SPH/_apply/_finish…），
  又一根毫毛都不碰原场景。

用法：
  A) 经 Blender MCP： execute_blender_code("exec(compile(open(r'...sofa_v2.py',encoding='utf-8').read(),'sofa_v2','exec'))")
  B) 无头：         blender.exe -b --python tools/sofa_v2.py -- --out <项目根> [--glb <输出路径>]
"""
import bpy, os, sys, math
from mathutils import Vector

PROJ = r'D:\桌面\ZCode\hide-and-seek'
BUILD = os.path.join(PROJ, 'tools', 'blender_build.py')
SCENE_NAME = 'SOFA · 客厅沙发 v2'
GLB_OUT = os.path.join(os.environ.get('TEMP', PROJ), 'sofa_v2', 'sofa.glb')
for i, a in enumerate(sys.argv):
    if a == '--out':
        PROJ = sys.argv[i + 1]
    if a == '--glb':
        GLB_OUT = sys.argv[i + 1]

SEP = '=' * 74


def log(*a):
    print(*a)


def bbox_of(objs):
    """three 坐标下的整体包围盒（Blender Z=up → three Y=up，Blender -Y → three +Z）"""
    lo = [1e9] * 3
    hi = [-1e9] * 3
    for o in objs:
        for c in o.bound_box:
            w = o.matrix_world @ Vector(c)
            t = (w.x, w.z, -w.y)          # → three
            for k in range(3):
                lo[k] = min(lo[k], t[k])
                hi[k] = max(hi[k], t[k])
    return lo, hi


# ============================================================ 1) 先清掉上一次跑留下的场景/材质（可反复重跑）
def purge_previous():
    """把上一次运行留下的场景、物体、程序化材质与贴图清干净，保证脚本可重复执行。
    只删「本脚本会生成的东西」：临时场景里的全部物体 + 无人引用的材质 + T_* 程序化贴图；
    原工程的参考照片（NASA_*.jpg / 976_*.jpg）一律不动。"""
    old = bpy.data.scenes.get(SCENE_NAME)
    if old:
        for o in list(old.objects):
            bpy.data.objects.remove(o, do_unlink=True)
        bpy.data.scenes.remove(old)
        log(f'[purge] 已移除上一次的场景「{SCENE_NAME}」')
    keep = set()
    for o in bpy.data.objects:
        for m in (o.data.materials if o.type == 'MESH' and o.data else []):
            if m:
                keep.add(m.name)
    n = 0
    for m in list(bpy.data.materials):
        if m.name not in keep:
            bpy.data.materials.remove(m)
            n += 1
    for im in list(bpy.data.images):
        if im.name.startswith('T_') or im.name == 'wood_diff.jpg':
            bpy.data.images.remove(im)
            n += 1
    if n:
        log(f'[purge] 已移除上一次残留的材质/贴图 {n} 个')


purge_previous()

prev_scene = bpy.context.scene
sc = bpy.data.scenes.new(SCENE_NAME)
try:
    bpy.context.window.scene = sc
except Exception as e:
    log('[warn] 无法切换活动场景:', e)
if prev_scene is not None and prev_scene != sc:
    log(f'[scene] 原场景「{prev_scene.name}」保持不动，物体数 = {len(prev_scene.objects)}')
log(f'[scene] 新场景「{sc.name}」已就绪')

# 预览用世界环境（原工程的 World 是深色棚拍，直接看会很黑）
world = bpy.data.worlds.new('Sofa preview')
world.use_nodes = True
world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.30, 0.31, 0.33, 1)
world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.7
sc.world = world
sc.view_settings.view_transform = 'Standard'      # 与游戏内 Lambert 直出色更接近
try:
    sc.render.engine = 'BLENDER_EEVEE_NEXT'
except TypeError:
    pass

# 预览用地面（不属于沙发，导出时不选它）
_floor = bpy.data.meshes.new('preview_floor')
_floor.from_pydata([(-6, -6, 0), (6, -6, 0), (6, 6, 0), (-6, 6, 0)], [], [(0, 1, 2, 3)])
_floor.update()
floor = bpy.data.objects.new('preview_floor', _floor)
floor.data.materials.append(bpy.data.materials.new('preview_floor_mat'))
floor.data.materials[0].diffuse_color = (0.62, 0.47, 0.31, 1)
sc.collection.objects.link(floor)

# 预览用三点光
for nm, loc, size, energy, col in [
    ('preview key',  (-3.2, -3.6, 3.4), 4.0, 500, (1.0, 0.97, 0.93)),
    ('preview fill', (3.4, -3.0, 2.0), 5.0, 180, (0.92, 0.95, 1.0)),
    ('preview rim',  (0.6, 3.8, 2.8), 3.0, 260, (0.90, 0.94, 1.0)),
]:
    ld = bpy.data.lights.new(nm, 'AREA')
    ld.shape = 'DISK'
    ld.size = size
    ld.energy = energy
    ld.color = col
    lo = bpy.data.objects.new(nm, ld)
    lo.location = loc
    lo.rotation_euler = (Vector((0, 0, 0.45)) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
    sc.collection.objects.link(lo)

# ============================================================ 2) 复用建模脚本的材质库与 helper
snapshot = {'mats': set(bpy.data.materials.keys()),
            'imgs': set(bpy.data.images.keys()),
            'objs': set(bpy.data.objects.keys())}

_saved_argv = list(sys.argv)
sys.argv = ['blender', '--', '--out', PROJ]
src = open(BUILD, encoding='utf-8').read().rsplit('\nmain()', 1)[0]
wipe = 'bpy.ops.wm.read_factory_settings(use_empty=True)'
assert wipe in src, '清场语句没找到，blender_build.py 结构变了，先人工确认再跑'
src = src.replace(wipe, 'pass  # ← 由调用方保证场景干净，绝不清空当前工程')
g = {'__name__': 'blender_build_prefix'}
exec(compile(src, BUILD + ' [prefix]', 'exec'), g)
sys.argv = _saved_argv
log(f'[prefix] blender_build.py 前缀已加载，材质库 {len(g["MATS"])} 项')
log(f'[prefix] 场景变量指向「{g["scene"].name}」（应为新场景）')

# 让 bpy.ops 的"全不选"在空场景里也别炸
_real_unselect = g['_unselect']
g['_unselect'] = lambda: (_real_unselect() if bpy.data.objects else None)

# ============================================================ 3) 建沙发
g['CUR'] = 'sofa'
g['b_sofa']()
objs = g['BUCKETS'].get('sofa', [])
log(f'[build] b_sofa() 产出 {len(objs)} 个部件')

# ============================================================ 4) 校验
lo, hi = bbox_of(objs)
size = [round(hi[k] - lo[k], 4) for k in range(3)]

# 面数必须按"评估后"的网格算 —— 倒角/边裂都是修改器，基础网格上是看不到的
dg = bpy.context.evaluated_depsgraph_get()
tris = verts = 0
for o in objs:
    if o.type != 'MESH':
        continue
    ev = o.evaluated_get(dg)
    me = ev.to_mesh()
    tris += sum(len(p.vertices) - 2 for p in me.polygons)
    verts += len(me.vertices)
    ev.to_mesh_clear()

log(SEP)
log('尺寸校验（three 坐标：宽X / 高Y / 深Z）')
log(SEP)
log(f'  实测 bbox  X[{lo[0]:.4f},{hi[0]:.4f}]  Y[{lo[1]:.4f},{hi[1]:.4f}]  Z[{lo[2]:.4f},{hi[2]:.4f}]')
log(f'  实测尺寸  {size[0]} × {size[1]} × {size[2]}')
log(f'  旧版 GLB  1.9 × 0.9032 × 0.85      Δ = '
    f'{size[0]-1.9:+.4f} / {size[1]-0.9032:+.4f} / {size[2]-0.85:+.4f}')

checks = []
checks.append(('占地宽 1.90 ± 0.02', abs(size[0] - 1.90) <= 0.02, size[0]))
checks.append(('深 0.85 ± 0.02', abs(size[2] - 0.85) <= 0.02, size[2]))
checks.append(('高 0.85–0.92（不超越旧版太多）', 0.85 <= size[1] <= 0.92, size[1]))
checks.append(('底面落在 y=0（原点=地面）', abs(lo[1]) <= 0.002, round(lo[1], 4)))

# 腿部净空：坐箱底面的 y
base = [o for o in objs if o.name.startswith('sofa_base')]
clear = min((o.matrix_world @ Vector(c)).z for o in base for c in o.bound_box)
checks.append(('沙发底净空 ≥ 0.13（隐藏槽位要求）', clear >= 0.13, round(clear, 4)))

# 结构件左右镜像：对每个结构件的 X 向跨度做"取负镜像"后应与原集合完全一致
# （甩掉刻意不对称的靠枕/盖毯；归并后的对象也适用，因为比的是几何跨度不是原点）
STRUCT = [o for o in objs if o.type == 'MESH'
          and not o.name.startswith(('throw', 'blanket'))]
spans = sorted((round(min((o.matrix_world @ Vector(c)).x for c in o.bound_box), 3),
                round(max((o.matrix_world @ Vector(c)).x for c in o.bound_box), 3))
               for o in STRUCT)
mirrored = sorted((-b, -a) for a, b in spans)
checks.append((f'结构件左右镜像（{len(STRUCT)} 件）', spans == mirrored,
               '几何完全镜像' if spans == mirrored else '不镜像'))
# 关键配对件必须同时存在
PAIRS = [('armL', 'armR'), ('leg1-1', 'leg-1-1'), ('leg11', 'leg-11')]
nm = set(o.name for o in objs)
checks.append(('左右配对件齐全', all(a in nm and b in nm for a, b in PAIRS),
               ' / '.join(f'{a}+{b}' for a, b in PAIRS)))

log(SEP)
log('几何校验')
log(SEP)
for label, ok, val in checks:
    log(f'  [{"PASS" if ok else "FAIL"}] {label:34s} → {val}')
log(f'  三角面 {tris}（含倒角/边裂评估后）   顶点 {verts}   部件 {len(objs)}')

# 部件清单（归并后的 18 个节点）
log('  部件（%d 个节点）: %s' % (len(objs), ', '.join(sorted(o.name for o in objs))))

# ============================================================ 5) 导出预览 GLB（不覆盖游戏文件）
os.makedirs(os.path.dirname(GLB_OUT), exist_ok=True)
g['_unselect']()
for o in objs:
    o.select_set(True)
bpy.context.view_layer.objects.active = objs[0]
g['export_glb'](GLB_OUT, selected=True)
log(SEP)
log(f'预览 GLB → {GLB_OUT}  ({os.path.getsize(GLB_OUT)/1024:.0f} KB)')
log('注意：没有覆盖 models/pieces/sofa.glb，等确认后再替换。')

# ============================================================ 6) 清掉本次为材质建的"零用户"数据块
removed = 0
for m in [m for m in bpy.data.materials if m.name not in snapshot['mats']]:
    if m.users == 0:
        bpy.data.materials.remove(m)
        removed += 1
for im in [i for i in bpy.data.images if i.name not in snapshot['imgs']]:
    if im.users == 0:
        bpy.data.images.remove(im)
        removed += 1
log(f'[cleanup] 移除未被引用的临时材质/贴图 {removed} 个（避免污染当前工程）')
if prev_scene is not None:
    log(f'[check] 原场景「{prev_scene.name}」物体数仍为 {len(prev_scene.objects)}')
