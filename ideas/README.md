# ideas — experiments and sparks

Prototype playground for the critical-sensors dashboard rebuild. Nothing here
is production code; things graduate into `orchard/` or the future dashboard
when they work.

## Status

### imgsmear — smear image transition (most developed)

Vue 3 + Vite demo of a "smear" image effect: a front column sweeps across the
image; pixels behind the front are replaced by the front column's colour on
their row (horizontal streaks). Two renderers with the same behaviour:

- **shader** (default): WebGL fragment shader, stateless, wrap = snap the
  front index back — the texture always holds the pristine image.
- **cpu**: ImageData loops (slower, kept as reference/fallback).

**New (this round): two-image transition mode.** Pass `img-b` to the
`ImgSmear` component and the smear becomes a wipe: image A ahead of the
front, a streak band (~1/8 of the width) mixing A's front-column colour into
B's, image B revealed behind it. Works in both renderers; falls back to the
single-image smear if `imgB` fails to load. Demo (`npm run dev`, button
`1 IMG` / `A→B`): two 2021 weekly orchard photos — summer (`photoA.jpg`) →
snow (`photoB.jpg`) — i.e. exactly the transition the new dashboard needs for
its weekly-photo feature.

Also fixed while here: the CPU tick no longer allocates two full ImageData
copies per tick (it reused the pristine buffer directly).

Next steps: cover-fit instead of stretch for mismatched aspect ratios;
easing on the front speed; make the band width a prop.

### perlin — noise experiments (Python, matplotlib)

- `sparks.py` — 1D Perlin-displaced "spark" line animation, rendered to MP4
  via FFMpegWriter (reference: youtube JrLSfSh43oA). Needs `pip install
  -r requirements.txt` (numpy, matplotlib, noise, ffmpeg binary).
- `repeat.py` — seamless (tileable) 2D Perlin tiles via `pnoise2` with
  `repeatx/repeaty` — useful for tiling displacement/texture maps.
- Not integrated anywhere yet. Candidate: tileable noise for the orchard's
  grass displacement or dashboard background texture.

### ez-tree — procedural tree library

Upstream three.js tree generator. Already vendored into `orchard/src/eztree/`
and in production use there (18 trees, 4 season variants each). This copy is
the upstream reference; kept for upstream tracking.
