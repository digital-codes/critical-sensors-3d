"""Runtime experiment: Perlin lightning bolt injected into the live orchard scene."""
import time, json, os
os.makedirs("/home/agent/projects/wiese/tmp/sparks", exist_ok=True)
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox", "--use-gl=swiftshader"])
    pg = b.new_page(viewport={"width": 1280, "height": 720})
    pg.goto("http://127.0.0.1:5199/?seed=1", wait_until="domcontentloaded", timeout=30000)
    dl = time.time() + 240
    while time.time() < dl:
        if "·" in pg.evaluate("document.getElementById('seasonvalue')?.textContent ?? ''"):
            break
        time.sleep(3)
    # gewitter condition + a day in summer for context
    pg.evaluate("""(() => {
      const s = document.getElementById('dayofyear');
      s.value = 100; s.dispatchEvent(new Event('input', {bubbles: true}));
      window.__scene3.sky.setCondition('gewitter');
    })()""")
    time.sleep(2)
    # cloud altitude reference
    print("clouds:", pg.evaluate("""(() => {
      const sky = window.__scene3.sky;
      const g = sky.group ?? sky.groupRef;
      return 'sky keys: ' + Object.keys(sky).join(',');
    })()"""))
    # inject the bolt
    pg.evaluate("""(async () => {
      const res = performance.getEntriesByType('resource').map(r => r.name);
      const threeUrl = res.find(u => /three/.test(u) && /\\.js/.test(u));
      const T = await import(threeUrl);
      const scene = window.__scene3Injected ? null : null;
      // find the scene: rig camera exists; get scene via renderer? Use __scene3.terrain.group.parent
      const grp = window.__scene3.terrain.mesh;
      const sceneRoot = grp.parent;
      window.__T = T;
      // --- JS improved Perlin (2D, with time as 2nd dim) ---
      const perm = new Uint8Array(512);
      const p = new Uint8Array(256);
      let seed = 1337;
      const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
      for (let i = 0; i < 256; i++) p[i] = i;
      for (let i = 255; i > 0; i--) { const j = (rnd() * (i + 1)) | 0; const t = p[i]; p[i] = p[j]; p[j] = t; }
      for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
      const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
      const lerp = (a, b, t) => a + t * (b - a);
      const grad = (h, x, y) => {
        switch (h & 7) {
          case 0: return  x + y; case 1: return -x + y; case 2: return x - y; case 3: return -x - y;
          case 4: return  x;     case 5: return -x;     case 6: return y;     default: return -y;
        }
      };
      function perlin2(x, y) {
        const X = Math.floor(x) & 255, Y = Math.floor(y) & 255;
        const xf = x - Math.floor(x), yf = y - Math.floor(y);
        const u = fade(xf), v = fade(yf);
        const aa = perm[perm[X] + Y], ab = perm[perm[X] + Y + 1];
        const ba = perm[perm[X + 1] + Y], bb = perm[perm[X + 1] + Y + 1];
        const x1 = lerp(grad(aa, xf, yf), grad(ba, xf - 1, yf), u);
        const x2 = lerp(grad(ab, xf, yf - 1), grad(bb, xf - 1, yf - 1), u);
        return lerp(x1, x2, v);
      }
      function pnoise2(x, y, octaves) {
        let v = 0, amp = 1, f = 1, norm = 0;
        for (let o = 0; o < octaves; o++) { v += perlin2(x * f, y * f) * amp; norm += amp; amp *= 0.5; f *= 2; }
        return v / norm;
      }
      // --- bolt polyline: sparks.py displacement, cloud -> ground ---
      const strikeX = -60, strikeZ = -95;      // behind tree line, west-ish
      const groundY = 113.5, topY = 300;       // bolt from high in the sky down
      const N = 90, amp = 55, freq = 2.2, oct = 4, t = 7.3;
      const pts = [];
      for (let i = 0; i <= N; i++) {
        const s = i / N;
        let n = pnoise2(freq * s, 0.7 * t, oct);
        n = n / 1.05;                          // rough normalize
        const env = Math.sin(Math.PI * s);
        const d = amp * n * env;
        const y = topY + (groundY - topY) * s;
        // direction perpendicular-ish: bolt leans in the x/z plane
        const px = strikeX + d * 0.8;
        const pz = strikeZ + d * 0.45;
        pts.push(new T.Vector3(px, y, pz));
      }
      const makeLine = (w, color, opacity) => {
        const g = new T.BufferGeometry().setFromPoints(pts);
        const m = new T.LineBasicMaterial({ color, linewidth: w, transparent: true,
          opacity, blending: T.AdditiveBlending, depthWrite: false });
        return new T.Line(g, m);
      };
      const bolt = new T.Group();
      bolt.add(makeLine(1, 0xffffff, 1.0));
      bolt.add(makeLine(1, 0xbfd8ff, 0.45));
      bolt.add(makeLine(1, 0x88aaff, 0.18));
      // strike glow sprite at the base
      const cv = document.createElement('canvas'); cv.width = cv.height = 128;
      const cx = cv.getContext('2d');
      const gr = cx.createRadialGradient(64, 64, 2, 64, 64, 64);
      gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(200,220,255,0.5)');
      gr.addColorStop(1, 'rgba(160,190,255,0)');
      cx.fillStyle = gr; cx.fillRect(0, 0, 128, 128);
      const tex = new T.CanvasTexture(cv);
      const sm = new T.SpriteMaterial({ map: tex, transparent: true, blending: T.AdditiveBlending, depthWrite: false });
      const glow = new T.Sprite(sm); glow.position.set(strikeX, groundY + 2, strikeZ); glow.scale.set(18, 18, 1);
      bolt.add(glow);
      sceneRoot.add(bolt);
      // flash: boost hemisphere+ambient while the bolt shows
      window.__sparkBolt = bolt;
      window.__sparkFlash = () => {
        const l = sceneRoot.children.filter(o => o.isHemisphereLight || o.isAmbientLight || o.isDirectionalLight);
        return l.map(o => ({type: o.type, i: +o.intensity.toFixed(2)}));
      };
      return 'bolt added, pts=' + N + ', scene children=' + sceneRoot.children.length;
    })()""")
    # camera: south vantage looking at the strike area
    pg.evaluate("""(() => {
      const r = window.__rig;
      r.camera.position.set(5, 132, 85);
      r.controls.target.set(-40, 135, -60);
      r.controls.update();
    })()""")
    time.sleep(1.2)
    pg.screenshot(path="/home/agent/projects/wiese/tmp/sparks/bolt_test.png")
    print("lights:", pg.evaluate("window.__sparkFlash ? window.__sparkFlash() : 'n/a'"))
    b.close()
