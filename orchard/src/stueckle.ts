import * as THREE from 'three';
import { CONFIG } from './config';
import site from './site';
import { getHeightSampler } from './terrain';

/**
 * The "Stückle": small private garden plot east of the orchard, towards the
 * small trail (newimages/stueckle.png). No LoD data exists for it, so the
 * structures are procedural, laid out from the aerial: wire-mesh fence
 * around CONFIG.STUECKLE.POLYGON, two gable-roofed tool huts (2-2.5 m), a
 * low translucent greenhouse, compost heaps, one conifer. The soil beds
 * visible from above are already in the DOP ground texture. Everything is
 * seeded and deterministic; all tunables live in CONFIG.STUECKLE.
 */

interface HutSpec {
  pos: [number, number];
  size: [number, number]; // footprint w (ridge direction) x d
  WALL_H: number;
  ROOF: number;
  WALL: number;
  RIDGE: 'x' | 'z';
}

export interface Stueckle {
  group: THREE.Group;
}

const hex = (c: number): string => `#${c.toString(16).padStart(6, '0')}`;

function mulberry32(a: number): () => number {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const canvasTexture = (
  w: number,
  h: number,
  draw: (ctx: CanvasRenderingContext2D) => void,
): THREE.CanvasTexture => {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  draw(cv.getContext('2d')!);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
};

/** gable-roofed hut: box body + prism roof, canvas wall/roof textures */
function buildHut(hut: HutSpec, rng: () => number): THREE.Group {
  const g = new THREE.Group();
  const [w, d] = hut.size;
  const wh = hut.WALL_H;
  // body
  const wallTex = canvasTexture(128, 64, (ctx) => {
    ctx.fillStyle = hex(hut.WALL);
    ctx.fillRect(0, 0, 128, 64);
    // subtle horizontal weathering streaks
    for (let i = 0; i < 6; i++) {
      ctx.fillStyle = `rgba(0,0,0,${0.03 + rng() * 0.04})`;
      ctx.fillRect(0, Math.floor(rng() * 64), 128, 1 + Math.floor(rng() * 3));
    }
    // door + window on the long side
    ctx.fillStyle = hex(0x4a3f35);
    ctx.fillRect(8, 22, 14, 42);
    ctx.fillStyle = hex(0x39434e);
    ctx.fillRect(84, 24, 26, 22);
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.strokeRect(84.5, 24.5, 25, 21);
  });
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(w, wh, d),
    new THREE.MeshLambertMaterial({ map: wallTex }),
  );
  body.position.y = wh / 2;
  body.castShadow = true;
  body.receiveShadow = true;
  g.add(body);
  // gable prism roof: the ridge runs along the footprint's RIDGE axis; the
  // gable width must match the body's CROSS extent (d for ridge 'z', w for
  // ridge 'x') and the extrusion the ridge extent, or the roof lands
  // offset next to the body
  const roofTex = canvasTexture(128, 64, (ctx) => {
    ctx.fillStyle = hex(hut.ROOF);
    ctx.fillRect(0, 0, 128, 64);
    for (let x = 0; x < 128; x += 4) {
      ctx.fillStyle = `rgba(0,0,0,${0.10 + rng() * 0.08})`;
      ctx.fillRect(x, 0, 2, 64); // corrugation / tile lines
    }
  });
  roofTex.wrapS = THREE.RepeatWrapping;
  roofTex.repeat.set(2, 1);
  const roofH = 0.9 + rng() * 0.4;
  const gableW = (hut.RIDGE === 'x' ? w : d) + 0.3;
  const ridgeL = (hut.RIDGE === 'x' ? d : w) + 0.3;
  const shape = new THREE.Shape([
    new THREE.Vector2(-gableW / 2, 0),
    new THREE.Vector2(gableW / 2, 0),
    new THREE.Vector2(0, roofH),
  ]);
  const roof = new THREE.Mesh(
    new THREE.ExtrudeGeometry(shape, { depth: ridgeL, bevelEnabled: false }),
    new THREE.MeshLambertMaterial({ map: roofTex, side: THREE.DoubleSide }),
  );
  roof.rotation.y = hut.RIDGE === 'x' ? 0 : Math.PI / 2;
  if (hut.RIDGE === 'x') {
    // extrusion runs local z 0..ridgeL -> world -z: pull back to centre
    roof.position.set(0, wh, -ridgeL / 2);
  } else {
    // ridge along z: the extrusion maps to world +x, so pull back -x
    roof.position.set(-ridgeL / 2, wh, 0);
  }
  roof.castShadow = true;
  roof.receiveShadow = true;
  g.add(roof);
  return g;
}

export async function createStueckle(): Promise<Stueckle> {
  const cfg = CONFIG.STUECKLE;
  const getHeight = await getHeightSampler();
  const group = new THREE.Group();
  group.name = 'stueckle';
  const rng = mulberry32(cfg.SEED);

  // ground y from the DGM at the plot's centroid
  const cx =
    cfg.POLYGON.reduce((s, p) => s + p[0], 0) / cfg.POLYGON.length;
  const cz =
    cfg.POLYGON.reduce((s, p) => s + p[1], 0) / cfg.POLYGON.length;
  const groundY = getHeight(cx, cz);

  // --- fence: posts + translucent mesh strip along the polygon edges ---
  const postGeo = new THREE.BoxGeometry(0.06, cfg.FENCE.HEIGHT + 0.15, 0.06);
  const postMat = new THREE.MeshLambertMaterial({ color: cfg.FENCE.POST });
  const meshTex = canvasTexture(64, 64, (ctx) => {
    ctx.clearRect(0, 0, 64, 64);
    ctx.strokeStyle = hex(cfg.FENCE.MESH);
    ctx.lineWidth = 1.5;
    for (let i = -64; i < 64; i += 8) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i + 64, 64);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(i + 64, 0);
      ctx.lineTo(i, 64);
      ctx.stroke();
    }
  });
  meshTex.wrapS = THREE.RepeatWrapping;
  meshTex.wrapT = THREE.RepeatWrapping;
  const meshMat = new THREE.MeshLambertMaterial({
    map: meshTex,
    transparent: true,
    opacity: cfg.FENCE.MESH_OPACITY,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const n = cfg.POLYGON.length;
  for (let i = 0; i < n; i++) {
    const [x0, z0] = cfg.POLYGON[i];
    const [x1, z1] = cfg.POLYGON[(i + 1) % n];
    const ex = x1 - x0;
    const ez = z1 - z0;
    const len = Math.hypot(ex, ez);
    const ang = Math.atan2(ex, ez);
    // posts
    const nPosts = Math.max(1, Math.round(len / cfg.FENCE.POST_SPACING));
    for (let pI = 0; pI <= nPosts; pI++) {
      const t = pI / nPosts;
      const post = new THREE.Mesh(postGeo, postMat);
      post.position.set(x0 + ex * t, groundY + (cfg.FENCE.HEIGHT + 0.15) / 2, z0 + ez * t);
      post.castShadow = true;
      group.add(post);
    }
    // mesh strip
    const strip = new THREE.Mesh(
      new THREE.PlaneGeometry(len, cfg.FENCE.HEIGHT),
      meshMat,
    );
    strip.position.set(
      x0 + ex / 2,
      groundY + cfg.FENCE.HEIGHT / 2 + 0.05,
      z0 + ez / 2,
    );
    strip.rotation.y = ang;
    group.add(strip);
  }

  // --- huts ---
  for (const hut of cfg.HUTS) {
    const h = buildHut(hut, rng);
    h.position.set(hut.pos[0], getHeight(hut.pos[0], hut.pos[1]), hut.pos[1]);
    if (hut.ROT) h.rotation.y = hut.ROT;
    group.add(h);
  }

  // --- greenhouse: low translucent box on a light frame ---
  const gh = cfg.GREENHOUSE;
  const ghMesh = new THREE.Mesh(
    new THREE.BoxGeometry(gh.size[0], gh.H, gh.size[1]),
    new THREE.MeshLambertMaterial({
      color: 0xdfe8e4,
      transparent: true,
      opacity: 0.45,
    }),
  );
  ghMesh.position.set(gh.pos[0], getHeight(gh.pos[0], gh.pos[1]) + gh.H / 2, gh.pos[1]);
  ghMesh.rotation.y = gh.ROT;
  ghMesh.castShadow = true;
  group.add(ghMesh);

  // --- compost heaps: small dark mounds ---
  const compostMat = new THREE.MeshLambertMaterial({ color: 0x3d3327 });
  for (const [px, pz] of cfg.COMPOST) {
    const mound = new THREE.Mesh(
      new THREE.SphereGeometry(0.7 + rng() * 0.3, 10, 8),
      compostMat,
    );
    mound.scale.y = 0.45;
    mound.position.set(px, getHeight(px, pz) + 0.15, pz);
    mound.castShadow = true;
    group.add(mound);
  }

  // --- one conifer, static (evergreen) ---
  const conifer = new THREE.Group();
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.08, 0.12, 1.2, 6),
    new THREE.MeshLambertMaterial({ color: 0x5a4632 }),
  );
  trunk.position.y = 0.6;
  conifer.add(trunk);
  const needleMat = new THREE.MeshLambertMaterial({ color: 0x2e4a2e });
  [[1.6, 1.1, 1.9], [1.2, 0.9, 3.0], [0.8, 0.7, 3.9]].forEach(([r, h, y]) => {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(r, h, 8), needleMat);
    cone.position.y = y;
    cone.castShadow = true;
    conifer.add(cone);
  });
  conifer.position.set(cfg.CONIFER[0], getHeight(cfg.CONIFER[0], cfg.CONIFER[1]), cfg.CONIFER[1]);
  group.add(conifer);

  console.info(`stueckle: plot at (${cx.toFixed(0)}, ${cz.toFixed(0)}), ground y ${groundY.toFixed(2)}`);
  void site;
  return { group };
}
