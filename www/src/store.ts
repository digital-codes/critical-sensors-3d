import { reactive } from 'vue';

/** day-of-year index (0–364) of the CURRENT date — the dashboard starts at
 *  today: the scene takes month + day for its season state, the data cards
 *  read the exact date (with the measured history up to it). */
function todayIndex(): number {
  const now = new Date();
  const start = Date.UTC(now.getFullYear(), 0, 1);
  const doy = Math.floor(
    (Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) - start) / 86400000,
  );
  return Math.max(0, Math.min(364, doy - 1));
}

/** Global day-of-year control (0–364), initialised to the current date. */
const state = reactive({ day: todayIndex() });

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
