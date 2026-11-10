"""Live-scene test: 200ms multi-pulse Perlin bolt in the orchard scene (frozen phases + slow-mo pass)."""
import time, os
from playwright.sync_api import sync_playwright
from PIL import Image, ImageDraw

OUT = '/home/agent/projects/wiese/tmp/sparks'
os.makedirs(OUT, exist_ok=True)

JS = r"""(async () => {
  const threeUrl = performance.getEntriesByType('resource').map(r => r.name)
    .find(u => /three/i.test(u) && /\.js/.test(u));
  const T = await import(threeUrl);
  if (!T || !T.Vector3) throw 'three import failed: ' + threeUrl;
  const sceneRoot = window.__scene3.terrain.mesh.parent;

  const perm = new Uint8Array(512), p = new Uint8Array(256);
  let seed = 1337;
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) { const j = (rnd() * (i + 1)) | 0; const tmp = p[i]; p[i] = p[j]; p[j] = tmp; }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const fade = t => t*t*t*(t*(t*6-15)+10);
  const lerp = (a,b,t) => a + t*(b-a);
  const grad = (h,x,y) => { switch (h & 7) { case 0: return x+y; case 1: return -x+y;
    case 2: return x-y; case 3: return -x-y; case 4: return x; case 5: return -x; case 6: return y; default: return -y; } };
  function perlin2(x, y) {
    const X = Math.floor(x) & 255, Y = Math.floor(y) & 255;
    const xf = x - Math.floor(x), yf = y - Math.floor(y);
    const u = fade(xf), v = fade(yf);
    const aa = perm[perm[X]+Y], ab = perm[perm[X]+Y+1], ba = perm[perm[X+1]+Y], bb = perm[perm[X+1]+Y+1];
    const x1 = lerp(grad(aa,xf,yf), grad(ba,xf-1,yf), u);
    const x2 = lerp(grad(ab,xf,yf-1), grad(bb,xf-1,yf-1), u);
    return lerp(x1, x2, v);
  }
  function pnoise2(x, y, oct) {
    let v = 0, amp = 1, f = 1, norm = 0;
    for (let o = 0; o < oct; o++) { v += perlin2(x*f, y*f) * amp; norm += amp; amp *= 0.5; f *= 2; }
    return v / norm;
  }

  const strikeX = -60, strikeZ = -95, groundY = 113.5, topY = 300;
  const N = 90, amp = 55, freq = 2.2, oct = 4, t0 = 7.3;
  const PULSES = [[40,1.0,28],[95,0.75,26],[148,0.45,24]];

  function channelPoints(t) {
    const pts = [];
    for (let i = 0; i <= N; i++) {
      const s = i / N;
      const n = pnoise2(freq*s, 0.7*t, oct) / 1.05;
      const d = amp * n * Math.sin(Math.PI * s);
      pts.push([strikeX + d*0.8, topY + (groundY-topY)*s, strikeZ + d*0.45]);
    }
    return pts;
  }

  const makeLine = (color, opacity) => new T.Line(
    new T.BufferGeometry().setFromPoints(channelPoints(t0).map(a => new T.Vector3(a[0], a[1], a[2]))),
    new T.LineBasicMaterial({ color, transparent: true, opacity, blending: T.AdditiveBlending, depthWrite: false }));
  const core = makeLine(0xffffff, 1.0), mid = makeLine(0xbfd8ff, 0.45), wide = makeLine(0x88aaff, 0.18);

  const cv = document.createElement('canvas'); cv.width = cv.height = 128;
  const cx = cv.getContext('2d');
  const gr = cx.createRadialGradient(64,64,2,64,64,64);
  gr.addColorStop(0,'rgba(255,255,255,1)'); gr.addColorStop(0.3,'rgba(200,220,255,0.5)'); gr.addColorStop(1,'rgba(160,190,255,0)');
  cx.fillStyle = gr; cx.fillRect(0,0,128,128);
  const glow = new T.Sprite(new T.SpriteMaterial({ map: new T.CanvasTexture(cv), transparent: true,
    blending: T.AdditiveBlending, depthWrite: false }));
  glow.position.set(strikeX, groundY + 2, strikeZ); glow.scale.set(18,18,1);

  const flash = new T.PointLight(0xcfe0ff, 0, 0, 1);
  flash.position.set(strikeX, groundY + 20, strikeZ);
  const hemi = sceneRoot.children.find(o => o.isHemisphereLight);
  const hemiBase = hemi ? hemi.intensity : 0;

  const bolt = new T.Group();
  bolt.add(wide, mid, core, glow, flash);
  sceneRoot.add(bolt);

  function env(ms) {
    if (ms <= 0) return 0;
    if (ms < 40) return 0.25 * (ms / 40);
    let v = 0;
    for (const [tp, A, tau] of PULSES) if (ms >= tp) v += A * Math.exp(-(ms - tp) / tau);
    return Math.min(1, v);
  }

  function update(ms) {
    const I = env(ms);
    const snaps = PULSES.filter(pl => ms >= pl[0]).length;
    const t = t0 + 0.7 * (ms / 1000) + 0.05 * snaps;
    const pts = channelPoints(t);
    const count = Math.max(2, Math.ceil((N + 1) * Math.min(1, ms / 40)));
    for (const line of [core, mid, wide]) {
      const pos = line.geometry.attributes.position;
      for (let i = 0; i <= N; i++) pos.setXYZ(i, pts[i][0], pts[i][1], pts[i][2]);
      pos.needsUpdate = true;
      line.geometry.setDrawRange(0, count);
    }
    core.material.opacity = I;
    mid.material.opacity = 0.45 * I;
    wide.material.opacity = 0.18 * I;
    glow.material.opacity = Math.min(1, 1.2 * I);
    const gs = 18 * (0.6 + 0.8 * I);
    glow.scale.set(gs, gs, 1);
    flash.intensity = 50 * I;
    if (hemi) hemi.intensity = hemiBase * (1 + 0.9 * I);
    bolt.visible = I > 0.01;
    window.__phaseNow = ms;
    return { I: +I.toFixed(3), t: +t.toFixed(3), count, hemi: hemi ? +(hemiBase*(1+0.9*I)).toFixed(2) : null };
  }

  window.__sparkUpdate = update;
  window.__sparkLive = (slow) => {
    const start = performance.now();
    const step = () => {
      const ms = (performance.now() - start) / slow;
      update(Math.min(200, ms));
      if (ms < 200) requestAnimationFrame(step); else { update(0); bolt.visible = false; }
    };
    requestAnimationFrame(step);
  };
  update(0);
  return 'bolt added; rig=' + (typeof window.__rig) + '; hemiBase=' + hemiBase.toFixed(2);
})()"""

with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox", "--use-gl=swiftshader"])
    pg = b.new_page(viewport={"width": 1280, "height": 720})
    pg.goto("http://127.0.0.1:5199/?seed=1", wait_until="domcontentloaded", timeout=30000)
    dl = time.time() + 240
    ready = False
    while time.time() < dl:
        try:
            if "\u00b7" in pg.evaluate("document.getElementById('seasonvalue')?.textContent ?? ''"):
                ready = True; break
        except Exception:
            pass
        time.sleep(3)
    print("scene ready:", ready)
    pg.evaluate("""(() => { const s = document.getElementById('dayofyear');
      if (s) { s.value = 100; s.dispatchEvent(new Event('input', {bubbles: true})); }
      window.__scene3.sky.setCondition('gewitter'); })()""")
    time.sleep(2)
    print("inject:", pg.evaluate(JS))
    print("camera:", pg.evaluate("""(() => { if (!window.__rig) return 'no rig';
      const r = window.__rig; r.camera.position.set(5, 132, 85);
      r.controls.target.set(-40, 135, -60); r.controls.update(); return 'set'; })()"""))
    time.sleep(1.0)

    phases = [20, 45, 100, 150, 195]
    states = {}
    for ms in phases:
        states[ms] = pg.evaluate(f"window.__sparkUpdate({ms})")
        pg.screenshot(path=f"{OUT}/phase_{ms:03d}.png")
        print(f"t={ms:3d}ms -> {states[ms]}")

    # slow-mo live pass: 200ms stretched to 4s, opportunistic captures
    pg.evaluate("window.__sparkLive(20)")
    t_start = time.time()
    live = []
    for target in [0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5]:
        wait = target - (time.time() - t_start)
        if wait > 0: time.sleep(wait)
        phase = pg.evaluate("window.__phaseNow ?? -1")
        path = f"{OUT}/live_{target:.1f}.png"
        pg.screenshot(path=path)
        live.append((target, phase, path))
        print(f"live capture @real {target}s -> anim ~{phase}ms")
    b.close()

# montage 1: frozen phases
def montage(items, out, label):
    imgs = [(Image.open(path), txt) for _, txt, path in items]
    W = 480
    panels = [im.resize((W, int(im.height * W / im.width))) for im, _ in imgs]
    m = Image.new("RGB", (W * len(panels), panels[0].height + 26), "black")
    d = ImageDraw.Draw(m)
    for i, (pn, txt) in enumerate(zip(panels, [t for _, t in imgs])):
        m.paste(pn, (i * W, 26))
        d.text((i * W + 8, 6), txt, fill="white", stroke_width=2, stroke_fill="black")
    m.save(out)
    print("saved", out, m.size)

montage([(ms, f"t={ms}ms  I={states[ms]['I']}") for ms in phases],
        f"{OUT}/strike_phases.png", "phases")

# montage 2: live captures that landed inside the strike
inside = [(tgt, f"live ~{ph}ms", path) for tgt, ph, path in live if 5 < ph < 195]
if inside:
    step = max(1, len(inside) // 4)
    montage(inside[::step][:4], f"{OUT}/live_anim.png", "live")
else:
    print("no live captures inside the strike window")
