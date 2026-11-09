import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js';
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js';
// typeface JSON bundled as a module (NOT fetched via import.meta.url — that
// crosses the www dev server's fs.allow root and 403s the embed mount)
import helvetikerBold from 'three/examples/fonts/helvetiker_bold.typeface.json';
import { getHeightSampler } from './terrain';
import { CONFIG } from './config';

/**
 * Cat with a one-shot route (user choreography): it starts on top of a
 * Stückle fence post, jumps off (small ballistic hop; if no fence post
 * exists it simply starts standing at the post anchor), walks through the
 * middle of the orchard, then stops facing a Hochsitz — where a small mug
 * with embossed "MOST" waits for it. The model (public/models/cat.glb,
 * MIT, Agentshire contributors) animates named rigid limb nodes
 * (body/tail/4 legs, no skinned mesh); walk plays while moving, idle
 * takes over at the stop.
 */

export type CatPhase = 'jump' | 'walk' | 'idle';

export type Cat = {
  group: THREE.Group;
  /** on-ground route length in metres (jump excluded) */
  pathLength: number;
  /** advance the route; no-op while hidden or after stopping */
  update(dt: number): void;
  setVisible(v: boolean): void;
  /** the jug + apples still life at the stop point; visibility sync with the cat */
  stillLife: THREE.Group;
  /** current cat pose for the chase cam and verification probes */
  followPose(): { position: THREE.Vector3; heading: number };
  /** debug/verification surface */
  phase: CatPhase;
  mixer: THREE.AnimationMixer;
  clips: THREE.AnimationClip[];
};

/** model's forward already matches its path tangent — verified by the
 *  front-probe (camera ahead of the cat sees its face, MODEL_YAW=0) */
const MODEL_YAW = 0;

/** stone jug with embossed "MOST" (lathe profile + canvas bump label) and
 *  five apples beside it. If a real model exists (public/models/jug.glb,
 *  e.g. a downloaded Sketchfab jug), it is used instead of the lathe. */
async function buildStillLife(): Promise<THREE.Group> {
  const g = new THREE.Group();
  const loader = new GLTFLoader();

  // --- jug --------------------------------------------------------------
  try {
    const gltf = await loader.loadAsync('/models/jug.glb');
    const jug = gltf.scene;
    jug.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });
    g.add(jug);
    return g; // real model — no procedural fallback, no label needed
  } catch { /* no jug.glb — procedural jug below */ }

  const ceramic = new THREE.MeshStandardMaterial({ color: 0x9a8878, roughness: 0.65 });
  // lathe profile: foot, belly, shoulder, neck, flared lip (in metres)
  const pts: THREE.Vector2[] = [
    new THREE.Vector2(0.0, 0.0), new THREE.Vector2(0.055, 0.0),
    new THREE.Vector2(0.062, 0.012), new THREE.Vector2(0.075, 0.055),
    new THREE.Vector2(0.078, 0.10), new THREE.Vector2(0.065, 0.145),
    new THREE.Vector2(0.042, 0.175), new THREE.Vector2(0.038, 0.195),
    new THREE.Vector2(0.046, 0.215), new THREE.Vector2(0.048, 0.225),
  ];
  const body = new THREE.Mesh(new THREE.LatheGeometry(pts, 28), ceramic);
  body.material.side = THREE.DoubleSide;
  body.castShadow = true;
  g.add(body);
  const handle = new THREE.Mesh(
    new THREE.TorusGeometry(0.045, 0.011, 10, 24, Math.PI * 1.15),
    ceramic,
  );
  handle.position.set(0.075, 0.135, 0);
  handle.rotation.z = -Math.PI * 0.42;
  handle.castShadow = true;
  g.add(handle);
  // label base (plain ceramic) + REAL extruded "MOST" letters standing off
  // the surface (user: bump-only text was unreadable; wants visible relief)
  const label = new THREE.Mesh(
    new THREE.PlaneGeometry(0.085, 0.032),
    new THREE.MeshStandardMaterial({ color: 0x9a8878, roughness: 0.55 }),
  );
  label.position.set(0, 0.09, 0.0755);
  g.add(label);
  // helvetiker_bold parsed from the bundled JSON module (no network fetch)
  const font = new FontLoader().parse(helvetikerBold as never);
  const textGeo = new TextGeometry('MOST', {
    font,
    size: 0.017,
    depth: 0.006, // stands 6 mm off the jug
    curveSegments: 5,
    bevelEnabled: true,
    bevelThickness: 0.001,
    bevelSize: 0.0008,
    bevelSegments: 2,
  });
  textGeo.computeBoundingBox();
  const bb = textGeo.boundingBox!;
  textGeo.translate(
    -(bb.min.x + bb.max.x) / 2,
    -(bb.min.y + bb.max.y) / 2,
    0,
  );
  const letters = new THREE.Mesh(
    textGeo,
    new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.5 }),
  );
  letters.position.set(0, 0.09, 0.0762);
  g.add(letters);

  // --- five apples beside the jug ---------------------------------------
  // procedural apple per the user's reference (newimages/apple-3d.png,
  // CC BY "Low Poly Apple Game Ready" by -Arthur-, sketchfab.com — the
  // mesh itself is not available, so this is an homage, not a copy):
  // lathe body with a deep top basin, red fading to yellow-green at the
  // bottom (vertex colors), bent dark stem.
  const APPLE_R = 0.034;
  const appleProfile: THREE.Vector2[] = [
    new THREE.Vector2(0.0, 0.0),
    new THREE.Vector2(0.014, 0.002), // flattened bottom
    new THREE.Vector2(0.026, 0.008),
    new THREE.Vector2(0.033, 0.02),
    new THREE.Vector2(APPLE_R, 0.032), // equator
    new THREE.Vector2(0.031, 0.044),
    new THREE.Vector2(0.022, 0.052), // crown rises toward the stem
    new THREE.Vector2(0.012, 0.056), // lip of the basin
    new THREE.Vector2(0.01, 0.051), // down into the dimple
    new THREE.Vector2(0.004, 0.049),
  ];
  const red = new THREE.Color(0xc0392b);
  const orange = new THREE.Color(0xd14b32);
  const blush = new THREE.Color(0xc9b45a);
  const stemMat = new THREE.MeshStandardMaterial({ color: 0x3e2e20, roughness: 0.8 });
  const appleAt = (x: number, z: number, rnd: number): void => {
    const geo = new THREE.LatheGeometry(appleProfile, 18);
    // vertex gradient: blush at the base -> red over the upper body
    const top = rnd > 0.5 ? red : orange;
    const pos = geo.getAttribute('position');
    const colors = new Float32Array(pos.count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const t = THREE.MathUtils.clamp(pos.getY(i) / 0.045, 0, 1);
      c.copy(blush).lerp(top, THREE.MathUtils.smoothstep(t, 0.1, 0.75));
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const a = new THREE.Group();
    const body = new THREE.Mesh(
      geo,
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4 }),
    );
    body.castShadow = true;
    a.add(body);
    // bent stem (S-curve out of the basin)
    const stemCurve = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(0, 0.047, 0),
      new THREE.Vector3(0.004, 0.058, 0.001),
      new THREE.Vector3(0.011, 0.067, 0.004),
    );
    const stem = new THREE.Mesh(new THREE.TubeGeometry(stemCurve, 8, 0.0022, 6), stemMat);
    a.add(stem);
    a.position.set(x, 0, z);
    a.rotation.y = rnd * Math.PI * 2;
    // user: 50% larger apples
    a.scale.setScalar(1.5);
    if (rnd > 0.8) {
      // one apple lying on its side in the grass
      a.rotation.x = Math.PI / 2 - 0.25;
      a.position.y = 0.03;
    }
    g.add(a);
  };
  let seed = 20261109;
  const rnd = (): number => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  appleAt(0.16, 0.05, rnd());
  appleAt(0.21, -0.06, rnd());
  appleAt(0.09, -0.14, rnd());
  appleAt(0.26, 0.04, rnd());
  appleAt(0.14, 0.16, rnd());
  return g;
}

export async function createCat(fencePosts: THREE.Vector3[] = []): Promise<Cat> {
  const cfg = CONFIG.CAT;
  const R = cfg.ROUTE;
  const getHeight = await getHeightSampler();

  // --- route waypoints -------------------------------------------------
  // jump-off post: nearest real fence post to the configured anchor; if
  // none exist, start standing at the anchor on the ground (no jump)
  let postTop: THREE.Vector3 | null = null;
  if (fencePosts.length > 0) {
    let best = fencePosts[0];
    let bestD = Infinity;
    for (const p of fencePosts) {
      const d = Math.hypot(p.x - R.JUMP_FROM[0], p.z - R.JUMP_FROM[1]);
      if (d < bestD) { bestD = d; best = p; }
    }
    postTop = best.clone();
  }
  const postGround = postTop
    ? new THREE.Vector3(postTop.x, getHeight(postTop.x, postTop.z), postTop.z)
    : new THREE.Vector3(R.JUMP_FROM[0], getHeight(R.JUMP_FROM[0], R.JUMP_FROM[1]), R.JUMP_FROM[1]);
  const land = postGround.clone().add(new THREE.Vector3(R.LAND_OFFSET[0], 0, R.LAND_OFFSET[1]));
  land.y = getHeight(land.x, land.z);

  // orchard middle: configured waypoint on the meadow (CONFIG.CAT.ROUTE.MID)
  const mid = new THREE.Vector3(R.MID[0], getHeight(R.MID[0], R.MID[1]), R.MID[1]);

  // stop point: STAND_OFF metres from the Hochsitz, on the mid→Hochsitz line
  const hoch = new THREE.Vector3(R.HOCHSITZ[0], getHeight(R.HOCHSITZ[0], R.HOCHSITZ[1]), R.HOCHSITZ[1]);
  const toHoch = hoch.clone().sub(mid).setY(0).normalize();
  const stop = hoch.clone().addScaledVector(toHoch, -R.STAND_OFF);
  stop.y = getHeight(stop.x, stop.z);
  const faceYaw = Math.atan2(toHoch.x, toHoch.z);

  // two straight legs — land→orchard middle→stop. A cat turns quickly at
  // the corner; straight legs keep the route predictable (a single
  // Catmull-Rom over these points bulges far around the Hochsitz).
  const walkPath = new THREE.CurvePath<THREE.Vector3>();
  walkPath.add(new THREE.LineCurve3(land.clone(), mid.clone()));
  walkPath.add(new THREE.LineCurve3(mid.clone(), stop.clone()));
  const pathLength = walkPath.getLength();

  // --- still life (jug + apples) at the stop point, right of the cat ----
  const stillLife = await buildStillLife();
  const right = new THREE.Vector3(-toHoch.z, 0, toHoch.x);
  const mugPos = stop.clone().addScaledVector(toHoch, 0.35).addScaledVector(right, 0.4);
  mugPos.y = getHeight(mugPos.x, mugPos.z);
  stillLife.position.copy(mugPos);
  stillLife.visible = false;

  // --- model ------------------------------------------------------------
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
  stillLife.visible = group.visible;

  const mixer = new THREE.AnimationMixer(model);
  const walkClip = gltf.animations.find((c) => /walk/i.test(c.name)) ?? gltf.animations[0];
  const idleClip = gltf.animations.find((c) => /idle/i.test(c.name));
  const walk = walkClip ? mixer.clipAction(walkClip) : null;
  const idle = idleClip ? mixer.clipAction(idleClip) : null;
  walk?.play();

  let phase: CatPhase = postTop ? 'jump' : 'walk';
  let jumpT = 0;
  let u = 0;
  const pos = new THREE.Vector3();
  const tan = new THREE.Vector3();
  const tmp = new THREE.Vector3();

  function place(x: number, y: number, z: number, yaw: number): void {
    group.position.set(x, y, z);
    group.rotation.y = yaw + MODEL_YAW;
  }

  // initial pose: on top of the post (or standing at the anchor)
  if (postTop) place(postTop.x, postTop.y, postTop.z, Math.atan2(land.x - postTop.x, land.z - postTop.z));
  else place(postGround.x, postGround.y, postGround.z, Math.atan2(land.x - postGround.x, land.z - postGround.z));

  return {
    group,
    pathLength,
    stillLife,
    mixer,
    clips: gltf.animations,
    get phase(): CatPhase { return phase; },
    update(dt: number): void {
      if (!group.visible || phase === 'idle') return;
      const d = Math.min(dt, 0.1); // clamp huge frames (tab switches)
      if (phase === 'jump') {
        jumpT += d;
        const t = Math.min(1, jumpT / R.JUMP_DURATION);
        tmp.lerpVectors(postTop ?? postGround, land, t);
        tmp.y += R.JUMP_APEX * Math.sin(Math.PI * t);
        place(tmp.x, tmp.y, tmp.z, Math.atan2(land.x - postGround.x, land.z - postGround.z));
        if (t >= 1) phase = 'walk';
      } else {
        u = Math.min(1, u + (cfg.SPEED * d) / pathLength);
        walkPath.getPointAt(u, pos);
        walkPath.getTangentAt(Math.min(0.999, u), tan);
        place(pos.x, getHeight(pos.x, pos.z), pos.z, Math.atan2(tan.x, tan.z));
        if (u >= 1) {
          phase = 'idle';
          walk?.fadeOut(0.4);
          if (idle) { idle.reset().fadeIn(0.4).play(); }
          else walk?.stop();
        }
      }
      mixer.update(d);
    },
    setVisible(v: boolean): void {
      group.visible = v;
      stillLife.visible = v;
    },
    followPose(): { position: THREE.Vector3; heading: number } {
      if (phase === 'jump') {
        return {
          position: new THREE.Vector3(group.position.x, getHeight(group.position.x, group.position.z), group.position.z),
          heading: Math.atan2(land.x - postGround.x, land.z - postGround.z),
        };
      }
      walkPath.getPointAt(Math.min(0.999, u), pos);
      walkPath.getTangentAt(Math.min(0.999, u), tan);
      return {
        position: new THREE.Vector3(pos.x, getHeight(pos.x, pos.z), pos.z),
        heading: phase === 'idle' ? faceYaw : Math.atan2(tan.x, tan.z),
      };
    },
  };
}
