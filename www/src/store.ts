import { reactive } from 'vue';

/** day-of-year index (0–364) of the CURRENT date — the dashboard starts at
 *  today: the scene takes month + day for its season state, the data cards
 *  read the exact date (with the measured history up to it). */
function todayIndex(): number {
  const now = new Date();
  const start = Date.UTC(now.getFullYear(), 0, 1);
  // days elapsed since Jan 1 == the 0-based day index (consumers map
  // doy = day + 1, so elapsed 314 → doy 315 → 11. Nov)
  const elapsed = Math.floor(
    (Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) - start) / 86400000,
  );
  return Math.max(0, Math.min(364, elapsed));
}

/** Global day-of-year control (0–364), initialised to the current date. */
const state = reactive({ day: todayIndex() });

/** Data-card axis zoom: full year (false) vs the last 7 days incl. today
 *  (true). Shared by the header toggle and both chart cards. */
const zoomState = reactive({ zoomed: false });

export function useZoom(): { zoomed: boolean } {
  return zoomState;
}

export function setZoomed(v: boolean): void {
  zoomState.zoomed = v;
}

/** Tick labels for the 7-day zoom axis: compact "5.11." at each DAY
 *  boundary of the hourly axis (left = percent position). */
export function zoomTicks(): Array<{ label: string; left: number }> {
  const out: Array<{ label: string; left: number }> = [];
  for (let i = 0; i < 7; i++) {
    const now = new Date();
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6 + i);
    out.push({
      label: `${d.getDate()}.${d.getMonth() + 1}.`,
      left: (i / 7) * 100,
    });
  }
  return out;
}

/** Span of the 7-day zoom window in ms (168 hourly slots). */
export const ZOOM_SPAN_MS = 7 * 86400000;

/** Local ms of the zoom window start: the REAL current date minus 6 days,
 *  00:00. The window always ends at today 24:00 (exclusive). */
export function zoomStartMs(): number {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6).getTime();
}

/** Local ms of the global day's midday — the cursor position on the
 *  hourly zoom axis (clamping to the window happens in the cards). */
export function zoomCursorMs(doy: number): number {
  const date = new Date(Date.UTC(2026, 0, Math.max(1, Math.min(365, Math.round(doy)))));
  return new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 12).getTime();
}

/** Day-change sources: the streak panel is a pure image animation and does
 *  NOT move the simulation day (user decision), so only these two remain. */
type DaySource = 'slider' | 'scene';
const listeners = new Set<(day: number, src: DaySource) => void>();

export function useTime(): { day: number } {
  return state;
}

export function setDay(day: number, src: DaySource = 'slider'): void {
  const d = Math.max(0, Math.min(364, Math.round(day)));
  if (d === state.day) return;
  state.day = d;
  for (const fn of listeners) fn(d, src);
}

/** Subscribe to global day changes; returns an unsubscribe fn. */
export function onDay(fn: (day: number, src: DaySource) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

const MONTHS = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

/** doy 1..365 → { d: 9, mon: 'Jul', season: 'Sommer' } (2026, non-leap). */
export function doyLabel(doy: number): { d: number; mon: string; season: string } {
  const date = new Date(Date.UTC(2026, 0, Math.max(1, Math.min(365, Math.round(doy)))));
  const m = date.getUTCMonth();
  const season = m === 11 || m <= 1 ? 'Winter' : m <= 4 ? 'Frühling' : m <= 7 ? 'Sommer' : 'Herbst';
  return { d: date.getUTCDate(), mon: MONTHS[m], season };
}

/** Month-start day-of-year for the chart ticks (Jan Mär Mai Jul Sep Nov). */
export const MONTH_TICKS: Array<{ label: string; doy: number }> = [
  { label: 'Jan', doy: 1 },
  { label: 'Mär', doy: 60 },
  { label: 'Mai', doy: 121 },
  { label: 'Jul', doy: 182 },
  { label: 'Sep', doy: 244 },
  { label: 'Nov', doy: 305 },
];
