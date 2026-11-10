"""Day-gate + envelope + restore verification for orchard-sparks (task 2.2/2.3).

Runs against the standalone orchard dev server on 127.0.0.1:5199.
Technique per wiese skill: synchronous update loops with fixed dt (headless
rAF throttles to ~1 tick / 2.4 s), raw CDP captureScreenshot for frames.
Outputs PNGs to wiese/tmp/sparks/.
"""
import base64
import io
import json
import os
import time

from PIL import Image
from playwright.sync_api import sync_playwright

OUT = '/home/agent/projects/wiese/tmp/sparks'  # run outputs stay out of the repo (gitignored)
os.makedirs(OUT, exist_ok=True)
URL = "http://127.0.0.1:5199/?seed=1"

SET_DAY = """(day) => {
  const s = document.getElementById('dayofyear');
  s.value = String(day);
  s.dispatchEvent(new Event('input', {bubbles: true}));
}"""

# synchronous fast-forward: real slider day already set; drive sparks.update
# with fixed dt and report how the strike state evolved
SYNC_RUN = """(args) => {
  const sp = window.__scene3.sparks;
  if (!sp) return {error: 'no __scene3.sparks'};
  const {ticks, dtMs, tag} = args;
  let activeTicks = 0, firstActiveTick = -1, peakI = 0, peakMs = 0, ms = 0;
  // find the bolt group: contains 3 additive lines + a PointLight 0xcfe0ff
  const root = window.__scene3.terrain.mesh.parent;
  let bolt = null;
  root.traverse(o => {
    if (o.isPointLight && o.color && o.color.getHex() === 0xcfe0ff) bolt = o.parent;
  });
  const snap = () => {
    if (!bolt) return null;
    const core = bolt.children.find(o => o.isLine);
    return core ? +core.material.opacity.toFixed(3) : null;
  };
  const states = [];
  for (let i = 0; i < ticks; i++) {
    sp.update(dtMs / 1000);
    if (sp.active) {
      activeTicks++;
      if (firstActiveTick < 0) firstActiveTick = i;
      const op = snap();
      if (op !== null && op > peakI) { peakI = op; peakMs = Math.round(i * dtMs); }
      if (states.length < 10 && i % Math.ceil(ticks / 10) === 0) states.push(snap());
    }
  }
  return {tag, activeTicks, firstActiveTick, peakI, peakMs, samples: states,
          hemiAfter: (() => { const h = root.children.find(o => o.isHemisphereLight);
                             return h ? +h.intensity.toFixed(4) : null; })()};
}"""

TRIGGER_TWICE = """(pos) => {
  const sp = window.__scene3.sparks;
  const read = () => {
    const root = window.__scene3.terrain.mesh.parent;
    let core = null;
    root.traverse(o => { if (o.isPointLight && o.color.getHex() === 0xcfe0ff) {
      const l = o.parent.children.find(c => c.isLine); if (l) core = l; } });
    if (!core) return null;
    return Array.from(core.geometry.attributes.position.array).map(v => +v.toFixed(4));
  };
  sp.trigger(7, pos);
  sp.update(0.001);
  const a = read();
  sp.update(0.25);  // run past the strike
  sp.trigger(7, pos);
  sp.update(0.001);
  const b = read();
  return {same: JSON.stringify(a) === JSON.stringify(b), len: a ? a.length / 3 : 0};
}"""

RESTORE_CHECK = """(pos) => {
  const root = window.__scene3.terrain.mesh.parent;
  const hemi = root.children.find(o => o.isHemisphereLight);
  const before = hemi.intensity;
  const sp = window.__scene3.sparks;
  sp.trigger(3, pos);
  let peak = 0;
  for (let i = 0; i < 30; i++) { sp.update(1 / 60); peak = Math.max(peak, hemi.intensity); }
  for (let i = 0; i < 30; i++) sp.update(1 / 60);  // past DURATION_MS
  const after = hemi.intensity;
  return {before: +before.toFixed(4), peak: +peak.toFixed(4), after: +after.toFixed(4),
          restored: Math.abs(before - after) < 1e-6};
}"""


def main() -> None:
    results = {}
    with sync_playwright() as p:
        b = p.chromium.launch(args=["--no-sandbox", "--use-gl=swiftshader"])
        pg = b.new_page(viewport={"width": 1280, "height": 720})
        pg.goto(URL, wait_until="domcontentloaded", timeout=30000)
        dl = time.time() + 240
        ready = False
        while time.time() < dl:
            try:
                if "\u00b7" in pg.evaluate("document.getElementById('seasonvalue')?.textContent ?? ''"):
                    ready = True
                    break
            except Exception:
                pass
            time.sleep(2)
        print("scene ready:", ready)
        print("sparks hook:", pg.evaluate(
            "(() => { const s = window.__scene3?.sparks; return s ? Object.keys(s) : null; })()"))
        cdp = pg.context.new_cdp_session(pg)

        def shot(name: str) -> None:
            r = cdp.send("Page.captureScreenshot", {"format": "jpeg", "quality": 85})
            Image.open(io.BytesIO(base64.b64decode(r["data"]))).save(f"{OUT}/{name}.png")
            print("shot:", name)

        def day(d: int) -> None:
            pg.evaluate(SET_DAY, d)

        # camera: the validated south vantage
        pg.evaluate("""(() => { const r = window.__rig; r.camera.position.set(5, 132, 85);
           r.controls.target.set(-40, 135, -60); r.controls.update(); })()""")

        # A: strike day 100 (April) — scheduled strike must fire; fast-forward sim time
        day(100)
        time.sleep(0.5)
        res = pg.evaluate(SYNC_RUN, {"ticks": 90, "dtMs": 33.3, "tag": "day100"})
        results["day100_scheduled"] = res
        print("A day100:", json.dumps(res))

        # B: non-strike April day 95
        day(95)
        time.sleep(0.3)
        res = pg.evaluate(SYNC_RUN, {"ticks": 90, "dtMs": 33.3, "tag": "day95"})
        results["day95_nostrike"] = res
        print("B day95:", json.dumps(res))

        # C: June day 160 (klar month)
        day(160)
        time.sleep(0.3)
        res = pg.evaluate(SYNC_RUN, {"ticks": 90, "dtMs": 33.3, "tag": "day160"})
        results["day160_nostrike"] = res
        print("C day160:", json.dumps(res))

        # D: strike day + manual klar -> kill switch
        day(100)
        time.sleep(0.3)
        pg.evaluate("window.__scene3.sky.setCondition('klar')")
        time.sleep(0.3)
        res = pg.evaluate(SYNC_RUN, {"ticks": 90, "dtMs": 33.3, "tag": "day100-klar"})
        results["day100_klar_nostrike"] = res
        print("D day100+klar:", json.dumps(res))

        # E: restore check (gewitter back on)
        day(100)
        time.sleep(0.5)
        pg.evaluate("window.__scene3.sky.setCondition('gewitter')")
        time.sleep(0.3)
        res = pg.evaluate(RESTORE_CHECK, [-60, -95])
        results["restore"] = res
        print("E restore:", json.dumps(res))

        # F: seeded reproducibility
        res = pg.evaluate(TRIGGER_TWICE, [-60, -95])
        results["seeded_reproducible"] = res
        print("F reproducible:", json.dumps(res))

        # screenshots: pre-strike vs peak via frozen trigger states
        day(100)
        time.sleep(0.5)
        shot("verify_prestrike")
        pg.evaluate("""(() => { const sp = window.__scene3.sparks;
           sp.trigger(7, [-60, -95]); sp.update(0.04); })()""")
        shot("verify_peak")
        b.close()

    with open(f"{OUT}/verify_results.json", "w") as f:
        json.dump(results, f, indent=1)
    print("results ->", f"{OUT}/verify_results.json")


if __name__ == "__main__":
    main()
