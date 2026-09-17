# -*- coding: utf-8 -*-
"""tools/sofa_trim_seam.py — 删除三个坐垫上凸起的「中缝」与「前沿滚边」

背景
  cush0 / cush1 / cush2 已经被 join 成单一网格，每个网格里含 6 个连通块：
      垫体(cream) ×1  +  滚边(cream_d) ×4  +  中缝(cream_d) ×1
  本脚本按连通块的"局部尺寸特征"精确挑出「中缝」与「前滚边」各 1 块，只删这 2 块，
  垫体与其余 3 条滚边（后 / 左 / 右）原样保留。

本脚本会依次做四件事
  ① 把当前 Blender 会话另存一份副本到 %TEMP%（不覆盖 飞机.blend，也不改当前文件路径）
  ② 把即将删掉的连通块顶点/面导出成 JSON（可精确回滚）
  ③ 执行删除，打印前后顶点 / 三角面数
  ④ 把更新后的沙发导出成预览 GLB 到 %TEMP%\\sofa_v2\\sofa.glb（不覆盖游戏文件）

用法（Blender MCP，作用于当前打开的工程，不保存主文件）
  exec(compile(open(r'D:\\桌面\\ZCode\\hide-and-seek\\tools\\sofa_trim_seam.py', encoding='utf-8').read(), 'sofa_trim_seam', 'exec'))
"""
import bpy
import bmesh
import json
import os
import time
from mathutils import Vector

SCENE = 'SOFA · 客厅沙发 v2'
CUSHIONS = ('cush0', 'cush1', 'cush2')
TEMP = os.environ.get('TEMP', os.path.expanduser('~'))
GLB_OUT = os.path.join(TEMP, 'sofa_v2', 'sofa.glb')
STAMP = time.strftime('%Y%m%d_%H%M%S')
BACKUP = os.path.join(TEMP, f'sofa_trim_backup_{STAMP}.blend')
UNDO = os.path.join(TEMP, f'sofa_trim_undo_{STAMP}.json')

# 目标连通块的局部尺寸签名（米）：(X 宽, Y 深, Z 高)
SEAM_SIG = (0.013, 0.700, 0.014)      # 坐垫中缝（凸起的白细条，贯穿前→后）
WELT_F_SIG = (0.482, 0.022, 0.022)    # 前沿滚边（横贯垫宽的圆角条）

SEP = '=' * 74


def log(*a):
    print(*a)


def near(a, b, tol):
    return abs(a - b) <= tol


def split_islands(me):
    """按边连通性把网格拆成连通块，返回 (bmesh, {根: [顶点…]})"""
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.verts.ensure_lookup_table()
    parent = list(range(len(bm.verts)))

    def find(a):
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a

    for e in bm.edges:
        ra, rb = find(e.verts[0].index), find(e.verts[1].index)
        if ra != rb:
            parent[ra] = rb

    groups = {}
    for v in bm.verts:
        groups.setdefault(find(v.index), []).append(v)
    return bm, groups


def classify(size, cy):
    """按尺寸+前后位置判定连通块身份；cy<0 = 沙发前方（Blender -Y 为正面）"""
    if (near(size[0], SEAM_SIG[0], 0.003) and near(size[1], SEAM_SIG[1], 0.020)
            and near(size[2], SEAM_SIG[2], 0.003)):
        return '中缝'
    if (near(size[0], WELT_F_SIG[0], 0.008) and near(size[1], WELT_F_SIG[1], 0.004)
            and near(size[2], WELT_F_SIG[2], 0.004) and cy < 0):
        return '前滚边'
    return None


# ============================================================ ① 会话副本备份
log(SEP)
log('① 会话副本备份')
log(SEP)
path_before, dirty_before = bpy.data.filepath, bpy.data.is_dirty
try:
    bpy.ops.wm.save_as_mainfile(filepath=BACKUP, copy=True, check_existing=False)
    ok = os.path.exists(BACKUP)
    log(f'  [{"OK" if ok else "FAIL"}] 备份 → {BACKUP}'
        + (f'  ({os.path.getsize(BACKUP) / 1048576:.1f} MB)' if ok else ''))
except Exception as e:
    log(f'  [FAIL] 备份失败：{e}')
    log('         —— 不阻断流程，继续（主文件仍未被写入）')
log(f'  主文件路径 之前={path_before!r}  之后={bpy.data.filepath!r}  '
    f'{"（未改变 ✓）" if bpy.data.filepath == path_before else "（⚠ 被改变了，见文末说明）"}')
log(f'  is_dirty 之前={dirty_before}  之后={bpy.data.is_dirty}')

# 切到沙发场景（导出要用选择集，必须在活动场景里）
sc = bpy.data.scenes[SCENE]
prev_scene = bpy.context.scene
try:
    bpy.context.window.scene = sc
except Exception as e:
    log('  [warn] 切换活动场景失败:', e)

# ============================================================ ② 定位 + 导出回滚数据
log(SEP)
log('② 定位目标连通块')
log(SEP)
undo = {'scene': SCENE, 'note': '删掉的坐垫中缝 + 前滚边，可据此回滚', 'objects': {}}
todo = {}
for name in CUSHIONS:
    o = bpy.data.objects.get(name)
    if o is None or o.type != 'MESH':
        log(f'  [skip] {name} 不存在或不是网格')
        continue
    me = o.data
    bm, groups = split_islands(me)
    before_v = len(bm.verts)
    before_t = sum(len(f.verts) - 2 for f in bm.faces)

    doomed, keep = [], 0
    for r, vs in groups.items():
        mn = [min(v.co[k] for v in vs) for k in range(3)]
        mx = [max(v.co[k] for v in vs) for k in range(3)]
        size = tuple(round(mx[k] - mn[k], 4) for k in range(3))
        cy = (mn[1] + mx[1]) / 2.0
        tag = classify(size, cy)
        if tag:
            # 记录顶点/面（用于回滚）
            idx = {v.index: i for i, v in enumerate(sorted(vs, key=lambda x: x.index))}
            verts = [[round(c, 6) for c in v.co] for v in sorted(vs, key=lambda x: x.index)]
            faces = [[idx[v.index] for v in f.verts]
                     for f in bm.faces if all(v.index in idx for v in f.verts)]
            doomed.append((tag, size, verts, faces))
            undo['objects'].setdefault(name, []).append(
                {'tag': tag, 'size': size, 'verts': verts, 'faces': faces})
        else:
            keep += 1

    log(f'  {name}: 连通块 {len(groups)} 个（保留 {keep} 个）→ 删除 '
        + '、'.join(f'{t}{[round(s, 3) for s in sz]}' for t, sz, _, _ in doomed))

    # 逐个连通块删除：每删一块都重新遍历一次，避免顶点索引失效
    removed = 0
    for tag, _, verts, faces in doomed:
        bm3, groups3 = split_islands(me)
        target = None
        for r, vs in groups3.items():
            if len(vs) != len(verts):
                continue
            co = sorted([round(c, 6) for v in vs for c in v.co])
            co2 = sorted([round(c, 6) for v in verts for c in v])
            if co == co2:
                target = vs
                break
        if target is None:
            log(f'    [warn] {name} 找不到待删块 {tag}，跳过')
            bm3.free()
            continue
        bmesh.ops.delete(bm3, geom=target, context='VERTS')
        bm3.to_mesh(me)
        bm3.free()
        me.update()
        removed += 1

    bm.free()
    after_v = len(me.vertices)
    after_t = sum(len(p.vertices) - 2 for p in me.polygons)
    modifiers = [m.type for m in o.modifiers]
    log(f'    删除 {removed} 块：顶点 {before_v} → {after_v}（-{before_v - after_v}） '
        f'三角面 {before_t} → {after_t}（-{before_t - after_t}）  修改器={modifiers}')
    todo[name] = (before_v, after_v)

with open(UNDO, 'w', encoding='utf-8') as f:
    json.dump(undo, f, ensure_ascii=False)
log(f'  回滚数据 → {UNDO}')

# ============================================================ ③ 复验：整体尺寸必须没变
log(SEP)
log('③ 尺寸复验（three 坐标：宽X / 高Y / 深Z）')
log(SEP)
sofa = [o for o in sc.objects if o.type == 'MESH' and o.name != 'preview_floor']
lo = [1e9] * 3
hi = [-1e9] * 3
for o in sofa:
    for c in o.bound_box:
        w = o.matrix_world @ Vector(c)
        t = (w.x, w.z, -w.y)
        for k in range(3):
            lo[k] = min(lo[k], t[k])
            hi[k] = max(hi[k], t[k])
size = [round(hi[k] - lo[k], 4) for k in range(3)]
log(f'  沙发整体  {size[0]} × {size[1]} × {size[2]} m   （改前 1.9 × 0.9032 × 0.85）')
log(f'  底面 y = {lo[1]:+.4f}（应为 0）')

# ============================================================ ④ 导出预览 GLB
os.makedirs(os.path.dirname(GLB_OUT), exist_ok=True)
try:
    bpy.ops.object.select_all(action='DESELECT')
except Exception:
    pass
for o in sofa:
    o.select_set(True)
bpy.context.view_layer.objects.active = sofa[0]

op = bpy.ops.export_scene.gltf
props = set(op.get_rna_type().properties.keys())
kw = {'filepath': GLB_OUT, 'export_format': 'GLB'}
for k, v in [('use_selection', True), ('export_selected_objects', True), ('export_apply', True),
             ('export_materials', 'EXPORT'), ('export_image_format', 'JPEG'),
             ('export_animations', False), ('export_cameras', False), ('export_lights', False),
             ('export_extras', False), ('export_yup', True)]:
    if k in props:
        kw[k] = v
op(**kw)
log(SEP)
log(f'④ 预览 GLB → {GLB_OUT}  ({os.path.getsize(GLB_OUT) / 1024:.0f} KB)')
log('   注意：没有覆盖 models/pieces/sofa.glb，等你确认后再替换。')

if prev_scene is not None and prev_scene != sc:
    try:
        bpy.context.window.scene = prev_scene
    except Exception:
        pass
log('TRIM_DONE')
