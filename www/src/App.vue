<script setup lang="ts">
import TimeSlider from './components/TimeSlider.vue';
import DataPane from './components/DataPane.vue';
import OrchardPane from './components/OrchardPane.vue';
</script>

<template>
  <header class="hdr">
    <h1>KATZENWEDDELWIESEN<span class="dash"> —</span><span class="sub">Umweltbeobachtung</span></h1>
    <div class="spacer"></div>
    <TimeSlider />
  </header>

  <main class="main">
    <OrchardPane />

    <DataPane />
  </main>

  <footer class="sources-footer">
    Quellen: DWD (© Deutscher Wetterdienst) · ICOS ERIC AS_KIT (CC BY 4.0, PID je Diagramm) ·
    SensorCity, Stadt Karlsruhe · 3D: LGL-BW dl-de/by-2-0, Stadt KA (Baumkataster, LoD2) CC BY 4.0,
    OSM ODbL · Fotos: Projektarchiv
  </footer>
</template>
