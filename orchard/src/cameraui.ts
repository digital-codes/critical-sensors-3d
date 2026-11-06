import * as THREE from 'three';
import type { CameraRig } from './camera';

/**
 * "Kamera" panel: numeric control over the camera pose for exact viewpoint
 * work (matching reference photos, reproducible presets, later remote
 * control). Fields:
 *  - Position X/Y/Z (local metres, Y absolute DHHN like getHeightSampler)
 *  - Blickpunkt (look-at target) X/Y/Z
 *  - Winkel: Azimut (0 = North, 90 = East), Erhebung (elevation, +up),
 *    Abstand (camera->target distance) with its own apply button
 * While orbiting, the non-focused fields live-update from the camera, so a
 * hand-flown pose can be read out and re-applied with nudges.
 */

const FIELDS = ['px', 'py', 'pz', 'tx', 'ty', 'tz', 'az', 'el', 'dist'] as const;
type FieldKey = (typeof FIELDS)[number];

function dirFromAngles(azDeg: number, elDeg: number): THREE.Vector3 {
  const az = (azDeg * Math.PI) / 180;
  const el = (elDeg * Math.PI) / 180;
  // local frame: +x east, +z SOUTH -> north is -z; azimuth 0 = looking north
  return new THREE.Vector3(
    Math.sin(az) * Math.cos(el),
    Math.sin(el),
    -Math.cos(az) * Math.cos(el),
  );
}

export function createCameraUI(rig: CameraRig): void {
  const panel = document.createElement('div');
  panel.id = 'cameraui';
  panel.innerHTML = `
    <div class="camtitle">Kamera</div>
    <div class="camgrid">
      <label>Pos X</label><input id="cam-px" type="number" step="0.1">
      <label>Pos Y</label><input id="cam-py" type="number" step="0.1">
      <label>Pos Z</label><input id="cam-pz" type="number" step="0.1">
      <label>Blick X</label><input id="cam-tx" type="number" step="0.1">
      <label>Blick Y</label><input id="cam-ty" type="number" step="0.1">
      <label>Blick Z</label><input id="cam-tz" type="number" step="0.1">
    </div>
    <button id="cam-apply">Übernehmen</button>
    <div class="camgrid">
      <label>Azimut°</label><input id="cam-az" type="number" step="1">
      <label>Erheb.°</label><input id="cam-el" type="number" step="1">
      <label>Abstand</label><input id="cam-dist" type="number" step="0.5">
    </div>
    <button id="cam-angles">Nach Winkel</button>`;
  document.body.appendChild(panel);

  const style = document.createElement('style');
  style.textContent = `
    #cameraui {
      position: fixed; left: 10px; bottom: 10px; z-index: 20;
      background: rgba(20,20,20,.78); color: #eee;
      font: 12px/1.4 sans-serif; padding: 8px 10px; border-radius: 8px;
      user-select: none;
    }
    #cameraui .camtitle { font-weight: bold; margin-bottom: 4px; }
    #cameraui .camgrid {
      display: grid; grid-template-columns: auto 70px auto 70px;
      gap: 2px 6px; align-items: center; margin-bottom: 6px;
    }
    #cameraui input {
      width: 68px; background: #111; color: #eee;
      border: 1px solid #555; border-radius: 4px; padding: 1px 4px;
      font: inherit;
    }
    #cameraui button {
      background: #3a5f2a; color: #fff; border: 0; border-radius: 4px;
      padding: 3px 10px; margin-bottom: 6px; cursor: pointer; font: inherit;
    }
    #cameraui button:hover { background: #4c7a37; }
    @media (max-width: 700px) { #cameraui { display: none; } }
  `;
  document.head.appendChild(style);

  const el = (k: FieldKey): HTMLInputElement =>
    document.getElementById('cam-' + k) as HTMLInputElement;

  const inputs = Object.fromEntries(FIELDS.map((k) => [k, el(k)])) as
    Record<FieldKey, HTMLInputElement>;

  function fillFromCamera(): void {
    for (const k of FIELDS) {
      if (document.activeElement === inputs[k]) return; // don't fight typing
    }
    const p = rig.camera.position;
    const t = rig.controls.target;
    const set = (k: FieldKey, v: number): void => {
      inputs[k].value = Number.isFinite(v) ? v.toFixed(1) : '';
    };
    set('px', p.x); set('py', p.y); set('pz', p.z);
    set('tx', t.x); set('ty', t.y); set('tz', t.z);
    const d = new THREE.Vector3().subVectors(t, p);
    const dist = d.length();
    const az = (Math.atan2(d.x, -d.z) * 180) / Math.PI; // 0 = north, 90 = east
    const elev = dist > 0.001 ? (Math.asin(THREE.MathUtils.clamp(d.y / dist, -1, 1)) * 180) / Math.PI : 0;
    set('az', ((az + 360) % 360));
    set('el', elev);
    set('dist', dist);
  }
  setInterval(fillFromCamera, 300);

  function applyTarget(): void {
    const p = new THREE.Vector3(
      Number(inputs.px.value), Number(inputs.py.value), Number(inputs.pz.value),
    );
    const t = new THREE.Vector3(
      Number(inputs.tx.value), Number(inputs.ty.value), Number(inputs.tz.value),
    );
    if (![p.x, p.y, p.z, t.x, t.y, t.z].every(Number.isFinite)) return;
    rig.camera.position.copy(p);
    rig.controls.target.copy(t);
    rig.controls.update();
  }

  function applyAngles(): void {
    const az = Number(inputs.az.value);
    const elev = Number(inputs.el.value);
    const dist = Number(inputs.dist.value);
    if (![az, elev, dist].every(Number.isFinite) || dist <= 0) return;
    const p = rig.camera.position;
    rig.controls.target.copy(p).addScaledVector(dirFromAngles(az, elev), dist);
    rig.controls.update();
  }

  el('apply' as FieldKey) ? null : null;
  (document.getElementById('cam-apply') as HTMLButtonElement)
    .addEventListener('click', applyTarget);
  (document.getElementById('cam-angles') as HTMLButtonElement)
    .addEventListener('click', applyAngles);
  for (const k of ['px', 'py', 'pz', 'tx', 'ty', 'tz'] as const) {
    inputs[k].addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Enter') applyTarget();
    });
  }
  for (const k of ['az', 'el', 'dist'] as const) {
    inputs[k].addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Enter') applyAngles();
    });
  }
  fillFromCamera();
}
