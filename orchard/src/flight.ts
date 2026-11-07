import * as THREE from 'three';
import type { CameraRig } from './camera';
import { CONFIG } from './config';

/**
 * "Vogelflug" camera flight: a bird's glide that starts at the elevated
 * tree on the north-east ridge (Baumkataster bk01345 at local (65, -47),
 * ~11 m tall on ~121 m DGM ground -> crown ~132 m absolute), sweeps
 * south-west over the orchard past the Hocksitzcafe towers and pulls up at
 * the south meadow edge. Position and look-target follow two Catmull-Rom
 * curves over the DGM terrain; a small wing-beat bob and slow lateral sway
 * sell the bird feel. Any pointer interaction cancels the flight and hands
 * the camera back to OrbitControls.
 */

export interface BirdFlight {
  readonly active: boolean;
  start(): void;
  stop(): void;
  /** stop advancing mid-flight (keeps the pose; for testing/remote control) */
  pause(): void;
  resume(): void;
  /** jump to a progress fraction 0..1 (deterministic testing / remote control) */
  seek(t01: number): void;
  /** advance the flight by dt seconds; no-op unless active */
  update(dt: number): void;
}

// waypoints/tuning live in CONFIG.FLIGHT (single constants home); y is
// filled from the DGM at start() as `terrain(x, z) + clearance`. The start
// sits ~1.5 m above the crown of the NE tree (bk01345, 11 m tall on the
// ~121 m ridge).

export async function createBirdFlight(
  rig: CameraRig,
  terrain: (x: number, z: number) => number,
): Promise<BirdFlight> {
  // resolve waypoint heights once: clearance above the local DGM ground
  const pts = CONFIG.FLIGHT.WAYPOINTS.map(([x, clearance, z]) => new THREE.Vector3(
    x, terrain(x, z) + clearance, z,
  ));
  const path = new THREE.CatmullRomCurve3(pts, false, 'centripetal', 0.5);
  // The bird aims along its own path tangent, a fixed distance ahead. The
  // target is defined RELATIVE to the camera position, so wing-beat bob and
  // lateral sway translate the view without rotating it: yaw follows the
  // curve smoothly instead of swinging with every beat. Near the end the
  // tangent extrapolates past the path end, keeping the heading constant
  // through arrival (a clamped ahead-point used to whip the yaw around).
  function lookFor(s: number, out: THREE.Vector3): THREE.Vector3 {
    const sc = Math.min(0.999, s);
    path.getPointAt(sc, out);
    path.getTangentAt(sc, tmpTangent);
    out.addScaledVector(tmpTangent, CONFIG.FLIGHT.LOOK_AHEAD_M);
    out.y -= CONFIG.FLIGHT.LOOK_DIP_M;
    return out;
  }

  let active = false;
  let progress = 0; // seconds within the flight
  let cancelOnPointer: (() => void) | null = null;
  const dom: HTMLElement = rig.controls.domElement ?? document.body;
  const tmpLook = new THREE.Vector3();
  const tmpTangent = new THREE.Vector3();

  function apply(u01: number, dt = 0): void {
    // smoothstep over the whole flight: gentle take-off and arrival
    const s = THREE.MathUtils.smoothstep(THREE.MathUtils.clamp(u01, 0, 1), 0, 1);
    const sc = Math.min(0.999, s);
    const pos = path.getPointAt(sc);
    path.getTangentAt(sc, tmpTangent);
    // banked gaze: low-pass the flight direction so sharp path corners turn
    // into gradual heading changes (per-frame lerp from the time constant;
    // a direct seek snaps so poses stay deterministic)
    if (!gazeDir.lengthSq() || dt <= 0) gazeDir.copy(tmpTangent);
    else gazeDir.lerp(tmpTangent, 1 - Math.exp(-dt / CONFIG.FLIGHT.YAW_TAU_S)).normalize();
    const look = tmpLook.copy(pos).addScaledVector(gazeDir, CONFIG.FLIGHT.LOOK_AHEAD_M);
    look.y -= CONFIG.FLIGHT.LOOK_DIP_M;
    // wing-beat + sway, phase-locked to flight time
    const bob = Math.sin(progress * CONFIG.FLIGHT.BOB_HZ * 2 * Math.PI) * CONFIG.FLIGHT.BOB_AMP_M;
    const sway = Math.sin(progress * CONFIG.FLIGHT.SWAY_HZ * 2 * Math.PI) * CONFIG.FLIGHT.SWAY_AMP_M;
    // sway perpendicular to the flight direction (horizontal)
    const side = new THREE.Vector3(-tmpTangent.z, 0, tmpTangent.x).normalize();
    rig.camera.position.copy(pos).addScaledVector(side, sway);
    rig.camera.position.y += bob;
    rig.controls.target.copy(look);
    rig.controls.update();
  }

  function stop(): void {
    if (!active) return;
    active = false;
    rig.controls.enabled = true;
    if (cancelOnPointer) {
      dom.removeEventListener('pointerdown', cancelOnPointer);
      cancelOnPointer = null;
    }
  }

  function start(): void {
    progress = 0;
    active = true;
    gazeDir.set(0, 0, 0); // re-anchor the banked gaze at take-off
    rig.controls.enabled = false;
    cancelOnPointer = () => stop();
    dom.addEventListener('pointerdown', cancelOnPointer, { once: true });
  }

  let paused = false;
  const gazeDir = new THREE.Vector3();

  return {
    get active(): boolean {
      return active;
    },
    start,
    stop,
    pause(): void {
      paused = true;
    },
    resume(): void {
      paused = false;
    },
    seek(t01: number): void {
      if (!active) start();
      paused = true; // seek pins the pose; resume() or stop() continues
      progress = THREE.MathUtils.clamp(t01, 0, 1) * CONFIG.FLIGHT.DURATION_S;
      apply(THREE.MathUtils.clamp(t01, 0, 1));
    },
    update(dt: number): void {
      if (!active || paused) return;
      progress += dt;
      if (progress >= CONFIG.FLIGHT.DURATION_S) {
        apply(1, dt);
        stop();
        return;
      }
      apply(progress / CONFIG.FLIGHT.DURATION_S, dt);
    },
  };
}
