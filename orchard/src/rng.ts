/**
 * Deterministic RNG option for verification/render tests.
 *
 * `?seed=<n>` on the URL makes every scene random decision (grass blade
 * placement, cloud placement/textures) reproducible: the same seed yields a
 * pixel-identical scene, which is what lets config refactors be verified by
 * pixel comparison. Without the parameter the rng is plain Math.random —
 * behaviour unchanged for normal use.
 */

export type Rng = () => number;

/** mulberry32 — small, fast, good-enough 32-bit PRNG */
export function mulberry32(seed: number): Rng {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The scene rng: `?seed=<n>` → deterministic mulberry32, otherwise
 * Math.random (default behaviour, unseeded).
 */
export function sceneRng(): Rng {
  const raw = new URLSearchParams(window.location.search).get('seed');
  if (raw === null || raw.trim() === '' || !Number.isFinite(Number(raw))) {
    return Math.random;
  }
  return mulberry32(Number(raw));
}
