<script setup lang="ts">
import { computed } from 'vue';
import { setDay, useTime, doyLabel } from '../store';

const time = useTime();
const label = computed(() => doyLabel(time.day + 1));
const text = computed(() => `${label.value.d}. ${label.value.mon} — ${label.value.season}`);

function onInput(e: Event) {
  setDay(Number((e.target as HTMLInputElement).value), 'slider');
}
</script>

<template>
  <div class="time-ctl">
    <label for="zeit">Zeit:</label>
    <input id="zeit" type="range" min="0" max="364" :value="time.day" @input="onInput" />
    <span class="date-readout">{{ text }}</span>
  </div>
</template>
