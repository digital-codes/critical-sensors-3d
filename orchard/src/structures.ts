import * as THREE from 'three';
import site from './site';
import { getHeightSampler } from './terrain';

interface SiteStructure {
  id: string;
  osmWay: number;
  footprint: [number, number][];
  x: number;
  z: number;
  heightEst: number;
  note: string;
  positionSource?: string;
}

/** Oriented bounding rectangle of a footprint polygon (local metres). */
export interface FootprintRect {
  cx: number;
  cz: number;
  /** rotation of the rect's long axis around Y (atan2 of edge direction) */
  ang: number;
  halfLen: number;
  halfWid: number;
}

export function getFootprintRects(): FootprintRect[] {
  return (site.structures as SiteStructure[]).map((s) => {
    let cx = 0;
    let cz = 0;
    for (const p of s.footprint) {
      cx += p[0];
      cz += p[1];
    }
    cx /= s.footprint.length;
    cz /= s.footprint.length;

    // long axis = direction of the polygon's longest edge
    let bestLen = -1;
    let ang = 0;
    for (let i = 0; i < s.footprint.length - 1; i++) {
      const dx = s.footprint[i + 1][0] - s.footprint[i][0];
      const dz = s.footprint[i + 1][1] - s.footprint[i][1];
      const len = Math.hypot(dx, dz);
      if (len > bestLen) {
        bestLen = len;
        ang = Math.atan2(dz, dx);
      }
    }
    const px = Math.cos(ang);
    const pz = Math.sin(ang);
    const qx = -Math.sin(ang);
    const qz = Math.cos(ang);
    let aMin = Infinity;
    let aMax = -Infinity;
    let bMin = Infinity;
    let bMax = -Infinity;
    for (const p of s.footprint) {
      const rx = p[0] - cx;
      const rz = p[1] - cz;
      const a = rx * px + rz * pz;
      const b = rx * qx + rz * qz;
      aMin = Math.min(aMin, a);
      aMax = Math.max(aMax, a);
      bMin = Math.min(bMin, b);
      bMax = Math.max(bMax, b);
    }
    return { cx, cz, ang, halfLen: (aMax - aMin) / 2, halfWid: (bMax - bMin) / 2 };
  });
}

export interface Structures {
  group: THREE.Group;
}

export async function createStructures(): Promise<Structures> {
  const getHeight = await getHeightSampler();
  const group = new THREE.Group();
  group.name = 'structures';

  const wood = new THREE.MeshLambertMaterial({ color: 0x4a3728 });
  const cream = new THREE.MeshLambertMaterial({ color: 0xd8cfae, side: THREE.DoubleSide });

  function box(w: number, h: number, d: number): THREE.Mesh {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wood);
    return m;
  }

  function boxM(w: number, h: number, d: number, mat: THREE.Material): THREE.Mesh {
    return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  }

  function post(x: number, z: number, h: number, r = 0.07): THREE.Mesh {
    const p = box(r * 2, h, r * 2);
    p.position.set(x, h / 2, z);
    return p;
  }

  function shadow(r: number): THREE.Mesh {
    const m = new THREE.Mesh(
      new THREE.CircleGeometry(r, 24),
      new THREE.MeshBasicMaterial({
        color: 0x000000,
        transparent: true,
        opacity: 0.25,
        depthWrite: false,
      }),
    );
    m.rotation.x = -Math.PI / 2;
    m.position.y = 0.03;
    return m;
  }

  function fabricPlane(w: number, h: number, color: number): THREE.Mesh {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide }),
    );
    return m;
  }

  /** Sloped tarp quad between two horizontal edges (weather/sun shield). */
  function tarpQuad(
    topY: number,
    botY: number,
    topOff: number,
    botOff: number,
    half: number,
    color: number,
  ): THREE.Mesh {
    const g = new THREE.BufferGeometry();
    // local +x = outward face normal side; quad spans z in [-half, +half]
    const v = new Float32Array([
      topOff, topY, -half,
      topOff, topY, half,
      botOff, botY, half,
      botOff, botY, -half,
    ]);
    g.setAttribute('position', new THREE.BufferAttribute(v, 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    g.computeVertexNormals();
    return new THREE.Mesh(
      g,
      new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide }),
    );
  }

  function ladder(g: THREE.Group, x: number, halfW: number, topY: number): void {
    for (const sz of [-1, 1]) {
      const rail = post(x, sz * (halfW - 0.05), topY, 0.04);
      g.add(rail);
    }
    for (let y = 0.5; y < topY - 0.2; y += 0.35) {
      const rung = box(0.05, 0.05, halfW * 2 - 0.15);
      rung.position.set(x, y, 0);
      g.add(rung);
    }
  }

  for (const s of site.structures as SiteStructure[]) {
    const rect = getFootprintRects()[ (site.structures as SiteStructure[]).indexOf(s) ];
    const H = s.heightEst;
    const L = rect.halfLen * 2;
    const W = rect.halfWid * 2;

    const g = new THREE.Group();
    g.name = `structure-${s.id}`;
    g.position.set(s.x, getHeight(s.x, s.z), s.z);
    g.rotation.y = -rect.ang;

    if (s.id === 'osmway124028003') {
      // RIGHT tower in photo 20261022_125920 (viewed from NE): roofed
      // platform - deck at ~2.5 m, vertical-slat railing, dark low-pitched
      // roof with overhang, blue tarp awning sloping down-out on the SE
      // face, table beneath the deck. Total ~4.2 m.
      const DECK = H * 0.6; // ~2.5 m
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          g.add(post(sx * rect.halfLen, sz * rect.halfWid, H, 0.08));
        }
      }
      // deck
      const deck = box(L + 0.2, 0.07, W + 0.2);
      deck.position.y = DECK;
      g.add(deck);
      // slat railing around the deck perimeter
      const railTop = DECK + 0.6;
      for (const side of [-1, 1]) {
        const rE = box(0.06, 0.06, W);
        rE.position.set(side * rect.halfLen, railTop, 0);
        g.add(rE);
        const rS = box(L, 0.06, 0.06);
        rS.position.set(0, railTop, side * rect.halfWid);
        g.add(rS);
        for (let t = -rect.halfWid + 0.1; t <= rect.halfWid - 0.1; t += 0.16) {
          const slat = box(0.035, 0.55, 0.035);
          slat.position.set(side * rect.halfLen, DECK + 0.3, t);
          g.add(slat);
        }
        for (let t = -rect.halfLen + 0.1; t <= rect.halfLen - 0.1; t += 0.16) {
          const slat = box(0.035, 0.55, 0.035);
          slat.position.set(t, DECK + 0.3, side * rect.halfWid);
          g.add(slat);
        }
      }
      // roof posts + dark low-pitched roof with overhang
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          const rp = box(0.07, H - DECK - 0.65, 0.07);
          rp.position.set(sx * (rect.halfLen - 0.05), DECK + (H - DECK - 0.65) / 2, sz * (rect.halfWid - 0.05));
          g.add(rp);
        }
      }
      const roof = box(L + 0.5, 0.06, W + 0.5);
      roof.position.y = H - 0.32;
      roof.rotation.z = 0.07; // slight tilt
      g.add(roof);
      // blue tarp awning: railing top on the SE (+x/+z) side sloping down-out
      g.add(tarpQuad(DECK + 0.55, 0.55, rect.halfLen + 0.02, rect.halfLen + 1.4, rect.halfWid * 0.85, 0x3f6f96));
      // picnic-style table beneath the deck
      const tbl = box(1.2, 0.05, 0.7);
      tbl.position.set(0, 0.72, 0);
      g.add(tbl);
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          const leg = box(0.05, 0.7, 0.05);
          leg.position.set(sx * 0.5, 0.35, sz * 0.25);
          g.add(leg);
        }
      }
    } else if (s.id === 'osmway124028005') {
      // TALLEST tower (south photo 20261028_163922 right / NE photo left):
      // two-level platform ~4.6 m, deck ~2.3 m with slat railing, purple
      // fabric valance over the top crossbeam on the SOUTH (+z) side, rung
      // ladder on the WEST (-x) side, diagonal bracing, bench beneath.
      const DECK = H * 0.5; // ~2.3 m
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          g.add(post(sx * rect.halfLen, sz * rect.halfWid, H, 0.08));
        }
      }
      // diagonal bracing on the west (-x) side
      for (const sz of [-1, 1]) {
        const brace = box(0.06, 1.6, 0.06);
        brace.position.set(-rect.halfLen, DECK * 0.45, sz * (rect.halfWid - 0.15));
        brace.rotation.x = sz * 0.5;
        g.add(brace);
      }
      // lower step platform + main deck
      const step = box(L * 0.55, 0.06, W * 0.55);
      step.position.set(rect.halfLen * 0.2, H * 0.26, 0);
      g.add(step);
      const deck = box(L + 0.2, 0.07, W + 0.2);
      deck.position.y = DECK;
      g.add(deck);
      // slat railing around the deck
      const railTop = DECK + 0.6;
      for (const side of [-1, 1]) {
        const rE = box(0.06, 0.06, W);
        rE.position.set(side * rect.halfLen, railTop, 0);
        g.add(rE);
        const rS = box(L, 0.06, 0.06);
        rS.position.set(0, railTop, side * rect.halfWid);
        g.add(rS);
        for (let t = -rect.halfWid + 0.1; t <= rect.halfWid - 0.1; t += 0.16) {
          const slat = box(0.035, 0.55, 0.035);
          slat.position.set(side * rect.halfLen, DECK + 0.3, t);
          g.add(slat);
        }
        for (let t = -rect.halfLen + 0.1; t <= rect.halfLen - 0.1; t += 0.16) {
          const slat = box(0.035, 0.55, 0.035);
          slat.position.set(t, DECK + 0.3, side * rect.halfWid);
          g.add(slat);
        }
      }
      // top crossbeams (open top, no roof)
      for (const sz of [-1, 1]) {
        const topB = box(L + 0.15, 0.1, 0.12);
        topB.position.set(0, H - 0.05, sz * rect.halfWid);
        g.add(topB);
      }
      // ladder on the WEST (-x) side, up to the deck
      ladder(g, -rect.halfLen - 0.1, rect.halfWid, DECK + 0.3);
      // purple fabric valance over the top crossbeam, hanging on the south side
      const fabric = fabricPlane(L * 0.8, 1.1, 0x6a4a9c);
      fabric.position.set(0, H - 0.62, rect.halfWid + 0.05);
      fabric.rotation.x = -0.08;
      fabric.rotation.z = 0.05;
      g.add(fabric);
      // bench slats beneath the deck
      const bench = box(L * 0.8, 0.06, 0.35);
      bench.position.set(0, 0.45, rect.halfWid * 0.55);
      g.add(bench);
      for (const sx of [-1, 1]) {
        const bl = post(sx * rect.halfLen * 0.55, 0, 0.45, 0.04);
        bl.position.z = rect.halfWid * 0.55;
        g.add(bl);
      }
    } else if (s.id === 'osmway124028004') {
      // WEST tower (south photo left): deck ~2.0 m, cream vertical fabric
      // strips covering the SOUTH face, lighter timber, ~3.4 m.
      const DECK = H * 0.58;
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          g.add(post(sx * rect.halfLen, sz * rect.halfWid, H));
        }
      }
      const deck = box(L + 0.15, 0.07, W + 0.15);
      deck.position.y = DECK;
      g.add(deck);
      // simple rail on the three open sides
      for (const side of [-1, 1]) {
        const rE = box(0.06, 0.06, W);
        rE.position.set(side * rect.halfLen, DECK + 0.55, 0);
        g.add(rE);
        const rN = box(L, 0.06, 0.06);
        rN.position.set(0, DECK + 0.55, -rect.halfWid);
        g.add(rN);
      }
      // cream vertical strips on the south (+z) face, from deck to top frame
      const stripN = 7;
      for (let i = 0; i < stripN; i++) {
        const t = -rect.halfLen + ((i + 0.5) * L) / stripN;
        const strip = boxM(0.14, H - DECK - 0.05, 0.02, cream);
        strip.position.set(t, DECK + (H - DECK) / 2, rect.halfWid + 0.04);
        g.add(strip);
      }
      // top frame
      const topA = box(L + 0.15, 0.08, 0.1);
      topA.position.set(0, H - 0.04, -rect.halfWid);
      g.add(topA);
      const topB = box(L + 0.15, 0.08, 0.1);
      topB.position.set(0, H - 0.04, rect.halfWid);
      g.add(topB);
    } else {
      // fallback: simple 4-post frame with crossbeam (unused with the three
      // measured towers, kept as a safe default)
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          g.add(post(sx * rect.halfLen, sz * rect.halfWid, H));
        }
      }
      const beam = box(L + 0.15, 0.1, 0.12);
      beam.position.y = H - 0.05;
      g.add(beam);
      const beam2 = box(L * 0.85, 0.08, 0.1);
      beam2.position.y = H * 0.6;
      g.add(beam2);
    }

    g.add(shadow(Math.max(rect.halfLen, rect.halfWid) * 1.15));
    group.add(g);
  }

  return { group };
}
