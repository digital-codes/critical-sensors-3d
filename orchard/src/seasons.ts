import { CONFIG } from './config';

export type SeasonKey =
  | 'winter'
  | 'spring'
  | 'summer'
  | 'earlyAutumn'
  | 'midAutumn'
  | 'autumn'
  | 'lateAutumn'
  | 'dormant';

export interface SeasonDef {
  key: SeasonKey;
  /** day of year this keyframe represents */
  day: number;
  /** fraction of the preset leaf count (0 = bare tree) */
  leafFactor: number;
  /** leaf tint */
  tint: number;
}

export const SEASONS: SeasonDef[] = CONFIG.SEASONS.map((s) => ({ ...s }));

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
 * Grass height factor (0..1) for a day of year, per the user's description:
 * growth starts late February, higher through spring, peak in early summer,
 * mowed in late August, slight regrowth in autumn, very low in winter
 * (sometimes snow-covered — see snowAmount).
 */
export function grassHeight(day: number): number {
  if (day < 40) return 0.02; // winter: blades vanish under the snow
  if (day < 52) return 0.02 + ((day - 40) / 12) * 0.08; // growth starting late Feb
  if (day < 150) {
    const t = (day - 52) / 98; // spring growth -> 0.85 by end of May
    return 0.12 + t * t * (3 - 2 * t) * 0.73;
  }
  if (day < 230) return 0.85 + ((day - 150) / 80) * 0.15; // peak 1.0 by mid July
  if (day < 238) return 1.0; // full height until the mow
  if (day < 246) return 1.0 - ((day - 238) / 8) * 0.88; // mowed late August -> 0.12
  if (day < 300) return 0.12 + ((day - 246) / 54) * 0.18; // slight autumn regrowth
  if (day < 340) return 0.3 - ((day - 300) / 40) * 0.25; // late fall down to 0.05
  return 0.02; // winter
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
