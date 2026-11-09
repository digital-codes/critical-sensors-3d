<script setup lang="ts">
import TimeSlider from './components/TimeSlider.vue';
import DataPane from './components/DataPane.vue';
</script>

<template>
  <header class="hdr">
    <h1>KATZENWEDDELWIESEN<span class="dash"> —</span><span class="sub">Umweltbeobachtung</span></h1>
    <div class="spacer"></div>
    <TimeSlider />
  </header>

  <main class="main">
    <!-- 3D-Pane: die eingebettete Orchardszene folgt (mountOrchard-Refactor,
             eigener Arbeitsauftrag im Changeset "dashboard-prototype"). -->
    <section class="pane3d" aria-label="3D-Ansicht">
      <div>
        <strong>3D-Modell der Streuobstwiese</strong><br />
        (eingebettete Szene folgt im nächsten Schritt)
      </div>
    </section>

    <DataPane />
  </main>

  <footer class="sources-footer">
    Quellen: DWD (© Deutscher Wetterdienst) · ICOS ERIC AS_KIT (CC BY 4.0, PID je Diagramm) ·
    SensorCity, Stadt Karlsruhe · 3D: LGL-BW dl-de/by-2-0, Stadt KA (Baumkataster, LoD2) CC BY 4.0,
    OSM ODbL · Fotos: Projektarchiv
  </footer>
</template>
