<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import ImgSmear from '@imgsmear/components/ImgSmear.vue';
import photos from '../../../orchard/src/photos.json';

/** The six archived meadow photos (2020/21 series) — the later 2026
 *  entries in photos.json are tower-measurement shots, not part of the
 *  streak. Per decision the streak is a pure image animation: it does NOT
 *  drive the 3D simulation day (no store sync either way). */
const PHOTOS = photos.filter((p) => p.date < '2022-01-01');

const idx = ref(0);
const active = computed(() => PHOTOS[idx.value]);
const stage = ref<HTMLDivElement | null>(null);
/** ImgSmear requires the container prop at ITS mount time — render it only
 *  once this component is mounted and the stage ref is populated. */
const ready = ref(false);
onMounted(() => {
  ready.value = true;
});

function advance(): void {
  idx.value = (idx.value + 1) % PHOTOS.length;
}

function jump(i: number): void {
  idx.value = i;
}

const label = (date: string): string =>
  new Date(date).toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: '2-digit' });
</script>

<template>
  <section class="streak-panel" aria-label="Wiesen-Fotoreihe">
    <div ref="stage" class="streak-stage">
      <ImgSmear
        v-if="ready"
        mode="shader"
        :img="active.file"
        :img-b="PHOTOS[(idx + 1) % PHOTOS.length].file"
        :delay-ms="25"
        :step-columns="4"
        :band="0.12"
        :tgl="false"
        :container="stage ?? undefined"
        @wrapped="advance"
      />
    </div>
    <div class="streak-markers">
      <button
        v-for="(p, i) in PHOTOS"
        :key="p.file"
        class="streak-marker"
        :class="{ active: i === idx }"
        :aria-label="`Foto vom ${label(p.date)} zeigen`"
        @click="jump(i)"
      >
        {{ label(p.date) }}
      </button>
    </div>
  </section>
</template>
