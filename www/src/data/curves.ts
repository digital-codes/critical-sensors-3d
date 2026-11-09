/** Deterministic DUMMY series for the Licht & Lichtfarbe card (the only
 *  non-real card until the Wiesenstation with its RGB light sensor exists).
 *
 *  Per user spec: ONE single chart — light intensity 0–100 % whose plotted
 *  colour is the RGB colour convoluted (multiplied) with the intensity
 *  (100 = max) — plus ONE combined colour bar built from the three channels
 *  (never three separate R/G/B bars). */

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const DAYS = 365;

/** Intensity 0–100 %: seasonal daylight curve peaked at day 172 (21. Jun),
 *  scaled by a smoothed multi-day "weather" factor. */
export function lightIntensity(): number[] {
  const rnd = mulberry32(20261109);
  const raw = Array.from({ length: DAYS + 4 }, () => rnd());
  // 5-tap moving average (clamped at both ends) → multi-day cloudy/bright periods
  const weather = raw.map((_, i) => {
    let s = 0;
    for (let k = -2; k <= 2; k++) s += raw[Math.min(raw.length - 1, Math.max(0, i + k))];
    return s / 5;
  });
  const out: number[] = [];
  for (let i = 0; i < DAYS; i++) {
    const seasonal = 0.5 + 0.5 * Math.cos((2 * Math.PI * (i - 171)) / DAYS); // 0 … 1
    const cloud = 0.45 + 0.75 * weather[i]; // 0.45 (dunkel) … 1.2 (klar)
    const v = (8 + 92 * seasonal) * cloud;
    out.push(Math.round(Math.max(2, Math.min(100, v))));
  }
  return out;
}

/** Per-day RGB triplet of the light colour (0–255 each): slowly wandering
 *  sun tint — cool bluish-white around the winter solstice, warm golden in
 *  summer, small seeded day-to-day drift. */
export function lightRgb(): Array<[number, number, number]> {
  const rnd = mulberry32(4711);
  const out: Array<[number, number, number]> = [];
  let drift = 0;
  for (let i = 0; i < DAYS; i++) {
    drift = 0.92 * drift + 0.08 * (rnd() - 0.5); // smooth random walk
    const seasonal = 0.5 + 0.5 * Math.cos((2 * Math.PI * (i - 171)) / DAYS);
    // warm (summer): high R, mid G, low B — cool (winter): flat, bluish
    const r = 235 + 20 * seasonal + 60 * drift;
    const g = 225 + 10 * seasonal + 20 * drift;
    const b = 215 - 65 * seasonal - 20 * drift;
    out.push([
      Math.max(120, Math.min(255, Math.round(r))),
      Math.max(120, Math.min(255, Math.round(g))),
      Math.max(80, Math.min(255, Math.round(b))),
    ]);
  }
  return out;
}

/** RGB colour convoluted with the intensity (i/100, 100 = max). */
export function convoluted(rgb: [number, number, number], intensity: number): string {
  const f = intensity / 100;
  const c = (v: number) => Math.round(v * f);
  return `rgb(${c(rgb[0])},${c(rgb[1])},${c(rgb[2])})`;
}

/** Pure (un-convoluted) css colour of the day's triplet. */
export function pure(rgb: [number, number, number]): string {
  return `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
}
