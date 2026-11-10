import sys, numpy as np
import os
os.makedirs("/home/agent/projects/wiese/tmp/sparks", exist_ok=True)
sys.path.insert(0, '/home/agent/projects/wiese/ideas/perlin')
from sparks import make_beam_image
from PIL import Image

fps = 30
frames = [make_beam_image(400, 800, t=i/fps, freq=5.0, amp=60.0,
                          beam_radius=3.0, octaves=4, time_speed=0.7)
          for i in range(6)]  # t = 0..5/30 -> 200ms span

print("frame  centroid_x  x-extent      peak")
allmin, allmax = 999, -999
for i, f in enumerate(frames):
    ys, xs = np.nonzero(f > 0.15)
    allmin, allmax = min(allmin, xs.min()), max(allmax, xs.max())
    print(f"  {i}     {xs.mean():6.1f}   [{xs.min():3d},{xs.max():3d}]   {f.max():.2f}")
print(f"common corridor over all 6 frames: x in [{allmin},{allmax}] (center=200, width={allmax-allmin}px)")
for i in range(5):
    c = np.corrcoef(frames[i].ravel(), frames[i+1].ravel())[0, 1]
    print(f"corr(frame{i}, frame{i+1}) = {c:.3f}")

strip = (np.hstack(frames) * 255).astype(np.uint8)
Image.fromarray(strip).save('/home/agent/projects/wiese/tmp/sparks/spark_strip_200ms.png')
print("saved /home/agent/projects/wiese/tmp/sparks/spark_strip_200ms.png")
