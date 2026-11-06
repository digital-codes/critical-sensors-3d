import numpy as np
import matplotlib.pyplot as plt
import matplotlib.animation as animation
from noise import pnoise2  # use 2D Perlin noise: (space, time)
from matplotlib.animation import FFMpegWriter

# see https://www.youtube.com/watch?v=JrLSfSh43oA

# -----------------------------------
# 1D Perlin noise + sine envelope, with time
# -----------------------------------
def make_displacement(height, t, freq=3.0, amp=40.0, octaves=3, time_speed=0.5):
    """
    Returns disp[y] for y=0..height-1 at time t.

    disp(s, t) = amp * Perlin(freq * s, time_speed * t) * sin(pi * s)

    - s = position along spark in [0,1]
    - Perlin(...) gives smooth noise in space and time
    - sin(pi * s) keeps displacement zero at top and bottom
    """
    ys = np.linspace(0.0, 1.0, height)

    base_noise = np.array(
        [pnoise2(freq * s, time_speed * t, octaves=octaves) for s in ys]
    )

    # Avoid division by zero in weird edge cases
    max_abs = np.max(np.abs(base_noise)) + 1e-6
    base_noise /= max_abs  # roughly in [-1, 1]

    envelope = np.sin(np.pi * ys)  # zero at s=0 and s=1
    disp = amp * base_noise * envelope
    return disp


# -----------------------------------
# Draw a single spark frame at time t
# -----------------------------------
def make_beam_image(
    width, height, t, freq=3.0, amp=40.0, beam_radius=3.0, octaves=3, time_speed=0.5
):
    """
    Create an image (H x W) of the spark at time t.
    """
    disp = make_displacement(
        height, t, freq=freq, amp=amp, octaves=octaves, time_speed=time_speed
    )

    img = np.zeros((height, width), dtype=np.float32)
    center_x = width // 2

    # Draw beam row by row
    for y in range(height):
        cx = center_x + disp[y]

        # Gaussian profile in x around cx
        xs = np.arange(width)
        dx = xs - cx
        line = np.exp(-(dx**2) / (2 * beam_radius**2))

        # Combine with existing image (max for glow stacking)
        img[y, :] = np.maximum(img[y, :], line)

    # Normalize to [0, 1]
    img /= img.max() + 1e-6
    return img


# -----------------------------------
# Animate the spark over time
# -----------------------------------
if __name__ == "__main__":
    width = 400
    height = 800

    n_frames = 100
    fps = 30
    update_interval = 250 / fps  # in milliseconds

    # Figure exactly matches image size
    dpi = 100
    fig, ax = plt.subplots(figsize=(width / dpi, height / dpi), dpi=dpi)

    # Remove all margins, axes, titles
    fig.subplots_adjust(0, 0, 1, 1)
    ax.axis("off")

    # Initial frame
    img0 = make_beam_image(width, height, t=0.0,
                        freq=5.0,
                        amp=60.0,
                        beam_radius=3.0,
                        octaves=4,
                        time_speed=0.7)

    im = ax.imshow(img0, cmap="gray", origin="upper", interpolation="nearest")

    plt.imsave("spark_frame.png", img0, cmap="gray")

    # ax.axis("off")
    # ax.set_title("Perlin spark with time variation")

    def update(frame_idx):
        # Map frame index to a time value
        t = frame_idx / fps  # 1 second per 30 frames; adjust if you want
        img = make_beam_image(
            width,
            height,
            t,
            freq=5.0,
            amp=60.0,
            beam_radius=3.0,
            octaves=4,
            time_speed=0.7,
        )
        im.set_data(img)
        return [im]

    ani = animation.FuncAnimation(
        fig,
        update,
        frames=n_frames,
        interval=update_interval,  # in ms between frames
        blit= True,
        repeat=False,
    )

    plt.show()

    # To save:
    writer = FFMpegWriter(
        fps=fps,
        codec="libvpx-vp9",
        extra_args=["-pix_fmt", "yuv420p"]
    )
    ani.save("spark.webm", writer=writer)

    # or (need ImageMagick installed):
    # ani.save("spark_perlin_time.gif", fps=fps)
