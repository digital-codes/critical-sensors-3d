<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';

/** Info button + popup: project description and credits as an overlay on
 *  the dashboard — NOT a separate page (navigating away and back would
 *  tear down and reload the running 3D simulation). The scene keeps
 *  rendering behind the modal. */

const open = ref(false);

function onKey(e: KeyboardEvent): void {
  if (e.key === 'Escape') open.value = false;
}
onMounted(() => window.addEventListener('keydown', onKey));
onBeforeUnmount(() => window.removeEventListener('keydown', onKey));
</script>

<template>
  <button
    class="info-btn"
    type="button"
    aria-label="Informationen und Quellen"
    :aria-expanded="open"
    @click="open = !open"
  >i</button>

  <Teleport to="body">
    <div v-if="open" class="info-overlay" @click.self="open = false">
      <div class="info-modal" role="dialog" aria-modal="true" aria-label="Informationen und Quellen">
        <button class="info-close" type="button" aria-label="Schließen" @click="open = false">×</button>

        <div class="info-title">
          <img class="info-logo" src="/site/logo.png" alt="Katzenwedelwiesen Logo" />
          <h2>Katzenwedelwiesen</h2>
        </div>
        <p class="info-lead">
          Umweltbeobachtung auf der Katzenwedelwiese: Live-Messwerte aus dem Sensornetz,
          eine jahreszeitliche 3D-Simulation der Streuobstwiese und die Wiesen-Fotoreihe
          im unteren Streifen.
        </p>

        <h3>Datenquellen</h3>
        <ul>
          <li>Messwerte: DWD (© Deutscher Wetterdienst), ICOS ERIC AS_KIT (CC BY 4.0),
              SensorCity, Stadt Karlsruhe</li>
          <li>Gelände &amp; Luftbilder: LGL Baden-Württemberg (dl-de/by-2-0)</li>
          <li>Baumkataster &amp; LoD2-Stadtmodell: Stadt Karlsruhe (CC BY 4.0)</li>
          <li>Gehölzbestand: OpenStreetMap-Mitwirkende (ODbL)</li>
          <li>Karte: © GeoBasis-DE/BKG ({{ new Date().getFullYear() }}) CC BY 4.0
              (<a href="https://www.bkg.bund.de/" target="_blank" rel="noopener">bkg.bund.de</a>)</li>
          <li>ZKM-Kubus-Foto: © JOEXX, CC BY-SA 3.0, via
              <a href="https://commons.wikimedia.org/wiki/File:ZKM_Kubus_.jpg" target="_blank"
                rel="noopener">Wikimedia Commons</a></li>
          <li>Fotos: Projektarchiv Katzenwedelwiesen</li>
        </ul>

        <h3>Technik &amp; Credits</h3>
        <ul>
          <li>Vue 3 + Vite · three.js (3D-Szene, Jahreszeiten, Vogelflug)</li>
          <li>Baumgenerierung: ez-tree</li>
          <li>Foto-Wischeffekt: ImgSmear</li>
          <li>Schrift: Mohave (SIL Open Font License)</li>
          <li>Sensor-API: PHP/MySQL hinter /php (nur lesend)</li>
        </ul>

        <p class="info-foot">
          Die Baumsimulation dient der Veranschaulichung; Messwerte und Fotos sind echt.<br>
          Vorgängerprojekt: <a href="https://critical-sensors.de/"
            target="_blank" rel="noopener">critical-sensors.de</a><br>
          Quellcode: <a href="https://github.com/digital-codes/critical-sensors-3d"
            target="_blank" rel="noopener">github.com/digital-codes/critical-sensors-3d</a>
        </p>

        <h3>Impressum &amp; Datenschutz</h3>
        <p class="info-legal">
          <strong>Angaben gemäß § 5 DDG</strong><br>
          Dr. Andreas Kugel<br>
          Karolinenstr. 4<br>
          76135 Karlsruhe<br>
          E-Mail: info@digital-codes.de<br>
        </p>
        <p class="info-legal">
          Angebot zu Forschungs- und Demonstrationszwecken; keine Gewähr für
          Richtigkeit und Vollständigkeit der dargestellten Daten.
          Diese Seite lädt Messwerte und Fotos ausschließlich von diesem Server
          und setzt keine Tracking-Cookies. Beim Aufruf werden technisch
          notwendige Daten (IP-Adresse, Zeitpunkt, angeforderte Ressource) in
          Server-Logfiles verarbeitet und nach kurzer Zeit automatisch gelöscht.
          Externe Links (z.&nbsp;B. GitHub) öffnen in einem neuen Tab; für deren
          Inhalte gelten die Datenschutzangaben der jeweiligen Anbieter.
        </p>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.info-btn {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  border: 1px solid var(--line, #888);
  background: var(--panel, #eee);
  color: var(--ink, #222);
  font: italic 700 16px/1 Georgia, serif;
  cursor: pointer;
  flex: 0 0 auto;
}
.info-btn:hover { background: var(--accent-soft, #d8e8c8); }

.info-overlay {
  position: fixed;
  inset: 0;
  /* above Leaflet's controls/popups (z-index up to 1000 inside the map) */
  z-index: 1100;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}
.info-modal {
  position: relative;
  max-width: 680px;
  width: min(92vw, 680px);
  max-height: 88dvh;
  overflow: auto;
  /* solid — the dashboard's --panel is translucent, the popup must not be */
  background: #faf9f5;
  color: #222;
  border-radius: 14px;
  padding: 26px 30px 18px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.35);
}
.info-close {
  position: absolute;
  top: 10px;
  right: 14px;
  border: 0;
  background: none;
  font-size: 26px;
  line-height: 1;
  cursor: pointer;
  color: #222;
}
.info-title {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-right: 28px;
}
.info-logo {
  width: 40px;
  height: 40px;
  object-fit: contain;
  flex: 0 0 auto;
}
.info-modal h2 {
  margin: 0;
  font-size: 22px;
  letter-spacing: 0.04em;
}
.info-modal h3 {
  margin: 16px 0 5px;
  font-size: 14px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  opacity: 0.75;
}
.info-lead { margin: 0 0 4px; font-size: 16px; line-height: 1.55; }
.info-modal ul { margin: 4px 0; padding-left: 20px; font-size: 15px; line-height: 1.6; }
.info-foot { margin: 14px 0 0; font-size: 14px; opacity: 0.85; }
.info-foot a { color: #2e5d1f; }
</style>
