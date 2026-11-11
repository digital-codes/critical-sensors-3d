<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { fetchSeries, todayIso, isoShift, type ChannelSeries, type ChannelKey } from '../api';
import { useZoom } from '../store';
import SeriesCard from './SeriesCard.vue';
import LightCard from './LightCard.vue';

const loading = ref(true);
const error = ref<string | null>(null);
const series = ref<Partial<Record<ChannelKey, ChannelSeries>>>({});
const hourly = ref<Partial<Record<ChannelKey, ChannelSeries>>>({});

const CARD_ORDER: ChannelKey[] = ['co2', 'temperature', 'humidity', 'solar', 'wind'];

onMounted(async () => {
  try {
    const data = await fetchSeries();
    series.value = data.channels;
  } catch (e) {
    error.value =
      'Sensorwerte nicht erreichbar. Läuft der PHP-Sensorserver? ' +
      '(Entwicklung: `php -S 127.0.0.1:9000 -t ../orchard/public/php ../orchard/public/php/router.php`)';
    console.error(e);
  } finally {
    loading.value = false;
  }
});

const got = (k: ChannelKey) => series.value[k]?.days ?? [];
const gotH = (k: ChannelKey) => hourly.value[k]?.days ?? [];

const zoom = useZoom();

/** hourly series for the 7-day window; an empty result falls back to the
 *  daily rows (windowPoints handles both) */
async function loadHourly(): Promise<void> {
  try {
    const to = todayIso();
    const from = isoShift(to, -6);
    const data = await fetchSeries({ res: 'hourly', from, to });
    hourly.value = data.channels;
  } catch (e) {
    console.error('Stundenwerte nicht erreichbar — 7-Tage-Ansicht nutzt Tageswerte.', e);
    hourly.value = {};
  }
}

watch(
  () => zoom.zoomed,
  (z) => {
    if (z) void loadHourly();
  },
);

/** short source codes for the mobile card subtitles … */
const SHORT: Partial<Record<ChannelKey, string>> = {
  co2: 'ICOS/CO₂',
  temperature: 'DWD/Temp',
  humidity: 'DWD/Feuchte',
  solar: 'City/Solar',
  wind: 'DWD/Wind',
  soilMoist: 'City/Boden',
};

/** … and the matching full descriptions, one paragraph per card below the
 *  data pane on mobile (same order as the cards) */
const DESCS: Array<{ short: string; full: string }> = [
  { short: 'ICOS/CO₂', full: 'ICOS Atmosphärenstation AS_KIT (KIT), Karlsruhe — CO₂-Konzentration in ppm' },
  { short: 'DWD/Temp', full: 'DWD Klimastation Rheinstetten — Lufttemperatur in °C' },
  { short: 'DWD/Feuchte', full: 'DWD Klimastation Rheinstetten — relative Luftfeuchte in %' },
  { short: 'City/Solar', full: 'SensorCity 116 Breite Straße (212 m N), Stadt Karlsruhe — Solar in W/m²' },
  { short: 'DWD/Wind', full: 'DWD Klimastation Rheinstetten (FF_10) — Wind in m/s' },
  { short: 'City/Boden', full: 'SensorCity 002 Hohenzollernstraße (457 m N), Stadt Karlsruhe — Bodenfeuchte in % und Bodentemperatur in °C' },
  { short: 'Wiese/Licht', full: 'Wiesenstation (geplant) — Dummy-Daten: Lichtintensität und Lichtfarbe' },
];
</script>

<template>
  <aside class="data-pane" aria-label="Messwerte">
    <div v-if="loading" class="data-loading">Messwerte werden geladen …</div>
    <div v-else-if="error" class="data-error">{{ error }}</div>

    <template v-else>
      <SeriesCard
        title="CO₂"
        :subtitle="series.co2?.source ?? ''"
        :short="SHORT.co2"
        unit="ppm"
        :days="got('co2')"
        :hourly="gotH('co2')"
        color="#6b6428"
        :decimals="0"
      />
      <SeriesCard
        title="Lufttemperatur"
        :subtitle="series.temperature?.source ?? ''"
        :short="SHORT.temperature"
        unit="°C"
        :days="got('temperature')"
        :hourly="gotH('temperature')"
        color="#c23a2b"
      />
      <SeriesCard
        title="Luftfeuchte"
        :subtitle="series.humidity?.source ?? ''"
        :short="SHORT.humidity"
        unit="%"
        :days="got('humidity')"
        :hourly="gotH('humidity')"
        color="#3f6fa8"
        :decimals="0"
      />
      <SeriesCard
        title="Solar"
        :subtitle="series.solar?.source ?? ''"
        :short="SHORT.solar"
        unit="W/m²"
        :days="got('solar')"
        :hourly="gotH('solar')"
        color="#d9a410"
        :decimals="0"
      />
      <SeriesCard
        title="Wind"
        :subtitle="series.wind?.source ?? ''"
        :short="SHORT.wind"
        unit="m/s"
        :days="got('wind')"
        :hourly="gotH('wind')"
        color="#4a7a5f"
      />
      <SeriesCard
        title="Boden"
        :subtitle="series.soilMoist?.source ?? ''"
        :short="SHORT.soilMoist"
        unit="%"
        label="Bodenfeuchte"
        :days="got('soilMoist')"
        :hourly="gotH('soilMoist')"
        color="#5b7fb5"
        :secondary="{
          days: got('soilTemp'),
          hourly: gotH('soilTemp'),
          unit: '°C',
          color: '#c97b3d',
          label: 'Bodentemperatur',
        }"
      />
      <LightCard short="Wiese/Licht" />
    </template>
  </aside>

  <!-- mobile-only: one description paragraph per card below the data pane
       (multi-root: becomes a sibling of the aside inside the tab wrapper) -->
  <div v-if="!loading && !error" class="data-descs" aria-label="Quellen-Beschreibungen">
    <p v-for="d in DESCS" :key="d.short">
      <b>{{ d.short }}</b>
      <span>{{ d.full }}</span>
    </p>
  </div>
</template>
