# ideas — experiments and sparks

Prototype playground for the critical-sensors dashboard rebuild. Nothing here
is production code; things graduate into `orchard/` or the future dashboard
when they work.

## Status

### imgsmear — smear image transition (git submodule)

Vue 3 + Vite demo of a "smear" image effect: a front column sweeps across the
image; pixels behind the front are replaced by the front column's colour on
their row (horizontal streaks). Two renderers with the same behaviour:

- **shader** (default): WebGL fragment shader, stateless, wrap = snap the
  front index back — the texture always holds the pristine image.
- **cpu**: ImageData loops (slower, kept as reference/fallback).

**Two-image transition mode:** pass `img-b` to the `ImgSmear` component and
the smear becomes a wipe: image A ahead of the front, a streak band (width
via the `band` prop) mixing A's front-column colour into B's, image B
revealed behind it. Works in both renderers; falls back to the single-image
smear if `imgB` fails to load. The component also emits `wrapped` after each
sweep (both renderers) — the hook a host uses to chain transitions (the
dashboard's StreakPanel consumes it in 'smear' mode; the default 'cycle'
mode advances on a timer). Component docs (props, `container` requirement,
emit, band/speed tuning): `imgsmear/README.md`; demo (`npm run dev` inside
`ideas/imgsmear/`, button `1 IMG` / `A→B`). Consumed by `www/` via the
`@imgsmear` alias.

Still open: cover-fit instead of stretch for mismatched aspect ratios
(`imgB` is stretched into A's geometry).

### perlin — noise experiments (Python, matplotlib)

- `sparks.py` — 1D Perlin-displaced "spark" line animation, rendered to MP4
  via FFMpegWriter (reference: youtube JrLSfSh43oA). Needs `pip install
  -r requirements.txt` (numpy, matplotlib, noise, ffmpeg binary). The seed
  of `ideas/sparks/` (below) — the technique graduated into
  `orchard/src/sparks.ts`.
- `repeat.py` — seamless (tileable) 2D Perlin tiles via `pnoise2` with
  `repeatx/repeaty`. **In production use:** generates the orchard's
  snow-noise tile (`orchard/public/site/snow_noise.png`, via
  `orchard/tools/prepare_site.py`).
- Not otherwise integrated. Candidate: tileable noise for the orchard's
  grass displacement or dashboard background texture.

### sparks — lightning-bolt tests (graduated)

Perlin lightning for the orchard's `gewitter` sky condition: fixed
noise-sampled channel + ~200 ms multi-pulse envelope, corridor + in-scene
flash validation. The shipped module is `orchard/src/sparks.ts`
(day-gated via `CONFIG.SPARKS.STRIKE_DAYS`); test scripts, measured results
and capture gotchas: `sparks/README.md`.

### ez-tree — procedural tree library

Upstream three.js tree generator. Vendored into `orchard/src/eztree/` and in
production use there (39 curated trees, 8 season keyframes each, runtime
rescale to photo-calibrated heights). This copy is the upstream reference;
kept for upstream tracking.
