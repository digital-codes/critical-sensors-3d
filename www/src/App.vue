<script setup lang="ts">
import { ref } from 'vue';
import TimeSlider from './components/TimeSlider.vue';
import DataPane from './components/DataPane.vue';
import OrchardPane from './components/OrchardPane.vue';
import StreakPanel from './components/StreakPanel.vue';
import InfoPopup from './components/InfoPopup.vue';

/* Small-mobile layout: one full-height pane each for data, 3D and photos,
 * switchable via the tab bar and horizontal swipes. All three panes stay
 * MOUNTED — hiding is display:none (v-show semantics, NOT v-if): the
 * Three.js render loop, its day/season handlers and the photo cycle keep
 * running while a pane is in the background, so the simulation is never
 * torn down or rebuilt on a tab switch. (No <KeepAlive> needed: nothing
 * unmounts. The wrappers are layout-transparent on desktop via
 * `display: contents`, so the dashboard grid is untouched.) */
const TABS = ['Daten', '3D', 'Fotos'] as const;
const tab = ref(1); // start on the 3D view

const mapYear = new Date().getFullYear();

let touchX = 0;
let touchY = 0;
function onTouchStart(e: TouchEvent): void {
  touchX = e.touches[0].clientX;
  touchY = e.touches[0].clientY;
}
function onTouchEnd(e: TouchEvent): void {
  // swipes only on small screens and only from non-interactive areas —
  // sliders/buttons/the 3D canvas keep their own gestures (the tab bar is
  // always available as the fallback)
  if (!window.matchMedia('(max-width: 560px)').matches) return;
  const t = e.target as HTMLElement | null;
  if (t?.closest('input, button, select, a, canvas, .chart-wrap, .leaflet-container')) return;
  const dx = e.changedTouches[0].clientX - touchX;
  const dy = e.changedTouches[0].clientY - touchY;
  if (Math.abs(dx) < 60 || Math.abs(dy) > 60) return;
  if (dx < 0 && tab.value < TABS.length - 1) tab.value += 1;
  else if (dx > 0 && tab.value > 0) tab.value -= 1;
}
</script>

<template>
  <header class="hdr">
    <img class="logo" src="/site/logo.png" alt="Katzenwedelwiesen Logo" />
    <h1>KATZENWEDELWIESEN<span class="dash"> —</span><span class="sub">Umweltbeobachtung</span></h1>
    <div class="spacer"></div>
    <TimeSlider />
    <InfoPopup />
  </header>

  <nav class="mtabs" aria-label="Bereiche">
    <button
      v-for="(t, i) in TABS"
      :key="t"
      type="button"
      :class="{ active: tab === i }"
      @click="tab = i"
    >
      {{ t }}
    </button>
  </nav>

  <main class="main" @touchstart.passive="onTouchStart" @touchend.passive="onTouchEnd">
    <div class="tpane" :class="{ active: tab === 0 }"><DataPane /></div>
    <div class="tpane" :class="{ active: tab === 1 }"><OrchardPane /></div>
    <div class="tpane" :class="{ active: tab === 2 }"><StreakPanel /></div>
  </main>

  <footer class="sources-footer">
    Quellen: DWD (© Deutscher Wetterdienst) · ICOS ERIC AS_KIT (CC BY 4.0, PID je Diagramm) ·
    SensorCity, Stadt Karlsruhe · 3D: LGL-BW dl-de/by-2-0, Stadt KA (Baumkataster, LoD2) CC BY 4.0,
    OSM ODbL · Karte: © GeoBasis-DE/BKG ({{ mapYear }}) CC BY 4.0 ·
    ZKM-Kubus-Foto © JOEXX, CC BY-SA 3.0, via Wikimedia Commons · Fotos: Projektarchiv
  </footer>
</template>
