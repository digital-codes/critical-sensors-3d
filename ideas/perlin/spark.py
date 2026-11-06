import numpy as np
import matplotlib.pyplot as plt
from noise import pnoise1  # Perlin noise

# -----------------------------------
# 1D Perlin noise + sine envelope
# -----------------------------------
def make_displacement(height, freq=3.0, amp=40.0, octaves=3):
    """
    Returns a 1D array 'disp[y]' giving lateral displacement (in pixels)
    for each scanline y = 0..height-1.

    The displacement is:
        disp(s) = amp * Perlin(s) * sin(pi * s)
    which is zero at s=0 and s=1 -> top + bottom fixed.
    """
    ys = np.linspace(0.0, 1.0, height)
    base_noise = np.array([
        pnoise1(freq * s, octaves=octaves)
        for s in ys
    ])

    # Normalise to roughly [-1,1]
    base_noise /= np.max(np.abs(base_noise) + 1e-6)

    envelope = np.sin(np.pi * ys)  # zero at both ends
    disp = amp * base_noise * envelope
    return disp


# -----------------------------------
# Draw a laser/spark beam into an image
# -----------------------------------
def make_beam_image(width=400, height=800,
                    freq=3.0, amp=40.0,
                    beam_radius=4.0):
    """
    Create a grayscale image (H x W) with a noisy 'laser' beam
    whose top and bottom are fixed.
    """
    # Displacement along the beam
    disp = make_displacement(height, freq=freq, amp=amp)

    # Start with a black image
    img = np.zeros((height, width), dtype=np.float32)

    center_x = width // 2

    # Draw beam row by row
    for y in range(height):
        cx = center_x + disp[y]

        # Gaussian profile around cx to make a soft beam
        for x in range(width):
            dx = x - cx
            # Gaussian falloff
            val = np.exp(-(dx ** 2) / (2 * beam_radius ** 2))
            img[y, x] = max(img[y, x], val)

    # Normalize to [0,1]
    img /= img.max() + 1e-6
    return img


if __name__ == "__main__":
    img = make_beam_image(
        width=400,
        height=800,
        freq=5.0,     # more or fewer wiggles
        amp=60.0,     # how far the beam bends
        beam_radius=3.0
    )

    plt.imshow(img, cmap="gray", origin="upper")
    plt.axis("off")
    plt.title("Perlin-noise laser with fixed endpoints")
    plt.show()
