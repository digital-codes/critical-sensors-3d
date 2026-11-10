"""www dashboard embed: day-store gate check + frozen-peak strike shot."""
import base64, io, time
from playwright.sync_api import sync_playwright
from PIL import Image

OUT = '/home/agent/projects/wiese/tmp/sparks'  # run outputs stay out of the repo (gitignored)

with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox", "--use-gl=swiftshader"])
    pg = b.new_page(viewport={"width": 1440, "height": 900})
    pg.goto("http://127.0.0.1:5212/", wait_until="domcontentloaded", timeout=60000)
    dl = time.time() + 300
    ready = False
    while time.time() < dl:
        try:
            if "\u00b7" in pg.evaluate("document.getElementById('seasonvalue')?.textContent ?? ''"):
                ready = True; break
        except Exception: pass
        time.sleep(2)
    print("embed scene ready:", ready)
    # day-store path: header slider #zeit -> store -> OrchardPane -> scene setDay
    pg.evaluate("""(() => { const s = document.getElementById('zeit');
      s.value = '100'; s.dispatchEvent(new Event('input', {bubbles: true})); })()""")
    time.sleep(1)
    # gate check: synchronous fast-forward, the scheduler must open on the
    # store-set day (asserted: strikes fire; a non-strike day would stay silent)
    res = pg.evaluate("""(() => {
      const sp = window.__scene3.sparks; let hits = 0;
      for (let i = 0; i < 90; i++) { sp.update(1/30); if (sp.active) hits++; }
      return {activeHits: hits};
    })()""")
    print("gate via #zeit ->", res)
    # frozen-peak shot: step to 40 ms, then stub update so the throttled
    # render loop cannot finish the 200 ms strike during the ~5 s capture
    pg.evaluate("""(() => {
      const r = window.__rig; r.camera.position.set(5, 132, 85);
      r.controls.target.set(-40, 135, -60); r.controls.update();
      const sp = window.__scene3.sparks;
      sp.trigger(7, [-60, -95]); sp.update(0.04); sp.update = () => {}; })()""")
    r = pg.context.new_cdp_session(pg).send("Page.captureScreenshot", {"format": "jpeg", "quality": 85})
    Image.open(io.BytesIO(base64.b64decode(r["data"]))).save(f"{OUT}/www_embed_strike.png")
    print("shot saved")
    b.close()
