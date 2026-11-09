/** Types + fetch layer for the wiese3d sensor API (see orchard/public/php/README.md). */

export type ChannelKey =
  | 'temperature'
  | 'humidity'
  | 'co2'
  | 'solar'
  | 'wind'
  | 'soilMoist'
  | 'soilTemp';

/** [date 'YYYY-MM-DD', avg, min, max] */
export type DayRow = [string, number, number, number];

export interface ChannelSeries {
  sensor: number;
  column: string;
  unit: string;
  source: string;
  licence: string;
  range: { from: string; to: string } | null;
  days: DayRow[];
}

export interface SeriesResponse {
  ok: boolean;
  generated: string;
  channels: Partial<Record<ChannelKey, ChannelSeries>>;
}

const CHANNEL_LIST: ChannelKey[] = [
  'temperature',
  'humidity',
  'co2',
  'solar',
  'wind',
  'soilMoist',
  'soilTemp',
];

/** In production the endpoint lives at /files/wiese3d/api.php; in dev the
 *  Vite proxy maps /php → the PHP built-in server on port 9000. */
export const API_BASE = '/php';

export async function fetchSeries(): Promise<SeriesResponse> {
  const res = await fetch(`${API_BASE}/api.php?channels=${CHANNEL_LIST.join(',')}`, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`API HTTP ${res.status}`);
  const data = (await res.json()) as SeriesResponse;
  if (!data.ok) throw new Error('API antwortete mit Fehler');
  return data;
}

/** day-of-year (1..365) → 'YYYY-MM-DD' (2026, non-leap). */
export function doyToIso(doy: number): string {
  const d = new Date(Date.UTC(2026, 0, Math.max(1, Math.min(365, Math.round(doy)))));
  return d.toISOString().slice(0, 10);
}

/** iso 'YYYY-MM-DD' → day-of-year 1..365. */
export function isoToDoy(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 1)) / 86400000) + 1;
}

/** Value of the day at (nearest, ±2 days tolerance) the given doy; null if none. */
export function valueAtDoy(days: DayRow[], doy: number): { avg: number; min: number; max: number } | null {
  let best: DayRow | null = null;
  let bestDist = Infinity;
  for (const row of days) {
    const dist = Math.abs(isoToDoy(row[0]) - doy);
    if (dist < bestDist) {
      bestDist = dist;
      best = row;
      if (dist === 0) break;
    }
  }
  if (!best || bestDist > 2) return null;
  return { avg: best[1], min: best[2], max: best[3] };
}
