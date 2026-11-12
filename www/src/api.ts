/** Types + fetch layer for the wiese3d sensor API (see orchard/public/php/README.md). */

export type ChannelKey =
  | 'temperature'
  | 'humidity'
  | 'co2'
  | 'solar'
  | 'wind'
  | 'soilMoist'
  | 'soilTemp'
  | 'wieseLight'
  | 'wieseR'
  | 'wieseG'
  | 'wieseB';

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
  res: 'daily' | 'hourly';
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
  'wieseLight',
  'wieseR',
  'wieseG',
  'wieseB',
];

/** In production the endpoint lives at /files/wiese3d/api.php; in dev the
 *  Vite proxy maps /php → the PHP built-in server on port 9000. */
export const API_BASE = '/php';

export async function fetchSeries(
  opts: { res?: 'daily' | 'hourly'; from?: string; to?: string } = {},
): Promise<SeriesResponse> {
  const p = new URLSearchParams({ channels: CHANNEL_LIST.join(',') });
  if (opts.res) p.set('res', opts.res);
  if (opts.from) p.set('from', opts.from);
  if (opts.to) p.set('to', opts.to);
  const res = await fetch(`${API_BASE}/api.php?${p.toString()}`, {
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

/** ISO 'YYYY-MM-DD' of today's LOCAL date. */
export function todayIso(): string {
  const now = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

/** ISO date shifted by n days (local calendar arithmetic). */
export function isoShift(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const t = new Date(y, m - 1, d + days);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())}`;
}

/** Local-time ms of a row date ('YYYY-MM-DD' or 'YYYY-MM-DD HH:MM:SS').
 *  Rows and window boundaries are parsed the same way (browser-local wall
 *  time), so hour offsets stay self-consistent. */
export function rowMs(date: string): number {
  const m = date.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (!m) return NaN;
  return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0)).getTime();
}

/** Value of the day at (nearest, ±2 days tolerance) the given doy; null if none.
 *  Startup-tolerant: when the global day is at/after the newest row but has
 *  no exact match (today's aggregate not yet published), the NEWEST
 *  available day is shown — the readout reflects the freshest measurement
 *  instead of going stale via the ±2-day tolerance. */
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
  if (best !== null && bestDist <= 2) return { avg: best[1], min: best[2], max: best[3] };
  if (best === null) return null;
  // global day at/after the newest row (today's aggregate not yet in the
  // data): show the newest available measurement. Mid-year gaps keep "—".
  let newestDoy = -Infinity;
  for (const row of days) {
    const d = isoToDoy(row[0]);
    if (d > newestDoy) newestDoy = d;
  }
  if (newestDoy <= doy) return { avg: best[1], min: best[2], max: best[3] };
  return null;
}
