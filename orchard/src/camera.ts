import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import site from './site';
import { CONFIG } from './config';

export interface CameraRig {
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  applyPreset(name: string): void;
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

  function applyPreset(p: Preset): void {
    camera.position.set(p.position[0], p.position[1], p.position[2]);
    controls.target.set(p.lookAt[0], p.lookAt[1], p.lookAt[2]);
    controls.update();
  }

  function applyPresetByName(name: string): void {
    const preset = PRESETS[name];
    if (preset) applyPreset(preset);
  }

  applyPreset(PRESETS.southEnd);

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
