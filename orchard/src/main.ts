import * as THREE from 'three';
import { createTerrain } from './terrain';
import { createCameraRig } from './camera';
import { createOrchard, type Orchard } from './trees';
import { nearestSeason, snowAmount } from './seasons';
import { createStructures } from './structures';
import { createGrass, type Grass } from './grass';
import { createSky, type Sky } from './sky';
import { createComparePanel } from './compare';

const MONTHS = [
  'Jan',
  'Feb',
  'Mär',
  'Apr',
  'Mai',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Okt',
  'Nov',
  'Dez',
];

function monthDay(day: number): string {
  const lengths = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  let m = 0;
  let d = day;
  while (d >= lengths[m]) {
    d -= lengths[m];
    m++;
  }
  return `${MONTHS[m]} ${d + 1}`;
}

async function main(): Promise<void> {
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  document.body.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const skyColor = 0xb9c6d0;
  scene.background = new THREE.Color(skyColor);
  scene.fog = new THREE.Fog(skyColor, 400, 1600);

  // soft overcast lighting; sun direction ~SE to match the August DOP shadows
  scene.add(new THREE.HemisphereLight(0xe8eef2, 0x62604e, 1.0));
  const sun = new THREE.DirectionalLight(0xffffff, 0.7);
  sun.position.set(150, 250, -100);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -90;
  sun.shadow.camera.right = 90;
  sun.shadow.camera.top = 90;
  sun.shadow.camera.bottom = -90;
  sun.shadow.camera.near = 50;
  sun.shadow.camera.far = 600;
  sun.shadow.bias = -0.0005;
  scene.add(sun);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  scene.add(new THREE.AmbientLight(0xffffff, 0.25));

  const rig = createCameraRig(renderer.domElement, window.innerWidth / window.innerHeight);
  // debug/testing hook: lets tooling move the camera programmatically
  (window as unknown as Record<string, unknown>).__rig = rig;

  const terrain = await createTerrain();
  scene.add(terrain.mesh);
  terrain.mesh.receiveShadow = true;

  const sky: Sky = createSky();
  scene.add(sky.group);

  const structures = await createStructures();
  scene.add(structures.group);
  structures.group.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      o.castShadow = true;
      (o as THREE.Mesh).receiveShadow = true;
    }
  });

  const grass: Grass = await createGrass();
  scene.add(grass.mesh);
  // debug/testing hook: direct access to the snow-driven scene parts
  (window as unknown as Record<string, unknown>).__scene3 = { terrain, grass, structures };

  // season UI (hidden until the orchard is ready)
  const seasonInput = document.getElementById('dayofyear') as HTMLInputElement | null;
  const seasonValue = document.getElementById('seasonvalue') as HTMLElement | null;
  const seasonPanel = document.getElementById('season') as HTMLElement | null;
  const progressEl = document.getElementById('treeprogress') as HTMLElement | null;
  if (seasonPanel) seasonPanel.style.display = 'none';
  if (seasonValue && seasonInput) {
    const day = Number(seasonInput.value);
    seasonValue.textContent = `Tag ${day} (${monthDay(day)})`;
  }
  grass.setSeason(Number(seasonInput?.value ?? 190));
  terrain.setSnow(snowAmount(Number(seasonInput?.value ?? 190)));
  structures.setSnow(snowAmount(Number(seasonInput?.value ?? 190)));

  createComparePanel(renderer, rig, seasonInput);

  let orchard: Orchard | null = null;
  createOrchard((done, total) => {
    if (progressEl) progressEl.textContent = `Bäume: ${done}/${total} …`;
  }).then((o) => {
    orchard = o;
    scene.add(o.group);
    o.group.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) obj.castShadow = true;
    });
    if (progressEl) {
      progressEl.textContent = `18 Bäume generiert (4 Jahreszeiten-Varianten)`;
    }
    if (seasonPanel) seasonPanel.style.display = '';
    if (seasonValue && seasonInput) {
      const day = Number(seasonInput.value);
      // sync the tree season with the slider so day 0 labels "Winter"
      seasonValue.textContent = `Tag ${day} (${monthDay(day)}) · ${labelFor(o.setSeason(day))}`;
    }
  });

  function labelFor(key: string): string {
    switch (key) {
      case 'winter':
        return 'Winter';
      case 'spring':
        return 'Frühling';
      case 'autumn':
        return 'Herbst';
      default:
        return 'Sommer';
    }
  }

  seasonInput?.addEventListener('input', () => {
    const day = Number(seasonInput.value);
    grass.setSeason(day);
    terrain.setSnow(snowAmount(day));
    structures.setSnow(snowAmount(day));
    if (seasonValue) {
      seasonValue.textContent = `Tag ${day} (${monthDay(day)})${
        orchard ? ` · ${labelFor(orchard.setSeason(day))}` : ''
      }`;
    }
  });

  window.addEventListener('resize', () => {
    rig.camera.aspect = window.innerWidth / window.innerHeight;
    rig.camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // Compass HUD: an "N" arrow that always points toward world north (+z),
  // so the view orientation is verifiable in any orbit position.
  const compass = document.createElement('div');
  compass.id = 'compass';
  compass.innerHTML =
    '<svg viewBox="0 0 40 40" width="40" height="40">' +
    '<circle cx="20" cy="20" r="18" fill="rgba(0,0,0,0.45)"/>' +
    '<path id="compass-needle" d="M20 5 L25 26 L20 22 L15 26 Z" fill="#e05555"/></svg>';
  compass.style.cssText =
    'position:fixed;left:12px;top:12px;width:40px;height:40px;z-index:20;' +
    'pointer-events:none;';
  document.body.appendChild(compass);
  const needle = compass.querySelector('#compass-needle') as SVGPathElement | null;
  const camDir = new THREE.Vector3();

  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    const dt = clock.getDelta();
    const t = clock.elapsedTime;
    rig.controls.update();
    if (needle) {
      rig.camera.getWorldDirection(camDir);
      // heading: 0 = looking north (+z), pi = south; rotate needle by -heading
      const heading = Math.atan2(camDir.x, camDir.z);
      needle.setAttribute('transform', `rotate(${(-heading * 180) / Math.PI} 20 20)`);
    }
    orchard?.update(t);
    grass.update(t);
    sky.update(dt);
    renderer.render(scene, rig.camera);
  });
}

main();
