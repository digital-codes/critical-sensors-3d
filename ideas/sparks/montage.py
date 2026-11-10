from PIL import Image, ImageDraw
import os
OUT = '/home/agent/projects/wiese/tmp/sparks'
os.makedirs(OUT, exist_ok=True)
def grid(files, out, cols=3):
    items = [(f, Image.open(f)) for f in files if os.path.exists(f)]
    W = 480
    panels = [(f, im.resize((W, int(im.height*W/im.width)))) for f, im in items]
    ph = panels[0][1].height + 26
    rows = (len(panels) + cols - 1) // cols
    m = Image.new("RGB", (W*cols, ph*rows), "black")
    d = ImageDraw.Draw(m)
    for i, (f, pn) in enumerate(panels):
        x, y = (i % cols)*W, (i // cols)*ph
        m.paste(pn, (x, y+26))
        d.text((x+8, y+6), os.path.basename(f), fill="white", stroke_width=2, stroke_fill="black")
    m.save(out); print("saved", out, m.size)

grid([f"{OUT}/bolt_test.png", f"{OUT}/bolt_test2.png", f"{OUT}/bolt_test3.png",
      f"{OUT}/flash_off.png", f"{OUT}/flash_on.png"], f"{OUT}/grid_lastnight.png")
grid([f"{OUT}/phase_{m:03d}.png" for m in [20,45,100,150,195]], f"{OUT}/grid_phases.png")
grid([f"{OUT}/live_0.5.png", f"{OUT}/live_1.0.png", f"{OUT}/live_1.5.png", f"{OUT}/live_2.0.png"],
     f"{OUT}/grid_live.png")
