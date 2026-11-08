import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import site from './site';
import { getHeightSampler } from './terrain';
import { CONFIG } from './config';
import { mulberry32, type Rng } from './rng';

/**
 * Walking cat — a real-size animated cat patrols a seeded closed loop
 * between the orchard tree rows, clamped to the terrain surface
 * (absolute DHHN via the height sampler). The model (public/models/cat.glb,
 * MIT, Agentshire contributors) animates named rigid limb nodes
 * (body/tail/4 legs, no skinned mesh), so a plain AnimationMixer on the
 * gltf animations works without skeleton retargeting.
 */

export type Cat = {
  group: THREE.Group;
  /** patrol loop length in metres */
  pathLength: number;
  /** advance along the loop; no-op while hidden */
  update(dt: number): void;
  setVisible(v: boolean): void;
  /** current cat pose for the chase cam and verification probes */
  followPose(): { position: THREE.Vector3; heading: number };
  /** debug/verification surface: mixer + loaded clips (walk binds at load) */
  mixer: THREE.AnimationMixer;
  clips: THREE.AnimationClip[];
};

/** FNV-1a: CONFIG.CAT.SEED string → 32-bit mulberry32 seed */
function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Patrol waypoints: candidates on a jittered ring inside the orchard tree
 * area (angle-sorted so they form a closed star loop), rejection-sampled to
 * keep clearance from every registered tree. The Catmull-Rom curve sags
 * between waypoints, so the FINAL curve is verified densely and the margin
 * escalates until the whole loop keeps CONFIG.CAT.CLEARANCE.
 */
function patrolLoop(getHeight: (x: number, z: number) => number): THREE.Vector3[] {
  const trees = site.trees;
  const xs = trees.map((t) => t.x);
  const zs = trees.map((t) => t.z);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cz = (Math.min(...zs) + Math.max(...zs)) / 2;
  const spanX = (Math.max(...xs) - Math.min(...xs)) / 2;
  const spanZ = (Math.max(...zs) - Math.min(...zs)) / 2;
  const ringR = Math.min(spanX, spanZ) * 0.55;

  const build = (extra: number): { curve: THREE.CatmullRomCurve3; pts: THREE.Vector3[] } | null => {
    const rng: Rng = mulberry32(hashSeed(CONFIG.CAT.SEED));
    const candidates: [number, number, number][] = []; // [x, z, angle]
    for (let i = 0; i < 400 && candidates.length < 40; i++) {
      const a = rng() * Math.PI * 2;
      const r = ringR * (0.7 + 0.3 * rng());
      const x = cx + Math.cos(a) * r;
      const z = cz + Math.sin(a) * r;
      const minDist = Math.min(...trees.map((t) => Math.hypot(t.x - x, t.z - z)));
      if (minDist >= CONFIG.CAT.CLEARANCE + extra) candidates.push([x, z, a]);
    }
    if (candidates.length < 6) return null;
    // angle sort around the centroid → simple closed loop; thin out to ~10
    candidates.sort((p, q) => p[2] - q[2]);
    const keep = Math.min(10, candidates.length);
    const step = candidates.length / keep;
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i < keep; i++) {
      const [x, z] = candidates[Math.floor(i * step)];
      pts.push(new THREE.Vector3(x, getHeight(x, z), z));
    }
    return { curve: new THREE.CatmullRomCurve3(pts, true, 'centripetal'), pts };
  };

  const curveClearance = (curve: THREE.CatmullRomCurve3): number => {
    let minD = Infinity;
    const p = new THREE.Vector3();
    for (let i = 0; i < 240; i++) {
      curve.getPointAt(i / 240, p);
      for (const t of trees) minD = Math.min(minD, Math.hypot(t.x - p.x, t.z - p.z));
    }
    return minD;
  };

  // escalate the waypoint margin until the smooth curve itself is clear
  for (const extra of [0.5, 1.5, 3, 5, 8]) {
    const built = build(extra);
    if (!built) continue;
    if (curveClearance(built.curve) >= CONFIG.CAT.CLEARANCE) return built.pts;
  }
  // open meadow — this line is unreachable in practice; last resort keeps the
  // loosest set rather than failing the module
  return build(8)?.pts ?? [];
}

/** model's forward already matches its path tangent — verified by the
 *  front-probe (camera ahead of the cat sees its face, MODEL_YAW=0) */
const MODEL_YAW = 0;

export async function createCat(): Promise<Cat> {
  const cfg = CONFIG.CAT;
  const getHeight = await getHeightSampler();

  const curve = new THREE.CatmullRomCurve3(patrolLoop(getHeight), true, 'centripetal');
  const pathLength = curve.getLength();

  const gltf = await new GLTFLoader().loadAsync('/models/cat.glb');
  const model = gltf.scene;
  model.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.castShadow = true;
  });

  // normalize to real size: longest bbox axis → BODY_LENGTH × SCALE, feet on y=0
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const s = (cfg.BODY_LENGTH * cfg.SCALE) / Math.max(size.x, size.y, size.z);
  const inner = new THREE.Group();
  inner.add(model);
  inner.scale.setScalar(s);
  inner.position.y = -box.min.y * s;

  const group = new THREE.Group();
  group.add(inner);
  group.visible = cfg.ENABLED;

  const mixer = new THREE.AnimationMixer(model);
  // the cat walks while patrolling; the idle clip exists but is never
  // triggered (the cat never stops) — walk first, fall back to any clip
  const walkClip = gltf.animations.find((c) => /walk/i.test(c.name)) ?? gltf.animations[0];
  const walk = walkClip ? mixer.clipAction(walkClip) : null;
  walk?.play();

  let u = 0;
  const pos = new THREE.Vector3();
  const tan = new THREE.Vector3();

  return {
    group,
    pathLength,
    mixer,
    clips: gltf.animations,
    update(dt: number): void {
      if (!group.visible) return;
      // clamp huge frames (tab switches, slow renderers): without this the
      // cat teleports along the path by minutes of accumulated dt
      const d = Math.min(dt, 0.1);
      u = (u + (cfg.SPEED * d) / pathLength) % 1;
      curve.getPointAt(u, pos);
      curve.getTangentAt(u, tan);
      group.position.set(pos.x, getHeight(pos.x, pos.z), pos.z);
      group.rotation.y = Math.atan2(tan.x, tan.z) + MODEL_YAW;
      mixer.update(d);
    },
    setVisible(v: boolean): void {
      group.visible = v;
    },
    followPose(): { position: THREE.Vector3; heading: number } {
      curve.getPointAt(u, pos);
      curve.getTangentAt(u, tan);
      return {
        position: new THREE.Vector3(pos.x, getHeight(pos.x, pos.z), pos.z),
        heading: Math.atan2(tan.x, tan.z),
      };
    },
  };
}
