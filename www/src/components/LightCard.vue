<script setup lang="ts">
import { computed } from 'vue';
import { DAYS, lightIntensity, lightRgb, convoluted, pure } from '../data/curves';
import {
  useTime, useZoom, zoomStartMs, zoomCursorMs, zoomTicks, MONTH_TICKS, ZOOM_SPAN_MS,
} from '../store';
import {
  isoToDoy, isoShift, rowMs, todayIso, valueAtDoy,
  type ChannelKey, type ChannelSeries, type DayRow,
} from '../api';

const W = 320;
const H = 92;

const intensity = lightIntensity();
const rgb = lightRgb();

const time = useTime();
const zoom = useZoom();
const zoomed = computed(() => zoom.zoomed);

const props = defineProps<{
  /** short source code shown as subtitle on mobile */
  short?: string;
  /** wiese channels, daily rows (light = sensor 2, r/g/b = sensor 7) */
  wiese?: Partial<Record<ChannelKey, ChannelSeries>>;
  /** wiese channels, hourly rows for the 7-day zoom view */
  wieseH?: Partial<Record<ChannelKey, ChannelSeries>>;
}>();

interface Bar {
  x: number;
  w: number;
  h: number;
  y: number;
  fill: string;
}

/** measured data counts as fresh while the newest daily light value is at
 *  most this many days old; older/absent → synthetic demo curves */
const STALE_AFTER_DAYS = 31;

/** real mode iff the daily light series exists and is fresh (ISO date
 *  string compare against today − 31 days) */
const real = computed(() => {
  const light = props.wiese?.wieseLight;
  if (!light) return false;
  return light.range !== null && light.range.to >= isoShift(todayIso(), -STALE_AFTER_DAYS);
});

/** [r,g,b] lookup per row key (date or hour string) across the three colour
 *  series; keys without a full triplet stay absent → rendered black */
function rgbLookup(
  r?: ChannelSeries,
  g?: ChannelSeries,
  b?: ChannelSeries,
): Map<string, [number, number, number]> {
  const gs = new Map<string, number>();
  const bs = new Map<string, number>();
  for (const row of g?.days ?? []) gs.set(row[0], row[1]);
  for (const row of b?.days ?? []) bs.set(row[0], row[1]);
  const out = new Map<string, [number, number, number]>();
  for (const row of r?.days ?? []) {
    const gv = gs.get(row[0]);
    const bv = bs.get(row[0]);
    if (gv === undefined || bv === undefined) continue;
    out.set(row[0], [row[1], gv, bv]);
  }
  return out;
}

/** measured light (0-255) -> displayed intensity 0-100 %, log characteristic */
function lightToPct(light: number): number {
  return (100 * Math.log(1 + light)) / Math.log(256);
}

/** light colour at full saturation: scale the triplet to its brightest
 *  channel (hue-preserving); a missing/dark triplet stays black */
function saturated(rgb: [number, number, number]): [number, number, number] {
  const f = 255 / Math.max(1, ...rgb);
  return [Math.min(255, rgb[0] * f), Math.min(255, rgb[1] * f), Math.min(255, rgb[2] * f)];
}

/** measured bars: one per row, height = mapped intensity (log
 *  characteristic) of the chart, colour = the row's rgb at full
 *  saturation (hue-preserving) */
function measuredBars(
  rows: DayRow[],
  rgbMap: Map<string, [number, number, number]>,
  w: number,
  xOf: (key: string) => number,
): Bar[] {
  return rows.map((row) => {
    const pct = lightToPct(row[1]);
    const h = Math.max(1, (pct / 100) * (H - 2));
    return {
      x: xOf(row[0]),
      w,
      h,
      y: H - h,
      fill: pure(saturated(rgbMap.get(row[0]) ?? [0, 0, 0])),
    };
  });
}

/** REAL year view: one bar per measured day at its day-of-year on the
 *  unchanged 365-day axis (days without measurements simply absent) */
const realYearBars = computed<Bar[]>(() => {
  const light = props.wiese?.wieseLight;
  if (!light) return [];
  const rgbMap = rgbLookup(props.wiese?.wieseR, props.wiese?.wieseG, props.wiese?.wieseB);
  return measuredBars(
    light.days,
    rgbMap,
    W / 365,
    (key) => ((isoToDoy(key) - 1) / 365) * W,
  );
});

/** rows inside the 7-day zoom window [today−6 00:00, today 24:00) */
function windowRows(rows: DayRow[]): DayRow[] {
  const start = zoomStartMs();
  return rows.filter((row) => {
    const ms = rowMs(row[0]);
    return ms >= start && ms < start + ZOOM_SPAN_MS;
  });
}

/** REAL zoom view: bars from the light hourly rows, colour from the hourly
 *  rgb rows under the same hour string (missing → black); without hourly
 *  data the daily rows fill the window (same fallback as SeriesCard) */
const realZoomBars = computed<Bar[]>(() => {
  const start = zoomStartMs();
  const w = W / (ZOOM_SPAN_MS / 3600000); // one full hour slot (no gaps)
  const lightH = props.wieseH?.wieseLight;
  const useHourly = lightH !== undefined && lightH.days.length > 0;
  const src = useHourly && lightH ? lightH.days : props.wiese?.wieseLight?.days ?? [];
  const rgbMap = useHourly
    ? rgbLookup(props.wieseH?.wieseR, props.wieseH?.wieseG, props.wieseH?.wieseB)
    : rgbLookup(props.wiese?.wieseR, props.wiese?.wieseG, props.wiese?.wieseB);
  return measuredBars(windowRows(src), rgbMap, w, (key) => ((rowMs(key) - start) / ZOOM_SPAN_MS) * W);
});

/** synthetic day index (0..364) of a calendar date, clamped to the curve */
function dayIdx(date: Date): number {
  const jan1 = new Date(date.getFullYear(), 0, 1).getTime();
  return Math.max(0, Math.min(DAYS - 1, Math.round((date.getTime() - jan1) / 86400000)));
}

/** hourly interpolated intensity for the zoom window: linear ramp between
 *  the synthetic daily values, one value per hour of [today−6, today) */
const hourlyValues = computed(() => {
  const now = new Date();
  const out: Array<{ ms: number; v: number }> = [];
  for (let d = 0; d < 7; d++) {
    const dayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6 + d);
    const v0 = intensity[dayIdx(dayDate)];
    const v1 = intensity[dayIdx(dayDate) + 1] ?? v0;
    for (let h = 0; h < 24; h++) {
      const f = h / 24;
      out.push({ ms: dayDate.getTime() + h * 3600000, v: v0 + (v1 - v0) * f });
    }
  }
  return out;
});

/** one bar per plotted value; zoom = hourly bars across the window,
 *  year = one bar per synthetic day (bar colour = RGB × intensity);
 *  with fresh measured data the bars come from the wiese channels */
const bars = computed<Bar[]>(() => {
  if (real.value) {
    return zoomed.value ? realZoomBars.value : realYearBars.value;
  }
  if (!zoomed.value) {
    return intensity.map((v, i) => {
      const h = Math.max(1, (v / 100) * (H - 2));
      return {
        x: (i / DAYS) * W,
        w: (W / DAYS) * 0.82,
        h,
        y: H - h,
        fill: convoluted(rgb[i], v),
      };
    });
  }
  const start = zoomStartMs();
  const w = (W / (ZOOM_SPAN_MS / 3600000)) * 0.8; // one hour slot
  return hourlyValues.value.map(({ ms, v }) => {
    const h = Math.max(1, (v / 100) * (H - 2));
    return {
      x: ((ms - start) / ZOOM_SPAN_MS) * W,
      w,
      h,
      y: H - h,
      fill: convoluted(rgb[dayIdx(new Date(ms))], v),
    };
  });
});

const doy = computed(() => time.day + 1);
const tag = computed(() => (real.value ? 'Wiese' : 'Wiese (fake/geplant)'));
const readout = computed(() => {
  if (real.value) {
    const light = props.wiese?.wieseLight;
    const v = light ? valueAtDoy(light.days, time.day) : null;
    return v === null ? '—' : `${lightToPct(v.avg).toFixed(1)} %`;
  }
  return `${intensity[Math.max(0, Math.min(DAYS - 1, time.day))]} %`;
});
const cursorX = computed(() => {
  if (!zoomed.value) return ((doy.value - 0.5) / 365) * W;
  const off = (zoomCursorMs(doy.value) - zoomStartMs()) / ZOOM_SPAN_MS;
  return Math.max(0, Math.min(1, off)) * W;
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
      <h2>Licht &amp; Lichtfarbe<span class="dummy-tag">{{ tag }}</span></h2>
      <span class="src short">{{ short }}</span>
      <span class="value">{{ readout }}</span>
    </div>

    <div class="chart-wrap">
      <svg :viewBox="`0 0 ${W} ${H}`" preserveAspectRatio="none" role="img" :aria-label="real ? 'Licht und Lichtfarbe' : 'Licht und Lichtfarbe (Dummy)'">
        <line x1="0" :y1="H - 1" :x2="W" :y2="H - 1" stroke="rgba(0,0,0,.2)" stroke-width="1" />
        <rect
          v-for="(b, i) in bars"
          :key="i"
          :x="b.x"
          :y="b.y"
          :width="b.w"
          :height="b.h"
          :fill="b.fill"
        />
        <line :x1="cursorX" y1="0" :x2="cursorX" :y2="H" stroke="#f93822" stroke-width="1.5" />
      </svg>
    </div>

    <div class="ticks" :class="{ z7: zoomed }">
      <span
        v-for="(t, i) in ticks"
        :key="t.label + i"
        :style="{ left: `${t.left}%` }"
      >{{ t.label }}</span>
    </div>

    <!-- 
    <div class="caption">
      Lichtintensität 0–100 %, Farbe = RGB-Lichtfarbe × Intensität (100 % = Maximum) —
      die Farbe tönt das Licht der 3D-Szene.
    </div>
    -->
  </section>
</template>
