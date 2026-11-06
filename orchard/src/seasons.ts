export type SeasonKey = 'winter' | 'spring' | 'summer' | 'autumn';

export interface SeasonDef {
  key: SeasonKey;
  /** day of year this keyframe represents */
  day: number;
  /** fraction of the preset leaf count (0 = bare tree) */
  leafFactor: number;
  /** leaf tint */
  tint: number;
}

export const SEASONS: SeasonDef[] = [
  { key: 'winter', day: 15, leafFactor: 0, tint: 0x9ac95e },
  { key: 'spring', day: 110, leafFactor: 0.55, tint: 0x9ac95e },
  { key: 'summer', day: 190, leafFactor: 1, tint: 0x5f8f3e },
  { key: 'autumn', day: 300, leafFactor: 0.85, tint: 0xc77f3a },
];

/** Nearest season keyframe for a day of year (0..364). */
export function nearestSeason(day: number): SeasonDef {
  let best = SEASONS[0];
  let bestDist = Infinity;
  for (const s of SEASONS) {
    const d = Math.abs(day - s.day);
    if (d < bestDist) {
      bestDist = d;
      best = s;
    }
  }
  return best;
}

/**
 * Patchy snow amount (0..1) for a day of year, calibrated on the
 * 2021-01-17 reference photo (thin, patchy blanket, grass poking through):
 * full around mid January, fading out towards March / late autumn.
 */
export function snowAmount(day: number): number {
  let dist = Math.abs(day - 17);
  dist = Math.min(dist, 365 - dist); // wrap around New Year
  if (dist <= 20) return 1;
  if (dist >= 60) return 0;
  const t = (dist - 20) / 40; // 0..1 across the fade
  return 1 - t * t * (3 - 2 * t); // smoothstep fade
}
