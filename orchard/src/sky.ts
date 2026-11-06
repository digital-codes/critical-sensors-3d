import * as THREE from 'three';

const CLOUD_COUNT = 12;
const CLOUD_SPAN = 1000; // wrap bounds for drift, local metres from origin
const GROUND_Y = 115; // approximate site ground level (terrain 111-123 m)

export interface Sky {
  group: THREE.Group;
  update(deltaTime: number): void;
}

/** Soft cloud sprite texture: random white blobs via radial gradients. */
function makeCloudTexture(): THREE.Texture {
  const size = 256;
  const cv = document.createElement('canvas');
  cv.width = size;
  cv.height = size;
  const ctx = cv.getContext('2d')!;
  const blobs = 12 + Math.floor(Math.random() * 7);
  for (let i = 0; i < blobs; i++) {
    const bx = size * 0.5 + (Math.random() - 0.5) * size * 0.5;
    const by = size * 0.55 + (Math.random() - 0.5) * size * 0.3;
    const r = size * 0.1 + Math.random() * size * 0.16;
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

export function createSky(): Sky {
  const group = new THREE.Group();
  group.name = 'sky';

  // overcast gradient dome
  const domeMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      topColor: { value: new THREE.Color(0xbfcdd8) },
      horizonColor: { value: new THREE.Color(0xe8ecef) },
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
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1500, 32, 16), domeMat);
  group.add(dome);

  // procedural cloud billboards
  const textures = [makeCloudTexture(), makeCloudTexture(), makeCloudTexture()];
  const clouds: { sprite: THREE.Sprite; speed: number }[] = [];
  for (let i = 0; i < CLOUD_COUNT; i++) {
    const mat = new THREE.SpriteMaterial({
      map: textures[i % textures.length],
      transparent: true,
      depthWrite: false,
      opacity: 0.55 + Math.random() * 0.3,
    });
    const sprite = new THREE.Sprite(mat);
    const w = 140 + Math.random() * 160;
    sprite.scale.set(w, w * (0.4 + Math.random() * 0.2), 1);
    sprite.position.set(
      (Math.random() - 0.5) * 2 * CLOUD_SPAN,
      GROUND_Y + 80 + Math.random() * 40,
      (Math.random() - 0.5) * 2 * CLOUD_SPAN,
    );
    group.add(sprite);
    clouds.push({ sprite, speed: 1 + Math.random() * 2 });
  }

  return {
    group,
    update(deltaTime: number): void {
      for (const c of clouds) {
        c.sprite.position.x += c.speed * deltaTime;
        if (c.sprite.position.x > CLOUD_SPAN) c.sprite.position.x = -CLOUD_SPAN;
      }
    },
  };
}
