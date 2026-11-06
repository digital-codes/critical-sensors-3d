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
