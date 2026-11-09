<script setup lang="ts">
import { computed } from 'vue';
import { DAYS, lightIntensity, lightRgb, convoluted, pure } from '../data/curves';
import { useTime, MONTH_TICKS } from '../store';

const W = 320;
const H = 92;
const BAR_H = 10;

const intensity = lightIntensity();
const rgb = lightRgb();

/** one bar per day; colour = rgb convoluted with intensity (100 % = max) */
const bars = computed(() =>
  intensity.map((v, i) => ({
    x: (i / DAYS) * W,
    w: (W / DAYS) * 0.82,
    h: Math.max(1, (v / 100) * (H - 2)),
    y: H - Math.max(1, (v / 100) * (H - 2)),
    fill: convoluted(rgb[i], v),
  })),
);

/** ONE combined colour bar: the day's RGB colour (all three channels
 *  blended per day — never R/G/B as separate strips). */
const barGradient = computed(() => {
  const stops = rgb.map((c, i) => `${pure(c)} ${(i / DAYS) * 100}%`);
  return `linear-gradient(to right, ${stops.join(',')})`;
});

const time = useTime();
const doy = computed(() => time.day + 1);
const readout = computed(() => `${intensity[Math.max(0, Math.min(DAYS - 1, time.day))]} %`);
const cursorX = computed(() => ((doy.value - 0.5) / 365) * W);
</script>

<template>
  <section class="card">
    <div class="card-hd">
      <h2>Licht &amp; Lichtfarbe<span class="dummy-tag">Dummy-Daten — Wiesenstation (geplant)</span></h2>
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

    <div class="ticks">
      <span
        v-for="t in MONTH_TICKS"
        :key="t.label"
        :style="{ left: `${((t.doy - 0.5) / 365) * 100}%` }"
      >{{ t.label }}</span>
    </div>

    <div class="caption">
      Lichtintensität 0–100 %, Farbe = RGB-Lichtfarbe × Intensität (100 % = Maximum) —
      die Farbe tönt das Licht der 3D-Szene.
    </div>
  </section>
</template>
