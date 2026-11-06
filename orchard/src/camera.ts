import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import site from './site';

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

const PRESETS: Record<string, Preset> = {
  southEnd: { label: 'Südende', ...site.cameraPresets.southEnd },
  elevated: { label: 'Erhöht', ...site.cameraPresets.elevated },
};

export function createCameraRig(dom: HTMLElement, aspect: number): CameraRig {
  const camera = new THREE.PerspectiveCamera(55, aspect, 0.5, 4000);
  const controls = new OrbitControls(camera, dom);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.maxPolarAngle = Math.PI / 2 - 0.02;

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

  const ui = document.getElementById('presets');
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
