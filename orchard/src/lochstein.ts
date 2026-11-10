import * as THREE from 'three';
import { Brush, Evaluator, SUBTRACTION } from 'three-bvh-csg';
import { CONFIG } from './config';
import site from './site';
import { utm32 } from './panel';
import { mulberry32 } from './rng';

/**
 * The Lochstein (OSM node 7697255398, tourism=artwork, artwork_type=
 * sculpture, stone): the three-piece sculpture at the north-east path
 * junction — an irregular polished slab with a circular through-hole,
 * balanced on a rough grey support boulder via a small pivot stone.
 *
 * Position, azimuth and every dimension come from CONFIG.LOCHSTEIN — no
 * verbatim numbers here. The WGS84 position is converted to the app-local
 * frame with the same projection the site pipeline uses (EPSG:25832,
 * ETRS89 / UTM 32N; local: +x = east, +z = south — see prepare_site.py
 * to_local), exactly like panel.ts.
 *
 * Clean "when new" look by user decision 2026-11-10: light greenish-grey
 * polished stone with white/light-green diagonal veining, NO graffiti.
 */

export type Lochstein = {
  group: THREE.Group;
  /** dispose textures/materials/geometries (module API completeness) */
  dispose(): void;
};

/** Deterministic per-position vertex jitter (±amp). Hashed from the
 *  vertex POSITION so duplicated vertices of non-indexed polyhedron
 *  geometries move together — the surface stays closed. */
function jitterGeometry(geom: THREE.BufferGeometry, amp: number, seed: number): void {
  const pos = geom.getAttribute('position') as THREE.BufferAttribute;
  const h = (x: number, y: number, z: number, s: number): number => {
    const v = Math.sin(x * 127.1 + y * 311.7 + z * 74.7 + s * 53.13 + seed) * 43758.5453;
    return v - Math.floor(v);
  };
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    pos.setXYZ(
      i,
      x * (1 + amp * (2 * h(x, y, z, 1) - 1)),
      y * (1 + amp * (2 * h(x, y, z, 2) - 1)),
      z * (1 + amp * (2 * h(x, y, z, 3) - 1)),
    );
  }
  pos.needsUpdate = true;
  geom.computeVertexNormals();
}

/** 512² canvas: light greenish-grey polished base (CONFIG.LOCHSTEIN.
 *  COLOR_BASE) with subtle noise and a few tapered diagonal veins
 *  (white / light green), slightly blurred. */
function makeStoneTexture(baseColor: string): THREE.CanvasTexture {
  const S = 512;
  const canvas = document.createElement('canvas');
  canvas.width = S;
  canvas.height = S;
  const ctx = canvas.getContext('2d')!;
  const rnd = mulberry32(20261110);

  // base: clean light greenish-grey polished stone
  ctx.fillStyle = baseColor;
  ctx.fillRect(0, 0, S, S);
  // subtle mineral noise
  for (let i = 0; i < 2600; i++) {
    const light = rnd() > 0.5;
    ctx.fillStyle = light
      ? `rgba(210,225,205,${(rnd() * 0.05).toFixed(3)})`
      : `rgba(8,12,10,${(rnd() * 0.06).toFixed(3)})`;
    const s = 1 + rnd() * 3;
    ctx.fillRect(rnd() * S, rnd() * S, s, s);
  }

  // diagonal veins: gently curving polylines, tapered (thin ends, wide
  // middle), drawn with a slight blur for the polished-in look
  ctx.lineCap = 'round';
  ctx.filter = 'blur(1.2px)';
  for (let v = 0; v < 9; v++) {
    const col = rnd() > 0.45 ? '232,238,228' : '168,196,154';
    const x0 = rnd() * S * 1.2 - S * 0.1;
    const y0 = rnd() * S;
    const len = S * (0.5 + rnd() * 0.8);
    const ang = (-38 + rnd() * 14) * (Math.PI / 180);
    const n = 14;
    const pts: Array<[number, number]> = [];
    let drift = 0;
    for (let k = 0; k <= n; k++) {
      drift += (rnd() - 0.5) * 6;
      const t = k / n;
      pts.push([
        x0 + Math.cos(ang) * len * t - Math.sin(ang) * drift,
        y0 + Math.sin(ang) * len * t + Math.cos(ang) * drift,
      ]);
    }
    const wMax = 1.2 + rnd() * 2.2;
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n;
      ctx.strokeStyle = `rgba(${col},${(0.25 + rnd() * 0.4).toFixed(2)})`;
      ctx.lineWidth = Math.max(0.4, wMax * Math.sin(Math.PI * t));
      ctx.beginPath();
      ctx.moveTo(pts[k][0], pts[k][1]);
      ctx.lineTo(pts[k + 1][0], pts[k + 1][1]);
      ctx.stroke();
    }
  }
  ctx.filter = 'none';

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  // ExtrudeGeometry UVs are in shape metres (x, y) — wrap + repeat ≈ 1/3.4
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(0.3, 0.3);
  return tex;
}

/** The slab face outline: an irregular rounded lens/tortoise silhouette —
 *  flatter base, wavy top edge, rounded ends — over the LENGTH × HEIGHT
 *  box. Fractions are of that box (±0.5 = the ends, 0/1 = base/top);
 *  smoothed through a closed Catmull-Rom curve (~12 control vertices). */
function slabShape(L: number, H: number): THREE.Shape {
  const f: Array<[number, number]> = [
    [-0.485, 0.045], [-0.24, 0.012], [0.0, 0.03], [0.245, 0.012], [0.472, 0.05],
    [0.5, 0.34], // right end
    [0.31, 0.94], [0.07, 1.0], [-0.19, 0.92], [-0.4, 0.98], // wavy top
    [-0.5, 0.62], [-0.51, 0.3], // left end
  ];
  const curve = new THREE.CatmullRomCurve3(
    f.map(([u, v]) => new THREE.Vector3(u * L, v * H, 0)),
    true,
    'catmullrom',
    0.6,
  );
  const pts = curve.getPoints(120).map((p) => new THREE.Vector2(p.x, p.y));
  return new THREE.Shape(pts);
}

export function createLochstein(getHeight: (x: number, z: number) => number): Lochstein {
  const cfg = CONFIG.LOCHSTEIN;

  // WGS84 → EPSG:25832 → app-local metres (panel.ts path):
  // x = easting − origin.utmE (east), z = origin.utmN − northing (south)
  const [e, n] = utm32(cfg.LAT, cfg.LON);
  const x = e - site.origin.utmE;
  const z = site.origin.utmN - n;
  const groundY = getHeight(x, z); // plaza pavement ≈ DGM

  const group = new THREE.Group();
  group.position.set(x, groundY, z);
  // slab face (local +z) points toward compass azimuth FACE_AZIMUTH_DEG:
  // rotate local +z (0,0,1) onto (sin A, 0, -cos A)  ⇒  yaw = π - A
  group.rotation.y = Math.PI - (cfg.FACE_AZIMUTH_DEG * Math.PI) / 180;

  // ------------------------------------------------------------------
  // support boulder: jittered icosahedron, squashed to SUPPORT_HEIGHT,
  // plain rough grey, flat shading
  const boulderMat = new THREE.MeshStandardMaterial({
    color: 0x8a8a86,
    roughness: 0.95,
    flatShading: true,
  });
  const boulderGeo = new THREE.IcosahedronGeometry(cfg.SUPPORT_WIDTH / 2, 1);
  jitterGeometry(boulderGeo, 0.15, 7697255);
  boulderGeo.computeBoundingBox();
  const bb = boulderGeo.boundingBox!;
  boulderGeo.scale(1, cfg.SUPPORT_HEIGHT / (bb.max.y - bb.min.y), 1);
  boulderGeo.computeBoundingBox();
  const bc = boulderGeo.boundingBox!.getCenter(new THREE.Vector3());
  boulderGeo.translate(-bc.x, -bc.y, -bc.z);
  const boulder = new THREE.Mesh(boulderGeo, boulderMat);
  boulder.position.y = cfg.SUPPORT_HEIGHT / 2;
  boulder.castShadow = true;
  boulder.receiveShadow = true;
  group.add(boulder);

  // ------------------------------------------------------------------
  // pivot stone: small icosahedron wedged between the boulder top and the
  // slab base (centre on the contact plane, y-squashed — it shows as a
  // small stone collar where slab meets boulder, the "balanced" look)
  const pivotGeo = new THREE.IcosahedronGeometry(cfg.PIVOT / 2, 0);
  jitterGeometry(pivotGeo, 0.15, 7697256);
  pivotGeo.scale(1, 0.7, 1);
  const pivot = new THREE.Mesh(pivotGeo, boulderMat);
  pivot.position.set(-cfg.LENGTH / 2 + 0.45 * cfg.LENGTH, cfg.SUPPORT_HEIGHT, 0);
  pivot.castShadow = true;
  group.add(pivot);

  // ------------------------------------------------------------------
  // slab: face-outline Shape, extruded along the face normal (local +z),
  // centred on the extrusion axis; the through-hole is NOT an extrude hole
  // (it cannot be oblique) but a CSG subtraction of a tilted cylinder
  let slabGeo: THREE.BufferGeometry;
  const shape = slabShape(cfg.LENGTH, cfg.HEIGHT);
  const sourceGeo = new THREE.ExtrudeGeometry(shape, {
    depth: cfg.THICKNESS,
    bevelEnabled: true,
    bevelThickness: 0.03,
    bevelSize: 0.03,
    bevelSegments: 2,
    curveSegments: 24,
  });
  sourceGeo.translate(0, 0, -cfg.THICKNESS / 2);

  // bore: cylinder radius HOLE_DIAMETER/2, length 3.5 (fully outside the
  // 0.4 m + bevel slab on both ends, so only the bore is removed). Centre
  // at ((HOLE_U-0.5)·LENGTH, HOLE_V·HEIGHT, 0) in slab-local coords; the
  // axis is swung HOLE_TILT_DEG about the vertical toward local +x —
  // slab-local axis (sin T, 0, cos T): cylinder default axis +Y →
  // rotateX(π/2) puts it on +Z (the face normal), then rotateY(T).
  const boreGeo = new THREE.CylinderGeometry(
    cfg.HOLE_DIAMETER / 2,
    cfg.HOLE_DIAMETER / 2,
    3.5,
    32,
  );
  boreGeo.rotateX(Math.PI / 2);
  boreGeo.rotateY((cfg.HOLE_TILT_DEG * Math.PI) / 180);
  boreGeo.translate(
    (cfg.HOLE_U - 0.5) * cfg.LENGTH,
    cfg.HOLE_V * cfg.HEIGHT,
    0,
  );

  // SUBTRACTION on the extruded+beveled+translated slab geometry; the
  // CSG result becomes the mesh geometry, intermediates are disposed
  const slabBrush = new Brush(sourceGeo);
  slabBrush.updateMatrixWorld();
  const boreBrush = new Brush(boreGeo);
  boreBrush.updateMatrixWorld();
  const evaluator = new Evaluator();
  evaluator.useGroups = false;
  slabGeo = (evaluator.evaluate(slabBrush, boreBrush, SUBTRACTION) as THREE.Mesh)
    .geometry;
  sourceGeo.dispose();
  boreGeo.dispose();

  const slabMat = new THREE.MeshStandardMaterial({
    map: makeStoneTexture(cfg.COLOR_BASE),
    roughness: cfg.ROUGHNESS, // polished stone — catches sun/sky highlights
  });
  const slab = new THREE.Mesh(slabGeo, slabMat);
  slab.position.y = cfg.SUPPORT_HEIGHT; // base on the boulder top
  // no tilt unless configured (slab base stays horizontal)
  slab.rotation.x = (cfg.TILT_DEG * Math.PI) / 180;
  slab.castShadow = true;
  slab.receiveShadow = true;
  group.add(slab);

  return {
    group,
    dispose(): void {
      slabGeo.dispose();
      boulderGeo.dispose();
      pivotGeo.dispose();
      if (slabMat.map) slabMat.map.dispose();
      slabMat.dispose();
      boulderMat.dispose();
    },
  };
}
