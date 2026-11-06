import * as THREE from 'three';
import type { CameraRig } from './camera';

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

// waypoints in local metres (x east, y up, z south); y is filled from the
// DGM at start() as `terrain(x, z) + clearance`. The start sits ~1.5 m above
// the crown of the NE tree (bk01345, 11 m tall on the ~121 m ridge).
const WAYPOINTS: Array<[number, number, number]> = [
  [66, 12.5, -45],  // the elevated NE tree's crown (bk01345)
  [50, 13.5, -38],  // off the ridge, skimming the crown tops
  [30, 14, -22],    // NE meadow corner (clears bk02868)
  [17, 14, -1],     // over the Hocksitzcafe towers (clears bk02839)
  [3, 14.5, 18],    // mid-meadow pass (clears bk01274)
  [6, 13.5, 40],    // south meadow, ends above open grass (clear of row+trees)
];
const DURATION_S = 36; // ~4 m/s glide
const BOB_AMP_M = 0.45; // wing-beat
const BOB_HZ = 1.4;
const SWAY_AMP_M = 0.5; // slow lateral drift
const SWAY_HZ = 0.11;
const LOOK_AHEAD = 0.08; // fraction of the whole path the bird looks toward
const LOOK_DIP_M = 2.5;  // slight downward gaze, keeps the horizon in frame

export async function createBirdFlight(
  rig: CameraRig,
  terrain: (x: number, z: number) => number,
): Promise<BirdFlight> {
  // resolve waypoint heights once: clearance above the local DGM ground
  const pts = WAYPOINTS.map(([x, clearance, z]) => new THREE.Vector3(
    x, terrain(x, z) + clearance, z,
  ));
  const path = new THREE.CatmullRomCurve3(pts, false, 'centripetal', 0.5);
  // look targets: slightly ahead of the position, dipping toward the ground
  // so the bird reads as gliding downward-outward rather than level-staring
  // the bird looks toward a point AHEAD on its own path, dipped slightly
  // downward - keeps the horizon in frame and reads as gliding
  function lookFor(s: number, out: THREE.Vector3): THREE.Vector3 {
    path.getPointAt(Math.min(0.999, s + LOOK_AHEAD), out);
    out.y -= LOOK_DIP_M;
    return out;
  }

  let active = false;
  let progress = 0; // seconds within the flight
  let cancelOnPointer: (() => void) | null = null;
  const dom: HTMLElement = rig.controls.domElement ?? document.body;
  const tmpLook = new THREE.Vector3();

  function apply(u01: number): void {
    // smoothstep over the whole flight: gentle take-off and arrival
    const s = THREE.MathUtils.smoothstep(THREE.MathUtils.clamp(u01, 0, 1), 0, 1);
    const pos = path.getPointAt(Math.min(0.999, s));
    const look = lookFor(s, tmpLook);
    // wing-beat + sway, phase-locked to flight time
    const bob = Math.sin(progress * BOB_HZ * 2 * Math.PI) * BOB_AMP_M;
    const sway = Math.sin(progress * SWAY_HZ * 2 * Math.PI) * SWAY_AMP_M;
    // sway perpendicular to the flight direction (horizontal)
    const dir = path.getTangentAt(Math.min(0.999, s));
    const side = new THREE.Vector3(-dir.z, 0, dir.x).normalize();
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
    rig.controls.enabled = false;
    cancelOnPointer = () => stop();
    dom.addEventListener('pointerdown', cancelOnPointer, { once: true });
  }

  let paused = false;

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
      progress = THREE.MathUtils.clamp(t01, 0, 1) * DURATION_S;
      apply(THREE.MathUtils.clamp(t01, 0, 1));
    },
    update(dt: number): void {
      if (!active || paused) return;
      progress += dt;
      if (progress >= DURATION_S) {
        apply(1);
        stop();
        return;
      }
      apply(progress / DURATION_S);
    },
  };
}
