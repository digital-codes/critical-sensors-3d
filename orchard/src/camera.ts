import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import site from './site';
import { CONFIG } from './config';

export interface CameraRig {
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  applyPreset(name: string): void;
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

  return { camera, controls, applyPreset: applyPresetByName };
}
