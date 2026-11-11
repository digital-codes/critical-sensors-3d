<script setup lang="ts">
import { computed } from 'vue';
import { DAYS, lightIntensity, lightRgb, convoluted, pure } from '../data/curves';
import {
  useTime, useZoom, zoomStartMs, zoomCursorMs, zoomTicks, MONTH_TICKS, ZOOM_SPAN_MS,
} from '../store';

const W = 320;
const H = 92;
const BAR_H = 10;

const intensity = lightIntensity();
const rgb = lightRgb();

const time = useTime();
const zoom = useZoom();
const zoomed = computed(() => zoom.zoomed);

defineProps<{
  /** short source code shown as subtitle on mobile */
  short?: string;
}>();

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
 *  year = one bar per synthetic day (bar colour = RGB × intensity) */
const bars = computed(() => {
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

/** ONE combined colour bar: the day's RGB colour (all three channels
 *  blended per day — never R/G/B as separate strips). */
const barGradient = computed(() => {
  const stops = rgb.map((c, i) => `${pure(c)} ${(i / DAYS) * 100}%`);
  return `linear-gradient(to right, ${stops.join(',')})`;
});

const doy = computed(() => time.day + 1);
const readout = computed(() => `${intensity[Math.max(0, Math.min(DAYS - 1, time.day))]} %`);
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
      <h2>Licht &amp; Lichtfarbe<span class="dummy-tag">Wiese (fake/geplant)</span></h2>
      <span class="src short">{{ short }}</span>
      <span class="value">{{ readout }}</span>
    </div>

    <div class="chart-wrap">
      <svg :viewBox="`0 0 ${W} ${H}`" preserveAspectRatio="none" role="img" aria-label="Licht und Lichtfarbe (Dummy)">
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

    <!-- the single RGB colour bar (from the three colour channels, combined) -->
    <div class="colorbar" :style="{ background: barGradient }" :title="`Farbskala ${BAR_H}px`"></div>

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
