# verify_glb.py — 校验导出的 GLB：部件节点名 / 材质数 / 网格数 / 包围盒
import struct, json, os, sys, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PIECES = os.path.join(ROOT, 'models', 'pieces')

EXPECTED_PARTS = {
    'tv_cabinet': ['part_doorL', 'part_doorR'],
    'counter': ['part_drawer1', 'part_drawer2', 'part_cabDoor'],
    'fridge': ['part_door'],
    'wardrobe': ['part_doorL', 'part_doorR'],
    'nightstand': ['part_drawer'],
    'dresser': ['part_drawer1', 'part_drawer2'],
    'desk': ['part_drawer'],
    'computer_case': ['part_sidePanel'],
    'chest': ['part_lid'],
    'mailbox': ['part_door'],
    'picture_frame': ['part_tilt'],
    'bookshelf': ['part_book_'],
}

def glb_json(path):
    with open(path, 'rb') as f:
        magic, ver, length = struct.unpack('<III', f.read(12))
        if magic != 0x46546C67:
            return None
        clen, ctype = struct.unpack('<II', f.read(8))
        return json.loads(f.read(clen))

def aabb_from_nodes(gj):
    import math
    mn = [1e9] * 3; mx = [-1e9] * 3
    for m in gj.get('meshes', []):
        for p in m.get('primitives', []):
            acc = gj['accessors'][p['attributes']['POSITION']]
            for i in range(3):
                mn[i] = min(mn[i], acc['min'][i]); mx[i] = max(mx[i], acc['max'][i])
    return mn, mx

ok = True
for fn in sorted(os.listdir(PIECES)):
    if not fn.endswith('.glb'): continue
    path = os.path.join(PIECES, fn)
    gj = glb_json(path)
    if gj is None:
        print(f'[BAD] {fn}: not GLB'); ok = False; continue
    nodes = [re.sub(r'\.\d+$', '', n.get('name', '')) for n in gj.get('nodes', [])]
    parts = [n for n in nodes if n.startswith('part_')]
    mats = len(gj.get('materials', []))
    meshes = len(gj.get('meshes', []))
    mn, mx = aabb_from_nodes(gj)
    size = [round(mx[i] - mn[i], 3) for i in range(3)]
    key = fn[:-4]
    exp = EXPECTED_PARTS.get(key, [])
    missing = []
    for e in exp:
        if e.endswith('_'):
            if not any(p.startswith(e) for p in parts): missing.append(e + '*')
        elif e not in parts:
            missing.append(e)
    flag = 'OK ' if not missing else 'MISS'
    if missing: ok = False
    print(f'[{flag}] {fn:20s} {os.path.getsize(path)//1024:4d}KB mat={mats:2d} mesh={meshes:3d} '
          f'parts={len(parts):2d} size={size}')
    if missing: print('      missing:', missing)
    if key == 'bookshelf' and parts:
        print('      books:', sorted(parts)[:4], f'... total {len(parts)}')

for fn in ('villa.glb', 'yard.glb', 'avatar.glb'):
    path = os.path.join(ROOT, 'models', fn)
    gj = glb_json(path)
    nodes = [n.get('name', '') for n in gj.get('nodes', [])]
    mn, mx = aabb_from_nodes(gj)
    print(f'[OK ] {fn:20s} {os.path.getsize(path)//1024:4d}KB mat={len(gj.get("materials", [])):2d} '
          f'nodes={len(nodes)} size={[round(mx[i]-mn[i],1) for i in range(3)]}')
print('ALL OK' if ok else 'HAS MISSING PARTS')
