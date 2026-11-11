<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

/** PoIs (WGS84): Katzenwedelwiesen = OSM node 11804686686, ZKM = centre of
 *  OSM way 224089410 */
const KATZENWEDELWIESEN: L.LatLngTuple = [48.9899695, 8.3876071];
const ZKM: L.LatLngTuple = [49.001303, 8.38359];

const mapEl = ref<HTMLDivElement | null>(null);
let map: L.Map | null = null;
let resizeObserver: ResizeObserver | null = null;
/** the initial fitBounds only runs once the container has a real size —
 *  the Daten tab can be display:none at mount time (tab layout) */
let fitted = false;

function fitInitial(): void {
  if (!map || fitted || !mapEl.value || mapEl.value.clientWidth === 0) return;
  fitted = true;
  map.fitBounds([KATZENWEDELWIESEN, ZKM], { padding: [24, 24] });
}

onMounted(() => {
  if (!mapEl.value) return;

  // Fix Leaflet's default icon paths under Vite (bundle the marker images)
  delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: markerIcon2x,
    iconUrl: markerIcon,
    shadowUrl: markerShadow,
  });

  map = L.map(mapEl.value);

  // BaseMapDE raster (BKG) — tile entry from klimaDashboard SimpleMap.vue
  L.tileLayer(
    'https://sgx.geodatenzentrum.de/wmts_basemapde/tile/1.0.0/de_basemapde_web_raster_farbe/default/GLOBAL_WEBMERCATOR/{z}/{y}/{x}.png',
    {
      maxZoom: 19,
      attribution:
        '&copy; <a href="https://www.bkg.bund.de" target="_blank" rel="noopener">GeoBasis-DE/BKG (' +
        new Date().getFullYear() +
        ')</a> | <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener">CC BY 4.0</a>',
    },
  ).addTo(map);

  L.marker(KATZENWEDELWIESEN)
    .addTo(map)
    .bindPopup(
      '<b>Katzenwedelwiesen</b><br>' +
        '<img src="/site/logo.png" alt="Katzenwedelwiesen Logo" width="140" loading="lazy">',
    );
  L.marker(ZKM)
    .addTo(map)
    .bindPopup(
      '<b>ZKM</b><br>' +
        '<a href="https://commons.wikimedia.org/wiki/File:ZKM_Kubus_.jpg" target="_blank" rel="noopener">' +
        '<img src="https://upload.wikimedia.org/wikipedia/commons/thumb/3/3d/ZKM_Kubus_.jpg/330px-ZKM_Kubus_.jpg" ' +
        'alt="ZKM Kubus" width="160" loading="lazy"></a><br>' +
        '<em>&copy; <a href="https://commons.wikimedia.org/wiki/File:ZKM_Kubus_.jpg" target="_blank" rel="noopener">' +
        'JOEXX, CC BY-SA 3.0, via Wikimedia Commons</a></em>',
    );

  fitInitial();

  // hidden panes (display:none tabs) mount with size 0 — refit once the
  // container gets its real size; afterwards the user's view is kept
  resizeObserver = new ResizeObserver(() => {
    if (!map) return;
    map.invalidateSize();
    fitInitial();
  });
  resizeObserver.observe(mapEl.value);
});

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  resizeObserver = null;
  map?.remove();
  map = null;
});
</script>

<template>
  <section class="card map-card" aria-label="Karte">
    <div class="card-hd">
      <h2>Karte</h2>
      <span class="src short">Karte</span>
      <span class="src long">BasemapDE</span>
    </div>
    <div ref="mapEl" class="map-body"></div>
  </section>
</template>

<style scoped>
.map-body {
  flex: 1 1 auto;
  min-height: 200px;
  margin-top: 4px;
  border-radius: 8px;
  overflow: hidden;
}
</style>
