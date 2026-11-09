import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import site from './site';
import { CONFIG } from './config';

export interface CameraRig {
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  applyPreset(name: string): void;
  /** register a runtime preset (e.g. the info-board view) — appends the
   *  button to the active presets row (embed row or #presets) */
  addPreset(name: string, position: readonly number[], lookAt: readonly number[], label?: string): void;
  /** drop a preset (and its button) — used to replace the generated
   *  site.json vantages with CONFIG-driven ones */
  removePreset(name: string): void;
}

/** minimal pose source (CameraRig satisfies this structurally) */
type PoseSource = { camera: THREE.PerspectiveCamera; controls: OrbitControls };

/**
 * Console log of the full camera pose, in the Kamera panel's own vocabulary
 * (position / Blickpunkt / Azimut 0=N 90=E / Erhebung / Abstand). Gated by
 * CONFIG.DEBUG.LOG_CAMERA — used while picking a new CONFIG.CAMERA start
 * pose: fly the view (orbit, presets, Kamera panel) and copy the numbers
 * from the browser console.
 */
export function logPose(rig: PoseSource, origin = ''): void {
  if (!CONFIG.DEBUG.LOG_CAMERA) return;
  const p = rig.camera.position;
  const t = rig.controls.target;
  const d = new THREE.Vector3().subVectors(t, p);
  const dist = d.length();
  const az = ((Math.atan2(d.x, -d.z) * 180) / Math.PI + 360) % 360; // 0 = north, 90 = east
  const el = dist > 0.001 ? (Math.asin(THREE.MathUtils.clamp(d.y / dist, -1, 1)) * 180) / Math.PI : 0;
  const f = (v: number): string => v.toFixed(1);
  console.log(
    `[kamera${origin}] pos=(${f(p.x)}, ${f(p.y)}, ${f(p.z)}) blick=(${f(t.x)}, ${f(t.y)}, ${f(t.z)}) ` +
      `azimut=${az.toFixed(1)} erhebung=${el.toFixed(1)} abstand=${dist.toFixed(1)}`,
  );
}

interface Preset {
  label: string;
  position: number[];
  lookAt: number[];
}

const PRESET_LABELS: Record<string, string> = CONFIG.CAMERA.PRESET_LABELS;

// Presets come from site.json so the pipeline can define the real photo
// vantages (southEnd/erhoeht/nordwest). 'elevated' is kept as an alias for
// 'erhoeht' for older photos.json references.
const PRESETS: Record<string, Preset> = Object.fromEntries(
  Object.entries(site.cameraPresets).map(([name, p]) => [
    name === 'elevated' ? 'elevated' : name,
    { label: PRESET_LABELS[name] ?? name, ...p },
  ]),
);

export function createCameraRig(
  dom: HTMLElement,
  aspect: number,
  presetsUi?: HTMLElement | null,
): CameraRig {
  const camera = new THREE.PerspectiveCamera(CONFIG.CAMERA.FOV, aspect, CONFIG.CAMERA.NEAR, CONFIG.CAMERA.FAR);
  const controls = new OrbitControls(camera, dom);
  controls.enableDamping = true;
  controls.dampingFactor = CONFIG.CAMERA.DAMPING;
  controls.maxPolarAngle = Math.PI / 2 - CONFIG.CAMERA.POLAR_MARGIN;

  // Dolly: OrbitControls' proportional zoom crawls to a halt near the
  // target and can never pass it (from the 1.5 m board view the wheel
  // died just past the panel). Replace it with a fixed world-space step
  // for wheel AND pinch; once closer than FOLLOW_DIST the target is
  // carried forward too, so the walk continues through/past the board.
  controls.enableZoom = false;

  const dollyOffset = new THREE.Vector3();
  function dollyFractional(f: number): void {
    const t = controls.target;
    dollyOffset.subVectors(camera.position, t);
    const dist = dollyOffset.length();
    if (dist < 1e-4) return;
    const step =
      THREE.MathUtils.clamp(dist * CONFIG.CAMERA.DOLLY.FACTOR, CONFIG.CAMERA.DOLLY.MIN_STEP, CONFIG.CAMERA.DOLLY.MAX_STEP) * f;
    let newDist = dist - step;
    if (step > 0 && newDist < CONFIG.CAMERA.DOLLY.FOLLOW_DIST) {
      // fly-past: carry the target along the view direction (camera's
      // forward = from camera toward target = -(cam-target)) so the walk
      // continues through/past the board
      t.addScaledVector(dollyOffset.normalize(), -(CONFIG.CAMERA.DOLLY.FOLLOW_DIST - newDist));
      newDist = CONFIG.CAMERA.DOLLY.FOLLOW_DIST;
      dollyOffset.subVectors(camera.position, t);
    }
    camera.position.copy(t).addScaledVector(dollyOffset.normalize(), newDist);
  }

  // pose log after a dolly burst settles (same [kamera] vocabulary)
  let dollyLogTimer: number | undefined;
  function queueDollyLog(): void {
    if (!CONFIG.DEBUG.LOG_CAMERA) return;
    window.clearTimeout(dollyLogTimer);
    dollyLogTimer = window.setTimeout(() => logPose({ camera, controls }, ' dolly'), 300);
  }

  // wheel: scroll up = closer (OrbitControls convention), px/100 steps,
  // clamped so one fast flick can't jump more than two steps
  dom.addEventListener(
    'wheel',
    (e: WheelEvent) => {
      e.preventDefault();
      const px = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      const f = THREE.MathUtils.clamp(-px / 100, -2, 2);
      if (f !== 0) dollyFractional(f);
      queueDollyLog();
    },
    { passive: false },
  );

  // pinch: finger spread px -> dolly steps (OrbitControls keeps two-finger
  // pan; its dolly part is off via enableZoom=false)
  const pinchPointers = new Map<number, { x: number; y: number }>();
  let pinchDist = 0;
  const pinchSpan = (): number => {
    const pts = [...pinchPointers.values()];
    return Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
  };
  dom.addEventListener('pointerdown', (e: PointerEvent) => {
    pinchPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinchPointers.size === 2) pinchDist = pinchSpan();
  });
  dom.addEventListener('pointermove', (e: PointerEvent) => {
    if (!pinchPointers.has(e.pointerId)) return;
    pinchPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinchPointers.size === 2) {
      const d = pinchSpan();
      if (pinchDist > 0 && d !== pinchDist) {
        dollyFractional((d - pinchDist) / CONFIG.CAMERA.PINCH_PX_PER_STEP);
        queueDollyLog();
      }
      pinchDist = d;
    }
  });
  const pinchDrop = (e: PointerEvent): void => {
    pinchPointers.delete(e.pointerId);
    pinchDist = 0;
  };
  dom.addEventListener('pointerup', pinchDrop);
  dom.addEventListener('pointercancel', pinchDrop);

  function applyPreset(p: Preset, origin = ''): void {
    camera.position.set(p.position[0], p.position[1], p.position[2]);
    controls.target.set(p.lookAt[0], p.lookAt[1], p.lookAt[2]);
    controls.update();
    logPose({ camera, controls }, origin);
  }

  function applyPresetByName(name: string): void {
    const preset = PRESETS[name];
    if (preset) applyPreset(preset, ` preset ${name}`);
  }

  // start pose: CONFIG.CAMERA.START (user-picked; fly + copy the console
  // line to change it) — the site.json presets stay available as buttons
  const start = CONFIG.CAMERA.START;
  camera.position.set(start.POS[0], start.POS[1], start.POS[2]);
  controls.target.set(start.TARGET[0], start.TARGET[1], start.TARGET[2]);
  controls.update();
  logPose({ camera, controls }, ' start');

  // embed mode passes its own in-scene presets row; standalone falls back
  // to the fixed #presets container from index.html
  const ui = presetsUi !== undefined ? presetsUi : document.getElementById('presets');
  if (ui) {
    for (const [name, preset] of Object.entries(PRESETS)) {
      const btn = document.createElement('button');
      btn.textContent = preset.label;
      btn.dataset.preset = name;
      btn.addEventListener('click', () => applyPreset(preset));
      ui.appendChild(btn);
    }
  }

  function addPreset(name: string, position: readonly number[], lookAt: readonly number[], label?: string): void {
    const preset: Preset = { label: label ?? PRESET_LABELS[name] ?? name, position: [...position], lookAt: [...lookAt] };
    PRESETS[name] = preset;
    if (ui) {
      const btn = document.createElement('button');
      btn.textContent = preset.label;
      btn.dataset.preset = name;
      btn.addEventListener('click', () => applyPreset(preset));
      ui.appendChild(btn);
    }
  }

  function removePreset(name: string): void {
    delete PRESETS[name];
    ui?.querySelector(`button[data-preset="${name}"]`)?.remove();
  }

  return { camera, controls, applyPreset: applyPresetByName, addPreset, removePreset };
}
