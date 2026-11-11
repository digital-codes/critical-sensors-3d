<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { setDay, setZoomed, useTime, useZoom, doyLabel } from '../store';

const time = useTime();
const zoom = useZoom();

/** local, instant day for the readout — the store commit is debounced so a
 *  touch drag does not thrash the scene/data panes; the final value commits
 *  immediately on release (@change) */
const shown = ref(time.day);
const label = computed(() => doyLabel(shown.value + 1));
const text = computed(() => `${label.value.d}. ${label.value.mon} — ${label.value.season}`);

let timer: ReturnType<typeof setTimeout> | undefined;
function onInput(e: Event) {
  const v = Number((e.target as HTMLInputElement).value);
  shown.value = v;
  clearTimeout(timer);
  timer = setTimeout(() => setDay(v, 'slider'), 250);
}
/** touch-up / keyboard release: commit the shown value without waiting */
function onCommit() {
  clearTimeout(timer);
  setDay(shown.value, 'slider');
}
/** ±1 day buttons: the precise correction for touch (a 365-day slider is
 *  ~1 day per pixel on a phone) */
function step(d: number) {
  const v = Math.max(0, Math.min(364, shown.value + d));
  shown.value = v;
  clearTimeout(timer);
  setDay(v, 'slider');
}
/** day changed from elsewhere (streak click, initial date, scene) → follow */
watch(
  () => time.day,
  (d) => { shown.value = d; },
);
function toggleZoom() {
  setZoomed(!zoom.zoomed);
}
</script>

<template>
  <div class="time-ctl">
    <label for="zeit">Zeit:</label>
    <button class="step-btn" type="button" title="Tag zurück" aria-label="Tag zurück" @click="step(-1)">‹</button>
    <input id="zeit" type="range" min="0" max="364" :value="time.day" @input="onInput" @change="onCommit" />
    <button class="step-btn" type="button" title="Tag vor" aria-label="Tag vor" @click="step(1)">›</button>
    <button
      class="zoom-btn"
      type="button"
      :class="{ active: zoom.zoomed }"
      :aria-pressed="zoom.zoomed"
      title="Nur die letzten 7 Tage (inkl. heute) anzeigen"
      @click="toggleZoom"
    >7 Tage</button>
    <span class="date-readout">{{ text }}</span>
  </div>
</template>
