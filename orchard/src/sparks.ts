/**
 * Lightning strikes (orchard-sparks): a day-gated strike scheduler plus the
 * approved 200 ms single-channel bolt — the `window.__sparkUpdate` reference
 * from ideas/sparks/strike_test.py with the strike_live2.py tuning (leader
 * brightness 0.6, flash 35·I, hemisphere ×(1+0.4·I)); user verdict
 * 2026-11-10: "sequence live_step_ looks good".
 *
 * Per strike: a FIXED channel (one seeded improved-Perlin sample, sine
 * envelope pinning both endpoints — frame_check.py measured the whole 200 ms
 * life stays inside the ±amp corridor) from the cloud deck to a
 * terrain-height ground point in CONFIG.SPARKS.BOX behind the west tree
 * line, drawn as three additive line layers + a base glow sprite. The
 * envelope plays a dim leader with growing draw-range, then 2–3 return-stroke
 * pulses; a point light + hemisphere boost flash with the strike and is
 * restored exactly at strike end.
 */
import * as THREE from 'three';
import { CONFIG } from './config';
import { mulberry32, type Rng } from './rng';

export type Sparks = {
  /** scheduler countdown + live-strike envelope animation (dt in seconds) */
  update(dt: number): void;
  /** day gate, called from the season slider handler and once at init */
  setDay(day: number): void;
  /** kill-switch on manual sky overrides (anything ≠ 'gewitter' cancels) */
  setCondition(key: string): void;
  /** deterministic strike for tests, independent of the day gate */
  trigger(seed?: number, pos?: [number, number]): void;
  get active(): boolean;
  dispose(): void;
};

/** seeded improved-Perlin (2D, fBm) — ported verbatim from
 *  ideas/sparks/strike_test.js (same algorithm as the python `noise`
 *  package's Perlin; LCG-shuffled permutation table) */
function makePerlin2(seed: number, octaves: number): (x: number, y: number) => number {
  const perm = new Uint8Array(512);
  const p = new Uint8Array(256);
  let s = seed;
  const rnd = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = (rnd() * (i + 1)) | 0;
    const tmp = p[i];
    p[i] = p[j];
    p[j] = tmp;
  }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
  const lerp = (a: number, b: number, t: number) => a + t * (b - a);
  const grad = (h: number, x: number, y: number): number => {
    switch (h & 7) {
      case 0: return x + y;
      case 1: return -x + y;
      case 2: return x - y;
      case 3: return -x - y;
      case 4: return x;
      case 5: return -x;
      case 6: return y;
      default: return -y;
    }
  };
  const perlin2 = (x: number, y: number): number => {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    const xf = x - Math.floor(x);
    const yf = y - Math.floor(y);
    const u = fade(xf);
    const v = fade(yf);
    const aa = perm[perm[X] + Y];
    const ab = perm[perm[X] + Y + 1];
    const ba = perm[perm[X + 1] + Y];
    const bb = perm[perm[X + 1] + Y + 1];
    const x1 = lerp(grad(aa, xf, yf), grad(ba, xf - 1, yf), u);
    const x2 = lerp(grad(ab, xf, yf - 1), grad(bb, xf - 1, yf - 1), u);
    return lerp(x1, x2, v);
  };
  return (x: number, y: number) => {
    let v = 0;
    let amp = 1;
    let f = 1;
    let norm = 0;
    for (let o = 0; o < octaves; o++) {
      v += perlin2(x * f, y * f) * amp;
      norm += amp;
      amp *= 0.5;
      f *= 2;
    }
    return v / norm;
  };
}

export function createSparks(
  scene: THREE.Scene,
  getHeight: (x: number, z: number) => number,
): Sparks {
  const CFG = CONFIG.SPARKS;
  const noise2 = makePerlin2(CFG.NOISE_SEED, CFG.OCTAVES);
  const N = CFG.SEGMENTS;
  // channel displacement split between x and z, and the /1.05 noise
  // normalization — the strike_test.py recipe values
  const X_FACTOR = 0.8;
  const Z_FACTOR = 0.45;
  const NOISE_NORM = 1.05;
  /** glow sprite hovers this far above the ground point (strike_test.py) */
  const GLOW_LIFT = 2;

  const group = new THREE.Group();
  group.visible = false;
  scene.add(group);

  // three additive line layers (core/mid/wide); vertices are recomputed into
  // the shared-layout position attributes every frame while a strike is live
  const lines: { line: THREE.Line; baseOpacity: number }[] = [];
  const positions: Float32Array[] = [];
  for (const layer of CFG.LAYERS) {
    const pos = new Float32Array((N + 1) * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.LineBasicMaterial({
      color: layer.COLOR,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const line = new THREE.Line(geo, mat);
    line.frustumCulled = false; // vertices move every frame
    positions.push(pos);
    lines.push({ line, baseOpacity: layer.OPACITY });
    group.add(line);
  }

  // base glow sprite: radial-gradient canvas texture (strike_test.py)
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const cx = cv.getContext('2d');
  if (cx) {
    const gr = cx.createRadialGradient(64, 64, 2, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.3, 'rgba(200,220,255,0.5)');
    gr.addColorStop(1, 'rgba(160,190,255,0)');
    cx.fillStyle = gr;
    cx.fillRect(0, 0, 128, 128);
  }
  const glowTex = new THREE.CanvasTexture(cv);
  const glowMat = new THREE.SpriteMaterial({
    map: glowTex,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const glow = new THREE.Sprite(glowMat);
  group.add(glow);

  const flash = new THREE.PointLight(CFG.FLASH.COLOR, 0, 0, CFG.FLASH.DECAY);
  group.add(flash);

  // -- state -----------------------------------------------------------
  let currentDay: number | null = null;
  let conditionKey: string | null = null;
  let strikeIndex = 0;
  let countdownS: number | null = null;
  type Live = {
    x: number;
    z: number;
    groundY: number;
    t0: number;
    elapsedMs: number;
    hemi: THREE.HemisphereLight | null;
    hemiBase: number;
  };
  let live: Live | null = null;

  /** month index (0 = Jan) for a season day — mirrors main.ts's split */
  function monthIndex(day: number): number {
    let m = 0;
    let d = day;
    while (m < 11 && d >= CONFIG.UI.MONTH_LENGTHS[m]) {
      d -= CONFIG.UI.MONTH_LENGTHS[m];
      m++;
    }
    return m;
  }

  /** day slider + month condition gate (ignores the manual override) */
  function dayGateOpen(): boolean {
    if (!CFG.ENABLED || currentDay === null) return false;
    if (!(CFG.STRIKE_DAYS as number[]).includes(currentDay)) return false;
    return CONFIG.SKY.MONTH_CONDITIONS[monthIndex(currentDay)] === 'gewitter';
  }

  /** effective gate: the manual condition override can close it too */
  function gateOpen(): boolean {
    return dayGateOpen() && conditionKey === 'gewitter';
  }

  /** envelope I(ms): dim leader ramp, then the return-stroke pulses */
  function envelope(ms: number): number {
    if (ms <= 0) return 0;
    if (ms < CFG.LEADER_MS) return CFG.LEADER_BRIGHTNESS * (ms / CFG.LEADER_MS);
    let v = 0;
    for (const [start, amp, tau] of CFG.PULSES) {
      if (ms >= start) v += amp * Math.exp(-(ms - start) / tau);
    }
    return Math.min(1, v);
  }

  function writeChannel(x: number, z: number, groundY: number, t: number): void {
    for (let i = 0; i <= N; i++) {
      const s = i / N;
      const n = noise2(CFG.FREQ * s, CFG.TIME_SPEED * t) / NOISE_NORM;
      const d = CFG.AMP * n * Math.sin(Math.PI * s);
      const px = x + d * X_FACTOR;
      const py = CFG.TOP_Y + (groundY - CFG.TOP_Y) * s;
      const pz = z + d * Z_FACTOR;
      for (const pos of positions) {
        pos[i * 3] = px;
        pos[i * 3 + 1] = py;
        pos[i * 3 + 2] = pz;
      }
    }
    for (const { line } of lines) {
      (line.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    }
  }

  function applyEnvelope(ms: number): void {
    if (!live) return;
    const I = envelope(ms);
    const snaps = CFG.PULSES.filter((p) => ms >= p[0]).length;
    const t = live.t0 + CFG.TIME_SPEED * (ms / 1000) + CFG.RESTROKE_SNAP * snaps;
    writeChannel(live.x, live.z, live.groundY, t);
    const count = Math.max(2, Math.ceil((N + 1) * Math.min(1, ms / CFG.LEADER_MS)));
    for (const { line, baseOpacity } of lines) {
      line.geometry.setDrawRange(0, count);
      (line.material as THREE.LineBasicMaterial).opacity = baseOpacity * I;
    }
    glowMat.opacity = Math.min(1, 1.2 * I);
    const gs = CFG.GLOW_SCALE * (0.6 + 0.8 * I);
    glow.scale.set(gs, gs, 1);
    flash.intensity = CFG.FLASH.INTENSITY * I;
    if (live.hemi) live.hemi.intensity = live.hemiBase * (1 + CFG.FLASH.HEMI_BOOST * I);
    group.visible = I > 0.01;
  }

  function findHemi(): THREE.HemisphereLight | null {
    let found: THREE.HemisphereLight | null = null;
    scene.traverse((o) => {
      if (found === null && o instanceof THREE.HemisphereLight) found = o;
    });
    // TS can't see the assignment inside the traverse callback
    return found as THREE.HemisphereLight | null;
  }

  /** build + place the bolt and start the envelope (ends any live strike) */
  function startStrike(rng: Rng, pos?: [number, number]): void {
    endStrike();
    const x = pos ? pos[0] : CFG.BOX.X_MIN + rng() * (CFG.BOX.X_MAX - CFG.BOX.X_MIN);
    const z = pos ? pos[1] : CFG.BOX.Z_MIN + rng() * (CFG.BOX.Z_MAX - CFG.BOX.Z_MIN);
    const groundY = getHeight(x, z);
    // per-strike noise time offset → each strike gets its own channel shape
    const t0 = rng() * 100;
    flash.position.set(x, groundY + CFG.FLASH.Y_ABOVE_GROUND, z);
    glow.position.set(x, groundY + GLOW_LIFT, z);
    // hemisphere base snapshotted at strike START (condition factors applied)
    const hemi = findHemi();
    live = { x, z, groundY, t0, elapsedMs: 0, hemi, hemiBase: hemi ? hemi.intensity : 0 };
    strikeIndex++;
    applyEnvelope(0);
  }

  /** end a live strike with the exact restore — never leave lights boosted */
  function endStrike(): void {
    if (!live) return;
    if (live.hemi) live.hemi.intensity = live.hemiBase;
    flash.intensity = 0;
    group.visible = false;
    live = null;
  }

  function update(dt: number): void {
    // clamp like every other animation update (wiese skill rule):
    // SwiftShader / background tabs deliver multi-second frame gaps
    const d = Math.min(dt, 0.1);
    if (live) {
      live.elapsedMs += d * 1000;
      if (live.elapsedMs >= CFG.DURATION_MS) {
        endStrike();
      } else {
        applyEnvelope(live.elapsedMs);
      }
      return;
    }
    if (countdownS === null) return;
    if (!gateOpen()) {
      countdownS = null;
      return;
    }
    countdownS -= d;
    if (countdownS <= 0) {
      // scheduled strike: seed = day*1000 + strike index (design.md)
      const rng = mulberry32((currentDay ?? 0) * 1000 + strikeIndex);
      startStrike(rng);
      countdownS = CFG.INTERVAL_MIN_S + rng() * (CFG.INTERVAL_MAX_S - CFG.INTERVAL_MIN_S);
    }
  }

  function setDay(day: number): void {
    if (day === currentDay) return;
    currentDay = day;
    strikeIndex = 0;
    if (gateOpen()) {
      countdownS = CFG.FIRST_DELAY_S;
    } else {
      countdownS = null;
      endStrike();
    }
  }

  function setCondition(key: string): void {
    conditionKey = key;
    if (key !== 'gewitter') {
      // kill-switch: cancel the countdown and end any live strike (restore
      // runs; a ≤200 ms strike needs no fade)
      countdownS = null;
      endStrike();
    } else if (dayGateOpen()) {
      // back on the storm look while a strike day is active: (re)arm
      countdownS = CFG.FIRST_DELAY_S;
    }
  }

  function trigger(seed?: number, pos?: [number, number]): void {
    const rng = mulberry32(seed ?? (currentDay ?? 0) * 1000 + strikeIndex);
    startStrike(rng, pos);
  }

  function dispose(): void {
    endStrike();
    scene.remove(group);
    for (const { line } of lines) {
      line.geometry.dispose();
      (line.material as THREE.Material).dispose();
    }
    glowTex.dispose();
    glowMat.dispose();
  }

  return {
    update,
    setDay,
    setCondition,
    trigger,
    get active() {
      return live !== null;
    },
    dispose,
  };
}
