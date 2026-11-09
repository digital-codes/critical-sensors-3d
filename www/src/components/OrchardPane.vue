<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { mountOrchard, type OrchardController } from '../../../orchard/src/main';
import { onDay as onStoreDay, setDay, useTime } from '../store';

const pane = ref<HTMLElement | null>(null);
let ctrl: OrchardController | null = null;
let unsubScene: (() => void) | null = null;
let unsubStore: (() => void) | null = null;

onMounted(async () => {
  if (!pane.value) return;
  ctrl = await mountOrchard(pane.value, { embed: true });
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
  <section ref="pane" class="pane3d" aria-label="3D-Ansicht"></section>
</template>
