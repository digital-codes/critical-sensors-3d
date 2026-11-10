"""Live-render proof: step the 200ms strike, raw CDP capture per phase (exact pairing)."""
import time, base64, io, os
from playwright.sync_api import sync_playwright
from PIL import Image, ImageDraw

OUT = '/home/agent/projects/wiese/tmp/sparks'
JS = open('/home/agent/projects/wiese/ideas/sparks/strike_test.py').read().split('JS = r"""')[1].split('"""\n\nwith sync_playwright')[0]
JS = JS.replace('if (ms < 40) return 0.25 * (ms / 40);', 'if (ms < 40) return 0.6 * (ms / 40);')
JS = JS.replace('if (hemi) hemi.intensity = hemiBase * (1 + 0.9 * I);',
                'if (hemi) hemi.intensity = hemiBase * (1 + 0.4 * I);')
JS = JS.replace('flash.intensity = 50 * I;', 'flash.intensity = 35 * I;')
JS = JS.replace("hemi: hemi ? +(hemiBase*(1+0.9*I)).toFixed(2) : null",
                "hemi: hemi ? +(hemiBase*(1+0.4*I)).toFixed(2) : null")

with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox", "--use-gl=swiftshader"])
    pg = b.new_page(viewport={"width": 1280, "height": 720})
    pg.goto("http://127.0.0.1:5199/?seed=1", wait_until="domcontentloaded", timeout=30000)
    dl = time.time() + 180
    ready = False
    while time.time() < dl:
        try:
            if "\u00b7" in pg.evaluate("document.getElementById('seasonvalue')?.textContent ?? ''"):
                ready = True; break
        except Exception: pass
        time.sleep(2)
    print("scene ready:", ready, f"({time.time()-dl+180:.0f}s)")
    pg.evaluate("""(() => { const s = document.getElementById('dayofyear');
      if (s) { s.value = 100; s.dispatchEvent(new Event('input', {bubbles: true})); }
      window.__scene3.sky.setCondition('gewitter'); })()""")
    time.sleep(2)
    print("inject:", pg.evaluate(JS))
    print("camera:", pg.evaluate("""(() => { if (!window.__rig) return 'no rig';
      const r = window.__rig; r.camera.position.set(5, 132, 85);
      r.controls.target.set(-40, 135, -60); r.controls.update(); return 'set'; })()"""))
    time.sleep(1.0)
    cdp = pg.context.new_cdp_session(pg)

    steps = [10, 40, 70, 100, 130, 160, 190]
    got = []
    for ms in steps:
        st = pg.evaluate(f"window.__sparkUpdate({ms})")
        t0 = time.time()
        r = cdp.send("Page.captureScreenshot", {"format": "jpeg", "quality": 85})
        dt = time.time() - t0
        img = Image.open(io.BytesIO(base64.b64decode(r["data"])))
        img.save(f"{OUT}/live_step_{ms:03d}.png")
        got.append((ms, st['I']))
        print(f"ms={ms:3d} I={st['I']:.2f} captured in {dt:.2f}s")
    b.close()

W = 440
panels = [(ms, Image.open(f"{OUT}/live_step_{ms:03d}.png")) for ms, _ in got]
ph = panels[0][1].height * W // panels[0][1].width + 26
cols, rows = 4, 2
m = Image.new("RGB", (W*cols, ph*rows), "black")
d = ImageDraw.Draw(m)
for i, (ms, im) in enumerate(panels):
    pn = im.resize((W, im.height * W // im.width))
    x, y = (i % cols)*W, (i // cols)*ph
    m.paste(pn, (x, y+26))
    d.text((x+8, y+6), f"t={ms}ms  I={dict(got)[ms]:.2f}", fill="white", stroke_width=2, stroke_fill="black")
m.save(f"{OUT}/grid_liveanim.png")
print("saved", f"{OUT}/grid_liveanim.png", m.size, f"({len(got)}/7 frames)")
