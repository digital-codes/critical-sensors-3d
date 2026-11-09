import * as THREE from 'three';
import { CONFIG } from './config';
import site from './site';

/**
 * The real information board ("Infotafel") at the meadow: a single dark
 * post carrying a landscape board whose face is the photographed ZKM panel
 * graphic (newimages/panel_small.png → public/textures/panel.png).
 *
 * Position and every dimension come from CONFIG.PANEL — no verbatim numbers
 * here. The WGS84 position is converted to the app-local frame with the
 * same projection the site pipeline uses (EPSG:25832, ETRS89 / UTM 32N;
 * local: +x = east, +z = south — see prepare_site.py to_local).
 */

// ---------------------------------------------------------------------------
// WGS84/ETRS89 → UTM 32N transverse Mercator (Krüger series, OGP GN7-2).
// Algorithm-internal constants (ellipsoid + zone 32 definition) — the zone
// is fixed because the whole site sits at ~8.39° E.
const UTM_A = 6378137.0; // GRS80/ETRS89 semi-major axis, m
const UTM_F = 1 / 298.257222101; // ETRS89 flattening
const UTM_K0 = 0.9996; // zone scale factor
const UTM_LON0 = (9 * Math.PI) / 180; // zone 32 central meridian, rad
const UTM_FE = 500000.0; // false easting, m

/** WGS84 lat/lon (deg) → [easting, northing] in EPSG:25832, metres. */
export function utm32(latDeg: number, lonDeg: number): [number, number] {
  const lat = (latDeg * Math.PI) / 180;
  const lon = (lonDeg * Math.PI) / 180;
  const f = UTM_F;
  const a = UTM_A;
  const e2 = f * (2 - f);
  const ep2 = e2 / (1 - e2);
  const n = a / Math.sqrt(1 - e2 * Math.sin(lat) ** 2);
  const t = Math.tan(lat) ** 2;
  const c = ep2 * Math.cos(lat) ** 2;
  const A = Math.cos(lat) * (lon - UTM_LON0);

  // meridian arc length from the equator (series in e2)
  const e = e2;
  const M =
    a *
    ((1 - e / 4 - (3 * e * e) / 64 - (5 * e ** 3) / 256) * lat -
      ((3 * e) / 8 + (3 * e * e) / 32 + (45 * e ** 3) / 1024) * Math.sin(2 * lat) +
      ((15 * e * e) / 256 + (45 * e ** 3) / 1024) * Math.sin(4 * lat) -
      ((35 * e ** 3) / 3072) * Math.sin(6 * lat));

  const easting =
    UTM_FE +
    UTM_K0 *
      n *
      (A +
        ((1 - t + c) * A ** 3) / 6 +
        ((5 - 18 * t + t * t + 72 * c - 58 * ep2) * A ** 5) / 120);
  const northing =
    UTM_K0 *
    (M +
      n *
        Math.tan(lat) *
        (A ** 2 / 2 +
          ((5 - 4 * t + 42 * c + 13 * c * c - 28 * ep2) * A ** 4) / 24 +
          ((61 - 148 * t + 16 * t * t) * A ** 6) / 720));
  return [easting, northing];
}

export async function createPanel(
  heightAt: (x: number, z: number) => number,
): Promise<{ group: THREE.Group }> {
  const cfg = CONFIG.PANEL;
  const [e, n] = utm32(cfg.LAT, cfg.LON);
  // app-local frame (prepare_site.py to_local): x = e - origin.utmE (east),
  // z = origin.utmN - n (south) — right-handed with +y up
  const x = e - site.origin.utmE;
  const z = site.origin.utmN - n;
  const groundY = heightAt(x, z);

  const group = new THREE.Group();
  group.position.set(x, groundY, z);
  // board face (local +z) points toward compass azimuth AZIMUTH_DEG:
  // rotate local +z (0,0,1) onto (sin A, 0, -cos A)  ⇒  yaw = π - A
  group.rotation.y = Math.PI - (cfg.AZIMUTH_DEG * Math.PI) / 180;

  const postMat = new THREE.MeshStandardMaterial({ color: cfg.POST_COLOR, roughness: 0.9 });
  const edgeMat = new THREE.MeshStandardMaterial({ color: cfg.EDGE_COLOR, roughness: 0.6, metalness: 0.3 });

  // single dark post behind the board
  const post = new THREE.Mesh(new THREE.BoxGeometry(cfg.POST_W, cfg.POST_TOP_H, cfg.POST_W), postMat);
  post.position.set(0, cfg.POST_TOP_H / 2, -cfg.BOARD_T / 2 - cfg.POST_W / 2 + 0.01);
  post.castShadow = true;
  group.add(post);

  // board: six-material box — the +z face (index 4) carries the graphic
  const loader = new THREE.TextureLoader();
  const faceTex = await loader.loadAsync(cfg.TEXTURE_URL);
  faceTex.colorSpace = THREE.SRGBColorSpace;
  const faceMat = new THREE.MeshStandardMaterial({ map: faceTex, roughness: 0.55 });
  const board = new THREE.Mesh(
    new THREE.BoxGeometry(cfg.BOARD_W, cfg.BOARD_H, cfg.BOARD_T),
    [edgeMat, edgeMat, edgeMat, edgeMat, faceMat, edgeMat],
  );
  board.position.set(0, cfg.BOARD_CENTRE_H, 0);
  board.castShadow = true;
  group.add(board);

  return { group };
}
