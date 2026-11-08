#!/usr/bin/env python3
"""Render a deterministic bird-flight clip from the running dev server.

Frames are pinned via flight seek() (absolute, reproducible) with a fixed
page seed, then muxed to H.264 with the imageio-ffmpeg static build (the
system ffmpeg on this machine is ffmpeg-free: no libx264, and its openh264
Baseline@3.1 output is rejected by VLC — see README).

Requires: playwright chromium (`playwright install chromium`) and the
`imageio-ffmpeg` package inside the same interpreter.

Usage:
  python tools/render_flight_video.py --url http://127.0.0.1:5199 \
      --seconds 2 --fps 30 --out birdflight-720p.mp4 \
      [--width 1280 --height 720 --day 190 --seed 42 --t0 0]
"""
import argparse
import os
import shutil
import tempfile

from playwright.sync_api import sync_playwright

DURATION_S_FLIGHT = 36.0  # flight.ts CONFIG.FLIGHT.DURATION_S


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--url", default="http://127.0.0.1:5199")
    ap.add_argument("--seconds", type=float, default=2.0, help="clip length in seconds")
    ap.add_argument("--fps", type=int, default=30)
    ap.add_argument("--width", type=int, default=1280)
    ap.add_argument("--height", type=int, default=720)
    ap.add_argument("--day", type=int, default=190, help="day of year (season)")
    ap.add_argument("--seed", type=int, default=42, help="page seed (?seed= param)")
    ap.add_argument("--t0", type=float, default=0.0, help="flight start offset in seconds")
    ap.add_argument("--out", default="birdflight.mp4")
    args = ap.parse_args()

    n = round(args.seconds * args.fps)
    frames = tempfile.mkdtemp(prefix="flightframes-")
    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch(args=["--no-sandbox", "--enable-unsafe-swiftshader"])
            page = browser.new_page(viewport={"width": args.width, "height": args.height},
                                    device_scale_factor=1)
            page.goto(f"{args.url}/?seed={args.seed}", wait_until="load")
            # the season panel becomes visible only after tree generation
            page.wait_for_selector("#season", state="visible", timeout=300_000)
            page.eval_on_selector("#dayofyear",
                                  f"el => {{ el.value = '{args.day}';"
                                  " el.dispatchEvent(new Event('input', {bubbles: true})); }")
            page.wait_for_timeout(1000)
            for i in range(n):
                t01 = (args.t0 + i / args.fps) / DURATION_S_FLIGHT
                page.evaluate(f"window.__scene3.flight.seek({t01:.8f})")
                page.wait_for_timeout(60)  # let the render loop paint
                page.screenshot(path=f"{frames}/frame_{i:05d}.png",
                                clip={"x": 0, "y": 0, "width": args.width, "height": args.height})
            browser.close()

        import imageio_ffmpeg
        ff = imageio_ffmpeg.get_ffmpeg_exe()
        cmd = (f'"{ff}" -y -framerate {args.fps} -i "{frames}"/frame_%05d.png '
               f"-c:v libx264 -profile:v high -level 4.0 -preset medium -crf 18 "
               f"-r {args.fps} -fps_mode cfr -pix_fmt yuv420p -an "
               f'-movflags +faststart "{args.out}"')
        os.system(cmd)
        print(f"wrote {args.out} ({n} frames @ {args.fps} fps)")
    finally:
        shutil.rmtree(frames, ignore_errors=True)


if __name__ == "__main__":
    main()
