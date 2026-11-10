"""Frozen-peak screenshots: stub sparks.update after stepping to peak, so the
live render loop (throttled in headless) can't finish the strike mid-capture."""
import base64, io, time
from playwright.sync_api import sync_playwright
from PIL import Image

OUT = '/home/agent/projects/wiese/tmp/sparks'
FREEZE = """(() => {
  const sp = window.__scene3.sparks;
  sp.trigger(7, [-60, -95]);
  sp.__realUpdate = sp.update;
  sp.update(0.04);                       // step to envelope peak (40 ms)
  sp.update = () => {};                  // freeze: render loop keeps drawing
  return window.__scene3.sparks.active;
})()"""

def shoot(pg, cdp, name):
    r = cdp.send("Page.captureScreenshot", {"format": "jpeg", "quality": 85})
    Image.open(io.BytesIO(base64.b64decode(r["data"]))).save(f"{OUT}/{name}.png")
    print("shot:", name)

def ready_wait(pg, deadline_s):
    dl = time.time() + deadline_s
    while time.time() < dl:
        try:
            if "\u00b7" in pg.evaluate("document.getElementById('seasonvalue')?.textContent ?? ''"):
                return True
        except Exception:
            pass
        time.sleep(2)
    return False

with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox", "--use-gl=swiftshader"])

    # standalone orchard (5199)
    pg = b.new_page(viewport={"width": 1280, "height": 720})
    pg.goto("http://127.0.0.1:5199/?seed=1", wait_until="domcontentloaded", timeout=30000)
    print("5199 ready:", ready_wait(pg, 240))
    pg.evaluate("""(() => {
      const s = document.getElementById('dayofyear');
      s.value = '100'; s.dispatchEvent(new Event('input', {bubbles: true}));
      const r = window.__rig; r.camera.position.set(5, 132, 85);
      r.controls.target.set(-40, 135, -60); r.controls.update(); })()""")
    time.sleep(1)
    print("frozen active:", pg.evaluate(FREEZE))
    shoot(pg, pg.context.new_cdp_session(pg), "verify_peak")
    pg.close()

    # www dashboard embed (5212)
    pg = b.new_page(viewport={"width": 1440, "height": 900})
    pg.goto("http://127.0.0.1:5212/", wait_until="domcontentloaded", timeout=60000)
    print("5212 ready:", ready_wait(pg, 300))
    pg.evaluate("""(() => { const s = document.getElementById('zeit');
      s.value = '100'; s.dispatchEvent(new Event('input', {bubbles: true})); })()""")
    time.sleep(1)
    print("frozen active:", pg.evaluate(FREEZE))
    shoot(pg, pg.context.new_cdp_session(pg), "www_embed_strike")
    pg.close()
    b.close()
