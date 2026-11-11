#!/usr/bin/env python3
"""Build a low-poly cat mesh (proportions from the cat1/cat2 reference
screenshots: walking quadruped, arched back, hooked raised tail) with a
procedural fur texture (UV-mapped PNG + vertex-color fallback).

Usage: build_cat.py [brown|black] out.glb
"""
import sys
import numpy as np
import trimesh
from trimesh.visual import TextureVisuals
from trimesh.visual.material import PBRMaterial
from PIL import Image, ImageFilter

np.random.seed(7)

BROWN = np.array([0x6b, 0x4a, 0x32], float) / 255
DARKB = np.array([0x2e, 0x21, 0x16], float) / 255
CREAM = np.array([0xb9, 0xa0, 0x86], float) / 255

TEX_W = TEX_H = 1024


def tapered(start, end, r0, r1, sections):
    a, b = np.asarray(start, float), np.asarray(end, float)
    d = b - a
    L = np.linalg.norm(d)
    axis = d / L if L > 1e-9 else np.array([0.0, 1.0, 0])
    if abs(axis[2]) < 0.9:
        up = np.cross(axis, [0, 0, 1])
    else:
        up = np.cross(axis, [0, 1, 0])
    up /= np.linalg.norm(up)
    w = np.cross(axis, up)
    ang = np.linspace(0, 2 * np.pi, sections, endpoint=False)
    ring = np.stack([np.cos(ang), np.sin(ang)], axis=1)
    xx = np.array([
        a + d * t + (up * ring[:, :1] + w * ring[:, 1:]) * r
        for t, r in ((0.0, r0), (1.0, r1))
    ])
    n = sections
    fc = []
    for i in range(n):
        j = (i + 1) % n
        fc.append([i, j, i + n])
        fc.append([j, j + n, i + n])
    m = trimesh.Trimesh(vertices=xx.reshape(-1, 3), faces=np.array(fc), process=True)
    m.fix_normals()
    return m


def blob(center, radii, subdivisions=2, taper=None):
    m = trimesh.creation.icosphere(subdivisions=subdivisions, radius=1.0)
    v = m.vertices * np.asarray(radii, float)
    if taper is not None:
        z01 = (v[:, 2] - v[:, 2].min()) / max(1e-9, np.ptp(v[:, 2]))
        v[:, 0] *= 1.0 + taper * z01
    m.vertices = v + np.asarray(center, float)
    m.fix_normals()
    return m


verts, faces, colors, UVS = [], [], [], []
GROUPS = {}  # name -> 'PART'
pivot_nodes = {}
# UV rects (u0,u1,v0,v1) on the final texture for face features
PATCH_RECTS = {
    'iris':  (0.72, 0.78, 0.035, 0.125),
    'pupil': (0.80, 0.815, 0.05, 0.12),
    'nose':  (0.838, 0.912, 0.04, 0.13),
}


def attach(m, color_top=BROWN, color_bottom=CREAM, stripes=False, freq=26.0, part='body', patch=None):
    """Append a part; vertices are kept per-group (named GLB node) plus
    global copies for vertex-color fallback."""
    global verts, faces, colors, UVS
    yy = np.asarray(m.vertices, float)
    fc = np.asarray(m.faces)
    g = GROUPS.setdefault(part, {'verts': [], 'faces': [], 'uv': []})
    goff = sum(len(v) for v in g['verts'])
    ymin, ymax = yy[:, 1].min(), yy[:, 1].max()
    bottom = 1 - np.clip((yy[:, 1] - ymin) / max(1e-9, ymax - ymin), 0, 1)
    c = (1 - bottom[:, None]) * color_top + bottom[:, None] * color_bottom
    c *= (1 + np.random.uniform(-0.07, 0.07, size=(len(yy), 1)))
    if stripes:
        mark = ((np.sin(yy[:, 2] * freq) > 0.55) & (bottom < 0.45)).astype(float)
        c = c * (1 - mark[:, None]) + DARKB[None, :] * mark[:, None]
    off = sum(len(v) for v in verts)
    colors.append((np.clip(c, 0, 1) * 255).astype(np.uint8))
    verts.append(yy)
    faces.append(fc + off)
    if patch:
        # map all feature verts into their texture patch rect (eyes/nose)
        u0, u1, v0, v1 = PATCH_RECTS[patch]
        span_x = max(1e-9, np.ptp(yy[:, 2]))
        span_y = max(1e-9, np.ptp(yy[:, 1]))
        uu = u0 + (yy[:, 2] - yy[:, 2].min()) / span_x * (u1 - u0)
        vv = v0 + (1 - (yy[:, 1] - yy[:, 1].min()) / span_y) * (v1 - v0)
        uv = np.stack([uu, vv], axis=1)
    else:
        u = (np.arctan2(yy[:, 0], -yy[:, 2]) / (2 * np.pi)) + 0.5
        u *= 0.70  # keep the right texture strip free for face patches
        v = 1 - bottom  # v=1 top/back, v=0 belly
        uv = np.stack([u, v], axis=1)
    UVS.append(uv)
    g['verts'].append(yy)
    g['faces'].append(fc + goff)
    g['uv'].append(uv)


# ---------------- proportions (forward = +z) ------------------------------
BODY_L, BODY_R, BODY_H, LEG_L, LEG_T = 1.0, 0.185, 0.155, 0.30, 0.075
LX, FLZ, HLZ = 0.105, 0.25, -0.25

# ---- body: smooth lofted torso (no stacked blobs, no camel back) ----------
def loft(ctrl, sections=18, steps=10, cap_start=True, cap_end=True):
    """Sweep elliptical cross-sections along a spine. ctrl rows:
    (y, z, rx, ry). Returns a smooth watertight torso/neck tube."""
    cs = np.asarray(ctrl, float)
    n = len(cs)
    ss = np.linspace(0, n - 1, steps + 1)
    from scipy.interpolate import PchipInterpolator
    f = [PchipInterpolator(np.arange(n), cs[:, i]) for i in range(4)]  # y, z, rx, ry
    ang = np.linspace(0, 2 * np.pi, sections, endpoint=False)
    ca, sa = np.cos(ang), np.sin(ang)
    verts, faces = [], []
    for zi, si in enumerate(ss):
        y, z, rx, ry = (f[i](si) for i in range(4))
        # ellipse in the x-y plane (x = width), swept to z
        ring = np.stack([ca * rx, y + sa * ry, np.full(sections, z)], axis=1)
        verts.append(ring)
    for zi in range(steps):
        base, nxt = zi * sections, (zi + 1) * sections
        for i in range(sections):
            j = (i + 1) % sections
            faces.append([base + i, base + j, nxt + i])
            faces.append([base + j, nxt + j, nxt + i])
    m = trimesh.Trimesh(vertices=np.vstack(verts), faces=np.array(faces), process=True)
    m.fix_normals()
    return m

# torso profile: deep front, soft waist dip, firm pelvis, rounded rear
BODY_CTRL = [
    (0.466,  0.29,  0.132, 0.124),   # withers / shoulder mass
    (0.446,  0.16,  0.148, 0.150),   # chest — deepest girth
    (0.462, -0.02,  0.116, 0.140),   # waist — slight lift-dip
    (0.450, -0.19,  0.134, 0.148),   # pelvis — firm, high
    (0.440, -0.30,  0.096, 0.116),   # rump end
]
torso = loft(BODY_CTRL, sections=20, steps=14)
# neck: separate loft but same smooth logic, up to the head pivot
NECK_CTRL = [
    (0.466,  0.28,  0.092, 0.114),
    (0.51,   0.36,  0.078, 0.098),
    (0.555,  0.435, 0.058, 0.078),
]
neck = loft(NECK_CTRL, sections=16, steps=8)
body_parts = [torso, neck]
# rounded haunches + shoulder caps kill the ant look
haunch_l = blob([-BODY_R * 0.62, 0.395, -0.26], [0.082, 0.125, 0.135], subdivisions=2)
haunch_r = haunch_l.copy()
haunch_r.apply_translation([BODY_R * 1.24, 0, 0])
attach(trimesh.util.concatenate(body_parts + [haunch_l, haunch_r]),
       stripes=True, freq=26.0)

# ---- head ----------------------------------------------------------------
head = blob([0, 0.575, 0.46], [0.108, 0.098, 0.116], subdivisions=2)
muzzle = blob([0, 0.528, 0.548], [0.058, 0.048, 0.060], subdivisions=1)
jaw = blob([0, 0.50, 0.527], [0.052, 0.034, 0.046], subdivisions=1)
head_pv = np.array([0, 0.50, 0.42])
head_pv_nodes = 'head'
pivot_nodes['head'] = head_pv
hm = trimesh.util.concatenate([head, muzzle, jaw])
hm.vertices = np.asarray(hm.vertices) - head_pv
attach(hm, part='head')

# ears: tall, pointed, slight forward tilt (cat-like)
def ear(sx):
    e = trimesh.creation.cone(radius=0.034, height=0.082, sections=4)
    T = trimesh.transformations.rotation_matrix
    e.apply_transform(T(-0.20, (1, 0, 0)))
    e.apply_transform(T(-0.30 if sx < 0 else 0.30, (0, 1, 0)))
    e.apply_transform(T(np.pi / 4, (0, 0, 1)))
    e.apply_translation([sx * 0.062, 0.635, 0.495])
    return e
em = trimesh.util.concatenate([ear(-1), ear(1)])
em.vertices = np.asarray(em.vertices) - head_pv
attach(em, part='head')

# eyes: cream sclera half-dome + green iris disc + vertical slit pupil
def eyeball(sx):
    ball = trimesh.creation.icosphere(subdivisions=1, radius=0.026)
    ball.vertices = ball.vertices * np.array([1.0, 1.0, 0.55])  # flat into the face
    ball.apply_translation([sx * 0.060, 0.604, 0.546])
    iris = trimesh.creation.icosphere(subdivisions=1, radius=0.019)
    iris.vertices = iris.vertices * np.array([1.0, 1.0, 0.35])
    iris.apply_translation([sx * 0.060, 0.606, 0.556])
    pupil = trimesh.creation.box(extents=[0.0035, 0.016, 0.006])  # narrow vertical slit
    pupil.apply_translation([sx * 0.060, 0.606, 0.562])
    return [ball, iris, pupil]

iris_g = np.array([0.30, 0.55, 0.25])
pupil_b = np.array([0.05, 0.04, 0.03])
each = []
for sx in (-1, 1):
    for kind, mm in (('ball', eyeball(sx)[0]), ('iris', eyeball(sx)[1]), ('pupil', eyeball(sx)[2])):
        each.append((kind, mm))
for kind, mesh in each:
    mesh.vertices = np.asarray(mesh.vertices) - head_pv
    if kind == 'ball':
        attach(mesh, part='head', color_top=np.array([0.92, 0.90, 0.85]),
               color_bottom=np.array([0.92, 0.90, 0.85]))
    elif kind == 'iris':
        attach(mesh, part='head', color_top=iris_g, color_bottom=iris_g, patch='iris')
    else:
        attach(mesh, part='head', color_top=pupil_b, color_bottom=pupil_b, patch='pupil')

# nose: small flat stud embedded in the muzzle tip (no gap to the head)
nose = trimesh.creation.icosphere(subdivisions=0, radius=0.020)
nose.vertices = nose.vertices * np.array([1.35, 0.75, 0.75])
nose.apply_translation([0, 0.534, 0.606])
nm = nose.copy(); nm.vertices = np.asarray(nm.vertices) - head_pv
attach(nm, part='head', color_top=np.array([0.45, 0.25, 0.28]),
       color_bottom=np.array([0.38, 0.20, 0.23]), patch='nose')

# ---- legs (feet on ground plane; thigh/hock muscles, more triangles) --------
def leg(z, sx, front, rear=False):
    top = np.array([sx * LX, 0.455, z])
    thigh = top + np.array([0, -LEG_L * 0.16, front * 0.008])
    knee = top + np.array([0, -LEG_L * (0.52 if rear else 0.42),
                           front * (0.09 if rear else 0.05)])
    foot = np.array([sx * LX, 0.026, z + 0.030])  # all paws point forward
    limb = tapered(top, thigh, LEG_T * 1.05, LEG_T * 1.25, 16)
    upper = tapered(thigh, knee, LEG_T * 1.25, LEG_T * (0.85 if rear else 0.75), 14)
    lower = tapered(knee, foot, LEG_T * 0.85, LEG_T * 0.70, 14)
    hip_cap = blob(top + [0, 0.03, 0.0], [LEG_T * 1.15, LEG_T * 1.0, LEG_T * 1.35],
                   subdivisions=1)  # close the open tube top (no dark panel)
    knee_cap = blob(knee + [0, 0, -front * 0.004],
                    [LEG_T * (0.92 if rear else 0.75)] * 2 + [LEG_T * 0.85], subdivisions=1)
    # rear thigh muscle (biceps femoris bulge)
    thigh_m = blob(top + [0, -LEG_L * 0.28, front * 0.01],
                   [LEG_T * 1.75, LEG_T * 1.9, LEG_T * 1.55], subdivisions=1) if rear else None
    paw = blob(foot + [0, 0.008, 0.045],  # toes forward on every paw
               [LEG_T * 1.30, 0.050, LEG_T * 1.70], subdivisions=1)
    meshes = [limb, upper, lower, hip_cap, knee_cap] + ([thigh_m] if thigh_m else []) + [paw]
    return trimesh.util.concatenate(meshes)

LEG_NODES = {
    (-1, +1): 'leg_fl', (1, +1): 'leg_fr',
    (-1, -1): 'leg_hl', (1, -1): 'leg_hr',
}  # rear = hind leg
for sx, z, front, rear in ((-1, FLZ, +1, False), (1, FLZ, +1, False),
                           (-1, HLZ, -1, True), (1, HLZ, -1, True)):
    Lm = leg(z, sx, front, rear)
    # translate leg geometry so its PIVOT (the hip joint) sits at the local
    # origin: rotating that node then swings the limb around the hip
    offv = np.array([sx * LX, 0.42, z])
    attach2 = offv.copy()
    offv_local = offv
    pivot_nodes[LEG_NODES[(sx, front)]] = offv_local
    Lm = Lm.copy()
    Lm.vertices = np.asarray(Lm.vertices) - offv_local
    attach(Lm, part=LEG_NODES[(sx, front)])
    pivot_nodes[LEG_NODES[(sx, front)]] = offv_local

# ---- tail: back-up curve with forward hook --------------------------------
tail_pts = []
for i in range(11):
    t = i / 10
    z = -0.32 - 0.30 * np.sin(t * 1.9) * (1 - t) if t < 1 else -0.32
    y = 0.46 + 0.36 * np.sin(min(1.0, t * 1.25) * np.pi * 0.55) + 0.12 * t * t
    z += 0.16 * max(0.0, t - 0.6) ** 1.2
    tail_pts.append([0.0, y, z])
tail_pts = np.array(tail_pts)
tail_pts[6:, 2] = tail_pts[6:, 2] + np.linspace(0, 0.26, 5)
tail = trimesh.util.concatenate([
    tapered(tail_pts[i], tail_pts[i + 1],
            0.042 * (1 - 0.45 * i / 10), 0.042 * (1 - 0.45 * (i + 1) / 10), 7)
    for i in range(10)
] + [blob(tail_pts[-1], [0.026, 0.026, 0.026], subdivisions=0)])
tail_pv = tail_pts[0].copy()
tail = tail.copy()
tail.vertices = np.asarray(tail.vertices) - tail_pv
attach(tail, part='tail', color_top=DARKB)
pivot_nodes['tail'] = tail_pv

# ---------------------------------------------------------------- texture --
def fur_texture(dark_ratio=1.0):
    """Procedural fur: mottled brown body, cream belly (low v), tabby
    stripes on the back (high v). u wraps around the body axis."""
    ygrid, xgrid = np.mgrid[0:TEX_H, 0:TEX_W].astype(float)
    u = xgrid / TEX_W * 2 * np.pi
    v = ygrid / TEX_H

    def noise(w, h, octaves=4):
        acc = np.zeros((h, w))
        amp = 1.0
        tot = 0.0
        rng = np.random.default_rng(11)
        for o in range(octaves):
            gw, gh = max(3, w // (6 * 2 ** (3 - o))), max(3, h // (4 * 2 ** (3 - o)))
            base = rng.random((gh, gw)) * (1 - 0) + 0  # value grid
            g = Image.fromarray((base * 255).astype(np.uint8)).resize((w, h), Image.BILINEAR)
            acc += np.asarray(g, float) / 255 * amp
            tot += amp
            amp *= 0.5
        return acc / tot

    fur = noise(TEX_W, TEX_H)
    fur = np.asarray(Image.fromarray((fur * 255).astype(np.uint8))
                     .filter(ImageFilter.GaussianBlur(1)), float) / 255

    brown = BROWN[None, None, :] * dark_ratio
    dark = DARKB[None, None, :] * dark_ratio
    cream = CREAM[None, None, :] * dark_ratio
    img = brown + (fur[..., None] - 0.5) * 0.55
    belly = np.clip((0.46 - v) / 0.18, 0, 1)
    img = img * (1 - belly[..., None]) + cream * belly[..., None]
    bands = np.sin(u * 6.0 + np.sin(v * 7.5) * 0.9)
    stripe = np.clip(bands > 0.35, 0, 1) * np.clip((v - 0.5) / 0.25, 0, 1)
    s = (stripe * 0.85)[..., None]
    img = img * (1 - s) + dark * s
    spine = np.clip((v - 0.88) / 0.12, 0, 1)
    img *= (1 - 0.22 * spine)[..., None]
    imgp = Image.fromarray((np.clip(img, 0, 1) * 255).astype(np.uint8))
    return imgp


def feature_patches(img):
    """ Paint dedicated UV regions for eyes/nose in an unused texture corner.
    Mirrors the UV rectangles chosen by attach(..., patch=...)."""
    IRIS_GREEN = np.array([0.30, 0.55, 0.25])
    PUPIL = np.array([0.05, 0.04, 0.03])
    from PIL import ImageDraw
    d = ImageDraw.Draw(img)
    W, H = img.size
    # three horizontal patches in the u-strip 0.70..0.94, top quarter v0.02..0.14
    def rect(u0, u1, v0, v1, color):
        d.rectangle([u0 * W, v0 * H, u1 * W, v1 * H], fill=tuple(int(c * 255) for c in color))
    # image is the FLIPPED photo: PATCH_RECTS v (mesh space) must be drawn
    # mirrored — mesh v small ⇔ image y near 1.0 (bottom strip)
    for u0, u1, v0, v1, color in [
        (0.715, 0.785, 0.035, 0.125, IRIS_GREEN),
        (0.797, 0.817, 0.05, 0.12, PUPIL),
        (0.838, 0.912, 0.04, 0.13, (0.45, 0.25, 0.28)),
    ]:
        rect(u0, u1, 1 - v1, 1 - v0, color)

    # iris: darker rim + brighten center for depth
    d.ellipse([0.725 * W, (1 - 0.115) * H, 0.775 * W, (1 - 0.045) * H],
              outline=(24, 40, 20), width=2)
    d.ellipse([0.745 * W, (1 - 0.085) * H, 0.76 * W, (1 - 0.06) * H],
              fill=(150, 220, 150))
    return img


mode = sys.argv[1] if len(sys.argv) > 1 else 'brown'
out = sys.argv[2] if len(sys.argv) > 2 else 'cat_new.glb'
dark_ratio = 0.42 if mode == 'black' else 1.0

photo = fur_texture(dark_ratio)
# glTF v axis runs down the image → flip so belly (v≈0) lands at image top
photo = photo.transpose(Image.FLIP_TOP_BOTTOM)
feature_patches(photo)
photo.save(out.replace('.glb', '') + '_fur.png')

import trimesh.transformations as txf
T_m = txf.translation_matrix
scene = trimesh.Scene()
scene.graph.update(frame_to='cat', frame_from='world', matrix=np.eye(4))
tris = totv = 0
for name, g in GROUPS.items():
    m = trimesh.Trimesh(vertices=np.vstack(g['verts']), faces=np.vstack(g['faces']),
                        process=False, vertex_colors=None)
    gm = trimesh.Trimesh(vertices=np.vstack(verts), faces=np.vstack(faces),
                         vertex_colors=np.vstack(colors), process=False)
    totv += len(m.vertices); tris += len(m.faces)
    mat = PBRMaterial(name='fur', metallicFactor=0.0, roughnessFactor=0.95,
                      doubleSided=True)
    mat.baseColorTexture = photo
    m.visual = TextureVisuals(uv=np.vstack(g['uv']), material=mat)
    pv = pivot_nodes.get(name)
    T = T_m(pv) if pv is not None else np.eye(4)
    scene.add_geometry(m, geom_name=name, node_name=name, parent_node_name='cat',
                       transform=T)
scene.export(out)
print('exported', out, 'tris:', tris, 'verts:', totv, 'mode:', mode,
      'nodes:', list(GROUPS.keys()))
