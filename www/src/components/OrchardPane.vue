<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { mountOrchard, type OrchardController } from '../../../orchard/src/main';
import { onDay as onStoreDay, setDay, useTime } from '../store';

const pane = ref<HTMLElement | null>(null);
let ctrl: OrchardController | null = null;
let unsubScene: (() => void) | null = null;
let unsubStore: (() => void) | null = null;

// performance toggles (Gras/Wind): initial state comes from the controller
// (i.e. the orchard CONFIG defaults); switches go through it too, so the
// embedded scene and the programmatic window.__scene3 hook stay in sync
const grass = ref(true);
const wind = ref(true);
const ready = ref(false);

function onGrass(e: Event): void {
  const v = (e.target as HTMLInputElement).checked;
  grass.value = v;
  ctrl?.setGrass(v);
}

async function onWind(e: Event): Promise<void> {
  const v = (e.target as HTMLInputElement).checked;
  wind.value = v;
  await ctrl?.setTreeWind(v);
}

onMounted(async () => {
  if (!pane.value) return;
  ctrl = await mountOrchard(pane.value, { embed: true });
  grass.value = ctrl.grass;
  wind.value = ctrl.treeWind;
  ready.value = true;
  // scene slider → global store (tagged 'scene' so the loop stops there)
  unsubScene = ctrl.onDay((day) => setDay(day, 'scene'));
  // global slider → scene (ignore events that came from the scene itself)
  unsubStore = onStoreDay((day, src) => {
    if (src !== 'scene') ctrl?.setDay(day);
  });
  ctrl.setDay(useTime().day); // initial sync
});

onBeforeUnmount(() => {
  unsubScene?.();
  unsubStore?.();
  ctrl = null;
});
</script>

<template>
  <section ref="pane" class="pane3d" aria-label="3D-Ansicht">
    <div v-show="ready" class="perf-toggles" role="group" aria-label="Leistung">
      <label><input
        type="checkbox"
        :checked="grass"
        title="Gras anzeigen (aus: weniger Rechenlast)"
        @change="onGrass"
      />Gras</label>
      <label><input
        type="checkbox"
        :checked="wind"
        title="Bewegung der Baumkronen (aus: weniger Rechenlast)"
        @change="onWind"
      />Wind</label>
    </div>
  </section>
</template>

<style scoped>
/* bottom-left overlay (top-right holds the scene panel, top-left the
 * compass); dark chip style matching the in-scene controls */
.perf-toggles {
  position: absolute;
  left: 12px;
  bottom: 12px;
  z-index: 10;
  display: flex;
  gap: 12px;
  padding: 6px 12px;
  border: 1px solid rgba(255, 255, 255, 0.25);
  border-radius: 6px;
  background: rgba(20, 24, 28, 0.65);
  font: 13px system-ui, sans-serif;
  color: #eef2f5;
}
.perf-toggles label {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  user-select: none;
}
.perf-toggles input {
  accent-color: #9ac95e;
}
</style>
