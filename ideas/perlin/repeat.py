import numpy as np
import matplotlib.pyplot as plt
from noise import pnoise2

def tileable_perlin_2d(width=256, height=256,
                       period=8.0,
                       octaves=4,
                       persistence=0.5,
                       lacunarity=2.0,
                       base=0):
    """
    Generate a seamless 2D Perlin noise tile of size (height, width).
    - 'period' is the spatial period in Perlin space; we map the image
      into [0, period) and use repeatx=repeaty=period for seamless tiling.
    """
    img = np.zeros((height, width), dtype=np.float32)

    for y in range(height):
        for x in range(width):
            # Map pixel (x,y) -> (u,v) in [0, period)
            u = (x / width) * period
            v = (y / height) * period

            n = pnoise2(
                u, v,
                octaves=octaves,
                persistence=persistence,
                lacunarity=lacunarity,
                repeatx=int(period),
                repeaty=int(period),
                base=base
            )
            img[y, x] = n

    # Normalize from [-1,1] to [0,1]
    img = (img + 1.0) * 0.5
    return img


if __name__ == "__main__":
    tex = tileable_perlin_2d(width=256, height=256, period=8.0)

    # Show single tile
    plt.figure(figsize=(4, 4))
    plt.imshow(tex, cmap="gray", origin="upper")
    plt.axis("off")
    plt.title("Single tile")
    plt.show()

    # Show how it tiles (3x3)
    tiled = np.tile(tex, (3, 6))
    plt.figure(figsize=(12, 6))
    plt.imshow(tiled, cmap="gray", origin="upper")
    plt.axis("off")
    plt.title("Tiled 3×6 (should look seamless)")
    plt.show()

