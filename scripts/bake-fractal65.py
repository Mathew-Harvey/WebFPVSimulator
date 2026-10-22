# bake-fractal65.py: bakes the owner's Fractal65.glb (1.09M triangles, 34 MB, not in
# this repository) into assets/whoop/fractal65.bin, which src/render/whoopcraft.js reads.
#
# usage: python3 -I scripts/bake-fractal65.py Fractal65.glb assets/whoop/fractal65.bin
# needs: pip install numpy trimesh scipy networkx fast-simplification shapely mapbox-earcut
#
# This file is part of WebFPVSimulator, GPLv3 or later (see LICENSE).
#
# What it does: flat plates (frame, board) are re-extruded from their outlines,
# the ducts are rebuilt as a 16 sided lathe of the measured profile, the motors,
# standoffs and camera are primitives sized from the model's own extents, the
# prop is its outline extruded plus a hub, and every part is given a colour from
# the sim's flat palette (the source's textures are dropped). Positions are int16
# in 2 micrometre steps; ducts, motors and standoffs are stored once and placed
# by instance offsets. Model frame (Y up, camera +Z) is turned to the craft frame
# (camera -Z) and the origin moved to the CG, 9.6 mm above the model's lowest point.
import sys, struct, numpy as np, trimesh, fast_simplification as fs
from shapely.geometry import Polygon, MultiPolygon
from shapely.ops import unary_union
from trimesh.creation import extrude_polygon
src, out = sys.argv[1], sys.argv[2]
s = trimesh.load(src)
MM = 0.001
YOFF = 9.6  # model y of the CG: the plant parks the craft on 9.6 mm of duct floor
def world(node):
    T, gn = s.graph[node]; m = s.geometry[gn].copy(); m.apply_transform(T); m.vertices = m.vertices*1000; return m  # mm, model frame
def dec(m, target):
    v = np.asarray(m.vertices, np.float32); f = np.asarray(m.faces, np.int32)
    if len(f) <= target: return v, f
    v2, f2 = fs.simplify(v, f, target_reduction=1-target/len(f), agg=int(__import__('os').environ.get('AGG','5'))); return v2, f2
PAL = {}  # name -> index
COLS = []
def col(hexv):
    if hexv not in PAL: PAL[hexv] = len(COLS); COLS.append(hexv)
    return PAL[hexv]
# colours: the sim's flat palette, see whoopcraft.js
C = dict(frame=0x2a3236, pcb=0x243c2c, duct=0x6f7e88, ductin=0x4a5860, bell=0xd6dade, base=0x30383c,
         cam=0x171b1e, lens=0x0d1114, camplate=0xe8a8b8, strap=0x1f2528, post=0xc8cdd0, hub=0x161c18, blade=0xffffff)
for k in C: col(C[k])
def part(v, f, c):  # mm model frame -> keep
    return (np.asarray(v, float), np.asarray(f, int), np.full(len(f), col(C[c]), int))
def cat(parts):
    vs, fs_, cs, o = [], [], [], 0
    for v, f, c in parts: vs.append(v); fs_.append(f+o); cs.append(c); o += len(v)
    return np.concatenate(vs), np.concatenate(fs_), np.concatenate(cs)
def plate(m, tol, name, y0, y1, minhole=25.0):
    tri = m.vertices[m.faces][:, :, [0, 2]]
    polys = [Polygon(t) for t in tri if Polygon(t).area > 1e-6]
    u = unary_union([p.buffer(0.01) for p in polys]).buffer(-0.01)
    geoms = list(u.geoms) if isinstance(u, MultiPolygon) else [u]
    parts = []
    for g in geoms:
        g = Polygon(g.exterior, [h for h in g.interiors if Polygon(h).area > minhole]).simplify(tol)
        if g.area < 4: continue
        e = extrude_polygon(g, y1-y0)  # extrudes along z
        v = np.c_[e.vertices[:, 0], e.vertices[:, 2]+y0, e.vertices[:, 1]]
        f = e.faces[:, ::-1] if False else e.faces
        parts.append((v, f))
    return parts
def fix(v, f):  # make winding outward using trimesh
    m = trimesh.Trimesh(v, f, process=False); m.fix_normals(); return m.vertices, m.faces
# ---------------- body (static, whole craft) in model mm
body = []
fr = world('Frame'); pl = plate(fr, 0.35, 'frame', 7.45, 8.95)
for v, f in pl: body.append(part(*fix(v, f), 'frame'))
fc = world('Crazybee F3 FC')
for v, f in plate(fc, 0.4, 'fc', 10.4, 11.4): body.append(part(*fix(v, f), 'pcb'))
for n, t, c in (('Crazybee F3 FC_1', 12, 'post'),):
    v, f = dec(world(n), t); body.append(part(v, f, c))
# ---------------- camera, from the measured extents of the model's own parts (mm, model frame)
def box(cx, cy, cz, sx, sy, sz):
    m = trimesh.creation.box(extents=(sx, sy, sz)); v = m.vertices + np.array([cx, cy, cz]); return fix(v, m.faces)
def zcyl(cx, cy, cz, r, h, seg=10):
    m = trimesh.creation.cylinder(radius=r, height=h, sections=seg); v = m.vertices[:, [0, 2, 1]].copy(); v[:, 2] = m.vertices[:, 2]
    v = np.c_[m.vertices[:, 0], m.vertices[:, 1], m.vertices[:, 2]]
    # cylinder axis is z already
    v = v + np.array([cx, cy, cz]); return fix(v, m.faces)
# the 1S pack under the plate: the model's two straps (thin loops that ink badly) stand
# in for it, and it is the lowest thing, which is where the plant parks the craft
body.append(part(*box(0, 3.7, -2.0, 17.0, 7.4, 26.0), 'strap'))
CAMPLATE_B = world('3D Prints_1').bounds
cb = CAMPLATE_B; plate_c = (cb[0]+cb[1])/2; plate_e = cb[1]-cb[0]
body.append(part(*box(*plate_c, *plate_e), 'camplate'))
cam = []
cam.append(part(*box(0, 15.9, 24.5, 14.5, 11.6, 5.0), 'cam'))
cam.append(part(*box(0, 18.2, 29.3, 9.4, 11.4, 6.0), 'cam'))
cam.append(part(*zcyl(0, 19.4, 33.0, 3.7, 3.4), 'lens'))
CAM = cat(cam)
BODY = cat(body)
# ---------------- duct (lathe at origin, axis y), 4x
SEG = 16
prof = [(9.0, 8.5), (12.5, 16.0), (17.5, 17.5), (22.5, 17.8), (25.5, 18.1), (27.4, 18.1),
        (27.5, 17.0), (25.5, 16.3), (22.5, 15.2), (17.5, 15.0), (13.5, 13.4), (10.0, 9.5)]
def lathe(pr, seg, closed=True):
    n = len(pr); v = []; f = []
    for k in range(seg):
        a = 2*np.pi*k/seg
        for y, r in pr: v.append((r*np.cos(a), y, r*np.sin(a)))
    for k in range(seg):
        k2 = (k+1) % seg
        for i in range(n if closed else n-1):
            j = (i+1) % n
            a, b, c, d = k*n+i, k*n+j, k2*n+j, k2*n+i
            f += [(a, b, c), (a, c, d)]
    return np.array(v), np.array(f)
dv, df = lathe(prof, SEG); dv, df = fix(dv, df)
dm = trimesh.Trimesh(dv, df, process=False)
if dm.volume < 0: df = df[:, ::-1]
DUCT = part(dv, df, 'duct')
# ---------------- motor (bell + base), 4x at origin
def cyl(r, h, y0, seg=10):
    m = trimesh.creation.cylinder(radius=r, height=h, sections=seg); v = m.vertices.copy(); v = v[:, [0, 2, 1]]; v[:, 1] += y0+h/2
    return v, m.faces[:, ::-1] if False else m.faces
mo = []
for r, h, y0, c in ((5.55, 4.9, 13.55, 'bell'), (5.2, 2.0, 13.5, 'base'), (2.0, 0.8, 18.4, 'bell')):
    v, f = cyl(r, h, y0, 10); v, f = fix(v, f); mo.append(part(v, f, c))
MOTOR = cat(mo)
# ---------------- post (fc standoff), 4x
v, f = cyl(2.4, 5.0, 8.9, 6); v, f = fix(v, f); POST = part(v, f, 'post')
# ---------------- blade: model prop 'GF_prop' re-centred on its hub
pm = world('31mm_GF_prop'); hub = pm.vertices[pm.vertices[:, 1] > pm.vertices[:, 1].max()-0.3][:, [0, 2]].mean(0)
pm.vertices[:, 0] -= hub[0]; pm.vertices[:, 2] -= hub[1]
bl = []
for v, f in plate(pm, 0.18, 'blade', 21.0, 21.8, minhole=1e9): bl.append(part(*fix(v, f), 'blade'))
v, f = cyl(3.3, 3.0, 19.4, 10); v, f = fix(v, f); bl.append(part(v, f, 'hub'))
v, f = cyl(1.3, 1.6, 22.4, 6); v, f = fix(v, f); bl.append(part(v, f, 'post'))
BLADE = cat(bl)
# instance lists (model frame mm): ducts/motors at motor axes, posts at FC corners
mot = [(25.0, 20.766), (25.0, -20.766), (-25.0, 20.766), (-25.0, -20.766)]
posts = [(18.0, 0.0), (-18.0, 0.0), (0.0, 18.0), (0.0, -18.0)]
cam_pivot = (0.0, 18.2, 29.8)
# ---------------- to craft frame: x->-x, z->-z, y-10, metres. Rotor-local sections shift to their own origin.
def to_craft(sec, origin=(0, 0, 0)):
    v, f, c = sec
    v = np.array(v, float) - np.array(origin)
    v = np.c_[-v[:, 0], v[:, 1], -v[:, 2]]
    # x and z both negated: rotation about y, winding unchanged
    return v*MM, f, c
def to_craft_world(sec):
    v, f, c = sec
    v = np.array(v, float); v[:, 1] -= YOFF
    return to_craft((v, f, c))
def local(sec, origin):  # sections already built about the origin in x,z
    return sec
# motor/duct/blade/post sections are built about x=z=0; y stays in craft frame (-10)
def yshift(sec):
    v, f, c = sec; v = np.array(v, float); v[:, 1] -= YOFF; return (v, f, c)
sections = [
  ('body', to_craft(yshift(BODY)), [(0, 0, 0)]),
  ('duct', to_craft(yshift(DUCT)), None),
  ('motor', to_craft(yshift(MOTOR)), None),
  ('post', to_craft(yshift(POST)), None),
  ('camera', None, [(0, 0, 0)]),
  ('blade', to_craft(yshift(BLADE)), [(0, 0, 0)]),
]
# fix instance offsets: craft metres of each model-frame (x, z) at y 0
def inst(pts): return [(-x*MM, 0.0, -z*MM) for x, z in pts]
sections[1] = ('duct', sections[1][1], inst(mot))
sections[2] = ('motor', sections[2][1], inst(mot))
sections[3] = ('post', sections[3][1], inst(posts))
# camera about its tilt axis
cv, cf, cc = CAM; cv = np.array(cv, float) - np.array(cam_pivot)
cv = np.c_[-cv[:, 0], cv[:, 1], -cv[:, 2]]*MM
sections[4] = ('camera', (cv, cf, cc), [(0, 0, 0)])
pivot_craft = (-cam_pivot[0]*MM, (cam_pivot[1]-YOFF)*MM, -cam_pivot[2]*MM)
Q = 2e-6
def q(a): return np.clip(np.round(np.asarray(a)/Q), -32767, 32767).astype('<i2')
buf = bytearray(b'FR65')
buf += struct.pack('<B', len(COLS))
for h in COLS: buf += bytes(((h >> 16) & 255, (h >> 8) & 255, h & 255))
buf += struct.pack('<3f', *pivot_craft)
buf += struct.pack('<B', len(sections))
tris = 0
for name, (v, f, c), insts in sections:
    # weld vertices
    key = np.round(v/Q).astype(np.int64); _, idx, inv = np.unique(key, axis=0, return_index=True, return_inverse=True)
    v2 = v[idx]; f2 = inv.reshape(-1)[f]
    keep = (f2[:, 0] != f2[:, 1]) & (f2[:, 1] != f2[:, 2]) & (f2[:, 0] != f2[:, 2])
    f2 = f2[keep]; c2 = np.asarray(c)[keep]
    buf += struct.pack('<B', len(insts))
    for p in insts: buf += q(p).tobytes()
    buf += struct.pack('<HH', len(v2), len(f2))
    buf += q(v2).tobytes() + f2.astype('<u2').tobytes() + c2.astype('u1').tobytes()
    tris += len(f2)*len(insts); print(name, len(v2), 'verts', len(f2), 'tris x', len(insts))
open(out, 'wb').write(buf)
print('total tris drawn', tris + 0, 'bytes', len(buf))
