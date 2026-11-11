<script setup lang="ts">
import { computed } from 'vue';
import type { DayRow } from '../api';
import { isoToDoy, rowMs, valueAtDoy } from '../api';
import {
  useTime, useZoom, zoomStartMs, zoomCursorMs, zoomTicks, MONTH_TICKS, ZOOM_SPAN_MS,
} from '../store';

const props = defineProps<{
  title: string;
  subtitle: string;
  unit: string;
  days: DayRow[];
  color: string;
  /** primary legend label (only shown together with `secondary`) */
  label?: string;
  /** secondary series (Boden card: Bodentemperatur) with its own scale */
  secondary?: {
    days: DayRow[];
    unit: string;
    color: string;
    label: string;
    hourly?: DayRow[];
  };
  /** hourly rows (timestamps) for the 7-day zoom view, primary series */
  hourly?: DayRow[];
  /** short source code shown as subtitle on mobile */
  short?: string;
  decimals?: number;
}>();

const W = 320;
const H = 92;
const PAD = 3; // svg px, keeps strokes inside the box

const time = useTime();
const zoom = useZoom();
const zoomed = computed(() => zoom.zoomed);
const doy = computed(() => time.day + 1); // 1..365

interface Pt {
  x: number;
  y: number;
}

/** rows for the zoom view: the HOURLY series when available (one point per
 *  hour of the window), otherwise the daily rows as fallback; both clipped
 *  to the window [today−6 00:00, today 24:00) */
function zoomRows(days: DayRow[]): DayRow[] {
  const src = props.hourly && props.hourly.length ? props.hourly : days;
  const start = zoomStartMs();
  return src.filter((r) => {
    const ms = rowMs(r[0]);
    return ms >= start && ms < start + ZOOM_SPAN_MS;
  });
}

function zoomRows2(days: DayRow[]): DayRow[] {
  if (!props.secondary) return [];
  const src = props.secondary.hourly && props.secondary.hourly.length
    ? props.secondary.hourly
    : days;
  const start = zoomStartMs();
  return src.filter((r) => {
    const ms = rowMs(r[0]);
    return ms >= start && ms < start + ZOOM_SPAN_MS;
  });
}

/** x position of a doy on the full-year axis */
function yearX(d: number): number {
  return ((d - 0.5) / 365) * W;
}

/** Daily-mean points over the fixed Jan–Dec axis (data gaps simply absent). */
function yearPoints(days: DayRow[]): Pt[] {
  if (days.length === 0) return [];
  let vmin = Infinity;
  let vmax = -Infinity;
  for (const r of days) {
    vmin = Math.min(vmin, r[1]);
    vmax = Math.max(vmax, r[1]);
  }
  const span = vmax - vmin || 1;
  const lo = vmin - 0.06 * span;
  const hi = vmax + 0.06 * span;
  const yOf = (v: number) => PAD + (1 - (v - lo) / (hi - lo)) * (H - 2 * PAD);
  return days.map((r) => ({ x: yearX(isoToDoy(r[0])), y: yOf(r[1]) }));
}

/** hourly/daily points across the 7-day window; x by local ms offset */
function windowPoints(rows: DayRow[]): Pt[] {
  if (rows.length === 0) return [];
  let vmin = Infinity;
  let vmax = -Infinity;
  for (const r of rows) {
    vmin = Math.min(vmin, r[1]);
    vmax = Math.max(vmax, r[1]);
  }
  const span = vmax - vmin || 1;
  const lo = vmin - 0.06 * span;
  const hi = vmax + 0.06 * span;
  const yOf = (v: number) => PAD + (1 - (v - lo) / (hi - lo)) * (H - 2 * PAD);
  const start = zoomStartMs();
  return rows.map((r) => ({ x: ((rowMs(r[0]) - start) / ZOOM_SPAN_MS) * W, y: yOf(r[1]) }));
}

const pts = computed(() => (zoomed.value ? windowPoints(zoomRows(props.days)) : yearPoints(props.days)));
const pts2 = computed(() =>
  props.secondary
    ? (zoomed.value ? windowPoints(zoomRows2(props.secondary.days)) : yearPoints(props.secondary.days))
    : [],
);

const path = computed(() =>
  pts.value.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' '),
);
const path2 = computed(() =>
  pts2.value.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' '),
);

/** cursor x: year axis at the global doy; zoom axis at the global day's
 *  midday slot, clamped to the window edges */
const cursorX = computed(() => {
  if (!zoomed.value) return yearX(doy.value);
  const off = (zoomCursorMs(doy.value) - zoomStartMs()) / ZOOM_SPAN_MS;
  return Math.max(0, Math.min(1, off)) * W;
});

/** cursor marker on the primary curve (nearest point; zoom takes whatever
 *  falls inside the window, year axis keeps the 3-day tolerance) */
const cursorPt = computed<Pt | null>(() => {
  let best: Pt | null = null;
  let bestDist = Infinity;
  for (const p of pts.value) {
    const dist = Math.abs(p.x - cursorX.value);
    if (dist < bestDist) {
      bestDist = dist;
      best = p;
    }
  }
  if (best === null) return null;
  return zoomed.value || bestDist <= (3 / 365) * W ? best : null;
});

const fmt = (v: number, dec: number) =>
  v.toLocaleString('de-DE', { minimumFractionDigits: dec, maximumFractionDigits: dec });

const readout = computed(() => {
  const v = valueAtDoy(props.days, doy.value);
  return v ? `${fmt(v.avg, props.decimals ?? 1)} ${props.unit}` : '—';
});

const readout2 = computed(() => {
  if (!props.secondary) return null;
  const v = valueAtDoy(props.secondary.days, doy.value);
  return v ? `${fmt(v.avg, 1)} ${props.secondary.unit}` : '—';
});

/** tick labels for the current axis: months (year) or day boundaries
 *  (7-day hourly window) */
const ticks = computed(() => {
  if (!zoomed.value) {
    return MONTH_TICKS.map((t) => ({ label: t.label, left: ((t.doy - 0.5) / 365) * 100 }));
  }
  return zoomTicks();
});
</script>

<template>
  <section class="card">
    <div class="card-hd">
      <h2>{{ title }}</h2>
      <span class="src short">{{ short }}</span>
      <span class="src long">{{ subtitle }}</span>
      <span class="value">{{ readout }}<template v-if="readout2"> · {{ readout2 }}</template></span>
    </div>

    <div v-if="secondary && label" class="legend">
      <span><i :style="{ background: color }"></i>{{ label }}</span>
      <span><i :style="{ background: secondary.color }"></i>{{ secondary.label }}</span>
    </div>

    <div class="chart-wrap">
      <svg :viewBox="`0 0 ${W} ${H}`" preserveAspectRatio="none" role="img" :aria-label="title">
        <line x1="0" :y1="H - 1" :x2="W" :y2="H - 1" stroke="rgba(0,0,0,.2)" stroke-width="1" />
        <path v-if="pts.length > 1" :d="path" fill="none" :stroke="color" stroke-width="2" />
        <path
          v-if="secondary && pts2.length > 1"
          :d="path2"
          fill="none"
          :stroke="secondary.color"
          stroke-width="1.6"
          stroke-dasharray="4 3"
        />
        <line :x1="cursorX" y1="0" :x2="cursorX" :y2="H" stroke="#f93822" stroke-width="1.5" />
        <circle v-if="cursorPt" :cx="cursorPt.x" :cy="cursorPt.y" r="3" fill="#f93822" />
      </svg>
    </div>

    <div class="ticks" :class="{ z7: zoomed }">
      <span
        v-for="(t, i) in ticks"
        :key="t.label + i"
        :style="{ left: `${t.left}%` }"
      >{{ t.label }}</span>
    </div>
  </section>
</template>
