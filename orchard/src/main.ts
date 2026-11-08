import * as THREE from 'three';
import { createTerrain, getHeightSampler } from './terrain';
import { createCameraRig } from './camera';
import { createOrchard, type Orchard } from './trees';
import { nearestSeason, snowAmount } from './seasons';
import { createStructures } from './structures';
import { createGrass, type Grass } from './grass';
import { createBuildings } from './buildings';
import { createThicket } from './thicket';
import { createSky, type Sky } from './sky';
import site from './site';
import { createComparePanel } from './compare';
import { createBirdFlight } from './flight';
import { createCameraUI } from './cameraui';
import { createCat, type Cat } from './cat';
import { CONFIG, type SkyCondition } from './config';
import { sceneRng } from './rng';

function monthDay(day: number): string {
  const { MONTHS, MONTH_LENGTHS } = CONFIG.UI;
  let m = 0;
  let d = day;
  while (d >= MONTH_LENGTHS[m]) {
    d -= MONTH_LENGTHS[m];
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
  // sky/fog colour starts at the default sky condition's fog value
  const skyColor = new THREE.Color(CONFIG.SKY.CONDITIONS[CONFIG.SKY.DEFAULT_CONDITION].FOG);
  scene.background = skyColor;
  scene.fog = new THREE.Fog(skyColor, CONFIG.SCENE.FOG_NEAR, CONFIG.SCENE.FOG_FAR);

  // active sky condition (CONFIG.SKY.CONDITIONS) — its light factors scale
  // the seasonal light bases so dark clouds come with dimmed lights
  let skyConditionKey: string = CONFIG.SKY.DEFAULT_CONDITION;

  // soft overcast lighting; the sun's midday elevation follows the season
  const hemi = new THREE.HemisphereLight(
    CONFIG.SCENE.HEMI.SKY,
    CONFIG.SCENE.HEMI.GROUND,
    CONFIG.SCENE.HEMI.INTENSITY,
  );
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(CONFIG.SUN.COLOR, CONFIG.SUN.BASE_INTENSITY);
  sun.castShadow = true;
  sun.shadow.mapSize.set(CONFIG.SUN.SHADOW.MAP_SIZE, CONFIG.SUN.SHADOW.MAP_SIZE);
  sun.shadow.camera.left = -CONFIG.SUN.SHADOW.EXTENT;
  sun.shadow.camera.right = CONFIG.SUN.SHADOW.EXTENT;
  sun.shadow.camera.top = CONFIG.SUN.SHADOW.EXTENT;
  sun.shadow.camera.bottom = -CONFIG.SUN.SHADOW.EXTENT;
  sun.shadow.camera.near = CONFIG.SUN.SHADOW.NEAR;
  sun.shadow.camera.far = CONFIG.SUN.SHADOW.FAR;
  sun.shadow.bias = CONFIG.SUN.SHADOW.BIAS;
  scene.add(sun);
  scene.add(sun.target);

  // Midday sun over the orchard (lat ~49 N): azimuth due south (+z), the
  // elevation follows the solar declination of the day — high in summer,
  // low in winter, so the generated trees' shadows lengthen and swing with
  // the season instead of the baked-in DOP shadows.
  function updateSun(day: number): void {
    const lat = CONFIG.SUN.LATITUDE_DEG;
    const decl =
      CONFIG.SUN.DECL_OBLIQUITY_DEG *
      Math.sin((2 * Math.PI * (day + CONFIG.SUN.DECL_PHASE_DAYS)) / CONFIG.SUN.YEAR_DAYS); // deg
    const alt = ((90 - lat + decl) * Math.PI) / 180; // rad above horizon
    const [cx, cy, cz] = CONFIG.SUN.ANCHOR; // orchard centre
    const R = CONFIG.SUN.ORBIT_R;
    sun.position.set(cx, cy + Math.sin(alt) * R, cz + Math.cos(alt) * R);
    sun.target.position.set(cx, cy, cz);
    sun.intensity =
      (CONFIG.SUN.INTENSITY_BASE + CONFIG.SUN.INTENSITY_AMP * Math.sin(alt)) *
      (CONFIG.SKY.CONDITIONS as Record<string, SkyCondition>)[skyConditionKey]
        .SUN_FACTOR;
  }
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const ambient = new THREE.AmbientLight(CONFIG.SCENE.AMBIENT.COLOR, CONFIG.SCENE.AMBIENT.INTENSITY);
  scene.add(ambient);

  const rig = createCameraRig(renderer.domElement, window.innerWidth / window.innerHeight);
  // debug/testing hook: lets tooling move the camera programmatically
  (window as unknown as Record<string, unknown>).__rig = rig;

  const terrain = await createTerrain();
  scene.add(terrain.mesh);
  terrain.mesh.receiveShadow = true;

  const sky: Sky = createSky(sceneRng());
  scene.add(sky.group);

  // Apply a sky condition everywhere at once: dome + clouds (sky), fog and
  // background colour, hemisphere/ambient levels, and the sun via updateSun.
  const applySkyCondition = (key: string): void => {
    if (!(key in CONFIG.SKY.CONDITIONS)) return;
    skyConditionKey = key;
    sky.setCondition(key);
    const cond = (CONFIG.SKY.CONDITIONS as Record<string, SkyCondition>)[key];
    skyColor.set(cond.FOG);
    (scene.fog as THREE.Fog).color.set(cond.FOG);
    hemi.intensity = CONFIG.SCENE.HEMI.INTENSITY * cond.HEMI_FACTOR;
    ambient.intensity = CONFIG.SCENE.AMBIENT.INTENSITY * cond.AMBIENT_FACTOR;
    const dayInput = document.getElementById('dayofyear') as HTMLInputElement | null;
    updateSun(Number(dayInput?.value ?? 190));
  };
  // debug/dashboard hook: programmatic sky control without the UI
  (window as unknown as Record<string, unknown>).__scene3 = {
    ...(window as unknown as Record<string, unknown>).__scene3 as object,
    sky: {
      setCondition: applySkyCondition,
      get condition() {
        return skyConditionKey;
      },
    },
  };
  // sky condition dropdown next to the day slider
  const seasonPanelEl = document.getElementById('season');
  if (seasonPanelEl) {
    const skySelect = document.createElement('select');
    skySelect.id = 'skycondition';
    skySelect.title = 'Himmelszustand';
    for (const [key, cond] of Object.entries(CONFIG.SKY.CONDITIONS)) {
      const opt = document.createElement('option');
      opt.value = key;
      opt.textContent = cond.LABEL;
      if (key === CONFIG.SKY.DEFAULT_CONDITION) opt.selected = true;
      skySelect.appendChild(opt);
    }
    skySelect.addEventListener('change', () => applySkyCondition(skySelect.value));
    seasonPanelEl.appendChild(skySelect);
  }

  const thicket = await createThicket(await getHeightSampler());
  scene.add(thicket.group);

  const structures = await createStructures();
  scene.add(structures.group);
  structures.group.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      o.castShadow = true;
      (o as THREE.Mesh).receiveShadow = true;
    }
  });

  const grass: Grass = await createGrass(sceneRng());
  (window as unknown as Record<string, unknown>).__buildId = CONFIG.DEBUG.BUILD_ID;
  scene.add(grass.mesh);

  const buildings = await createBuildings();
  scene.add(buildings.group);
  // debug/testing hook: direct access to the snow-driven scene parts
  (window as unknown as Record<string, unknown>).__scene3 =
    { ...((window as unknown as Record<string, unknown>).__scene3 as object), terrain, grass, structures, buildings, thicket };
  // hand the lawn mask to the terrain so winter snow covers exactly the
  // grass region (same cells the blades are placed on) — minus the thicket
  // strip: its dense bushes are green in the DOP (so the lawn mask includes
  // them) but must not carry ground snow
  const lm = grass.getLawnMask();
  const cellW = (site.window.eMax - site.window.eMin) / lm.w;
  const cellD = (site.window.nMax - site.window.nMin) / lm.h;
  const thicketInPolygon = (x: number, z: number): boolean => {
    const poly = CONFIG.THICKET.POLYGON;
    for (const [dx, dz] of [[0, 0], [cellW * 4, 0], [-cellW * 4, 0], [0, cellD * 4], [0, -cellD * 4]]) {
      let inside = false;
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const xi = poly[i][0], zi = poly[i][1], xj = poly[j][0], zj = poly[j][1];
        if (zi > z + dz !== zj > z + dz && x + dx < ((xj - xi) * (z + dz - zi)) / (zj - zi) + xi) inside = !inside;
      }
      if (inside) return true;
    }
    return false;
  };
  // RGBA so each 250 px row stays 4-byte aligned (RedFormat rows of 250 B
  // need unpackAlignment tricks); luminance replicated into all channels
  const maskData = new Uint8Array(lm.w * lm.h * 4);
  for (let gz = 0; gz < lm.h; gz++) {
    for (let gx = 0; gx < lm.w; gx++) {
      const k = gz * lm.w + gx;
      const cx = site.window.eMin - site.origin.utmE + (gx + 0.5) * cellW;
      const cz = site.origin.utmN - site.window.nMax + (gz + 0.5) * cellD;
      const v = lm.data[k] && !thicketInPolygon(cx, cz) ? 255 : 0;
      maskData[k * 4] = v;
      maskData[k * 4 + 1] = v;
      maskData[k * 4 + 2] = v;
      maskData[k * 4 + 3] = 255;
    }
  }
  const maskTex = new THREE.DataTexture(maskData, lm.w, lm.h, THREE.RGBAFormat, THREE.UnsignedByteType);
  maskTex.needsUpdate = true;
  terrain.setSnowMask(maskTex);

  // walking cat (hidden by default; "Katze" toggle below)
  const cat: Cat = await createCat();
  scene.add(cat.group);
  (window as unknown as Record<string, unknown>).__scene3 =
    { ...((window as unknown as Record<string, unknown>).__scene3 as object), cat };

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
  thicket.setSeason(Number(seasonInput?.value ?? 190));
  updateSun(Number(seasonInput?.value ?? 190));

  createComparePanel(renderer, rig, seasonInput);
  createCameraUI(rig);

  // "Katze" toggle in the season panel (hidden default, no page reload)
  if (seasonPanel) {
    const catToggle = document.createElement('input');
    catToggle.type = 'checkbox';
    catToggle.id = 'showcat';
    catToggle.title = 'Katze zeigen';
    catToggle.checked = CONFIG.CAT.ENABLED;
    const catLabel = document.createElement('label');
    catLabel.htmlFor = 'showcat';
    catLabel.textContent = 'Katze';
    catToggle.addEventListener('change', () => {
      cat.setVisible(catToggle.checked);
      if (!catToggle.checked) setFollow(false);
    });
    seasonPanel.appendChild(catToggle);
    seasonPanel.appendChild(catLabel);
  }

  // "Katze folgen" chase cam: tracks the walking cat, cancels on user
  // interaction (same UX as the Vogelflug)
  let followActive = false;
  let followBtn: HTMLButtonElement | null = null;
  function setFollow(v: boolean): void {
    followActive = v && cat.group.visible;
    if (followBtn) followBtn.classList.toggle('active', followActive);
  }
  const presetsUi2 = document.getElementById('presets');
  if (presetsUi2) {
    followBtn = document.createElement('button');
    followBtn.textContent = 'Katze folgen';
    followBtn.dataset.preset = 'katze';
    followBtn.addEventListener('click', () => setFollow(!followActive));
    presetsUi2.appendChild(followBtn);
  }
  renderer.domElement.addEventListener('pointerdown', () => setFollow(false));

  // "Vogelflug": bird's-eye flight from the elevated NE tree over the
  // orchard; cancels on user interaction, hands the camera back to OrbitControls
  const flight = await createBirdFlight(rig, await getHeightSampler());
  const presetsUi = document.getElementById('presets');
  if (presetsUi) {
    const btn = document.createElement('button');
    btn.textContent = 'Vogelflug';
    btn.dataset.preset = 'vogelflug';
    btn.addEventListener('click', () => (flight.active ? flight.stop() : flight.start()));
    presetsUi.appendChild(btn);
  }
  (window as unknown as Record<string, unknown>).__scene3 =
    { ...(window as unknown as Record<string, unknown>).__scene3 as object, flight };

  let orchard: Orchard | null = null;
  createOrchard((done, total) => {
    if (progressEl) progressEl.textContent = `Bäume: ${done}/${total} …`;
  }).then((o) => {
    orchard = o;
    scene.add(o.group);
    (window as unknown as Record<string, unknown>).__scene3 =
      { ...(window as unknown as Record<string, unknown>).__scene3 as object, orchard: o };
    o.group.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) obj.castShadow = true;
    });
    if (progressEl) {
      progressEl.textContent = `${site.trees.length} Bäume generiert (${CONFIG.SEASONS.length} Jahreszeiten-Varianten)`;
    }
    if (seasonPanel) seasonPanel.style.display = '';
    if (seasonValue && seasonInput) {
      const day = Number(seasonInput.value);
      // sync the tree season with the slider so day 0 labels "Winter"
      seasonValue.textContent = `Tag ${String(day).padStart(3, '0')} (${monthDay(day)}) · ${labelFor(o.setSeason(day))}`;
    }
  });

  function labelFor(key: string): string {
    return CONFIG.UI.SEASON_LABELS[key as keyof typeof CONFIG.UI.SEASON_LABELS] ?? 'Sommer';
  }

  // fixed-format season label (3-digit day) so the slider panel never reflows
  const seasonLabel = (day: number): string =>
    `Tag ${String(day).padStart(3, '0')} (${monthDay(day)})${orchard ? ` · ${labelFor(orchard.setSeason(day))}` : ''}`;

  seasonInput?.addEventListener('input', () => {
    const day = Number(seasonInput.value);
    grass.setSeason(day);
    terrain.setSnow(snowAmount(day));
    structures.setSnow(snowAmount(day));
    thicket.setSeason(day);
    updateSun(day);
    if (seasonValue) {
      seasonValue.textContent = seasonLabel(day);
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
  const followBehind = new THREE.Vector3();
  const followTarget = new THREE.Vector3();
  const followCam = new THREE.Vector3();
  renderer.setAnimationLoop(() => {
    const dt = clock.getDelta();
    const t = clock.elapsedTime;
    flight.update(dt);
    cat.update(dt);
    if (followActive && cat.group.visible) {
      // chase pose: BACK metres behind (opposite the cat's heading), UP above.
      // Exponential smoothing with dt (not per-frame lerp) so convergence is
      // frame-rate independent — SwiftShader runs at a handful of fps.
      const fp = cat.followPose();
      followBehind.set(-Math.sin(fp.heading), 0, -Math.cos(fp.heading));
      followCam.copy(fp.position).addScaledVector(followBehind, CONFIG.CAT.FOLLOW.BACK);
      followCam.y += CONFIG.CAT.FOLLOW.UP;
      followTarget.copy(fp.position);
      followTarget.y += 0.3;
      const k = 1 - Math.exp(-5 * dt);
      rig.camera.position.lerp(followCam, k);
      rig.controls.target.lerp(followTarget, Math.min(1, k * 2));
    }
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
