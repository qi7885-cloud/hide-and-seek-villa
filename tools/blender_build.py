# blender_build.py — 别墅捉迷藏 · Blender 全量建模与 GLB 导出
# 运行: blender.exe -b --python tools/blender_build.py -- --out <项目根>
#
# 坐标约定: 游戏内是 three.js Y-up(前+Z)；Blender 是 Z-up。
#   T(x,y,z) = (x, -z, y)   位置转换  three -> blender
#   尺寸 (w,h,d)three -> (w,d,h)blender
#   three绕Y转θ -> blender绕Z转θ；three绕X转ψ -> blender绕X转ψ；three绕Z转θ -> blender绕Y转-θ
# 部件命名: part_* 的对象必须是场景根级对象（导出后其局部位置=three局部坐标），
#   游戏端 js/models.js 会为每个 part 包一层代理组，与程序化部件行为完全一致。
import bpy, bmesh, math, os, sys, re, random
import numpy as np

random.seed(7)
np.random.seed(7)

ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
def arg(name, default=None):
    return ARGS[ARGS.index(name) + 1] if name in ARGS else default
ROOT = arg('--out', os.getcwd())
PIECE_DIR = os.path.join(ROOT, 'models', 'pieces')
os.makedirs(PIECE_DIR, exist_ok=True)

WALL_H, EXT_T, INT_T = 2.9, 0.24, 0.12
F2 = 3.15

# ---------------------------------------------------------------- 场景清场
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene

# ---------------------------------------------------------------- 材质库
def _img(name, arr):
    h, w = arr.shape[:2]
    img = bpy.data.images.new(name, w, h, alpha=False)
    rgba = np.ones((h, w, 4), np.float32)
    rgba[..., :3] = np.clip(arr[..., :3], 0, 1)
    img.pixels.foreach_set(rgba.reshape(-1))
    img.pack()
    return img

def _noise(h, w, amp):
    return (np.random.rand(h, w, 1) - 0.5) * 2 * amp

def tex_wood(base, dark, n=256, plank=0):
    """竖纹木纹；plank>0 时画横缝模拟拼板"""
    v, u = np.mgrid[0:n, 0:n].astype(np.float32) / n
    a = np.empty((n, n, 3), np.float32)
    a[..., 0], a[..., 1], a[..., 2] = base
    grain = np.zeros((n, n), np.float32)
    for k, f, s in [(0, 3.0, 0.05), (1, 7.0, 0.035), (2, 16.0, 0.02), (3, 41.0, 0.012)]:
        ph = np.random.rand() * 6.28
        grain += s * np.sin((u * f * n / n * 8 + v * (0.5 + k)) * 3.1 + ph)
    grain += _noise(n, n, 0.03)[..., 0]
    a = a * (1 + np.clip(grain, -0.35, 0.25))[..., None]
    if plank > 0:
        rows = (v * plank).astype(int) % 2 == 0
        line = (np.abs((v * plank) % 1 - 0.5) > 0.47)
        tone = ((np.sin((v * plank).astype(int) * 12.9898) * 43758.5) % 1 - 0.5) * 0.10
        a *= (1 + tone)[..., None]
        a[line] *= 0.62
    return _img('T_wood', np.clip(a, 0, 1))

def tex_fabric(base, n=256, weave=0.05):
    v, u = np.mgrid[0:n, 0:n].astype(np.float32) / n
    a = np.empty((n, n, 3), np.float32)
    a[..., 0], a[..., 1], a[..., 2] = base
    nz = _noise(n, n, 0.09)[..., 0]
    wv = weave * np.sin(u * n * 1.57) * np.sin(v * n * 1.57)
    a *= (1 + nz + wv)[..., None]
    return _img('T_fabric', np.clip(a, 0, 1))

def tex_rug(n=512):
    v, u = np.mgrid[0:n, 0:n].astype(np.float32) / n
    a = np.empty((n, n, 3), np.float32)
    a[..., 0], a[..., 1], a[..., 2] = (0.91, 0.88, 0.82)
    a += _noise(n, n, 0.05)
    d = np.minimum(np.minimum(u, 1 - u), np.minimum(v, 1 - v))
    b1 = (d > 0.055) & (d < 0.085)
    b2 = (d > 0.12) & (d < 0.135)
    a[b1] = (0.66, 0.60, 0.50)
    a[b2] = (0.58, 0.52, 0.44)
    dash = ((u * 40) % 1 < 0.55)
    a[b1 & ~dash] = (0.91, 0.88, 0.82)
    for cx, cy in [(0.28, 0.28), (0.72, 0.28), (0.28, 0.72), (0.72, 0.72)]:
        m = (np.abs(u - cx) < 0.03) ^ (np.abs(v - cy) < 0.03)
        m &= (np.abs(u - cx) < 0.03) & (np.abs(v - cy) < 0.03)
        a[(np.abs(u - cx) < 0.028) & (np.abs(v - cy) < 0.012)] = (0.62, 0.55, 0.47)
        a[(np.abs(u - cx) < 0.012) & (np.abs(v - cy) < 0.028)] = (0.62, 0.55, 0.47)
    return _img('T_rug', np.clip(a, 0, 1))

def tex_tile(n=256, cell=2):
    v, u = np.mgrid[0:n, 0:n].astype(np.float32) / n
    a = np.empty((n, n, 3), np.float32)
    a[..., 0], a[..., 1], a[..., 2] = (0.84, 0.86, 0.85)
    tone = (np.sin((u * cell).astype(int) * 7.3 + (v * cell).astype(int) * 3.1) * 43758.5) % 1
    a *= (1 + (tone - 0.5) * 0.06)[..., None]
    gx = (np.abs((u * cell) % 1 - 0.5) > 0.485)
    gy = (np.abs((v * cell) % 1 - 0.5) > 0.485)
    a[gx | gy] = (0.55, 0.56, 0.55)
    a += _noise(n, n, 0.015)
    return _img('T_tile', np.clip(a, 0, 1))

def tex_roof(n=256):
    v, u = np.mgrid[0:n, 0:n].astype(np.float32) / n
    a = np.empty((n, n, 3), np.float32)
    a[..., 0], a[..., 1], a[..., 2] = (0.58, 0.33, 0.27)
    row = (v * 8).astype(int)
    off = (row % 2) * 0.5
    col = ((u + off) * 5).astype(int)
    tone = (np.sin(row * 12.9898 + col * 78.233) * 43758.5) % 1
    a *= (1 + (tone - 0.5) * 0.18)[..., None]
    a[np.abs((v * 8) % 1 - 0.5) > 0.44] *= 0.55
    a += _noise(n, n, 0.04)
    return _img('T_roof', np.clip(a, 0, 1))

def tex_grass(n=256):
    v, u = np.mgrid[0:n, 0:n].astype(np.float32) / n
    a = np.empty((n, n, 3), np.float32)
    a[..., 0], a[..., 1], a[..., 2] = (0.42, 0.55, 0.30)
    patch = np.sin(u * 21 + 1.3) * np.sin(v * 17 + 4.1)
    a[..., 0] *= 1 + patch * 0.08
    a[..., 1] *= 1 + patch * 0.10 + _noise(n, n, 0.10)[..., 0]
    a[..., 2] *= 1 + patch * 0.05
    streak = np.sin(u * n * 1.2 + np.sin(v * 40) * 2.0) > 0.985
    a[streak] *= 0.8
    return _img('T_grass', np.clip(a, 0, 1))

def tex_plaster(base, n=256, amp=0.015):
    a = np.empty((n, n, 3), np.float32)
    a[..., 0], a[..., 1], a[..., 2] = base
    a += _noise(n, n, amp)
    return _img('T_plaster', np.clip(a, 0, 1))

def tex_paint(n=256):
    """内墙乳胶漆（2026-09-18 楼体升级）：暖白 + 低频云斑 + 细颗粒，替代旧版单频噪点"""
    v, u = np.mgrid[0:n, 0:n].astype(np.float32) / n
    a = np.empty((n, n, 3), np.float32)
    a[..., 0], a[..., 1], a[..., 2] = (0.925, 0.905, 0.862)
    blot = (np.sin(u * 9.7 + 1.3) * np.sin(v * 7.1 + 0.7)
            + 0.5 * np.sin(u * 23.0 + v * 31.0)) * 0.014
    a *= (1 + blot + _noise(n, n, 0.008)[..., 0])[..., None]
    return _img('T_paint', np.clip(a, 0, 1))

def tex_stucco(n=256):
    """外墙水泥砂浆（2026-09-18 楼体升级）：粗灰调颗粒 + 抹刀横纹"""
    v, u = np.mgrid[0:n, 0:n].astype(np.float32) / n
    a = np.empty((n, n, 3), np.float32)
    a[..., 0], a[..., 1], a[..., 2] = (0.885, 0.855, 0.795)
    grain = _noise(n, n, 0.05)[..., 0]
    streak = np.sin(v * n * 0.55 + np.sin(u * 14.0) * 3.0) * 0.02
    a *= (1 + grain + streak)[..., None]
    return _img('T_stucco', np.clip(a, 0, 1))

def tex_cardboard(n=256):
    v, u = np.mgrid[0:n, 0:n].astype(np.float32) / n
    a = np.empty((n, n, 3), np.float32)
    a[..., 0], a[..., 1], a[..., 2] = (0.76, 0.65, 0.44)
    fib = np.sin(v * n * 0.9 + np.sin(u * 30) * 1.5) * 0.05
    a *= (1 + fib + _noise(n, n, 0.04)[..., 0])[..., None]
    return _img('T_card', np.clip(a, 0, 1))

def tex_soil(n=128):
    a = np.empty((n, n, 3), np.float32)
    a[..., 0], a[..., 1], a[..., 2] = (0.33, 0.25, 0.17)
    a += _noise(n, n, 0.08)
    blob = (np.random.rand(n, n) > 0.985)
    a[blob] = (0.20, 0.15, 0.11)
    return _img('T_soil', np.clip(a, 0, 1))

def tex_bark(n=128):
    v, u = np.mgrid[0:n, 0:n].astype(np.float32) / n
    a = np.empty((n, n, 3), np.float32)
    a[..., 0], a[..., 1], a[..., 2] = (0.38, 0.29, 0.19)
    g = np.sin(u * n * 0.8 + np.sin(v * 12) * 2.0)
    a *= (1 + g * 0.18 + _noise(n, n, 0.06)[..., 0])[..., None]
    return _img('T_bark', np.clip(a, 0, 1))

def tex_leaf(base, n=128):
    a = np.empty((n, n, 3), np.float32)
    a[..., 0], a[..., 1], a[..., 2] = base
    a += _noise(n, n, 0.10)
    return _img('T_leaf', np.clip(a, 0, 1))

def P(mat, base, rough=0.8, metal=0.0, emit=None, emit_s=0.0, alpha=1.0):
    m = bpy.data.materials.new(mat)
    m.use_nodes = True
    bsdf = m.node_tree.nodes['Principled BSDF']
    bsdf.inputs['Base Color'].default_value = (*base, 1)
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Metallic'].default_value = metal
    if emit:
        bsdf.inputs['Emission Color'].default_value = (*emit, 1)
        bsdf.inputs['Emission Strength'].default_value = emit_s
    if alpha < 1.0:
        bsdf.inputs['Alpha'].default_value = alpha
        m.blend_method = 'BLEND'
    m.use_backface_culling = False
    return m

def Ptex(mat, img, rough=0.8, metal=0.0, emit=None, emit_s=0.0, alpha=1.0):
    m = P(mat, (0.8, 0.8, 0.8), rough, metal, emit, emit_s, alpha)
    nt = m.node_tree
    tex = nt.nodes.new('ShaderNodeTexImage')
    tex.image = img
    tex.interpolation = 'Cubic'
    nt.links.new(tex.outputs['Color'], nt.nodes['Principled BSDF'].inputs['Base Color'])
    return m

IMG = {}
def M(key):
    return MATS[key]

def _build_materials():
    wood_floor_path = os.path.join(ROOT, 'textures', 'wood_diff.jpg')
    floor_img = None
    if os.path.exists(wood_floor_path):
        floor_img = bpy.data.images.load(wood_floor_path)
        floor_img.pack()
    return {
        # 建筑
        'plaster_ext': Ptex('plaster_ext', tex_plaster((0.90, 0.87, 0.81)), 0.9),
        'plaster_int': Ptex('plaster_int', tex_plaster((0.94, 0.92, 0.88), amp=0.012), 0.92),
        # 楼体升级墙材质（2026-09-18，仅 villa 墙体使用；旧 plaster_* 保留键位防外引）
        'paint_int':   Ptex('paint_int', tex_paint(), 0.9),
        'stucco_ext':  Ptex('stucco_ext', tex_stucco(), 0.88),
        'trim':        P('trim', (0.965, 0.945, 0.905), 0.55),
        'ceil':        P('ceil', (0.94, 0.93, 0.90), 0.9),
        'slab':        P('slab', (0.84, 0.80, 0.73), 0.9),
        'floor_wood':  Ptex('floor_wood', floor_img, 0.62, 0.02) if floor_img else P('floor_wood', (0.78, 0.63, 0.42), 0.62),
        'floor_tile':  Ptex('floor_tile', tex_tile(), 0.5),
        'floor2_wood': Ptex('floor2_wood', tex_wood((0.72, 0.58, 0.38), 0.35, plank=4), 0.6),
        'frame':       P('frame', (0.36, 0.27, 0.19), 0.5),
        'door_leaf':   Ptex('door_leaf', tex_wood((0.54, 0.35, 0.20), 0.4), 0.55),
        'roof':        Ptex('roof', tex_roof(), 0.85),
        'ridge':       P('ridge', (0.45, 0.26, 0.21), 0.85),
        'chimney':     P('chimney', (0.66, 0.50, 0.38), 0.9),
        'glass':       P('glass', (0.75, 0.89, 0.95), 0.08, 0.0, alpha=0.25),
        'stone':       Ptex('stone', tex_plaster((0.71, 0.69, 0.64), amp=0.05), 0.85),
        'grass':       Ptex('grass', tex_grass(), 0.95),
        'soil':        Ptex('soil', tex_soil(), 0.95),
        'bark':        Ptex('bark', tex_bark(), 0.9),
        'leaf1':       Ptex('leaf1', tex_leaf((0.35, 0.52, 0.27)), 0.9),
        'leaf2':       Ptex('leaf2', tex_leaf((0.27, 0.42, 0.22)), 0.9),
        'fence':       P('fence', (0.60, 0.63, 0.55), 0.8),
        'fence_post':  P('fence_post', (0.54, 0.57, 0.49), 0.8),
        'cove':        P('cove', (0.1, 0.08, 0.05), emit=(1.0, 0.85, 0.62), emit_s=2.4),
        'bulb':        P('bulb', (1.0, 0.94, 0.78), emit=(1.0, 0.9, 0.7), emit_s=3.0),
        'metal_arm':   P('metal_arm', (0.16, 0.15, 0.14), 0.4, 0.7),
        'art1': P('art1', (0.54, 0.61, 0.48), 0.6), 'art2': P('art2', (0.79, 0.70, 0.54), 0.6),
        'art3': P('art3', (0.66, 0.49, 0.42), 0.6), 'art4': P('art4', (0.48, 0.55, 0.63), 0.6),
        'art5': P('art5', (0.72, 0.65, 0.49), 0.6),
        'curtain':     Ptex('curtain', tex_fabric((0.95, 0.93, 0.88), weave=0.02), 0.85),
        # 家具木
        'wood':        Ptex('wood', tex_wood((0.60, 0.42, 0.25), 0.4), 0.55),
        'wood_dark':   Ptex('wood_dark', tex_wood((0.42, 0.29, 0.17), 0.45), 0.55),
        'wood_light':  Ptex('wood_light', tex_wood((0.78, 0.65, 0.46), 0.32), 0.55),
        'wood_body':   Ptex('wood_body', tex_wood((0.52, 0.38, 0.24), 0.42), 0.6),
        # 织物
        'velvet':      Ptex('velvet', tex_fabric((0.37, 0.47, 0.32), weave=0.03), 0.85),
        'velvet_d':    Ptex('velvet_d', tex_fabric((0.31, 0.41, 0.27), weave=0.03), 0.85),
        # 缝/凹槽专用：比面料更暗、更糙，且织纹更粗（缝比面暗 —— 与飞机面板缝同一条道理）
        'velvet_seam': Ptex('velvet_seam', tex_fabric((0.20, 0.27, 0.18), weave=0.06), 0.92),
        # 健身房（2026-09-18 新增：器械软垫 / 瑜伽垫紫）
        'gym_pad':     P('gym_pad', (0.45, 0.12, 0.10), 0.9),
        'yoga':        P('yoga', (0.49, 0.43, 0.66), 0.85),
        'yoga_d':      P('yoga_d', (0.43, 0.37, 0.59), 0.85),
        'cream':       Ptex('cream', tex_fabric((0.91, 0.88, 0.82)), 0.85),
        'cream_d':     Ptex('cream_d', tex_fabric((0.84, 0.80, 0.72)), 0.85),
        'teddy':       Ptex('teddy', tex_fabric((0.85, 0.79, 0.68), weave=0.08), 0.95),
        'teddy_d':     P('teddy_d', (0.79, 0.72, 0.60), 0.95),
        'mattress':    Ptex('mattress', tex_fabric((0.92, 0.90, 0.86), weave=0.02), 0.85),
        'blanket':     Ptex('blanket', tex_fabric((0.50, 0.62, 0.72)), 0.85),
        'pillow':      Ptex('pillow', tex_fabric((0.97, 0.96, 0.93), weave=0.02), 0.8),
        'rug':         Ptex('rug', tex_rug(), 0.95),
        # 金属/塑料/电器
        'steel':       P('steel', (0.62, 0.64, 0.66), 0.35, 0.85),
        'steel_dark':  P('steel_dark', (0.55, 0.57, 0.60), 0.4, 0.8),
        'fridge':      P('fridge', (0.93, 0.93, 0.91), 0.35, 0.25),
        'fridge_door': P('fridge_door', (0.87, 0.87, 0.85), 0.35, 0.25),
        'dark':        P('dark', (0.23, 0.24, 0.26), 0.5, 0.1),
        'screen':      P('screen', (0.06, 0.07, 0.09), 0.15, 0.4, emit=(0.12, 0.16, 0.22), emit_s=0.35),
        'screen_pc':   P('screen_pc', (0.10, 0.16, 0.26), 0.15, 0.3, emit=(0.25, 0.38, 0.55), emit_s=0.5),
        'led':         P('led', (0.3, 0.5, 0.3), emit=(0.3, 0.9, 0.4), emit_s=2.0),
        # 杂项
        'white':       P('white', (0.95, 0.95, 0.94), 0.4),
        'ceramic':     P('ceramic', (0.93, 0.92, 0.90), 0.15),
        'pot':         Ptex('pot', tex_wood((0.66, 0.37, 0.23), 0.5), 0.7),
        'card':        Ptex('card', tex_cardboard(), 0.85),
        'card_band':   P('card_band', (0.68, 0.57, 0.37), 0.8),
        'paper':       P('paper', (0.96, 0.94, 0.90), 0.7),
        'photo':       P('photo', (0.84, 0.89, 0.93), 0.3),
        'gold':        P('gold', (0.79, 0.63, 0.15), 0.25, 0.9),
        'silver':      P('silver', (0.73, 0.73, 0.76), 0.2, 0.9),
        'ring_m':      P('ring_m', (0.85, 0.85, 0.88), 0.15, 0.95),
        'eraser':      P('eraser', (0.91, 0.42, 0.42), 0.6),
        'remote':      P('remote', (0.20, 0.21, 0.24), 0.45),
        'ball':        P('ball', (1.0, 0.91, 0.66), 0.3),
        'bowl':        P('bowl', (0.50, 0.66, 0.54), 0.3),
        'bowl_d':      P('bowl_d', (0.41, 0.56, 0.45), 0.3),
        'fruit1':      P('fruit1', (0.85, 0.48, 0.29), 0.5),
        'fruit2':      P('fruit2', (0.79, 0.25, 0.23), 0.5),
        'flower1': P('flower1', (0.91, 0.42, 0.54), 0.6), 'flower2': P('flower2', (0.94, 0.75, 0.38), 0.6),
        'flower3': P('flower3', (0.85, 0.44, 0.29), 0.6), 'flower4': P('flower4', (0.79, 0.63, 0.86), 0.6),
        'mailbox':     P('mailbox', (0.37, 0.49, 0.66), 0.5, 0.2),
        'mailbox_d':   P('mailbox_d', (0.29, 0.42, 0.54), 0.5, 0.2),
        'pc_glass':    P('pc_glass', (0.10, 0.11, 0.13), 0.2, 0.5),
        'skin':        P('skin', (0.91, 0.72, 0.56), 0.7),
        'shirt':       P('shirt', (0.85, 0.48, 0.29), 0.8),
        'pants':       P('pants', (0.29, 0.36, 0.48), 0.8),
        'cap':         P('cap', (0.29, 0.42, 0.54), 0.8),
        # 书脊
        **{f'book{i}': P(f'book{i}', c, 0.65) for i, c in enumerate([
            (0.71, 0.33, 0.30), (0.37, 0.49, 0.66), (0.43, 0.60, 0.37), (0.79, 0.64, 0.15),
            (0.54, 0.43, 0.66), (0.79, 0.48, 0.29), (0.37, 0.66, 0.63)])},
    }

MATS = _build_materials()
# 天花板必须单面（法线朝下）：上帝视角从上方看穿、室内可见——与原程序化行为一致
MATS['ceil'].use_backface_culling = True

# ---------------------------------------------------------------- 几何基元
def _unselect():
    bpy.ops.object.select_all(action='DESELECT')

def _apply(obj, rot=True, scale=True):
    _unselect()
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.transform_apply(location=False, rotation=rot, scale=scale)

def _bevel(obj, width):
    d = min(obj.dimensions)
    w = min(width, d * 0.4)
    if w <= 0.0008:
        return
    m = obj.modifiers.new('Bevel', 'BEVEL')
    m.width = w
    m.segments = 2
    m.limit_method = 'ANGLE'
    m.angle_limit = math.radians(48)

def _smooth(obj, angle=32):
    _unselect()
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.shade_smooth()
    es = obj.modifiers.new('EdgeSplit', 'EDGE_SPLIT')
    es.split_angle = math.radians(angle)

def T(x, y, z):
    return (x, -z, y)

def _finish(obj, bevel=0.004, smooth=False):
    _apply(obj)
    if bevel:
        _bevel(obj, bevel)
    if smooth:
        _smooth(obj)
    return obj

def B(w, h, d, x, y, z, mat, name='box', bevel=0.004):
    """three坐标盒：中心(x,y,z) 尺寸(w,h,d)"""
    bpy.ops.mesh.primitive_cube_add(size=1, location=T(x, y, z))
    o = bpy.context.active_object
    o.scale = (w, d, h)
    o.name = name
    o.data.materials.append(mat)
    return _finish(o, bevel)

def CYL(r, h, x, y, z, mat, name='cyl', seg=24, r2=None, smooth=True):
    bpy.ops.mesh.primitive_cylinder_add(vertices=seg, radius=r, depth=h, location=T(x, y, z))
    o = bpy.context.active_object
    if r2 is not None:
        o.scale = (r2 / r, r2 / r, 1)
    o.name = name
    o.data.materials.append(mat)
    _apply(o)
    if smooth:
        _smooth(o)
    return o

def CONE(r1, r2, h, x, y, z, mat, name='cone', seg=24, smooth=True):
    """r1=底部半径 r2=顶部半径 (three空间)"""
    bpy.ops.mesh.primitive_cone_add(vertices=seg, radius1=r1, radius2=r2, depth=h, location=T(x, y, z))
    o = bpy.context.active_object
    o.name = name
    o.data.materials.append(mat)
    _apply(o)
    if smooth:
        _smooth(o)
    return o

def SPH(r, x, y, z, mat, name='sph', seg=24, rings=16):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=rings, radius=r, location=T(x, y, z))
    o = bpy.context.active_object
    o.name = name
    o.data.materials.append(mat)
    _apply(o)
    _smooth(o)
    return o

def TORUS(R, r, x, y, z, mat, name='torus', rot_bl=(0, 0, 0)):
    bpy.ops.mesh.primitive_torus_add(major_radius=R, minor_radius=r,
                                     location=T(x, y, z), rotation=rot_bl)
    o = bpy.context.active_object
    o.name = name
    o.data.materials.append(mat)
    _apply(o)
    _smooth(o)
    return o

def PLANE(w, d, x, y, z, mat, name='plane', uv_scale=None, flip=False):
    bpy.ops.mesh.primitive_plane_add(size=1, location=T(x, y, z))
    o = bpy.context.active_object
    o.scale = (w, d, 1)
    if flip:
        o.rotation_euler = (math.pi, 0, 0)
    o.name = name
    o.data.materials.append(mat)
    _apply(o)
    if uv_scale:
        su, sv = uv_scale
        uv = o.data.uv_layers[0]
        for dd in uv.data:
            dd.uv = (dd.uv[0] * su, dd.uv[1] * sv)
    return o

def scale_uv(obj, su, sv):
    uv = obj.data.uv_layers[0]
    for dd in uv.data:
        dd.uv = (dd.uv[0] * su, dd.uv[1] * sv)

def TUBE(r_top, r_bot, h, x, y, z, mat, name='tube', seg=24):
    """开口向上的空心筒（无顶盖，有朝上的可见内壁；底另配）"""
    o = CONE(r_bot, r_top, h, x, y, z, mat, name, seg)
    m = o.modifiers.new('Solidify', 'SOLIDIFY')
    m.thickness = 0.004
    _unselect(); o.select_set(True); bpy.context.view_layer.objects.active = o
    bpy.ops.object.modifier_apply(modifier='Solidify')
    return o

def HOLLOW(w, h, d, x, y, z, mat, name, t=0.03):
    """五面板拼成的空心盒（前口开放），中心(x,y,z) three 坐标。
    用于衣柜/冰箱/吊柜等有 interior 藏点的家具：藏进去的物品开柜后可见。"""
    reg(B(w - 2 * t, h, t, x, y, z - d / 2 + t / 2, mat, name + '_back', 0.004))
    reg(B(t, h, d - 2 * t, x - w / 2 + t / 2, y, z, mat, name + '_left', 0.004))
    reg(B(t, h, d - 2 * t, x + w / 2 - t / 2, y, z, mat, name + '_right', 0.004))
    reg(B(w - 2 * t, t, d - 2 * t, x, y + h / 2 - t / 2, z, mat, name + '_top', 0.004))
    reg(B(w - 2 * t, t, d - 2 * t, x, y - h / 2 + t / 2, z, mat, name + '_bottom', 0.004))

def HOLLOW_TOP(w, h, d, x, y, z, mat, name, t=0.025):
    """五面板空心盒（顶口开放）：背/左/右/前/底——用于玩具箱等顶开盖家具。"""
    reg(B(w - 2 * t, h, t, x, y, z - d / 2 + t / 2, mat, name + '_back', 0.004))
    reg(B(t, h, d - 2 * t, x - w / 2 + t / 2, y, z, mat, name + '_left', 0.004))
    reg(B(t, h, d - 2 * t, x + w / 2 - t / 2, y, z, mat, name + '_right', 0.004))
    reg(B(w - 2 * t, h, t, x, y, z + d / 2 - t / 2, mat, name + '_front', 0.004))
    reg(B(w - 2 * t, t, d - 2 * t, x, y - h / 2 + t / 2, z, mat, name + '_bottom', 0.004))

def DRAWER_BOX(w, h, d, x, y, z, front_z, mat_front, mat_body, name, t=0.02, handle_mat=None,
               front_w=None, front_h=None, front_dx=0, front_dy=0):
    """空心抽屉（顶口开放）：外观前板(位于 front_z) + 底/左右/后板 + 把手，中心(x,y,z)。
    侧/底板沿 z 一直延伸到前板背面，杜绝板间漏缝；五面板+把手 join 为单一 part 对象。
    front_w/front_h/front_dx/front_dy：前板尺寸与中心偏移（铺满柜体开口用，默认略大于箱体）。"""
    back0 = z - d / 2                       # 箱体后端面
    front_back = front_z - 0.014            # 前板背面
    depth = front_back - back0              # 侧/底板长度
    center_z = (back0 + front_back) / 2
    fw = front_w if front_w is not None else w + 0.05
    fh = front_h if front_h is not None else h + 0.04
    fx, fy = x + front_dx, y + front_dy
    front = B(fw, fh, 0.028, fx, fy, front_z, mat_front, name + '_front', 0.005)
    bottom = B(w - 0.04, t, depth, x, y - h / 2 + t / 2, center_z, mat_body, name + '_bottom', 0.004)
    left = B(t, h - 0.04, depth, x - w / 2 + t / 2, y, center_z, mat_body, name + '_left', 0.004)
    right = B(t, h - 0.04, depth, x + w / 2 - t / 2, y, center_z, mat_body, name + '_right', 0.004)
    back = B(w - 0.04, h - 0.04, t, x, y, back0 + t / 2, mat_body, name + '_back', 0.004)
    parts = [front, bottom, left, right, back]
    if handle_mat:
        parts.append(B(0.16, 0.03, 0.03, fx, fy, front_z + 0.022, handle_mat, name + '_handle', 0.005))
    reg(join(parts, name))

def DISPLACED_SPH(r, x, y, z, mat, name, amp=0.16, seed=0):
    """有机形变球（树冠）"""
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=3, radius=r, location=T(x, y, z))
    o = bpy.context.active_object
    o.name = name
    o.data.materials.append(mat)
    _apply(o)
    ph1, ph2, ph3 = (seed * 1.7 % 6.28, seed * 2.3 % 6.28, seed * 3.1 % 6.28)
    for v in o.data.vertices:
        cx, cy, cz = v.co
        n = (math.sin(cx * 5.2 + ph1) * math.sin(cy * 4.4 + ph2) * 0.6
             + math.sin(cz * 6.8 + ph3) * 0.4 + math.sin((cx + cz) * 9.0) * 0.25)
        s = 1 + amp * n
        v.co = (cx * s, cy * s, cz * s)
    _smooth(o, angle=60)
    return o

def join(objs, name):
    """合并为一个对象（保留世界位置与各自材质）。
    部件名追加桶名后缀保证全场景唯一（Blender 名称全局去重会静默加 .001，
    而 glTF 导出器会去掉点号破坏 part_* 命名）；已带后缀则先剥离再重加，避免叠加。
    游戏端按 __ 截断还原。"""
    _unselect()
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    if len(objs) > 1:
        bpy.ops.object.join()
    o = bpy.context.active_object
    base = name.split('__')[0]
    o.name = f'{base}__{CUR}' if CUR else base
    return o

def mesh_tri(name, verts3, faces, mat, double=True):
    """直接给 three 坐标三角面：verts3=[(x,y,z)...]"""
    me = bpy.data.meshes.new(name)
    me.from_pydata([T(*v) for v in verts3], [], faces)
    me.update()
    o = bpy.data.objects.new(name, me)
    scene.collection.objects.link(o)
    o.data.materials.append(mat)
    return o

# ---------------------------------------------------------------- 家具部件注册
CUR = None           # 当前收集列表 key
BUCKETS = {}         # key -> [objects]
def reg(o):
    if CUR:
        BUCKETS.setdefault(CUR, []).append(o)
    return o

# ---------------------------------------------------------------- 家具（全部尺寸取自 furniture.js）
def b_sofa():
    """法式圆扶手三人沙发（v2 · 2026-09-17 改款）
    尺寸锚点（必须守住，取自 furniture.js 与旧版 GLB）：
      占地 1.90 × 0.85 m；总高 ≤ 0.905；原点=占地中心+地面；正面朝 three +z。
      腿部净空 0.145 —— 隐藏槽位 cap 高 0.11 @ y0.07 要求净空 ≥0.13，别改矮。
    分层：腿 0→0.145 / 围裙 0.145→0.205 / 坐箱 0.205→0.44 / 坐垫 0.446→0.586 /
          靠背顶 0.844 / 扶手圆枕顶 0.74（靠背比扶手高 10cm，是这种款型的比例特征）。
    做工逻辑：所有缝、凹槽、坐垫间隙一律换成更暗更糙的 velvet_seam；
             坐垫底部抬离坐箱 0.006、盖毯抬离扶手 0.005 —— 防共面闪烁。
    坐垫：只留「后 / 左 / 右」三条滚边 —— 中缝与前滚边已于 2026-09-17 按反馈删除。
    节点数：碎件先烘修改器再归并成 18 个对象（每个 mesh 在游戏里是一次 draw call，
           旧版 15 个；不烘就合并会让粗倒角套到细滚边上烂面）。
    """
    V, VD, SEAM = M('velvet'), M('velvet_d'), M('velvet_seam')
    CREAM, CREAM_D, WD = M('cream'), M('cream_d'), M('wood_dark')
    P = {}                                              # 归并桶：目标对象名 -> [零件…]

    def put(key, o):
        P.setdefault(key, []).append(o)

    # ---- 1) 四条车木腿（0→0.145）：铜脚套 → 球足 → 束腰 → 柱身 → 顶盘 ----
    for sx in (-1, 1):
        for sz in (-1, 1):
            k = f'leg{sx}{sz}'
            lx, lz = sx * 0.845, sz * 0.345
            put(k, CYL(0.026, 0.014, lx, 0.007, lz, M('gold'), f'{k}_ferrule', 16))
            put(k, SPH(0.024, lx, 0.030, lz, WD, f'{k}_foot', 16, 10))
            put(k, CONE(0.019, 0.030, 0.052, lx, 0.076, lz, WD, f'{k}_waist', 16))
            put(k, CYL(0.030, 0.036, lx, 0.117, lz, WD, f'{k}_shaft', 16))
            put(k, CYL(0.037, 0.016, lx, 0.139, lz, WD, f'{k}_cap', 16))

    # ---- 2) 围裙 + 暗缝 + 坐箱 ----
    put('sofa_apron', B(1.90, 0.060, 0.84, 0, 0.175, 0, VD, 'sofa_apron', bevel=0.012))
    put('sofa_apron', B(1.88, 0.014, 0.82, 0, 0.205, 0, SEAM, 'sofa_apron_seam', bevel=0.004))
    put('sofa_base', B(1.90, 0.235, 0.85, 0, 0.3225, 0, V, 'sofa_base', bevel=0.040))

    # ---- 3) 三块坐垫（0.446→0.586）+ 三条滚边（后/左/右）+ 垫间暗缝 ----
    #      2026-09-17 按反馈删掉了「前滚边」与「中缝」——原来是坐垫前沿一条横贯垫宽的
    #      白圆管 + 垫面正中一条从后贯到前的凸起白细条；坐垫正面现在留光面。
    #      （改动同源：tools/sofa_trim_seam.py 对已 join 的网格做连通块级删除）
    CUSH_D = 0.710          # 垫深（不含滚边）
    for i, cx in enumerate((-0.494, 0.0, 0.494)):
        k = f'cush{i}'
        put(k, B(0.482, 0.140, CUSH_D, cx, 0.516, 0.05, CREAM, k, bevel=0.042))
        put(k, B(0.482, 0.022, 0.022, cx, 0.578, -0.301, CREAM_D, f'{k}_welt_b', bevel=0.010))
        put(k, B(0.022, 0.022, 0.702, cx - 0.235, 0.578, 0.05, CREAM_D, f'{k}_welt_l', bevel=0.010))
        put(k, B(0.022, 0.022, 0.702, cx + 0.235, 0.578, 0.05, CREAM_D, f'{k}_welt_r', bevel=0.010))
    for sx in (-1, 1):
        put('sofa_cush_gap',
            B(0.012, 0.026, 0.700, sx * 0.2465, 0.576, 0.05, SEAM, f'sofa_cush_gap_{sx}', bevel=0.004))

    # ---- 4) 靠背：暗色背板（填三块面板之间的缝）+ 三块独立面板后倾 0.10 rad + 腰枕圆枕
    #       z 值是为了"后倾后最靠后的角点仍不超过 0.425"反推的，动倾角就要重算 ----
    bd = B(1.48, 0.46, 0.04, 0, 0.625, -0.378, SEAM, 'sofa_backboard', bevel=0.008)
    bd.rotation_euler = (-0.10, 0, 0); _apply(bd); put('sofa_back', bd)
    for i, bx in enumerate((-0.497, 0.0, 0.497)):
        bp = B(0.485, 0.40, 0.20, bx, 0.635, -0.303, VD, f'sofa_back{i}', bevel=0.045)
        bp.rotation_euler = (-0.10, 0, 0); _apply(bp); put('sofa_back', bp)
    lum = CYL(0.045, 1.46, 0, 0.505, -0.212, VD, 'sofa_lumbar_roll', 20)
    lum.rotation_euler = (0, math.pi / 2, 0); _apply(lum); put('sofa_lumbar_roll', lum)

    # ---- 5) 卷臂：侧板 + 前后向圆枕 + 前卷盘 ----
    for sx in (-1, 1):
        n = 'L' if sx < 0 else 'R'
        put(f'arm{n}', B(0.22, 0.36, 0.80, sx * 0.840, 0.50, 0.0, VD, f'arm{n}_panel', bevel=0.045))
        ar = CYL(0.090, 0.80, sx * 0.840, 0.650, 0.0, VD, f'arm{n}_roll', 24)
        ar.rotation_euler = (math.pi / 2, 0, 0); _apply(ar); put(f'arm{n}', ar)
        ad = CYL(0.102, 0.040, sx * 0.840, 0.650, 0.390, VD, f'arm{n}_scroll', 24)
        ad.rotation_euler = (math.pi / 2, 0, 0); _apply(ad); put(f'arm{n}', ad)

    # ---- 6) 靠枕 + 盖毯（底部抬离支撑面，避免共面闪烁） ----
    p1 = B(0.40, 0.36, 0.14, -0.44, 0.716, -0.235, M('pillow'), 'throwL', bevel=0.030)
    p1.rotation_euler = (-0.15, 0, 0); _apply(p1); put('throwL', p1)
    p2 = B(0.40, 0.36, 0.14, 0.30, 0.716, -0.235, CREAM_D, 'throwR', bevel=0.030)
    p2.rotation_euler = (-0.15, 0, 0); _apply(p2); put('throwR', p2)
    t1 = B(0.52, 0.045, 0.64, 0.62, 0.775, 0.06, M('white'), 'blanketA', bevel=0.014)
    t1.rotation_euler = (0, -0.05, 0); _apply(t1); put('blanketA', t1)
    put('blanketB', B(0.52, 0.33, 0.045, 0.62, 0.605, 0.40, M('white'), 'blanketB', bevel=0.014))

    # ---- 7) 烘修改器后归并（合并不继承非活动对象的修改器，必须先烘） ----
    def bake(o):
        _unselect()
        o.select_set(True)
        bpy.context.view_layer.objects.active = o
        for md in list(o.modifiers):
            bpy.ops.object.modifier_apply(modifier=md.name)
        return o

    global CUR
    keep, CUR = CUR, None            # 临时清空，免去名字被追加 __桶名 后缀
    merged = []
    for nm, lst in P.items():
        for o in lst:
            bake(o)
        m = join(lst, nm) if len(lst) > 1 else lst[0]
        m.name = nm
        merged.append(m)
    CUR = keep
    for m in merged:
        reg(m)

def b_coffee_table():
    """中古风胡桃木茶几 v2（2026-09-17 写实重建，与客厅法式圆扶手沙发 v2 配套）
    尺寸锚点（必须守住，取自旧版 GLB 实测与 furniture.js 槽位）：
      占地 1.10 × 0.60；桌面顶面 0.450；隔板顶面 0.155；总高 0.45；
      原点 = 占地中心 + 地面；正面朝 three +z；无可动部件（furniture.js parts={}）。
      槽位物品落点（top 0.475 / shelf 0.175）高于面 2~2.5cm 是旧版既有行为，
      本次不动槽位数据，锚定面按旧值复刻，行为零变化。
    制造逻辑（写实指南军规6）：桌面板厚 42mm 边缘倒圆；桌面下四面围板承重结构
      （顶面与桌底齐平贴合，是真实桌子的受力路径）；车木锥腿上Ø62 下Ø44 + 圆盘足，
      腿顶伸入围板区间 18mm（榫接入围板，不是浮贴）；隔板两端插进腿柱。
    节点数：4（top/apron/legs/shelf），旧版 6 —— 每 mesh 一次 draw call，只减不增。
    材质：桌面 wood（中胡桃半光 rough 0.55），其余 wood_dark（深胡桃）——与沙发车木腿同语言。
    """
    W, WD = M('wood'), M('wood_dark')
    P = {}                                              # 归并桶：目标节点名 -> [零件…]

    def put(key, o):
        P.setdefault(key, []).append(o)

    # ---- 1) 桌面：厚 42mm 圆角面板（0.408 → 0.450；bevel 受 _bevel 的 min 维 40% 钳制到 ~17mm）----
    put('top', B(1.10, 0.042, 0.60, 0, 0.429, 0, W, 'top', bevel=0.03))

    # ---- 2) 围板四面（0.382 → 0.408，顶面贴桌底）：前后板搭左右板，角部齐平 ----
    put('apron', B(0.98, 0.026, 0.016, 0, 0.395, 0.235, WD, 'apron_f', 0.004))
    put('apron', B(0.98, 0.026, 0.016, 0, 0.395, -0.235, WD, 'apron_b', 0.004))
    put('apron', B(0.016, 0.026, 0.454, 0.482, 0.395, 0, WD, 'apron_l', 0.004))
    put('apron', B(0.016, 0.026, 0.454, -0.482, 0.395, 0, WD, 'apron_r', 0.004))

    # ---- 3) 四条车木腿（0 → 0.400）：圆盘足 + 锥柱（下Ø44 上Ø62），腿顶没入围板 ----
    for sx in (-1, 1):
        for sz in (-1, 1):
            lx, lz = sx * 0.49, sz * 0.24
            put('legs', CYL(0.026, 0.012, lx, 0.006, lz, WD, f'leg_foot{sx}{sz}', 16))
            put('legs', CONE(0.022, 0.031, 0.388, lx, 0.206, lz, WD, f'leg_shaft{sx}{sz}', 16))

    # ---- 4) 低位隔板（0.125 → 0.155，顶面锚定旧值）：两端插进腿柱 11mm ----
    put('shelf', B(0.94, 0.030, 0.44, 0, 0.140, 0, WD, 'shelf', bevel=0.010))

    # ---- 5) 烘修改器后归并（合并不继承非活动对象的修改器，必须先烘——同 b_sofa 纪律）----
    def bake(o):
        _unselect()
        o.select_set(True)
        bpy.context.view_layer.objects.active = o
        for md in list(o.modifiers):
            bpy.ops.object.modifier_apply(modifier=md.name)
        return o

    global CUR
    keep, CUR = CUR, None            # 临时清空，免去名字被追加 __桶名 后缀
    merged = []
    for nm, lst in P.items():
        for o in lst:
            bake(o)
        m = join(lst, nm) if len(lst) > 1 else lst[0]
        m.name = nm
        merged.append(m)
    CUR = keep
    for m in merged:
        reg(m)

def b_tv_cabinet():
    # 四条柜腿（0→0.06，与 furniture.js 回退 builder 的 legs4(1.6,0.42,0.06) 对齐；
    # 漏建会让柜体底面停在 0.06，视觉上悬空）
    for sx in (-1, 1):
        for sz in (-1, 1):
            reg(B(0.06, 0.06, 0.06, sx * 0.74, 0.03, sz * 0.15, M('wood_dark'), f'tvleg{sx}{sz}', 0.006))
    # 空心柜体 + 中层隔板（上下两层，与吊柜一致）
    HOLLOW(1.6, 0.44, 0.42, 0, 0.28, 0, M('wood'), 'tv_body', t=0.02)
    reg(B(1.5, 0.02, 0.34, 0, 0.28, 0, M('wood_dark'), 'tv_shelf', 0.004))
    reg(B(1.56, 0.03, 0.40, 0, 0.505, 0, M('wood_dark'), 'toptrim', 0.006))
    reg(join([B(0.72, 0.36, 0.03, -0.4, 0.28, 0.215, M('wood_light'), 'd', 0.006),
              B(0.1, 0.025, 0.025, -0.08, 0.28, 0.245, M('dark'), 'h')], 'part_doorL'))
    reg(join([B(0.72, 0.36, 0.03, 0.4, 0.28, 0.215, M('wood_light'), 'd', 0.006),
              B(0.1, 0.025, 0.025, 0.08, 0.28, 0.245, M('dark'), 'h')], 'part_doorR'))

def b_tv():
    reg(B(0.5, 0.04, 0.25, 0, 0.02, 0, M('dark'), 'foot', 0.01))
    reg(B(0.08, 0.12, 0.08, 0, 0.08, 0, M('dark'), 'neck', 0.008))
    reg(B(1.15, 0.66, 0.05, 0, 0.46, 0, M('dark'), 'bezel', 0.008))
    reg(B(1.05, 0.56, 0.012, 0, 0.46, 0.026, M('screen'), 'panel', 0.003))

def b_carpet(w=2.6, d=1.8, name='carpet'):
    o = B(w, 0.022, d, 0, 0.035, 0, M('rug'), name, bevel=0.006)
    reg(o)

def b_plant():
    reg(CONE(0.13, 0.16, 0.3, 0, 0.15, 0, M('pot'), 'pot', 24))
    reg(CYL(0.145, 0.025, 0, 0.29, 0, M('soil'), 'soil', 24))
    reg(CYL(0.025, 0.34, 0, 0.47, 0, M('bark'), 'stem', 12))
    reg(DISPLACED_SPH(0.17, 0, 0.68, 0, M('leaf1'), 'leaf1', 0.14, seed=3))
    reg(DISPLACED_SPH(0.12, 0.1, 0.56, 0.06, M('leaf2'), 'leaf2', 0.16, seed=8))

def b_floor_lamp():
    reg(CYL(0.16, 0.03, 0, 0.015, 0, M('dark'), 'base', 24))
    reg(CYL(0.02, 1.3, 0, 0.68, 0, M('steel'), 'pole', 16))
    sh = CONE(0.16, 0.11, 0.24, 0, 1.42, 0, M('cream'), 'shade', 20)
    m = sh.modifiers.new('Solidify', 'SOLIDIFY'); m.thickness = 0.006
    _unselect(); sh.select_set(True); bpy.context.view_layer.objects.active = sh
    bpy.ops.object.modifier_apply(modifier='Solidify')
    reg(sh)
    reg(SPH(0.05, 0, 1.36, 0, M('bulb'), 'bulb', 12, 8))

def b_armchair():
    reg(CYL(0.4, 0.26, 0, 0.2, 0, M('teddy'), 'base', 24))
    back = CONE(0.42, 0.42, 0.55, 0, 0.5, 0, M('teddy'), 'back', 24)
    # 开口背：切掉前半（用布尔太重，直接整环+前方坐垫遮挡即可；改为半开口造型）
    reg(back)
    reg(CYL(0.36, 0.07, 0, 0.36, 0, M('teddy_d'), 'cushion', 24))

def b_counter():
    # 空心柜身（柜门区可见内部）+ 抽屉真实箱体 + 台面含水槽龙头
    HOLLOW(2.4, 0.82, 0.62, 0, 0.41, 0, M('wood_light'), 'ct_body', t=0.04)
    reg(B(0.04, 0.74, 0.54, -0.175, 0.41, 0, M('wood_body'), 'ct_divider', 0.006))
    reg(B(2.44, 0.05, 0.66, 0, 0.875, 0, M('white'), 'top', 0.008))
    reg(B(0.52, 0.015, 0.42, -0.6, 0.883, 0, M('steel'), 'sink_rim', 0.004))
    reg(B(0.46, 0.05, 0.36, -0.6, 0.872, 0, M('steel_dark'), 'sink_in', 0.006))
    reg(CYL(0.02, 0.24, -0.6, 1.0, -0.22, M('steel'), 'faucet', 16))
    sp = CYL(0.015, 0.16, -0.6, 1.11, -0.15, M('steel'), 'spout', 14)
    sp.rotation_euler = (math.pi / 2, 0, 0); _apply(sp); reg(sp)
    # 抽屉×2（空心，滑出可见内部，把手随动）；前板加高加宽铺满立柱，
    # 上缘塞进台面底、下缘接柜门顶、中缝对齐隔板——杜绝看进柜体的缝隙
    for i, (dx, fw, fdx) in enumerate(((-0.6, 1.0, -0.075), (0.25, 0.79, -0.0275))):
        DRAWER_BOX(0.67, 0.15, 0.5, dx, 0.665, 0.0, 0.283, M('wood'), M('wood_body'), f'part_drawer{i+1}',
                   handle_mat=M('dark'), front_w=fw, front_h=0.36, front_dy=0.0075, front_dx=fdx)
    reg(join([B(0.97, 0.5, 0.03, -0.68, 0.25, 0.315, M('wood'), 'd', 0.006),
              B(0.12, 0.025, 0.025, -0.25, 0.25, 0.34, M('dark'), 'h')], 'part_cabDoor'))
    reg(B(0.815, 0.5, 0.56, 0.2075, 0.25, 0, M('wood_dark'), 'openbox', 0.006))   # 左缘延到柜门背后, 消门板间黑洞
    reg(B(0.55, 0.86, 0.03, 0.885, 0.43, 0.30, M('wood'), 'front_right', 0.006))   # 右端封板

def b_fridge():
    # 空心箱体 + 冷冻/冷藏隔板 + 内置玻璃层架（门从把手侧向外开，把手装在自由缘）
    HOLLOW(0.75, 1.78, 0.7, 0, 0.89, 0, M('fridge'), 'fr_body', t=0.04)
    reg(B(0.66, 0.03, 0.6, 0, 0.375, 0, M('steel_dark'), 'fr_divider', 0.006))
    reg(B(0.71, 0.02, 0.62, 0, 0.9, 0.02, M('steel_dark'), 'fr_shelf', 0.004))
    reg(join([B(0.73, 1.74, 0.05, 0, 0.89, 0.35, M('fridge_door'), 'd', 0.01),
              B(0.04, 0.5, 0.04, 0.28, 1.1, 0.39, M('steel'), 'h1', 0.008),
              B(0.02, 0.3, 0.02, 0.28, 0.55, 0.39, M('steel'), 'h2', 0.006),
              B(0.73, 0.012, 0.052, 0, 1.15, 0.351, M('steel_dark'), 'seam', 0.003)], 'part_door'))

def b_dining_table():
    reg(CYL(0.09, 0.68, 0, 0.34, 0, M('wood_dark'), 'column', 24))
    reg(CYL(0.32, 0.05, 0, 0.025, 0, M('wood_dark'), 'base', 28))
    reg(CYL(0.8, 0.05, 0, 0.73, 0, M('wood'), 'top', 40))

def b_chair():
    for sx in (-1, 1):
        for sz in (-1, 1):
            reg(B(0.04, 0.44, 0.04, sx * 0.19, 0.22, sz * 0.19, M('wood_dark'), f'leg{sx}{sz}', 0.006))
    reg(B(0.45, 0.05, 0.45, 0, 0.465, 0, M('wood'), 'seat', 0.01))
    reg(B(0.45, 0.5, 0.04, 0, 0.74, -0.2, M('wood'), 'back', 0.01))

def b_cup():
    reg(TUBE(0.045, 0.04, 0.11, 0, 0.055, 0, M('ceramic'), 'wall', 20))
    reg(CYL(0.04, 0.008, 0, 0.006, 0, M('ceramic'), 'bottom', 20))
    reg(TORUS(0.028, 0.007, 0.052, 0.06, 0, M('ceramic'), 'handle', rot_bl=(math.pi / 2, 0, 0)))

def b_fruit_bowl():
    reg(TUBE(0.15, 0.11, 0.07, 0, 0.035, 0, M('bowl'), 'wall', 24))
    reg(CYL(0.115, 0.012, 0, 0.012, 0, M('bowl_d'), 'bottom', 24))
    reg(SPH(0.045, 0.08, 0.05, 0.03, M('fruit1'), 'f1', 14, 10))
    reg(SPH(0.04, -0.06, 0.045, -0.05, M('fruit2'), 'f2', 14, 10))

def b_microwave():
    # 空心炉腔（内部可藏物）+ 可开门（左铰链、玻璃窗、右缘把手）
    HOLLOW(0.5, 0.3, 0.38, 0, 0.15, 0, M('dark'), 'mw_body', t=0.02)
    reg(join([B(0.46, 0.26, 0.022, 0, 0.15, 0.201, M('dark'), 'd', 0.006),
              B(0.34, 0.17, 0.01, -0.03, 0.15, 0.209, M('pc_glass'), 'g', 0.004),
              B(0.035, 0.16, 0.028, 0.195, 0.15, 0.212, M('steel'), 'h', 0.006)], 'part_door'))

def b_trash_bin():
    reg(TUBE(0.155, 0.13, 0.42, 0, 0.21, 0, M('steel_dark'), 'wall', 20))
    reg(CYL(0.128, 0.015, 0, 0.06, 0, M('dark'), 'bottom', 20))

def b_bed():
    for sx in (-1, 1):
        for sz in (-1, 1):
            reg(B(0.07, 0.18, 0.07, sx * 0.76, 0.09, sz * 1.0, M('wood_dark'), f'leg{sx}{sz}', 0.008))
    reg(B(1.6, 0.14, 2.1, 0, 0.25, 0, M('wood'), 'deck', 0.008))
    reg(B(1.6, 0.22, 2.0, 0, 0.43, 0.03, M('mattress'), 'mattress', 0.035))
    reg(B(1.6, 0.7, 0.1, 0, 0.6, -1.05, M('wood_dark'), 'headboard', 0.012))
    reg(B(1.66, 0.28, 0.06, 0, 0.78, -1.06, M('wood_light'), 'headtop', 0.012))
    for i, px in enumerate((-0.4, 0.4)):
        p = B(0.55, 0.1, 0.32, px, 0.58, -0.72, M('pillow'), f'pillow{i}', bevel=0.035)
        p.rotation_euler = (0.06, 0.04 * i, 0.02 * i); _apply(p); reg(p)
    reg(B(1.55, 0.06, 1.25, 0, 0.55, 0.4, M('blanket'), 'duvet', 0.03))
    reg(B(1.55, 0.16, 0.06, 0, 0.585, -0.2, M('blanket'), 'duvet_fold', 0.03))

def b_nightstand():
    """床头柜 v2（2026-09-18 真实抽屉工艺）：无框柜身（无框全深五面板，前脸平齐）
    + 全覆盖抽屉面板（铺满整个前脸，缝隙统一 3mm：底/中/顶缝）。
    尺寸锚点（不变）：0.45×0.5×0.4；抽屉盒底 0.315/0.125（furniture.js 槽位
    drawer1/drawer2 依赖，物品落点不变）；原点=底面中心；正面 +z。
    节点：柜身归并 1 + 抽屉×2（面板+箱体+把手已 join）= 3（旧 3，不增）。
    """
    W_, H_, D_, T, REV = 0.45, 0.5, 0.4, 0.016, 0.003
    FW, FH = W_ - 2 * REV, (H_ - 3 * REV) / 2      # 面板 0.444 × 0.2455
    P = {}

    def put(key, o):
        P.setdefault(key, []).append(o)

    put('body', B(T, H_, D_, -(W_ / 2 - T / 2), H_ / 2, 0, M('wood'), 'ns_sideL', 0.004))
    put('body', B(T, H_, D_, (W_ / 2 - T / 2), H_ / 2, 0, M('wood'), 'ns_sideR', 0.004))
    put('body', B(W_ - 2 * T, T, D_, 0, H_ - T / 2, 0, M('wood'), 'ns_top', 0.004))
    put('body', B(W_ - 2 * T, T, D_, 0, T / 2, 0, M('wood'), 'ns_bottom', 0.004))
    put('body', B(W_ - 2 * T, H_ - 2 * T, T, 0, H_ / 2, -D_ / 2 + T / 2, M('wood'), 'ns_back', 0.004))
    # 抽屉盒（盒底=槽位锚点 0.315/0.125）；面板铺满前脸（front_h 铺满，dy 对中）
    DRAWER_BOX(0.40, 0.16, 0.34, 0, 0.395, -0.014, 0.205, M('wood_light'), M('wood_body'),
               'part_drawer', handle_mat=M('dark'), front_w=FW, front_h=FH, front_dy=-0.02075,
               front_dx=0)
    DRAWER_BOX(0.40, 0.16, 0.34, 0, 0.205, -0.014, 0.205, M('wood_light'), M('wood_body'),
               'part_drawer2', handle_mat=M('dark'), front_w=FW, front_h=FH, front_dy=-0.07925,
               front_dx=0)
    # DRAWER_BOX 内部已 reg——上面直接 reg 了 part；柜身需归并注册
    def bake(o):
        _unselect()
        o.select_set(True)
        bpy.context.view_layer.objects.active = o
        for md in list(o.modifiers):
            bpy.ops.object.modifier_apply(modifier=md.name)
        return o

    global CUR
    keep, CUR = CUR, None
    merged = []
    for nm, lst in P.items():
        for o in lst:
            bake(o)
        m = join(lst, nm) if len(lst) > 1 else lst[0]
        m.name = f'ns_{nm}'
        merged.append(m)
    CUR = keep
    for m in merged:
        reg(m)

def b_dresser():
    """斗柜 v2（2026-09-18 真实抽屉工艺）：车木腿（0→0.06）+ 无框柜身
    + 两块全覆盖大抽屉面板（铺满 0.06→0.78 前脸，缝隙统一 3mm）。
    尺寸锚点（不变）：0.9×0.78×0.45；腿位 ±0.4/±0.19；抽屉盒底 0.475/0.195（槽位锚点）。
    节点：腿 1 + 柜身 1 + 抽屉×2 = 4（旧 7，只减不增）。
    """
    W_, H_, D_, T, REV = 0.9, 0.78, 0.45, 0.016, 0.003
    LH = 0.06                                       # 腿高
    FW, FH = W_ - 2 * REV, (H_ - LH - 3 * REV) / 2  # 面板 0.894 × 0.3555
    P = {}

    def put(key, o):
        P.setdefault(key, []).append(o)

    for sx in (-1, 1):
        for sz in (-1, 1):
            put('legs', B(0.05, LH, 0.05, sx * 0.4, LH / 2, sz * 0.19, M('wood_dark'),
                          f'dr_leg{sx}{sz}', 0.006))
    put('body', B(T, H_ - LH, D_, -(W_ / 2 - T / 2), LH + (H_ - LH) / 2, 0, M('wood'),
                  'dr_sideL', 0.004))
    put('body', B(T, H_ - LH, D_, (W_ / 2 - T / 2), LH + (H_ - LH) / 2, 0, M('wood'),
                  'dr_sideR', 0.004))
    put('body', B(W_ - 2 * T, T, D_, 0, H_ - T / 2, 0, M('wood'), 'dr_top', 0.004))
    put('body', B(W_ - 2 * T, T, D_, 0, LH + T / 2, 0, M('wood'), 'dr_bottom', 0.004))
    put('body', B(W_ - 2 * T, H_ - LH - 2 * T, T, 0, LH + (H_ - LH) / 2, -D_ / 2 + T / 2,
                  M('wood'), 'dr_back', 0.004))
    # 盒底锚点 0.475/0.195；面板铺满 0.063→0.777
    DRAWER_BOX(0.84, 0.28, 0.38, 0, 0.615, -0.019, 0.23, M('wood_light'), M('wood_body'),
               'part_drawer1', handle_mat=M('dark'), front_w=FW, front_h=FH, front_dy=-0.01575,
               front_dx=0)
    DRAWER_BOX(0.84, 0.28, 0.38, 0, 0.335, -0.019, 0.23, M('wood_light'), M('wood_body'),
               'part_drawer2', handle_mat=M('dark'), front_w=FW, front_h=FH, front_dy=-0.09425,
               front_dx=0)

    def bake(o):
        _unselect()
        o.select_set(True)
        bpy.context.view_layer.objects.active = o
        for md in list(o.modifiers):
            bpy.ops.object.modifier_apply(modifier=md.name)
        return o

    global CUR
    keep, CUR = CUR, None
    merged = []
    for nm, lst in P.items():
        for o in lst:
            bake(o)
        m = join(lst, nm) if len(lst) > 1 else lst[0]
        m.name = f'dr_{nm}'
        merged.append(m)
    CUR = keep
    for m in merged:
        reg(m)

def b_desk():
    """书桌 v2（2026-09-18）：桌面 + 落地侧板（旧版悬空 1cm 已修）+ 背部望板（真实书桌
    的 modesty panel）+ 全覆盖抽屉（面板顶缝 3mm 贴桌底，面板厚 14→ hmm 面板贴桌底）。
    尺寸锚点（不变）：1.4×0.76×0.7，桌面顶 0.76（top 槽位），抽屉盒底 0.585（drawer 槽位），
    抽屉位 x=0.35。节点：桌面 1 + 侧板望板归并 1 + 抽屉 1 = 3（旧 4）。
    """
    reg(B(1.4, 0.05, 0.7, 0, 0.735, 0, M('wood'), 'desk_top', 0.01))
    parts = [B(0.05, 0.71, 0.65, -0.66, 0.355, 0, M('wood_dark'), 'desk_sideL', 0.008),
             B(0.05, 0.71, 0.65, 0.66, 0.355, 0, M('wood_dark'), 'desk_sideR', 0.008),
             B(1.2, 0.35, 0.025, 0, 0.38, -0.30, M('wood_dark'), 'desk_modesty', 0.006)]
    global CUR
    keep, CUR = CUR, None
    for o in parts:
        _unselect(); o.select_set(True)
        bpy.context.view_layer.objects.active = o
        for md in list(o.modifiers):
            bpy.ops.object.modifier_apply(modifier=md.name)
    m = join(parts, 'desk_frame')
    m.name = 'desk_frame'
    CUR = keep
    reg(m)
    # 抽屉：面板顶缝 3mm 贴桌底（0.71），面板 0.45×0.14；盒底锚点 0.585
    DRAWER_BOX(0.40, 0.10, 0.44, 0.35, 0.635, 0.121, 0.355, M('wood_light'), M('wood_body'),
               'part_drawer', handle_mat=M('dark'), front_w=0.45, front_h=0.14, front_dy=0.002,
               front_dx=0)

def b_file_cabinet():
    """文件柜 v2（2026-09-18 真实抽屉工艺）：无框柜身 + 两块全覆盖面板（缝隙统一 3mm），
    钢拉手保留。尺寸锚点（不变）：0.45×0.6×0.45；抽屉盒底 0.34/0.075（槽位锚点）。
    节点：柜身 1 + 抽屉×2 = 3（旧 3，不增）。"""
    W_, H_, D_, T, REV = 0.45, 0.6, 0.45, 0.016, 0.003
    FW, FH = W_ - 2 * REV, (H_ - 3 * REV) / 2       # 0.444 × 0.2955
    P = {}

    def put(key, o):
        P.setdefault(key, []).append(o)

    put('body', B(T, H_, D_, -(W_ / 2 - T / 2), H_ / 2, 0, M('wood_dark'), 'fc_sideL', 0.004))
    put('body', B(T, H_, D_, (W_ / 2 - T / 2), H_ / 2, 0, M('wood_dark'), 'fc_sideR', 0.004))
    put('body', B(W_ - 2 * T, T, D_, 0, H_ - T / 2, 0, M('wood_dark'), 'fc_top', 0.004))
    put('body', B(W_ - 2 * T, T, D_, 0, T / 2, 0, M('wood_dark'), 'fc_bottom', 0.004))
    put('body', B(W_ - 2 * T, H_ - 2 * T, T, 0, H_ / 2, -D_ / 2 + T / 2, M('wood_dark'),
                  'fc_back', 0.004))
    # 盒底锚点 0.34/0.075
    DRAWER_BOX(0.40, 0.22, 0.38, 0, 0.45, -0.019, 0.23, M('wood'), M('wood_body'),
               'part_drawer', handle_mat=M('steel'), front_w=FW, front_h=FH, front_dy=-0.00075,
               front_dx=0)
    DRAWER_BOX(0.40, 0.22, 0.38, 0, 0.185, -0.019, 0.23, M('wood'), M('wood_body'),
               'part_drawer2', handle_mat=M('steel'), front_w=FW, front_h=FH, front_dy=-0.03425,
               front_dx=0)

    def bake(o):
        _unselect()
        o.select_set(True)
        bpy.context.view_layer.objects.active = o
        for md in list(o.modifiers):
            bpy.ops.object.modifier_apply(modifier=md.name)
        return o

    global CUR
    keep, CUR = CUR, None
    merged = []
    for nm, lst in P.items():
        for o in lst:
            bake(o)
        m = join(lst, nm) if len(lst) > 1 else lst[0]
        m.name = f'fc_{nm}'
        merged.append(m)
    CUR = keep
    for m in merged:
        reg(m)

def b_treadmill():
    """跑步机（2026-09-18 首次建模，替换方块兜底）：圆柱体结构——跑带前后滚筒、
    圆管侧轨/立柱/扶手（全 CYL），电机罩与控制台为倒角件。
    尺寸锚点（=furniture.js 兜底）：占地 0.8×1.75，跑带朝 -z，控制台在 +z 前端，总高约 1.2。
    无可动部件（slots: []）。节点：机身 1 + 钢件 1 + 屏 1 = 3。"""
    dark, steel, screen = M('dark'), M('steel'), M('screen')
    # 机身：底座 + 跑带 + 电机罩 + 控制台 + 握把套（同深色，归并）
    body = [B(0.80, 0.13, 1.75, 0, 0.065, -0.02, dark, 'tm_deck', 0.04),
            B(0.56, 0.014, 1.46, 0, 0.144, -0.10, dark, 'tm_belt', 0.005),
            B(0.62, 0.12, 0.30, 0, 0.19, 0.66, dark, 'tm_hood', 0.035),
            B(0.76, 0.10, 0.30, 0, 1.13, 0.77, dark, 'tm_console', 0.03),
            CYL(0.017, 0.13, -0.265, 1.05, 0.79, dark, 'tm_gripL', 14),
            CYL(0.017, 0.13, 0.265, 1.05, 0.79, dark, 'tm_gripR', 14)]
    for o in body:
        if o.name.startswith('tm_grip'):
            o.rotation_euler = (0, math.pi / 2, 0); _apply(o)
    console = body[3]
    console.rotation_euler = (-0.28, 0, 0); _apply(console)
    # 钢件：前后滚筒（Ø85）+ 侧轨 + 斜立柱 + 扶手横管（全圆柱）
    steel_parts = []
    for zz in (-0.79, 0.59):
        r = CYL(0.0425, 0.56, 0, 0.135, zz, steel, f'tm_roller{zz}', 18)
        r.rotation_euler = (0, math.pi / 2, 0); _apply(r)
        steel_parts.append(r)
    for sx in (-1, 1):
        rail = CYL(0.015, 1.50, sx * 0.315, 0.165, -0.10, steel, f'tm_rail{sx}', 14)
        rail.rotation_euler = (math.pi / 2, 0, 0); _apply(rail)
        steel_parts.append(rail)
        up = CYL(0.0175, 1.04, sx * 0.30, 0.62, 0.69, steel, f'tm_upright{sx}', 14)
        up.rotation_euler = (0.206, 0, 0); _apply(up)
        steel_parts.append(up)
    bar = CYL(0.014, 0.66, 0, 1.05, 0.79, steel, 'tm_bar', 14)
    bar.rotation_euler = (0, math.pi / 2, 0); _apply(bar)
    steel_parts.append(bar)

    global CUR
    keep, CUR = CUR, None
    for o in body + steel_parts:
        _unselect(); o.select_set(True)
        bpy.context.view_layer.objects.active = o
        for md in list(o.modifiers):
            bpy.ops.object.modifier_apply(modifier=md.name)
    m1 = join(body, 'tm_body'); m1.name = 'tm_body'
    m2 = join(steel_parts, 'tm_steel'); m2.name = 'tm_steel'
    CUR = keep
    reg(m1); reg(m2)
    sc = B(0.52, 0.016, 0.22, 0, 1.16, 0.74, screen, 'tm_screen', 0.004)
    sc.rotation_euler = (-0.28, 0, 0); _apply(sc)
    reg(sc)

def b_flymachine():
    """飞鸟机（2026-09-18 首次建模）：圆柱结构——主立柱/摆臂轴/臂管/顶滑轮全圆柱，
    配重为圆孔杠铃片堆（Ø200 ×5），座垫圆垫 + 软包靠背。
    尺寸锚点（=兜底）：占地 0.85×0.95，座垫靠背在 -z，摆臂托盘在 +z 两侧，总高约 1.2。
    节点：架体 1 + 配重 1 + 座靠垫 1 + 摆臂 1 = 4。"""
    dark, steel, steel_d = M('dark'), M('steel'), M('steel_dark')
    PAD, SD = M('gym_pad'), M('steel_dark')
    base = B(0.85, 0.10, 0.95, 0, 0.05, 0, dark, 'fm_base', 0.03)
    post = CYL(0.03, 1.00, 0, 0.55, -0.12, steel, 'fm_post', 16)
    cross = CYL(0.012, 1.05, 0, 1.16, -0.40, steel, 'fm_cross', 12)
    cross.rotation_euler = (0, math.pi / 2, 0); _apply(cross)
    plates = []
    for i in range(5):
        plates.append(CYL(0.10, 0.045, 0.33, 0.10 + i * 0.048, 0.28, SD, f'fm_plate{i}', 24))
    plates.append(CYL(0.012, 0.45, 0.33, 0.30, 0.28, steel, 'fm_wpost', 10))
    pin = CYL(0.006, 0.10, 0.23, 0.244, 0.28, steel, 'fm_pin', 8)
    pin.rotation_euler = (0, math.pi / 2, 0); _apply(pin)
    plates.append(pin)
    seat = CYL(0.135, 0.11, 0, 0.565, -0.10, PAD, 'fm_seat', 24)
    back = B(0.44, 0.52, 0.09, 0, 0.88, -0.345, PAD, 'fm_back', 0.035)
    back.rotation_euler = (-0.12, 0, 0); _apply(back)
    arms = []
    for sx in (-1, 1):
        piv = CYL(0.02, 0.52, sx * 0.42, 0.86, 0.16, steel, f'fm_pivot{sx}', 14)
        arms.append(piv)
        tube = CYL(0.013, 0.40, sx * 0.24, 1.07, 0.16, steel, f'fm_armtube{sx}', 12)
        tube.rotation_euler = (0, math.pi / 2, 0); _apply(tube)
        arms.append(tube)
        pad = CYL(0.0575, 0.12, sx * 0.08, 1.07, 0.16, PAD, f'fm_pad{sx}', 20)
        pad.rotation_euler = (0, math.pi / 2, 0); _apply(pad)
        arms.append(pad)
        pul = CYL(0.03, 0.028, sx * 0.42, 1.16, 0.16, SD, f'fm_pulley{sx}', 14)
        pul.rotation_euler = (0, math.pi / 2, 0); _apply(pul)
        arms.append(pul)

    global CUR
    # 不清 CUR（reg 依赖它指向本件；__桶名 后缀由导出端剥掉）
    groups = {'fm_body': [base, post, cross], 'fm_weights': plates,
              'fm_seatpad': [seat, back], 'fm_arms': arms}
    for nm, lst in groups.items():
        for o in lst:
            _unselect(); o.select_set(True)
            bpy.context.view_layer.objects.active = o
            for md in list(o.modifiers):
                bpy.ops.object.modifier_apply(modifier=md.name)
        m = join(lst, nm)
        reg(m)

def b_dumbbellrack():
    """哑铃架（2026-09-18 首次建模）：圆管框架（4 立柱 + 两层双管托轨）+
    5 只圆柱头哑铃（杠铃杆 + 两片圆柱配重头，不再用球）。
    尺寸锚点（=兜底）：1.0×0.46，两层（哑铃中心 y 0.47/0.17），x 位 -0.3/0/0.3 与 ∓0.3。
    节点：架 1 + 哑铃×5 = 6。"""
    steel, dark, red = M('steel'), M('dark'), M('eraser')
    parts = []
    for sx in (-1, 1):
        parts.append(CYL(0.011, 0.46, sx * 0.47, 0.23, -0.14, steel, f'drr_postB{sx}', 12))
        parts.append(CYL(0.011, 0.16, sx * 0.47, 0.08, 0.16, steel, f'drr_postF{sx}', 12))
    # 两层托轨：每层双圆管（间距 44mm 成 V 槽），全宽贯通
    for ty, tz in ((0.42, -0.10), (0.13, 0.02)):
        for dz in (-0.022, 0.022):
            t = CYL(0.008, 0.94, 0, ty, tz + dz, steel, f'drr_tube{ty}{dz}', 10)
            t.rotation_euler = (0, math.pi / 2, 0); _apply(t)
            parts.append(t)
    # 哑铃：圆柱头坐在托轨管顶（管顶 y 0.428/0.138 + 头半径 0.031）
    bells = []
    spec = [(-0.30, 0.46, dark), (0.0, 0.46, red), (0.30, 0.46, dark),
            (-0.30, 0.17, red), (0.30, 0.17, dark)]
    for i, (bx, by, bm) in enumerate(spec):
        bl = [CYL(0.012, 0.22, bx, by, 0, steel, f'db{i}_bar', 10)]
        for sx2 in (-1, 1):
            h = CYL(0.031, 0.055, bx + sx2 * 0.105, by, 0, bm, f'db{i}_head{sx2}', 18)
            h.rotation_euler = (0, math.pi / 2, 0); _apply(h)
            bl.append(h)
        bells.append(bl)

    global CUR
    # 不清 CUR（reg 依赖它指向本件）
    def bake_join(lst, nm):
        for o in lst:
            _unselect(); o.select_set(True)
            bpy.context.view_layer.objects.active = o
            for md in list(o.modifiers):
                bpy.ops.object.modifier_apply(modifier=md.name)
        m = join(lst, nm)
        reg(m)
    bake_join(parts, 'drr_frame')
    for i, bl in enumerate(bells):
        bake_join(bl, f'db_{i}')

def b_yogamat():
    """瑜伽垫（2026-09-18 首次建模）：平铺垫（大倒角圆角）+ 卷轴圆柱（紫色调新材质）。
    尺寸锚点（=兜底）：垫 0.70×1.42 @ z+0.09，卷轴 Ø0.125 在垫后缘。节点 2。"""
    reg(B(0.70, 0.02, 1.42, 0, 0.01, 0.09, M('yoga'), 'ym_mat', 0.008))
    r = CYL(0.0625, 0.70, 0, 0.0625, -0.71, M('yoga_d'), 'ym_roll', 20)
    r.rotation_euler = (0, math.pi / 2, 0); _apply(r)
    reg(r)

def b_plant():
    """盆栽 v2（2026-09-18 写实化，替换"两个变形球"假树冠）：
    陶盆与土面尺寸原样（soil 顶 0.3025 槽位锚点不动）+ 锥形主干 + 3 根斜枝
    + 9 簇压扁变形球叶团（双绿色交替、确定性的环形分布，不用随机数保证可重现）。
    节点：盆 1 + 土 1 + 枝干 1 + 叶团归并 1 = 4（旧 5）。"""
    reg(CONE(0.13, 0.16, 0.30, 0, 0.15, 0, M('pot'), 'pot_pot', 24))
    reg(CYL(0.145, 0.025, 0, 0.29, 0, M('soil'), 'pot_soil', 24))
    trunk = CONE(0.028, 0.018, 0.34, 0, 0.46, 0, M('bark'), 'pot_trunk', 12)
    branches = []
    for i in range(3):
        a = i * 2.094
        br = CONE(0.013, 0.007, 0.17, math.cos(a) * 0.05, 0.55 + i * 0.035,
                  math.sin(a) * 0.05, M('bark'), f'pot_branch{i}', 8)
        br.rotation_euler = (math.sin(a) * 0.55, 0, -math.cos(a) * 0.55)
        _apply(br)
        branches.append(br)
    leaves = []
    # 显式叶团布局（x, z, y, 半径）：环部 8 簇铺到冠幅 ~0.47，顶心 1 簇抬高
    LEAF_LAYOUT = [
        (0.15, 0.02, 0.66, 0.075), (0.10, 0.13, 0.64, 0.065),
        (-0.04, 0.16, 0.68, 0.070), (-0.15, 0.07, 0.65, 0.080),
        (-0.14, -0.09, 0.70, 0.065), (-0.03, -0.17, 0.66, 0.070),
        (0.10, -0.12, 0.71, 0.075), (0.16, -0.03, 0.68, 0.060),
        (0.0, 0.0, 0.78, 0.085),
    ]
    for i, (lx, lz, ly, r) in enumerate(LEAF_LAYOUT):
        mat = M('leaf1') if i % 2 == 0 else M('leaf2')
        s = DISPLACED_SPH(r, lx, ly, lz, mat, f'pot_leaf{i}', 0.22, seed=i + 2)
        s.scale = (1.0, 0.62, 1.0); _apply(s)
        leaves.append(s)

    global CUR
    # 注意：不清 CUR——bake_join 里 reg() 依赖 CUR 指向本件；join 自动加 __桶名 后缀，
    # 导出与校验端都会剥掉（此前在 CUR=None 窗口里 reg 导致整件 0 节点的教训）
    def bake_join(lst, nm):
        for o in lst:
            _unselect(); o.select_set(True)
            bpy.context.view_layer.objects.active = o
            for md in list(o.modifiers):
                bpy.ops.object.modifier_apply(modifier=md.name)
        m = join(lst, nm)
        reg(m)
    bake_join([trunk] + branches, 'pot_trunk')
    bake_join(leaves, 'pot_leaves')

def b_wardrobe():
    """欧式无框衣柜 v2（2026-09-17 按真实橱柜工艺重做，修复"闭门漏光见衣服"）
    根因（旧版）：门板 0.55×2 只盖 1.14 开口的中间部分——中缝 30mm + 上下缝 20mm，
    闭门可直视挂衣区；顶/底板比侧板短 30mm（HOLLOW 五面板缩进），前脸不平齐。
    真实工艺（2026-09-17 调研橱柜标准）：无框柜 full-overlay 门板盖住几乎整个前脸，
    门缝统一 2-3mm（欧洲铰链规格，±2mm 可调）；门板经 18-19mm 铰链臂外凸于柜体前沿；
    顶/底板与侧板前脸平齐。门关上后前脸光密，只能看到均匀 3mm 门缝。
    尺寸锚点（必须守住）：外形 1.2 × 2.0 × 0.6；内空侧壁 x=±0.57、挂杆 y=1.4、
      顶隔板面 1.715（furniture.js 槽位 hang/topShelf 依赖）；原点=底面中心；正面 +z。
    开合同步：interact.js wardrobe/wardrobe2 的 hinge 改 [-0.597, 1.0, 0.309]
      （= 左门左缘/门板中心 z）。
    节点数：11（旧 23）——柜体五板归并 1、门×2（门板+把手）、隔板、杆（含托座）、
      衣服×4（钩+衣身各自归并）、叠放衣物归并 1、鞋归并 1。
    """
    W, WD, WL = M('wood'), M('wood_dark'), M('wood_light')
    STEEL, DARK = M('steel'), M('dark')
    W_, H_, D_, T, REV = 1.2, 2.0, 0.6, 0.03, 0.003   # 外形 / 板厚 / 门缝
    P = {}

    def put(key, o):
        P.setdefault(key, []).append(o)

    # ---- 1) 柜体五面板：侧板全深；顶/底板夹在侧板间但同深（前脸平齐，消旧版 30mm 缩进）----
    put('body', B(T, H_, D_, -(W_ / 2 - T / 2), H_ / 2, 0, W, 'wd_sideL', 0.004))
    put('body', B(T, H_, D_, (W_ / 2 - T / 2), H_ / 2, 0, W, 'wd_sideR', 0.004))
    put('body', B(W_ - 2 * T, T, D_, 0, H_ - T / 2, 0, W, 'wd_top', 0.004))
    put('body', B(W_ - 2 * T, T, D_, 0, T / 2, 0, W, 'wd_bottom', 0.004))
    put('body', B(W_ - 2 * T, H_ - 2 * T, T, 0, H_ / 2, -D_ / 2 + T / 2, W, 'wd_back', 0.004))

    # ---- 2) 全覆盖门板（full overlay）：各盖一半前脸，统一 3mm 缝，19mm 铰链外凸 ----
    #   door_w=(1.2-3*0.003)/2=0.5955  door_h=2.0-2*0.003=1.994
    #   左门 x∈[-0.597,-0.0015]  右门镜像；z 中心 0.309（背面藏进柜前脸 1mm 消共面闪烁）
    DW, DH, DZ = (W_ - 3 * REV) / 2, H_ - 2 * REV, 0.309
    for sx in (-1, 1):
        k = 'doorL' if sx < 0 else 'doorR'
        # 门外缘在 -(W_/2 - REV)，往内延伸 DW：中心 = W_/2 - REV - DW/2
        cx = sx * (W_ / 2 - REV - DW / 2)
        put(k, B(DW, DH, 0.02, cx, H_ / 2, DZ, WL, f'wd_{k}', 0.006))
        # 把手装自由缘（铰链对侧=中缝侧）；背面嵌入门面 1mm，防共面闪烁
        put(k, B(0.03, 0.24, 0.03, cx - sx * 0.26, H_ / 2, DZ + 0.024, DARK, f'wd_{k}_h', 0.005))

    # ---- 3) 内部（ cavity 不变，槽位锚点原样）：顶隔板补齐到贴侧板内壁 ----
    put('topshelf', B(1.14, 0.03, 0.5, 0, 1.7, 0, WD, 'wd_topshelf', 0.005))
    rod = CYL(0.015, 1.08, 0, 1.4, -0.18, STEEL, 'wd_rod', 14)
    rod.rotation_euler = (0, math.pi / 2, 0); _apply(rod)
    put('rod', rod)
    for sx in (-1, 1):   # 杆托座（真实柜的法兰托，消杆端悬空）
        put('rod', B(0.02, 0.05, 0.06, sx * 0.55, 1.4, -0.18, STEEL, f'wd_rodbrace{sx}', 0.004))

    # ---- 4) 挂着的衣服（钩+衣身各归并一件；位置/颜色与旧版一致）----
    for i, (gx, gw, gh, mname) in enumerate([(-0.35, 0.26, 0.72, 'velvet'), (-0.12, 0.28, 0.6, 'cream'),
                                             (0.1, 0.24, 0.8, 'mailbox'), (0.33, 0.26, 0.66, 'shirt')]):
        hook = TORUS(0.02, 0.004, gx, 1.42, -0.18, STEEL, f'wd_hook{i}', rot_bl=(0, math.pi / 2, 0))
        put(f'cloth{i}', hook)
        put(f'cloth{i}', B(gw, gh, 0.05, gx, 1.38 - gh / 2 - 0.02, -0.18, M(mname), f'wd_cloth{i}', 0.03))

    # ---- 5) 顶隔板叠放衣物（叠放关系保持：fold2 叠 fold1 顶、fold4 叠 fold3 顶）----
    put('folds', B(0.38, 0.09, 0.3, -0.38, 1.755, -0.14, M('cream'), 'wd_fold1', 0.02))
    put('folds', B(0.34, 0.08, 0.28, -0.36, 1.84, -0.13, M('velvet'), 'wd_fold2', 0.02))
    put('folds', B(0.36, 0.1, 0.3, 0.4, 1.76, -0.14, M('mailbox'), 'wd_fold3', 0.02))
    put('folds', B(0.32, 0.08, 0.28, 0.38, 1.85, -0.13, M('cream_d'), 'wd_fold4', 0.02))

    # ---- 6) 柜底一双鞋 ----
    put('shoes', B(0.09, 0.1, 0.24, -0.5, 0.08, -0.05, M('shirt'), 'wd_shoeA', 0.02))
    put('shoes', B(0.09, 0.1, 0.24, -0.5, 0.08, 0.09, M('shirt'), 'wd_shoeB', 0.02))

    # ---- 7) 烘修改器后归并（同 b_sofa/b_coffee_table 纪律）----
    def bake(o):
        _unselect()
        o.select_set(True)
        bpy.context.view_layer.objects.active = o
        for md in list(o.modifiers):
            bpy.ops.object.modifier_apply(modifier=md.name)
        return o

    global CUR
    keep, CUR = CUR, None
    merged = []
    for nm, lst in P.items():
        for o in lst:
            bake(o)
        m = join(lst, nm) if len(lst) > 1 else lst[0]
        m.name = f'wd_{nm}' if nm not in ('doorL', 'doorR') else f'part_{nm}'
        merged.append(m)
    CUR = keep
    for m in merged:
        reg(m)

# （旧版 b_dresser/b_desk 已由 2026-09-18 真实抽屉工艺版取代，新定义在本文件更前处）

def b_office_chair():
    reg(CYL(0.26, 0.04, 0, 0.04, 0, M('dark'), 'base', 24))
    for i in range(5):
        a = i / 5 * math.pi * 2
        leg = B(0.2, 0.03, 0.05, math.cos(a) * 0.16, 0.055, math.sin(a) * 0.16, M('dark'), f'leg{i}', 0.008)
        leg.rotation_euler = (0, -a, 0); _apply(leg); reg(leg)
    reg(CYL(0.035, 0.34, 0, 0.23, 0, M('steel'), 'column', 16))
    reg(B(0.46, 0.06, 0.44, 0, 0.42, 0, M('dark'), 'seat', 0.025))
    reg(B(0.44, 0.5, 0.06, 0, 0.7, -0.19, M('dark'), 'back', 0.025))

def b_computer_case():
    # 空心机箱（侧板开门可见内部）+ 前面板/主板/风扇
    HOLLOW(0.2, 0.45, 0.45, 0, 0.225, 0, M('dark'), 'pc_body', t=0.015)
    reg(B(0.17, 0.42, 0.015, 0, 0.225, 0.213, M('dark'), 'pc_front', 0.004))
    reg(B(0.012, 0.3, 0.02, 0.06, 0.3, 0.225, M('led'), 'power_led', 0.002))
    reg(B(0.02, 0.3, 0.28, -0.055, 0.25, 0.0, M('pc_glass'), 'mobo', 0.004))
    fan = CYL(0.06, 0.015, 0.04, 0.32, -0.17, M('steel_dark'), 'fan', 16)
    fan.rotation_euler = (math.pi / 2, 0, 0); _apply(fan); reg(fan)
    reg(join([B(0.015, 0.4, 0.4, 0.1075, 0.23, 0, M('pc_glass'), 'p', 0.004),
              B(0.03, 0.02, 0.02, 0.11, 0.23, 0.19, M('dark'), 'h')], 'part_sidePanel'))
    reg(B(0.015, 0.4, 0.4, -0.1, 0.23, 0, M('dark'), 'sideL', 0.004))

def b_monitor():
    reg(B(0.3, 0.03, 0.2, 0, 0.015, 0, M('dark'), 'foot', 0.008))
    reg(B(0.05, 0.24, 0.05, 0, 0.14, -0.02, M('dark'), 'neck', 0.008))
    reg(B(0.56, 0.34, 0.03, 0, 0.42, 0, M('dark'), 'bezel', 0.006))
    reg(B(0.52, 0.3, 0.012, 0, 0.42, 0.018, M('screen_pc'), 'panel', 0.003))

def b_bookshelf():
    reg(B(0.04, 1.9, 0.32, -0.48, 0.95, 0, M('wood_dark'), 'sideL', 0.006))
    reg(B(0.04, 1.9, 0.32, 0.48, 0.95, 0, M('wood_dark'), 'sideR', 0.006))
    reg(B(1.0, 0.04, 0.32, 0, 1.88, 0, M('wood_dark'), 'top', 0.006))
    shelfY = [0.08, 0.52, 0.96, 1.4]
    for i, y in enumerate(shelfY):
        reg(B(0.92, 0.035, 0.3, 0, y, 0, M('wood'), f'shelf{i}', 0.005))
    # 两排书（与程序化一致：书脊颜色/宽高循环）+ 书脊书名 Vol.N
    bi = 0
    for row in (1, 2):
        yBase = shelfY[row] + 0.018
        x = -0.42
        while x < 0.38:
            w = 0.032 + (bi % 3) * 0.012
            h = 0.24 + ((bi * 7) % 5) * 0.014
            cx3, cy3 = x + w / 2, yBase + h / 2
            book = B(w, h, 0.22, cx3, cy3, 0, M(f'book{bi % 7}'), f'part_book_{bi:02d}', 0.003)
            # 书脊文字：面朝书前(-Y_bl)，自下而上读，略凸出书面
            bpy.ops.object.text_add(location=(cx3, -0.1115, cy3))
            txt = bpy.context.active_object
            txt.data.body = f'Vol.{bi + 1}'
            txt.data.size = 0.013
            txt.data.extrude = 0.0012
            txt.data.align_x = 'CENTER'
            txt.data.align_y = 'CENTER'
            txt.rotation_euler = (0, -math.pi / 2, math.pi / 2)
            bpy.ops.object.convert(target='MESH')   # 文本不能 apply 旋转，先转网格再合并
            txt.data.materials.append(M('paper'))
            reg(join([book, txt], f'part_book_{bi:02d}__bookshelf'))
            x += w + 0.006
            bi += 1

def b_picture_frame():
    fr = join([B(0.4, 0.3, 0.025, 0, 0.15, 0, M('wood_dark'), 'f', 0.006),
               B(0.34, 0.24, 0.008, 0, 0.15, 0.014, M('photo'), 'p', 0.002)], 'part_tilt')
    fr.rotation_euler = (0.13, 0, 0)   # three: rotation.x=-0.13（向后斜靠）
    _apply(fr)
    reg(fr)

def b_chest():
    # 四壁齐全的箱体（顶口开放，盖子盖顶），面对任何方向都有木板
    HOLLOW_TOP(0.62, 0.36, 0.42, 0, 0.18, 0, M('wood'), 'chest_body', t=0.025)
    reg(join([B(0.64, 0.05, 0.44, 0, 0.385, 0, M('wood_light'), 'l', 0.008),
              B(0.1, 0.03, 0.03, 0, 0.37, 0.22, M('dark'), 'h', 0.005)], 'part_lid'))

def b_shelf_unit():
    reg(B(0.05, 1.8, 0.34, -0.46, 0.9, 0, M('wood_dark'), 'sideL', 0.006))
    reg(B(0.05, 1.8, 0.34, 0.46, 0.9, 0, M('wood_dark'), 'sideR', 0.006))
    for i, y in enumerate((0.04, 0.62, 1.2, 1.78)):
        reg(B(0.92, 0.045, 0.32, 0, y, 0, M('wood'), f'shelf{i}', 0.006))
    # 层架上的日常用品（靠背板摆放，前方留出藏匿空间；底面贴合各层板顶）
    # 下层：收纳纸箱
    reg(B(0.24, 0.18, 0.18, -0.28, 0.1525, -0.06, M('card'), 'sbox1', 0.01))
    reg(B(0.2, 0.14, 0.16, -0.02, 0.1325, -0.06, M('card_band'), 'sbox2', 0.01))
    # 中层：洗护瓶×2 + 收纳盒
    reg(CYL(0.045, 0.2, -0.3, 0.7425, -0.09, M('bowl_d'), 'bottle1', 14))
    reg(CYL(0.035, 0.15, -0.2, 0.7175, -0.09, M('gold'), 'bottle2', 14))
    reg(B(0.18, 0.12, 0.14, 0.22, 0.7025, -0.06, M('mailbox'), 'sbox3', 0.01))
    # 上层：卷起的毯子 + 小盒
    roll = CYL(0.07, 0.34, 0.15, 1.2925, -0.07, M('cream'), 'blanket_roll', 16)
    roll.rotation_euler = (0, math.pi / 2, 0); _apply(roll); reg(roll)
    reg(B(0.16, 0.1, 0.12, 0.35, 1.2725, -0.06, M('eraser'), 'sbox4', 0.01))

def b_crate():
    # 开口纸箱：四壁+底（顶部翻盖），内部可藏
    reg(B(0.5, 0.42, 0.02, 0, 0.21, -0.24, M('card'), 'wall_back', 0.006))
    reg(B(0.5, 0.42, 0.02, 0, 0.21, 0.24, M('card'), 'wall_front', 0.006))
    reg(B(0.02, 0.42, 0.46, -0.24, 0.21, 0, M('card'), 'wall_left', 0.006))
    reg(B(0.02, 0.42, 0.46, 0.24, 0.21, 0, M('card'), 'wall_right', 0.006))
    reg(B(0.46, 0.02, 0.46, 0, 0.01, 0, M('card_band'), 'bottom', 0.004))
    for i, (rx, ry, px, py) in enumerate([(-0.28, 0, 0, -0.27), (0.28, 0, 0, 0.27),
                                          (0, 0.28, -0.27, 0), (0, -0.28, 0.27, 0)]):
        flap = B(0.24, 0.015, 0.46 if rx else 0.24, px, 0.425, py, M('card'), f'flap{i}', 0.004)
        flap.rotation_euler = (0, -rx * 1.2, -ry * 1.2)
        _apply(flap); reg(flap)

def b_bench():
    for sx in (-1, 1):
        for sz in (-1, 1):
            reg(B(0.07, 0.42, 0.07, sx * 0.68, 0.21, sz * 0.17, M('wood_dark'), f'leg{sx}{sz}', 0.008))
    reg(B(1.55, 0.06, 0.5, 0, 0.45, 0, M('wood'), 'seat', 0.012))
    reg(B(1.55, 0.5, 0.06, 0, 0.73, -0.22, M('wood'), 'back', 0.012))
    reg(B(1.55, 0.06, 0.06, 0, 0.95, -0.22, M('wood'), 'backtop', 0.012))

def b_mailbox():
    reg(CYL(0.05, 1.0, 0, 0.5, 0, M('wood_dark'), 'post', 16))
    HOLLOW(0.26, 0.24, 0.4, 0, 1.12, 0, M('mailbox'), 'mb_body', t=0.015)
    reg(join([B(0.24, 0.2, 0.03, 0, 1.12, 0.2, M('mailbox_d'), 'd', 0.008),
              B(0.03, 0.06, 0.03, 0.08, 1.12, 0.225, M('dark'), 'h', 0.005)], 'part_door'))

def b_flowerbed():
    reg(B(1.7, 0.28, 0.06, 0, 0.14, -0.42, M('wood_dark'), 'railN', 0.008))
    reg(B(1.7, 0.28, 0.06, 0, 0.14, 0.42, M('wood_dark'), 'railS', 0.008))
    reg(B(0.06, 0.28, 0.9, -0.82, 0.14, 0, M('wood_dark'), 'railW', 0.008))
    reg(B(0.06, 0.28, 0.9, 0.82, 0.14, 0, M('wood_dark'), 'railE', 0.008))
    reg(B(1.58, 0.06, 0.78, 0, 0.24, 0, M('soil'), 'soil', 0.006))
    for i in range(7):
        fx = -0.6 + i * 0.2
        reg(SPH(0.07, fx, 0.36, 0.14 if i % 2 else -0.12, M(f'flower{(i % 3) + 1}'), f'fl{i}', 10, 8))
        reg(CYL(0.012, 0.09, fx, 0.29, 0.14 if i % 2 else -0.12, M('leaf2'), f'st{i}', 8))

# ---- M15 新增家具 ----
def b_shoe_cabinet():
    # 空心柜体 + 中隔板 + 几双鞋
    HOLLOW(0.9, 1.1, 0.35, 0, 0.55, 0, M('wood_light'), 'shoe_body', t=0.02)
    reg(B(0.82, 0.02, 0.27, 0, 0.42, 0, M('wood_dark'), 'shoe_shelf', 0.004))
    reg(join([B(0.86, 1.04, 0.03, 0, 0.55, 0.175, M('wood'), 'd', 0.006),
              B(0.03, 0.12, 0.025, 0.3, 0.55, 0.2, M('dark'), 'h', 0.004)], 'part_door'))
    for i, (sx, mname, rot) in enumerate([(-0.36, 'shirt', 0.06), (-0.27, 'dark', -0.04),
                                          (0.24, 'mailbox', 0.03), (0.34, 'eraser', -0.05)]):
        s = B(0.09, 0.07, 0.2, sx, 0.055, 0.02, M(mname), f'shoe{i}', 0.015)
        s.rotation_euler = (0, rot, 0); _apply(s); reg(s)

def b_side_table():
    reg(CYL(0.24, 0.04, 0, 0.42, 0, M('wood'), 'top', 24))
    for i in range(3):
        a = i / 3 * math.pi * 2
        reg(CYL(0.016, 0.42, math.cos(a) * 0.17, 0.21, math.sin(a) * 0.17, M('wood_dark'), f'leg{i}', 12))
    reg(CYL(0.19, 0.015, 0, 0.14, 0, M('wood'), 'shelf', 20))

def b_wall_cabinet():
    # 空心柜体 + 中层隔板（上下两层）+ 两层调料
    HOLLOW(1.0, 0.7, 0.33, 0, 0.35, 0, M('white'), 'cab_body', t=0.02)
    reg(B(0.92, 0.02, 0.3, 0, 0.33, 0, M('wood_light'), 'cab_shelf', 0.004))
    reg(join([B(0.94, 0.64, 0.028, 0, 0.35, 0.165, M('wood_light'), 'd', 0.006),
              B(0.1, 0.025, 0.025, 0.38, 0.35, 0.19, M('dark'), 'h', 0.004)], 'part_door'))
    # 下层调料（靠背板，前区留给藏匿物品）
    reg(CYL(0.032, 0.2, -0.3, 0.12, -0.12, M('dark'), 'soy', 14))
    reg(CYL(0.015, 0.02, -0.3, 0.23, -0.12, M('dark'), 'soy_cap', 10))
    reg(CYL(0.03, 0.18, -0.22, 0.11, -0.12, M('gold'), 'oil', 14))
    reg(CYL(0.045, 0.08, 0.28, 0.06, -0.12, M('fruit2'), 'jar', 14))
    reg(CYL(0.047, 0.015, 0.28, 0.105, -0.12, M('gold'), 'jar_lid', 14))
    # 上层调料
    reg(B(0.06, 0.09, 0.05, -0.25, 0.385, -0.12, M('paper'), 'salt', 0.006))
    reg(CYL(0.035, 0.1, 0.05, 0.39, -0.12, M('bowl_d'), 'spice', 12))
    reg(CYL(0.037, 0.012, 0.05, 0.446, -0.12, M('wood_dark'), 'spice_lid', 12))
    reg(CYL(0.03, 0.16, 0.3, 0.42, -0.12, M('gold'), 'oil2', 14))

# （旧版 b_file_cabinet 已由 2026-09-18 真实抽屉工艺版取代，新定义在本文件更前处）

def b_kettle():
    # 台面水壶（独立装饰件，可被瞄准命名）
    reg(CYL(0.085, 0.16, 0, 0.08, 0, M('steel'), 'body', 20))
    reg(CYL(0.05, 0.02, 0, 0.17, 0, M('steel_dark'), 'lid', 16))
    sp = CYL(0.014, 0.1, -0.08, 0.09, 0.06, M('steel'), 'spout', 10)
    sp.rotation_euler = (0, 0, math.pi / 4); _apply(sp); reg(sp)
    reg(TORUS(0.06, 0.008, 0.09, 0.12, 0, M('dark'), 'handle', rot_bl=(math.pi / 2, 0, 0)))

def b_board():
    reg(B(0.35, 0.018, 0.25, 0, 0.009, 0, M('wood_light'), 'board', 0.006))

def b_bean_bag():
    o = SPH(0.45, 0, 0.31, 0, M('teddy'), 'bag', 24, 18)
    o.scale = (1.0, 0.72, 1.0); _apply(o); reg(o)
    reg(SPH(0.09, 0, 0.6, 0, M('teddy_d'), 'knot', 12, 10))

def b_backpack():
    # 开口书包：四壁+底（顶部开口），内部可藏
    reg(B(0.28, 0.36, 0.02, 0, 0.18, -0.06, M('shirt'), 'bp_back', 0.03))
    reg(B(0.28, 0.36, 0.02, 0, 0.18, 0.06, M('shirt'), 'bp_front', 0.03))
    reg(B(0.02, 0.36, 0.14, -0.13, 0.18, 0, M('shirt'), 'bp_left', 0.02))
    reg(B(0.02, 0.36, 0.14, 0.13, 0.18, 0, M('shirt'), 'bp_right', 0.02))
    reg(B(0.24, 0.02, 0.1, 0, 0.01, 0, M('shirt'), 'bp_bottom', 0.006))
    reg(B(0.2, 0.14, 0.03, 0, 0.12, 0.085, M('mailbox'), 'pocket', 0.02))
    reg(B(0.05, 0.3, 0.02, -0.08, 0.2, -0.08, M('dark'), 'strapL', 0.008))
    reg(B(0.05, 0.3, 0.02, 0.08, 0.2, -0.08, M('dark'), 'strapR', 0.008))
    reg(CYL(0.05, 0.03, 0, 0.375, 0, M('dark'), 'handle', 12))

def b_bucket():
    reg(TUBE(0.16, 0.13, 0.3, 0, 0.15, 0, M('steel_dark'), 'wall', 20))
    reg(CYL(0.128, 0.012, 0, 0.02, 0, M('dark'), 'bottom', 20))
    reg(TORUS(0.14, 0.008, 0, 0.3, 0, M('steel'), 'handle', rot_bl=(math.pi / 2, 0, 0)))

def b_planter():
    reg(CONE(0.24, 0.3, 0.42, 0, 0.21, 0, M('pot'), 'pot', 24))
    reg(CYL(0.28, 0.03, 0, 0.405, 0, M('soil'), 'soil', 24))
    reg(CYL(0.03, 0.4, 0, 0.6, 0, M('bark'), 'stem', 12))
    reg(DISPLACED_SPH(0.24, 0, 0.85, 0, M('leaf1'), 'leaf1', 0.15, seed=5))
    reg(DISPLACED_SPH(0.16, 0.12, 0.7, 0.08, M('leaf2'), 'leaf2', 0.17, seed=9))

# 文件名 -> 构建函数
PIECE_BUILDERS = {
    'sofa': b_sofa, 'coffee_table': b_coffee_table, 'tv_cabinet': b_tv_cabinet, 'tv': b_tv,
    'carpet': lambda: b_carpet(), 'rug_small': lambda: b_carpet(1.6, 1.0, 'rug_small'),
    'plant': b_plant, 'floor_lamp': b_floor_lamp, 'armchair': b_armchair,
    'counter': b_counter, 'fridge': b_fridge, 'dining_table': b_dining_table, 'chair': b_chair,
    'cup': b_cup, 'fruit_bowl': b_fruit_bowl, 'microwave': b_microwave, 'trash_bin': b_trash_bin,
    'bed': b_bed, 'nightstand': b_nightstand, 'wardrobe': b_wardrobe, 'dresser': b_dresser,
    'desk': b_desk, 'office_chair': b_office_chair, 'computer_case': b_computer_case,
    'monitor': b_monitor, 'bookshelf': b_bookshelf, 'picture_frame': b_picture_frame,
    'chest': b_chest, 'shelf_unit': b_shelf_unit, 'crate': b_crate, 'bench': b_bench,
    'mailbox': b_mailbox, 'flowerbed': b_flowerbed,
    'shoe_cabinet': b_shoe_cabinet, 'side_table': b_side_table, 'wall_cabinet': b_wall_cabinet,
    'file_cabinet': b_file_cabinet, 'bean_bag': b_bean_bag, 'backpack': b_backpack,
    'kettle': b_kettle, 'board': b_board,
    'bucket': b_bucket, 'planter': b_planter,
    # 健身房（2026-09-18 首次建模，此前只有方块兜底无 GLB）
    'treadmill': b_treadmill, 'fly_machine': b_flymachine,
    'dumbbell_rack': b_dumbbellrack, 'yoga_mat': b_yogamat,
}

# ---------------------------------------------------------------- 别墅结构（villa.glb，世界坐标）
def wall_v(key, axis, at, from_, to_, thickness, mat, openings=(), yBase=0, height=None):
    """带开口的墙（视觉版，无碰撞——碰撞由游戏端 villa.js 负责）；yBase=墙底高度，
    height=墙顶高度（相对 yBase，默认 WALL_H 全高）"""
    top = WALL_H if height is None else height
    segs, cur = [], from_
    for op in sorted(openings, key=lambda o: o['at']):
        a0, a1 = op['at'] - op['w'] / 2, op['at'] + op['w'] / 2
        if a0 > cur: segs.append((cur, a0, 0, top))
        y0, y1 = op.get('y0', 0), op.get('y1', top)
        if y0 > 0: segs.append((a0, a1, 0, y0))
        if y1 < top: segs.append((a0, a1, y1, top))
        cur = a1
    if cur < to_: segs.append((cur, to_, 0, top))
    objs = []
    for i, (a, b, y0, y1) in enumerate(segs):
        if b - a <= 0.002: continue
        mid, sy = (a + b) / 2, y1 - y0
        cy = yBase + (y0 + y1) / 2
        if axis == 'x':
            objs.append(reg(B(b - a, sy, thickness, mid, cy, at, mat, f'{key}_seg{i}', 0.008)))
        else:
            objs.append(reg(B(thickness, sy, b - a, at, cy, mid, mat, f'{key}_seg{i}', 0.008)))
    return objs

def window_v(key, axis, at, at_along, w, y0, y1, ext, yBase=0):
    """窗：玻璃+边框+中梃+窗台板（视觉）"""
    gy = yBase + (y0 + y1) / 2
    y0a, y1a = yBase + y0, yBase + y1
    o = []
    if axis == 'x':
        o.append(reg(B(w - 0.1, y1a - y0a - 0.1, 0.02, at_along, gy, at, M('glass'), f'{key}_glass', 0)))
        o.append(reg(B(w, 0.06, EXT_T + 0.06, at_along, y0a + 0.03, at, M('frame'), f'{key}_fb', 0.004)))
        o.append(reg(B(w, 0.06, EXT_T + 0.06, at_along, y1a - 0.03, at, M('frame'), f'{key}_ft', 0.004)))
        o.append(reg(B(0.06, y1a - y0a, EXT_T + 0.06, at_along - w / 2 + 0.03, gy, at, M('frame'), f'{key}_fl', 0.004)))
        o.append(reg(B(0.06, y1a - y0a, EXT_T + 0.06, at_along + w / 2 - 0.03, gy, at, M('frame'), f'{key}_fr', 0.004)))
        o.append(reg(B(0.05, y1a - y0a, EXT_T + 0.02, at_along, gy, at, M('frame'), f'{key}_mullion', 0.003)))
        o.append(reg(B(w + 0.12, 0.045, EXT_T + 0.14, at_along, y0a - 0.022, at, M('trim'), f'{key}_sill', 0.008)))
    else:
        o.append(reg(B(0.02, y1a - y0a - 0.1, w - 0.1, at, gy, at_along, M('glass'), f'{key}_glass', 0)))
        o.append(reg(B(EXT_T + 0.06, 0.06, w, at, y0a + 0.03, at_along, M('frame'), f'{key}_fb', 0.004)))
        o.append(reg(B(EXT_T + 0.06, 0.06, w, at, y1a - 0.03, at_along, M('frame'), f'{key}_ft', 0.004)))
        o.append(reg(B(EXT_T + 0.06, y1a - y0a, 0.06, at, gy, at_along - w / 2 + 0.03, M('frame'), f'{key}_fl', 0.004)))
        o.append(reg(B(EXT_T + 0.06, y1a - y0a, 0.06, at, gy, at_along + w / 2 - 0.03, M('frame'), f'{key}_fr', 0.004)))
        o.append(reg(B(EXT_T + 0.02, y1a - y0a, 0.05, at, gy, at_along, M('frame'), f'{key}_mullion', 0.003)))
        o.append(reg(B(EXT_T + 0.14, 0.045, w + 0.12, at, y0a - 0.022, at_along, M('trim'), f'{key}_sill', 0.008)))
    return o

def door_leaf_v(key, axis, at, at_along, w, y1, open_angle=1.9):
    """半开木门扇（装饰）"""
    hx = at_along - w / 2 if axis == 'x' else at
    hz = at if axis == 'x' else at_along - w / 2
    leaf = B(w - 0.08, y1 - 0.06, 0.05, 0, 0, 0, M('door_leaf'), f'{key}_leaf', 0.008)
    knob = SPH(0.028, (w - 0.08) - 0.09, (y1 - 0.06) * 0.48, 0.045, M('gold'), f'{key}_knob', 12, 8)
    g = join([leaf, knob], f'{key}_grp')
    base = 0 if axis == 'x' else -math.pi / 2
    g.rotation_euler = (0, 0, base + open_angle)   # three绕Y -> blender绕Z 同号
    g.location = T(hx, 0, hz)
    _apply(g)
    reg(g)
    return g

def room_trim(key, r):
    """石膏线+踢脚线（跳过门洞，与 realism.js 一致）"""
    INSET, MOLD_H, BASE_H = 0.05, 0.1, 0.12
    DOOR_GAPS = [
        ('x', 0, -3.75 - 0.55, -3.75 + 0.55), ('x', 0, 3.75 - 0.55, 3.75 + 0.55),
        ('z', 0, -3 - 0.7, -3 + 0.7), ('z', 0, 3 - 0.55, 3 + 0.55),
        ('z', -7.5, -2.5 - 0.6, -2.5 + 0.6),
    ]
    def run(axis, at, from_, to_, y, h, depth, dirn, tag):
        segs, cur = [], from_
        gaps = sorted([g for g in DOOR_GAPS if g[0] == axis and abs(g[1] - at) < 0.14], key=lambda g: g[2])
        for _, _, g0, g1 in gaps:
            if g0 > cur: segs.append((cur, min(g0, to_)))
            cur = max(cur, g1)
        if cur < to_: segs.append((cur, to_))
        for i, (a, b) in enumerate(segs):
            if b - a < 0.05: continue
            mid, ln = (a + b) / 2, b - a
            if axis == 'x':
                reg(B(ln, h, depth, mid, y, at + dirn * (depth / 2 + 0.01), M('trim'), f'{key}_{tag}{i}', 0.004))
            else:
                reg(B(depth, h, ln, at + dirn * (depth / 2 + 0.01), y, mid, M('trim'), f'{key}_{tag}{i}', 0.004))
    for side, (axis, at, dirn) in enumerate([
            ('x', r['minZ'] + INSET, 1), ('x', r['maxZ'] - INSET, -1),
            ('z', r['minX'] + INSET, 1), ('z', r['maxX'] - INSET, -1)]):
        rng = (r['minX'], r['maxX']) if axis == 'x' else (r['minZ'], r['maxZ'])
        run(axis, at, rng[0], rng[1], WALL_H - MOLD_H / 2 - 0.02, MOLD_H, 0.06, dirn, f'mold{side}')
        run(axis, at, rng[0], rng[1], BASE_H / 2, BASE_H, 0.04, dirn, f'base{side}')
    # 灯槽发光带（厨房北边灯槽避开楼梯井，不再横穿楼梯）
    in2 = 0.22
    cx, cz = (r['minX'] + r['maxX']) / 2, (r['minZ'] + r['maxZ']) / 2
    cove_edges = [
        ('x', r['maxX'] - r['minX'] - in2 * 2, cx, r['minZ'] + in2),
        ('x', r['maxX'] - r['minX'] - in2 * 2, cx, r['maxZ'] - in2),
        ('z', r['maxZ'] - r['minZ'] - in2 * 2, r['minX'] + in2, cz),
        ('z', r['maxZ'] - r['minZ'] - in2 * 2, r['maxX'] - in2, cz),
    ]
    cove_skip = {'kitchen': [(0.0, 99.0)]}.get(r['id'])   # 厨房北边整条不做灯槽（楼梯井）
    for i, (axis, ln, pc, at) in enumerate(cove_edges):
        segs = [(pc - ln / 2, pc + ln / 2)]
        if cove_skip and i == 0 and axis == 'x':
            segs, cur = [], cove_skip and segs[0][0]
            for a, b in cove_skip:
                if a > cur: segs.append((cur, min(a, pc + ln / 2)))
                cur = max(cur, b)
            if cur < pc + ln / 2: segs.append((cur, pc + ln / 2))
        for j, (a, b) in enumerate(segs):
            if axis == 'x':
                reg(B(b - a, 0.035, 0.04, (a + b) / 2, WALL_H - 0.12, at, M('cove'), f'{key}_cove{i}_{j}', 0))
            else:
                reg(B(0.04, 0.035, b - a, at, WALL_H - 0.12, (a + b) / 2, M('cove'), f'{key}_cove{i}_{j}', 0))

def curtain_v(key, axis, wall_at, dirn, center_at, w=1.4, spread=0.65, shift=0):
    rodY, off = 2.32, 0.14 + 0.05
    c = center_at + shift
    rod_len = w + 0.6 + abs(shift)
    if axis == 'x':
        rod = CYL(0.018, rod_len, c, rodY, wall_at + dirn * off, M('metal_arm'), f'{key}_rod', 12)
        rod.rotation_euler = (0, math.pi / 2, 0); _apply(rod); reg(rod)
    else:
        rod = CYL(0.018, rod_len, wall_at + dirn * off, rodY, c, M('metal_arm'), f'{key}_rod', 12)
        rod.rotation_euler = (math.pi / 2, 0, 0); _apply(rod); reg(rod)
    for side in (-1, 1):
        bpy.ops.mesh.primitive_grid_add(x_subdivisions=28, y_subdivisions=2, size=1,
                                        location=(0, 0, 0))
        o = bpy.context.active_object
        o.name = f'{key}_panel{side}'
        o.scale = (0.42, 2.1, 1)
        _apply(o)
        for v in o.data.vertices:
            lx = v.co.x
            v.co.z += math.sin(lx * 88 + side * 2) * 0.05 + math.sin(lx * 36) * 0.03
        m = o.modifiers.new('Solidify', 'SOLIDIFY'); m.thickness = 0.01
        _unselect(); o.select_set(True); bpy.context.view_layer.objects.active = o
        bpy.ops.object.modifier_apply(modifier='Solidify')
        o.data.materials.append(M('curtain'))
        # 摆位：three 坐标 —— 垂直面
        if axis == 'x':
            o.rotation_euler = (0, 0, 0)   # blender默认面朝+Z(three +Y? 需面朝z向) -> 面法线沿blender Y
            o.rotation_euler = (math.pi / 2, 0, 0)  # 竖起来：grid在XY面，转X90 -> XZ面(法线Y)
            o.location = T(c + side * spread, rodY - 1.08, wall_at + dirn * (off + 0.05))
        else:
            o.rotation_euler = (math.pi / 2, 0, math.pi / 2)
            o.location = T(wall_at + dirn * (off + 0.05), rodY - 1.08, c + side * spread)
        _apply(o)
        reg(o)

def chandelier_v(key, x, y, z):
    reg(CYL(0.012, 0.5, x, y + 0.25, z, M('metal_arm'), f'{key}_stem', 8))
    reg(TORUS(0.3, 0.014, x, y, z, M('metal_arm'), f'{key}_ring'))
    for i in range(6):
        a = i / 6 * math.pi * 2
        bx, bz = math.cos(a) * 0.3, math.sin(a) * 0.3
        reg(SPH(0.075, x + bx, y - 0.06 - (i % 2) * 0.09, z + bz, M('bulb'), f'{key}_b{i}', 12, 10))
        reg(CYL(0.006, 0.14, x + bx, y + 0.02, z + bz, M('metal_arm'), f'{key}_s{i}', 6))

def bubble_lamp_v(key, x, y, z):
    arm = M('metal_arm')
    for i, (bx, bz, r) in enumerate([(-0.22, -0.34, 0.09), (0.1, -0.15, 0.07), (-0.05, 0.05, 0.12),
                                     (0.24, 0.18, 0.06), (-0.2, 0.3, 0.08)]):
        dropH = 0.3 + abs(bx) + abs(bz)
        reg(CYL(0.004, dropH, x + bx, y + dropH / 2, z + bz, arm, f'{key}_d{i}', 6))
        reg(SPH(r, x + bx, y, z + bz, M('bulb'), f'{key}_b{i}', 12, 10))

def wainscot_v(key, axis, at, dirn, from_, to_):
    y0, y1, t, depth = 0.98, 2.02, 0.035, 0.028
    ln, mid = to_ - from_, (from_ + to_) / 2
    def put(w, h, off, offy, i):
        if axis == 'x':
            reg(B(w, h, depth, off, offy, at + dirn * (0.05 + depth / 2 - 0.005), M('trim'), f'{key}_w{i}', 0.004))
        else:
            reg(B(depth, h, w, at + dirn * (0.05 + depth / 2 - 0.005), offy, off, M('trim'), f'{key}_w{i}', 0.004))
    put(ln, t, mid, y0, 0); put(ln, t, mid, y1, 1)
    put(t, y1 - y0, from_ + t / 2, (y0 + y1) / 2, 2); put(t, y1 - y0, to_ - t / 2, (y0 + y1) / 2, 3)

def build_villa_v():
    win = lambda at: {'at': at, 'w': 1.4, 'y0': 0.95, 'y1': 2.15}
    door = lambda at, **ex: dict({'at': at, 'w': 1.05, 'y1': 2.15}, **ex)
    # 外墙（北墙厨房侧不留窗：楼梯贴墙而上，窗被台阶穿过）
    wall_v('wallN', 'x', -5.5 - EXT_T / 2, -7.62, 7.62, EXT_T, M('stucco_ext'), [win(-3.75)])
    wall_v('wallS', 'x', 5.5 + EXT_T / 2, -7.62, 7.62, EXT_T, M('stucco_ext'), [win(-3.75), win(3.75)])
    wall_v('wallW', 'z', -7.5 - EXT_T / 2, -5.5, 5.5, EXT_T, M('stucco_ext'), [win(-4.3), door(-2.5, doorLeaf=True)])
    wall_v('wallE', 'z', 7.5 + EXT_T / 2, -5.5, 5.5, EXT_T, M('stucco_ext'), [win(-2.75), win(2.75)])
    # 内墙
    wall_v('wallX1', 'x', 0, -7.5, 7.5, INT_T, M('paint_int'), [door(-3.75), door(3.75)])
    wall_v('wallZ1', 'z', 0, -5.5, 5.5, INT_T, M('paint_int'), [{'at': -3, 'w': 1.4, 'y1': 2.15}, door(3)])
    # 窗（北墙仅客厅侧一扇）
    window_v('winN1', 'x', -5.5 - EXT_T / 2, -3.75, 1.4, 0.95, 2.15, True)
    window_v('winS1', 'x', 5.5 + EXT_T / 2, -3.75, 1.4, 0.95, 2.15, True)
    window_v('winS2', 'x', 5.5 + EXT_T / 2, 3.75, 1.4, 0.95, 2.15, True)
    window_v('winW1', 'z', -7.5 - EXT_T / 2, -4.3, 1.4, 0.95, 2.15, True)
    window_v('winE1', 'z', 7.5 + EXT_T / 2, -2.75, 1.4, 0.95, 2.15, True)
    window_v('winE2', 'z', 7.5 + EXT_T / 2, 2.75, 1.4, 0.95, 2.15, True)
    # 正门门扇（半开）
    door_leaf_v('frontdoor', 'z', -7.5 - EXT_T / 2, -2.5, 1.05, 2.2, 1.9)
    # 拱形门洞填充
    AW, SPRING, ATOP = 0.7, 1.75, 2.15
    RY = ATOP - SPRING
    u = -0.65
    i = 0
    while u <= 0.66:
        yTop = SPRING + RY * math.sqrt(max(0, 1 - (u / AW) ** 2))
        if yTop < ATOP - 0.004:
            reg(B(INT_T, ATOP - yTop, 0.095, 0, (yTop + ATOP) / 2, -3 + u, M('paint_int'), f'arch{i}', 0.006))
            i += 1
        u += 0.09
    # 地板
    for r in ROOMS:
        w, d = r['maxX'] - r['minX'], r['maxZ'] - r['minZ']
        cx, cz = (r['minX'] + r['maxX']) / 2, (r['minZ'] + r['maxZ']) / 2
        if r['id'] == 'kitchen':
            f = PLANE(w, d, cx, 0.012, cz, M('floor_tile'), f"floor_{r['id']}", uv_scale=(w / 0.6, d / 0.6))
        else:
            f = PLANE(w, d, cx, 0.012, cz, M('floor_wood'), f"floor_{r['id']}", uv_scale=(w / 2.2, d / 2.2))
        reg(f)
    # 天花板（法线朝下；楼梯井上方开洞与二楼楼板楼梯口对齐，
    # 否则从楼下仰望楼梯像被吊顶/二楼地面封死）。
    # 洞口覆盖楼梯全程头部空间：x≥2.9 处台阶上人眼已越过吊顶面
    hx0, hx1, hz0, hz1 = 2.9, 6.5, -5.5, -4.55   # 楼梯井洞口（与二楼楼板楼梯口对齐）
    ceiling_parts = [
        (-7.7, 7.7, -5.7, hz0),        # 北窄条
        (-7.7, hx0, hz0, hz1),         # 洞西侧
        (hx1, 7.7, hz0, hz1),          # 洞东侧
        (-7.7, 7.7, hz1, 5.7),         # 南大部
    ]
    for i, (x0, x1, z0, z1) in enumerate(ceiling_parts):
        bpy.ops.mesh.primitive_plane_add(size=1, location=T((x0 + x1) / 2, WALL_H - 0.03, (z0 + z1) / 2))
        c = bpy.context.active_object
        c.scale = (x1 - x0, z1 - z0, 1)
        c.rotation_euler = (math.pi, 0, 0)
        c.name = f'ceiling{i}'
        c.data.materials.append(M('ceil'))
        _apply(c)
        reg(c)
    # 门廊台阶
    reg(B(1.6, 0.12, 1.6, -7.9, 0.06, -2.5, M('stone'), 'porch', 0.01))
    # 细部：石膏线/踢脚线/灯槽
    for r in ROOMS:
        room_trim(f"trim_{r['id']}", r)
    # 护墙板
    wainscot_v('wp1', 'x', 0, -1, -7.3, -4.5)
    wainscot_v('wp2', 'x', 0, -1, -3.0, -0.4)
    wainscot_v('wp3', 'x', 5.5, -1, -6.9, -4.7)
    wainscot_v('wp4', 'x', 5.5, -1, -2.8, -0.6)
    wainscot_v('wp5', 'z', -7.5, 1, 0.6, 2.2)
    # 窗帘
    curtain_v('cur1', 'x', -5.5, 1, -3.75)
    curtain_v('cur2', 'x', 5.5, -1, -3.75, 1.4, 0.85)
    curtain_v('cur3', 'x', 5.5, -1, 3.75, 1.4, 0.85)
    curtain_v('cur4', 'z', 7.5, -1, -2.75, 1.4, 0.28, 0.85)
    curtain_v('cur5', 'z', 7.5, -1, 2.75)
    curtain_v('cur6', 'z', -7.5, 1, -4.3)
    curtain_v('cur7', 'z', -7.5, 1, 2.75)
    # 相片墙
    frames = [(-6.9, 1.72, 0.42, 0.52, 'art1'), (-6.3, 1.86, 0.3, 0.24, 'art2'),
              (-5.75, 1.66, 0.36, 0.44, 'art3'), (-5.1, 1.82, 0.26, 0.34, 'art4'),
              (-4.62, 1.62, 0.4, 0.3, 'art5')]
    for i, (fx, fy, w, h, art) in enumerate(frames):
        reg(B(w + 0.05, h + 0.05, 0.03, fx, fy, -0.1, M('wood_dark'), f'pw{i}f', 0.005))
        reg(B(w, h, 0.012, fx, fy, -0.082, M(art), f'pw{i}a', 0.002))
    # 吊灯
    chandelier_v('chand', -3.75, WALL_H - 0.62, -2.75)
    bubble_lamp_v('bub', 3.4, WALL_H - 0.55, -2.3)
    # 厨房挡水板（止于窗缘，不遮挡东窗）
    reg(B(0.03, 0.6, 1.4, 7.5 - 0.05 - 0.015, 1.2, -4.2, M('trim'), 'backsplash', 0.004))
    # ---- 装饰小物（增加生活气息，无碰撞）——水壶/砧板已升级为独立家具件 ----
    # 客厅北墙：挂钟
    rim = CYL(0.16, 0.03, -2.0, 2.2, -5.44, M('wood_dark'), 'clock_rim', 24)
    rim.rotation_euler = (math.pi / 2, 0, 0); _apply(rim); reg(rim)
    face = CYL(0.145, 0.012, -2.0, 2.2, -5.432, M('white'), 'clock_face', 24)
    face.rotation_euler = (math.pi / 2, 0, 0); _apply(face); reg(face)
    reg(B(0.01, 0.09, 0.008, -2.0, 2.23, -5.424, M('dark'), 'clock_h1', 0.002))
    reg(B(0.06, 0.01, 0.008, -2.03, 2.2, -5.424, M('dark'), 'clock_h2', 0.002))
    # 客厅茶几：书堆
    for i, (bw, bd, rot) in enumerate([(0.24, 0.17, 0.06), (0.22, 0.16, -0.12), (0.2, 0.15, 0.2)]):
        bk = B(bw, 0.035, bd, -5.68, 0.472 + i * 0.036, -1.82, M(f'book{(i * 2) % 7}'), f'bookstack{i}', 0.004)
        bk.rotation_euler = (0, rot, 0); _apply(bk); reg(bk)
    # 卧室床头柜：花瓶
    reg(CYL(0.035, 0.1, -7.25, 0.58, 4.45, M('ceramic'), 'vase', 16))
    reg(SPH(0.05, -7.25, 0.66, 4.45, M('flower1'), 'vase_fl', 12, 10))
    # 主卧床头柜：闹钟
    reg(B(0.12, 0.07, 0.05, -7.28, 3.715, 4.45, M('dark'), 'alarm', 0.008))
    reg(B(0.09, 0.04, 0.008, -7.28, 3.72, 4.477, M('screen_pc'), 'alarm_face', 0.002))

ROOMS = [
    {'id': 'living', 'minX': -7.5, 'maxX': 0, 'minZ': -5.5, 'maxZ': 0},
    {'id': 'kitchen', 'minX': 0, 'maxX': 7.5, 'minZ': -5.5, 'maxZ': 0},
    {'id': 'bedroom', 'minX': -7.5, 'maxX': 0, 'minZ': 0, 'maxZ': 5.5},
    {'id': 'study', 'minX': 0, 'maxX': 7.5, 'minZ': 0, 'maxZ': 5.5},
]

# ---------------------------------------------------------------- 二楼+屋顶（并入 villa.glb）
def build_upper_v():
    # 二楼外墙（yBase=F2）
    wall_v('u_wallN', 'x', -5.5 - EXT_T / 2, -7.62, 7.62, EXT_T, M('stucco_ext'),
           [{'at': -3.75, 'w': 1.4, 'y0': 0.95, 'y1': 2.15}], yBase=F2)
    wall_v('u_wallS', 'x', 5.5 + EXT_T / 2, -7.62, 7.62, EXT_T, M('stucco_ext'),
           [{'at': 3.75, 'w': 1.4, 'y0': 0.95, 'y1': 2.15}], yBase=F2)
    wall_v('u_wallW', 'z', -7.5 - EXT_T / 2, -5.5, 5.5, EXT_T, M('stucco_ext'),
           [{'at': -2.75, 'w': 1.4, 'y0': 0.95, 'y1': 2.15}], yBase=F2)
    wall_v('u_wallE', 'z', 7.5 + EXT_T / 2, -5.5, 5.5, EXT_T, M('stucco_ext'),
           [{'at': 2.75, 'w': 1.4, 'y0': 0.95, 'y1': 2.15}], yBase=F2)
    # 二楼窗
    window_v('u_winN', 'x', -5.5 - EXT_T / 2, -3.75, 1.4, 0.95, 2.15, True, yBase=F2)
    window_v('u_winS', 'x', 5.5 + EXT_T / 2, 3.75, 1.4, 0.95, 2.15, True, yBase=F2)
    window_v('u_winW', 'z', -7.5 - EXT_T / 2, -2.75, 1.4, 0.95, 2.15, True, yBase=F2)
    window_v('u_winE', 'z', 7.5 + EXT_T / 2, 2.75, 1.4, 0.95, 2.15, True, yBase=F2)
    # 二楼内墙
    wall_v('u_wallX', 'x', 0, -7.5, 7.5, INT_T, M('paint_int'),
           [{'at': -3.75, 'w': 1.05, 'y1': 2.15}, {'at': 3.75, 'w': 1.05, 'y1': 2.15}], yBase=F2)
    wall_v('u_wallZ', 'z', 0, -5.5, 5.5, INT_T, M('paint_int'),
           [{'at': -3, 'w': 1.05, 'y1': 2.15}, {'at': 3, 'w': 1.05, 'y1': 2.15}], yBase=F2)
    # 楼板
    quads = [(-7.5, 0, -5.5, 0), (0, 7.5, -4.55, 0), (-7.5, 0, 0, 5.5), (0, 7.5, 0, 5.5)]
    for i, (x0, x1, z0, z1) in enumerate(quads):
        reg(B(x1 - x0, 0.25, z1 - z0, (x0 + x1) / 2, F2 - 0.125, (z0 + z1) / 2, M('slab'), f'u_slab{i}', 0.008))
    # 二楼地板（储物间避楼梯口分两块）
    f2rooms = [('lounge2', -7.5, 0, -5.5, 0), ('storage_a', 0, 7.5, -4.55, 0),
               ('master', -7.5, 0, 0, 5.5), ('kids', 0, 7.5, 0, 5.5)]
    for name, x0, x1, z0, z1 in f2rooms:
        f = PLANE(x1 - x0, z1 - z0, (x0 + x1) / 2, F2 + 0.021, (z0 + z1) / 2,
                  M('floor2_wood'), f'u_floor_{name}', uv_scale=((x1 - x0) / 1.2, (z1 - z0) / 1.2))
        reg(f)
    # 楼梯井北侧的层间封带（F1墙顶2.9与F2墙底3.15之间的外墙空隙，
    # 覆盖整个楼梯井洞口 x 2.9..6.5，否则上楼梯左手边能看到一条缝）
    reg(B(3.75, 0.25, 0.24, 4.725, 3.025, -5.62, M('stucco_ext'), 'stairwell_band', 0.006))
    # 楼梯口平台补板
    reg(B(1.0, 0.25, 0.95, 7.0, F2 - 0.125, -5.02, M('slab'), 'u_slab_gate', 0.008))
    # 楼梯
    STEPS, RISE, TREAD = 18, F2 / 18, 0.29
    for i in range(STEPS):
        reg(B(TREAD + 0.02, (i + 1) * RISE, 0.9, 1.2 + i * TREAD + TREAD / 2, (i + 1) * RISE / 2, -5.02,
              M('floor2_wood'), f'stair{i}', 0.006))
    # 侧栏立柱（高度逐根计算，柱顶嵌入斜扶手截面，保证接触）
    x0c, y0c, x1c, y1c = 1.345, 1.145, 5.695, 3.745
    slope = (y1c - y0c) / (x1c - x0c)
    for i in range(0, STEPS, 3):
        xi = 1.2 + i * TREAD + TREAD / 2
        yi = y0c + (xi - x0c) * slope
        step_y = (i + 1) * RISE
        reg(B(0.05, yi - step_y, 0.05, xi, (step_y + yi) / 2, -4.53, M('wood_dark'), f'rail{i}', 0.005))
    hr = B(math.hypot(x1c - x0c, y1c - y0c), 0.07, 0.07, (x0c + x1c) / 2, (y0c + y1c) / 2, -4.53,
           M('wood_dark'), 'handrail', 0.006)
    hr.rotation_euler = (0, -math.atan2(y1c - y0c, x1c - x0c), 0)
    _apply(hr); reg(hr)
    # 楼梯井南侧半墙（x 0.1..6.45，高1.35——比健身房器械略高，可探看楼梯井）——
    # 仍挡住从储物间/健身房跌落楼梯井；东段 6.45..7.5 留空作为落地进入储物间的出口
    wall_v('f2_stair_wall', 'x', -4.55, 0.1, 6.45, 0.1, M('paint_int'), [], yBase=F2, height=1.35)
    # 坡屋顶
    ridgeY, eaveY = F2 + 2.9 + 2.15, F2 + 2.9
    EZ, EX = 6.35, 8.4
    slope_len = math.hypot(EZ, ridgeY - eaveY)
    ang = math.atan2(ridgeY - eaveY, EZ)
    for side in (-1, 1):
        r = B(EX * 2, 0.06, slope_len, 0, (eaveY + ridgeY) / 2, side * EZ / 2, M('roof'), f'roof{side}', 0)
        r.rotation_euler = (side * ang, 0, 0)   # three rotX -> blender rotX 同号
        _apply(r)
        scale_uv(r, 5.0, slope_len / 0.7)
        reg(r)
    reg(B(EX * 2 + 0.2, 0.14, 0.32, 0, ridgeY + 0.06, 0, M('ridge'), 'roof_ridge', 0.01))
    # 山墙（延伸到屋檐线 ±6.35，斜边与屋面同角，封死山墙端与屋檐间的看天缝隙）
    for ex in (-7.5, 7.5):
        g = mesh_tri(f'gable{ex}', [(ex, eaveY, -6.35), (ex, eaveY, 6.35), (ex, ridgeY, 0)],
                     [(0, 1, 2)], M('stucco_ext'))
        reg(g)
    # 烟囱
    reg(B(0.7, 1.7, 0.7, 4.5, ridgeY - 0.15, -1.7, M('chimney'), 'chimney', 0.012))
    reg(B(0.8, 0.1, 0.8, 4.5, ridgeY + 0.72, -1.7, M('stone'), 'chimney_cap', 0.008))

def build_villa_details():
    """楼体写实升级（2026-09-18）——纯附加节点，原几何零改动：
    门套：10 个门洞 × 内外两面「双竖梃+门头梃」三件套（trim 白漆木线）；
    勒脚：外墙四周 18cm 高 stone 石带（外突 2cm，消"白盒坐在草上"）；
    檐口封板：两坡屋檐 eave 白封板（封住屋面板边缘截面）。
    归并为 3 个节点（每 mesh 一次 draw call）。基线硬对比见 tools/villa_upgrade_body.py。
    """
    TRIM, STONE = M('trim'), M('stone')
    boards = []

    def casing_x(door_x, faces, y0=0.0, h=2.15, w=1.05):
        """墙沿 X 走向（厚 z 向）：faces = 门套两面的 z 偏移列表"""
        jl = w / 2 + 0.035
        for fz in faces:
            boards.append(B(0.07, h + 0.07, 0.024, door_x - jl, y0 + (h + 0.07) / 2, fz,
                            TRIM, 'cas', 0.004))
            boards.append(B(0.07, h + 0.07, 0.024, door_x + jl, y0 + (h + 0.07) / 2, fz,
                            TRIM, 'cas', 0.004))
            boards.append(B(w + 0.21, 0.07, 0.024, door_x, y0 + h + 0.035, fz,
                            TRIM, 'cas', 0.004))

    def casing_z(door_z, faces_x, y0=0.0, h=2.15, w=1.05):
        """墙沿 Z 走向（厚 x 向）：faces_x = 门套两面的 x 绝对坐标列表"""
        jl = w / 2 + 0.035
        for fx in faces_x:
            boards.append(B(0.024, h + 0.07, 0.07, fx, y0 + (h + 0.07) / 2, door_z - jl,
                            TRIM, 'cas', 0.004))
            boards.append(B(0.024, h + 0.07, 0.07, fx, y0 + (h + 0.07) / 2, door_z + jl,
                            TRIM, 'cas', 0.004))
            boards.append(B(0.024, 0.07, w + 0.21, fx, y0 + h + 0.035, door_z,
                            TRIM, 'cas', 0.004))

    # 1F：wallX1（z=0 内墙）两门 + wallZ1（x=0 内墙）一门 + 正门（外墙两面）
    casing_x(-3.75, (-0.072, 0.072))
    casing_x(3.75, (-0.072, 0.072))
    casing_z(3.0, (-0.072, 0.072))
    casing_z(-2.5, (-7.752, -7.488), h=2.2)
    # 2F：u_wallX 两门 + u_wallZ 两门
    casing_x(-3.75, (-0.072, 0.072), y0=F2)
    casing_x(3.75, (-0.072, 0.072), y0=F2)
    casing_z(-3.0, (-0.072, 0.072), y0=F2)
    casing_z(3.0, (-0.072, 0.072), y0=F2)
    reg(join(boards, 'villa_casings'))

    # 勒脚（外墙四条石带，角落自然搭接）
    plinth = [B(15.48, 0.18, 0.04, 0, 0.09, -5.74, STONE, 'plinthN', 0.008),
              B(15.48, 0.18, 0.04, 0, 0.09, 5.74, STONE, 'plinthS', 0.008),
              B(0.04, 0.18, 11.48, -7.74, 0.09, 0, STONE, 'plinthW', 0.008),
              B(0.04, 0.18, 11.48, 7.74, 0.09, 0, STONE, 'plinthE', 0.008)]
    reg(join(plinth, 'villa_plinth'))

    # 檐口封板（两坡屋檐，盖住屋面板边缘截面）
    fascia = [B(16.9, 0.16, 0.05, 0, F2 + 2.9 + 0.02, -6.38, TRIM, 'fasciaN', 0.006),
              B(16.9, 0.16, 0.05, 0, F2 + 2.9 + 0.02, 6.38, TRIM, 'fasciaS', 0.006)]
    reg(join(fascia, 'roof_fascia'))

# ---------------------------------------------------------------- 庭院（yard.glb）
def build_yard_v():
    FX, FZ = 11.5, 8.5
    def fence_run(axis, at, from_, to_, gate=None):
        segs = [(from_, gate[0]), (gate[1], to_)] if gate else [(from_, to_)]
        n = 0
        for a, b in segs:
            if b - a < 0.1: continue
            mid, ln = (a + b) / 2, b - a
            if axis == 'x':
                reg(B(ln, 1.0, 0.08, mid, 0.5, at, M('fence'), f'fence{n}', 0.006))
            else:
                reg(B(0.08, 1.0, ln, at, 0.5, mid, M('fence'), f'fence{n}', 0.006))
            n += 1
        p = from_
        while p <= to_:
            if not (gate and gate[0] < p < gate[1]):
                if axis == 'x':
                    reg(B(0.14, 1.24, 0.14, p, 0.62, at, M('fence_post'), f'fp{p:.0f}_{at:.0f}', 0.008))
                else:
                    reg(B(0.14, 1.24, 0.14, at, 0.62, p, M('fence_post'), f'fp{at:.0f}_{p:.0f}', 0.008))
            p += 2
    fence_run('x', -FZ, -FX, FX)                                   # 南墙
    fence_run('x', FZ, -FX, FX)                                    # 北墙
    fence_run('z', -FX, -FZ, FZ, gate=(-3.1, -1.9))                # 西墙大门：正对屋门(z=-2.5)
    fence_run('z', FX, -FZ, FZ)                                    # 东墙
    reg(B(0.18, 1.4, 0.18, -FX, 0.7, -3.25, M('fence_post'), 'gateL', 0.01))
    reg(B(0.18, 1.4, 0.18, -FX, 0.7, -1.75, M('fence_post'), 'gateR', 0.01))
    # 石板路（西门 → 正门，直线正对）
    for i in range(4):
        reg(B(0.55, 0.05, 1.0, -10.95 - i * 0.78, 0.035, -2.5, M('stone'), f'path{i}', 0.008))
    # 树×3（有机树冠）
    def tree(key, tx, tz, s):
        reg(CONE(0.24 * s, 0.17 * s, 2.2 * s, tx, 1.1 * s, tz, M('bark'), f'{key}_trunk', 12))
        reg(DISPLACED_SPH(1.5 * s, tx, 2.9 * s, tz, M('leaf1'), f'{key}_c1', 0.22, seed=int(tx * 10)))
        reg(DISPLACED_SPH(1.05 * s, tx + 0.5 * s, 2.4 * s, tz + 0.4 * s, M('leaf2'), f'{key}_c2', 0.25, seed=int(tz * 10) + 2))
    tree('tree1', -9.6, -6.4, 1.1)
    tree('tree2', 9.8, 6.4, 1.0)
    tree('tree3', 9.9, -6.2, 0.85)
    # 花丛（确定性伪随机：装饰用途，位置/大小由 i 的散列决定，可重现且无安全面）
    for i in range(14):
        h1 = abs(math.sin(i * 127.1 + 311.7)) % 1
        h2 = abs(math.sin(i * 269.5 + 183.3)) % 1
        h3 = abs(math.sin(i * 419.2 + 371.9)) % 1
        fx, fz = (h1 - 0.5) * 20, (h2 - 0.5) * 14
        if abs(fx) < 8.6 and abs(fz) < 6.4: continue
        reg(SPH(0.09 + h3 * 0.07, fx, 0.12, fz,
                M(f'flower{(i % 4) + 1}'), f'wildfl{i}', 8, 6))
    # 草地
    g = PLANE(60, 60, 0, -0.01, 0, M('grass'), 'lawn', uv_scale=(30, 30))
    reg(g)

# ---------------------------------------------------------------- 藏匿物品（item_*.glb，尺寸=items.js）
def b_item_note():
    reg(B(0.12, 0.002, 0.08, 0, 0.001, 0, M('paper'), 'note', 0.0006))
def b_item_card():
    reg(B(0.063, 0.001, 0.088, 0, 0.0005, 0, M('paper'), 'card', 0.0004))
def b_item_key():
    reg(B(0.054, 0.008, 0.009, 0, 0.004, -0.005, M('gold'), 'shaft', 0.002))
    reg(TORUS(0.0105, 0.004, 0, 0.004, 0.014, M('gold'), 'head', rot_bl=(math.pi / 2, 0, 0)))
    reg(B(0.015, 0.008, 0.008, 0.018, 0.004, -0.011, M('gold'), 'tooth', 0.0015))
def b_item_coin():
    reg(CYL(0.012, 0.004, 0, 0.002, 0, M('silver'), 'coin', 20))
def b_item_ring():
    reg(TORUS(0.0105, 0.004, 0, 0.01, 0, M('ring_m'), 'ring', rot_bl=(0, math.pi / 2, 0)))
def b_item_eraser():
    reg(B(0.05, 0.02, 0.024, 0, 0.01, 0, M('eraser'), 'eraser', 0.006))
def b_item_ball():
    reg(SPH(0.02, 0, 0.02, 0, M('ball'), 'ball', 16, 12))
def b_item_remote():
    reg(B(0.05, 0.022, 0.16, 0, 0.011, 0, M('remote'), 'body', 0.008))
    for i in range(6):
        reg(CYL(0.006, 0.004, (i % 3 - 1) * 0.014, 0.0235, 0.02 + (i // 3) * 0.022, M('dark'), f'btn{i}', 10))

ITEM_BUILDERS = {
    'note': b_item_note, 'card': b_item_card, 'key': b_item_key, 'coin': b_item_coin,
    'ring': b_item_ring, 'eraser': b_item_eraser, 'ball': b_item_ball, 'remote': b_item_remote,
}

# ---------------------------------------------------------------- 角色替身（avatar.glb）
def b_avatar():
    reg(SPH(0.19, 0, 1.5, 0, M('skin'), 'head', 20, 14))
    cap = SPH(0.205, 0, 1.56, 0, M('cap'), 'cap', 20, 14)
    cap.scale = (1.0, 0.62, 1.0); _apply(cap); reg(cap)
    reg(CYL(0.225, 0.02, 0, 1.53, 0.12, M('cap'), 'brim', 20))
    body = B(0.44, 0.62, 0.3, 0, 0.98, 0, M('shirt'), 'torso', 0.1); reg(body)
    for sx in (-1, 1):
        arm = B(0.09, 0.5, 0.11, sx * 0.27, 0.98, 0, M('shirt'), f'arm{sx}', 0.038)
        arm.rotation_euler = (0.12, 0, 0); _apply(arm); reg(arm)
        reg(B(0.13, 0.5, 0.15, sx * 0.12, 0.25, 0, M('pants'), f'leg{sx}', 0.05))
    reg(B(0.16, 0.08, 0.3, -0.12, 0.04, 0.04, M('dark'), 'shoeL', 0.025))
    reg(B(0.16, 0.08, 0.3, 0.12, 0.04, 0.04, M('dark'), 'shoeR', 0.025))

# ---------------------------------------------------------------- 导出
def _rna_props(op):
    try:
        return {p.identifier for p in op.get_rna_type().properties}
    except Exception:
        return set()

def export_glb(path, selected=True):
    op = bpy.ops.export_scene.gltf
    props = _rna_props(op)
    kw = {'filepath': path, 'export_format': 'GLB'}
    for k, v in [('use_selection', selected), ('export_selected_objects', selected),
                 ('export_apply', True), ('export_materials', 'EXPORT'),
                 ('export_image_format', 'JPEG'), ('export_animations', False),
                 ('export_cameras', False), ('export_lights', False),
                 ('export_extras', False), ('export_yup', True)]:
        if k in props:
            kw[k] = v
    op(**kw)

def export_bucket(key, out_dir, filename):
    objs = BUCKETS.get(key, [])
    if not objs:
        print(f'[skip] {key}: no objects')
        return None
    # 部件名规范化：去掉 Blender 场景去重产生的 .NNN 后缀（join() 已用 __桶名 保证唯一）
    seen = set()
    for o in objs:
        if o.name.startswith('part_'):
            base = re.sub(r'\.\d+$', '', o.name)
            if base in seen:
                base = f'{base}_{key}'
            o.name = base
            seen.add(base)
    _unselect()
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    path = os.path.join(out_dir, filename)
    export_glb(path, selected=True)
    sz = os.path.getsize(path) / 1024
    print(f'[ok] {filename}  {sz:.0f} KB  ({len(objs)} objects)')
    return path

def main():
    global CUR
    # --skip-full：单件重建脚本（tools/*_v2_body.py）import 本模块时传此参数，
    # 跳过全量建模与导出，由调用方自己挑 builder 跑（避免为一件事重写全部 50 个 glb）
    if '--skip-full' in ARGS:
        print('[skip] --skip-full：单件模式，main() 全量导出已跳过')
        return
    # —— 家具 ——
    for key, fn in PIECE_BUILDERS.items():
        CUR = key
        fn()
    CUR = None
    # —— 别墅 / 庭院 / 物品 / 角色 ——
    CUR = 'villa'; build_villa_v(); build_upper_v(); build_villa_details()
    CUR = 'yard'; build_yard_v()
    for key, fn in ITEM_BUILDERS.items():
        CUR = f'item_{key}'
        fn()
    CUR = 'avatar'; b_avatar()
    CUR = None

    total = 0
    for key in PIECE_BUILDERS:
        p = export_bucket(key, PIECE_DIR, f'{key}.glb')
        total += os.path.getsize(p) if p else 0
    for key in ITEM_BUILDERS:
        p = export_bucket(f'item_{key}', PIECE_DIR, f'item_{key}.glb')
        total += os.path.getsize(p) if p else 0
    for key, fn in [('villa', 'villa.glb'), ('yard', 'yard.glb'), ('avatar', 'avatar.glb')]:
        p = export_bucket(key, os.path.join(ROOT, 'models'), fn)
        total += os.path.getsize(p) if p else 0
    print(f'== DONE ==  total {total/1024/1024:.1f} MB')

main()
