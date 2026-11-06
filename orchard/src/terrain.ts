import * as THREE from 'three';
import site from './site';

const hm = site.heightmap;
const win = site.window;
const origin = site.origin;

export const WIN_W = win.eMax - win.eMin; // 500 m (east-west)
export const WIN_D = win.nMax - win.nMin; // 450 m (south-north)
export const X_MIN = win.eMin - origin.utmE;
export const X_MAX = win.eMax - origin.utmE;
// +z = SOUTH (right-handed for three.js with +x = east, +y = up):
// north edge is the most negative z.
export const Z_MIN = origin.utmN - win.nMax;
export const Z_MAX = origin.utmN - win.nMin;

interface HeightField {
  w: number;
  h: number;
  /** millimetres above hm.hmin, row 0 = north edge */
  mm: Uint16Array;
}

async function inflate(data: Uint8Array): Promise<Uint8Array> {
  const bytes = data.buffer.slice(
    data.byteOffset,
    data.byteOffset + data.byteLength,
  ) as ArrayBuffer;
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Minimal PNG decoder for 16-bit grayscale, non-interlaced (our heightmap). */
async function decodePng16(buf: ArrayBuffer): Promise<HeightField> {
  const bytes = new Uint8Array(buf);
  const sig = [137, 80, 78, 71, 13, 10, 26, 10];
  for (let i = 0; i < 8; i++) if (bytes[i] !== sig[i]) throw new Error('not a PNG');

  let w = 0;
  let h = 0;
  let bitDepth = 0;
  let colorType = -1;
  let interlace = -1;
  const idat: Uint8Array[] = [];
  let pos = 8;
  while (pos + 8 <= bytes.length) {
    const len = new DataView(buf, pos).getUint32(0);
    const type = String.fromCharCode(bytes[pos + 4], bytes[pos + 5], bytes[pos + 6], bytes[pos + 7]);
    if (type === 'IHDR') {
      w = new DataView(buf, pos + 8).getUint32(0);
      h = new DataView(buf, pos + 8).getUint32(4);
      bitDepth = bytes[pos + 16];
      colorType = bytes[pos + 17];
      interlace = bytes[pos + 20];
    } else if (type === 'IDAT') {
      idat.push(bytes.subarray(pos + 8, pos + 8 + len));
    } else if (type === 'IEND') {
      break;
    }
    pos += 12 + len;
  }
  if (bitDepth !== 16 || colorType !== 0 || interlace !== 0) {
    throw new Error(`unsupported PNG: depth=${bitDepth} color=${colorType} interlace=${interlace}`);
  }

  const raw = await inflate(idat.length === 1 ? idat[0] : concat(idat));

  // Unfilter scanlines (bpp = 2 bytes for one 16-bit gray sample)
  const stride = w * 2;
  const mm = new Uint16Array(w * h);
  const prev = new Uint8Array(stride);
  const cur = new Uint8Array(stride);
  let p = 0;
  for (let y = 0; y < h; y++) {
    const ft = raw[p++];
    for (let i = 0; i < stride; i++) {
      const x = raw[p++];
      const a = i >= 2 ? cur[i - 2] : 0;
      const b = prev[i];
      const c = i >= 2 ? prev[i - 2] : 0;
      let v = x;
      switch (ft) {
        case 1:
          v = x + a;
          break;
        case 2:
          v = x + b;
          break;
        case 3:
          v = x + ((a + b) >> 1);
          break;
        case 4: {
          const pa = Math.abs(b - c);
          const pb = Math.abs(a - c);
          const pc = Math.abs(a + b - 2 * c);
          v = x + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
          break;
        }
      }
      cur[i] = v & 0xff;
    }
    for (let x = 0; x < w; x++) {
      mm[y * w + x] = (cur[2 * x] << 8) | cur[2 * x + 1];
    }
    prev.set(cur);
  }
  return { w, h, mm };
}

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of parts) {
    out.set(c, off);
    off += c.length;
  }
  return out;
}

/** Fallback: canvas decode (8-bit; browsers scale 16-bit PNGs by 1/257). */
function heightmapViaCanvas(url: string): Promise<HeightField> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const cv = document.createElement('canvas');
      cv.width = img.width;
      cv.height = img.height;
      const ctx = cv.getContext('2d');
      if (!ctx) return reject(new Error('no 2d context'));
      ctx.drawImage(img, 0, 0);
      const d = ctx.getImageData(0, 0, cv.width, cv.height).data;
      const mm = new Uint16Array(cv.width * cv.height);
      for (let i = 0; i < mm.length; i++) mm[i] = d[i * 4] * 257;
      resolve({ w: cv.width, h: cv.height, mm });
    };
    img.onerror = () => reject(new Error('failed to load ' + url));
    img.src = url;
  });
}

export async function loadHeightField(url: string): Promise<HeightField> {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await decodePng16(await res.arrayBuffer());
  } catch (e) {
    console.warn('16-bit PNG decode failed, using canvas fallback', e);
    return heightmapViaCanvas(url);
  }
}

export interface Terrain {
  mesh: THREE.Mesh;
  /** local metres (x east, z south) -> absolute height in metres */
  heightAt(x: number, z: number): number;
}

/** Shared height field, loaded once and reused by terrain mesh + tree placement. */
let sharedField: HeightField | null = null;

function sampleMM(field: HeightField, grid: number, x: number, z: number): number {
  const fx = clamp((x - X_MIN) / grid, 0, field.w - 1);
  const fy = clamp((z - Z_MIN) / grid, 0, field.h - 1);
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const x1 = Math.min(x0 + 1, field.w - 1);
  const y1 = Math.min(y0 + 1, field.h - 1);
  const tx = fx - x0;
  const ty = fy - y0;
  const v00 = field.mm[y0 * field.w + x0];
  const v10 = field.mm[y0 * field.w + x1];
  const v01 = field.mm[y1 * field.w + x0];
  const v11 = field.mm[y1 * field.w + x1];
  return (
    v00 * (1 - tx) * (1 - ty) + v10 * tx * (1 - ty) + v01 * (1 - tx) * ty + v11 * tx * ty
  );
}

/**
 * Loads the height field once and returns a sampler for local metres
 * (x east, z north) -> absolute height in metres. Shared by the terrain
 * mesh and tree placement so both see identical heights.
 */
export async function getHeightSampler(): Promise<(x: number, z: number) => number> {
  if (!sharedField) sharedField = await loadHeightField('/' + hm.file);
  const field = sharedField;
  return (x: number, z: number) => hm.hmin + sampleMM(field, hm.gridM, x, z) / 1000;
}

/** Sync variant; only valid after getHeightSampler() has resolved. */
export function getHeight(x: number, z: number): number {
  if (!sharedField) throw new Error('height sampler not loaded yet');
  return hm.hmin + sampleMM(sharedField, hm.gridM, x, z) / 1000;
}

export async function createTerrain(): Promise<Terrain> {
  const heightAt = await getHeightSampler();

  // Plane spans the site window: x = easting, z = northing (plane rotated -PI/2)
  const geo = new THREE.PlaneGeometry(WIN_W, WIN_D, 500, 450);
  geo.rotateX(-Math.PI / 2);
  geo.translate((X_MIN + X_MAX) / 2, 0, (Z_MIN + Z_MAX) / 2);

  const pos = geo.attributes.position as THREE.BufferAttribute;
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    pos.setY(i, heightAt(x, z));
    // aerial.jpg covers the window exactly; image top row = north edge
    uv.setXY(i, (x - X_MIN) / WIN_W, (z - Z_MIN) / WIN_D);
  }
  uv.needsUpdate = true;
  geo.computeVertexNormals();

  const tex = await new THREE.TextureLoader().loadAsync('/' + site.aerial.file);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  // image row 0 = north; +z = south => v grows southward with flipY disabled
  tex.flipY = false;

  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: tex }));
  return { mesh, heightAt };
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
