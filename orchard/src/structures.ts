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

  function box(w: number, h: number, d: number): THREE.Mesh {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wood);
    return m;
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
      // tall narrow frame tower: 4 posts + ladder rungs + top platform + purple fabric
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          g.add(post(sx * rect.halfLen, sz * rect.halfWid, H));
        }
      }
      // ladder rungs on one long side
      for (let i = 1; i <= 3; i++) {
        const rung = box(0.06, 0.06, W - 0.1);
        rung.position.set(rect.halfLen + 0.05, (H * i) / 4, 0);
        g.add(rung);
      }
      // ladder side rails
      for (const sz of [-1, 1]) {
        const rail = post(rect.halfLen + 0.12, sz * (rect.halfWid - 0.05), H, 0.04);
        g.add(rail);
      }
      // top platform
      const platform = box(L + 0.2, 0.08, W + 0.2);
      platform.position.y = H - 0.04;
      g.add(platform);
      // purple fabric draped over the top rail
      const fabric = fabricPlane(L * 0.55, 0.9, 0x6a4a9c);
      fabric.position.set(0, H - 0.45, rect.halfWid + 0.05);
      fabric.rotation.x = -0.12;
      fabric.rotation.z = 0.07;
      g.add(fabric);
    } else if (s.id === 'osmway124028004') {
      // boxier construction: 4 posts + top railing + seat platform + blue tarp awning
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          g.add(post(sx * rect.halfLen, sz * rect.halfWid, H));
        }
      }
      // top railing around the perimeter
      const top = box(L, 0.07, W);
      top.position.y = H - 0.035;
      g.add(top);
      const railH = H - 0.45;
      for (const sx of [-1, 1]) {
        const r = box(0.07, 0.07, W);
        r.position.set(sx * rect.halfLen, railH, 0);
        g.add(r);
      }
      for (const sz of [-1, 1]) {
        const r = box(L, 0.07, 0.07);
        r.position.set(0, railH, sz * rect.halfWid);
        g.add(r);
      }
      // small seat platform
      const seat = box(L * 0.7, 0.07, W * 0.55);
      seat.position.set(0, 0.45, 0);
      g.add(seat);
      for (const sx of [-1, 1]) {
        const leg = post(sx * rect.halfLen * 0.55, 0, 0.45, 0.04);
        leg.position.z = rect.halfWid * 0.2;
        g.add(leg);
      }
      // blue tarp angled like an awning on one long side (muted, weathered)
      const awn = fabricPlane(L * 0.7, W * 0.6, 0x3f6f96);
      awn.position.set(0, H - 0.25, rect.halfWid + W * 0.32);
      awn.rotation.x = -Math.PI / 2.6;
      g.add(awn);
    } else {
      // smaller simple frame: 4 posts + crossbeam
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
