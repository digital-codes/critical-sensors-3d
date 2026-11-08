import * as THREE from 'three';
import { CONFIG, type SkyCondition } from './config';
import { mulberry32, type Rng } from './rng';

// All sky look values live in CONFIG.SKY.CONDITIONS (single constants home).

export interface Sky {
  group: THREE.Group;
  /** switch dome/clouds to a named condition (unknown keys are ignored) */
  setCondition(key: string): void;
  update(deltaTime: number): void;
}

/** Soft cloud sprite texture: random white blobs via radial gradients. */
function makeCloudTexture(rng: Rng): THREE.Texture {
  const size = 256;
  const cv = document.createElement('canvas');
  cv.width = size;
  cv.height = size;
  const ctx = cv.getContext('2d')!;
  const blobs = 12 + Math.floor(rng() * 7);
  for (let i = 0; i < blobs; i++) {
    const bx = size * 0.5 + (rng() - 0.5) * size * 0.5;
    const by = size * 0.55 + (rng() - 0.5) * size * 0.3;
    const r = size * 0.1 + rng() * size * 0.16;
    const g = ctx.createRadialGradient(bx, by, 0, bx, by, r);
    g.addColorStop(0, 'rgba(255,255,255,0.55)');
    g.addColorStop(0.6, 'rgba(255,255,255,0.28)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createSky(rng: Rng = Math.random): Sky {
  const group = new THREE.Group();
  group.name = 'sky';

  // dome gradient from the default condition's colours
  const initial = CONFIG.SKY.CONDITIONS[CONFIG.SKY.DEFAULT_CONDITION];
  const domeMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      topColor: { value: new THREE.Color(initial.DOME_TOP) },
      horizonColor: { value: new THREE.Color(initial.DOME_HORIZON) },
    },
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 topColor;
      uniform vec3 horizonColor;
      varying vec3 vDir;
      void main() {
        float h = clamp(vDir.y, 0.0, 1.0);
        gl_FragColor = vec4(mix(horizonColor, topColor, pow(h, 0.6)), 1.0);
      }
    `,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(CONFIG.SKY.DOME_RADIUS, 32, 16), domeMat);
  group.add(dome);

  // procedural cloud billboards (shared textures, per-condition materials)
  const textures = Array.from({ length: CONFIG.SKY.TEXTURES }, () => makeCloudTexture(rng));
  const clouds: { sprite: THREE.Sprite; speed: number }[] = [];

  /** rng call order MUST stay: opacity → w → aspect → x → y → z → speed
   *  (keeps the page-seeded default placement byte-identical) */
  const spawnClouds = (
    count: number,
    tint: number,
    opacityMin: number,
    opacityJitter: number,
    cloudRng: Rng,
  ): void => {
    for (let i = 0; i < count; i++) {
      const mat = new THREE.SpriteMaterial({
        map: textures[i % textures.length],
        transparent: true,
        depthWrite: false,
        opacity: opacityMin + cloudRng() * opacityJitter,
        color: tint,
      });
      const sprite = new THREE.Sprite(mat);
      const w = 140 + cloudRng() * 160;
      sprite.scale.set(w, w * (0.4 + cloudRng() * 0.2), 1);
      sprite.position.set(
        (cloudRng() - 0.5) * 2 * CONFIG.SKY.CLOUD_SPAN,
        CONFIG.SKY.GROUND_Y + CONFIG.SKY.CLOUD_ALT_BASE + cloudRng() * CONFIG.SKY.CLOUD_ALT_JITTER,
        (cloudRng() - 0.5) * 2 * CONFIG.SKY.CLOUD_SPAN,
      );
      group.add(sprite);
      clouds.push({ sprite, speed: 1 + cloudRng() * 2 });
    }
  };

  spawnClouds(
    initial.CLOUD_COUNT,
    initial.CLOUD_TINT,
    initial.CLOUD_OPACITY_MIN,
    initial.CLOUD_OPACITY_JITTER,
    rng,
  );

  return {
    group,
    setCondition(key: string): void {
      const cond = (CONFIG.SKY.CONDITIONS as Record<string, SkyCondition>)[key];
      if (!cond) return;
      domeMat.uniforms.topColor.value.set(cond.DOME_TOP);
      domeMat.uniforms.horizonColor.value.set(cond.DOME_HORIZON);
      for (const { sprite } of clouds) {
        group.remove(sprite);
        (sprite.material as THREE.SpriteMaterial).dispose();
      }
      clouds.length = 0;
      // condition-stable placement: same key → same layout, independent of
      // page seed and switch history
      const seed = 0xc10d + Object.keys(CONFIG.SKY.CONDITIONS).indexOf(key);
      spawnClouds(cond.CLOUD_COUNT, cond.CLOUD_TINT, cond.CLOUD_OPACITY_MIN, cond.CLOUD_OPACITY_JITTER, mulberry32(seed));
    },
    update(deltaTime: number): void {
      for (const c of clouds) {
        c.sprite.position.x += c.speed * deltaTime;
        if (c.sprite.position.x > CONFIG.SKY.CLOUD_SPAN) c.sprite.position.x = -CONFIG.SKY.CLOUD_SPAN;
      }
    },
  };
}
