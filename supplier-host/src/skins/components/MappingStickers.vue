<script setup lang="ts">
import { ref } from 'vue';

const props = defineProps<{
  visible?: boolean;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'select', sticker: string): void;
}>();

const stickers = ref<string[]>([]);

const close = () => emit('close');
const selectSticker = (sticker: string) => emit('select', sticker);
</script>

<template>
  <div v-if="visible" class="mapping-stickers">
    <div class="stickers-header">
      <span>Mapping Stickers</span>
      <button @click="close">Close</button>
    </div>
    <div class="stickers-content">
      <div v-for="sticker in stickers" :key="sticker" @click="selectSticker(sticker)">
        {{ sticker }}
      </div>
    </div>
  </div>
</template>

<style scoped>
.mapping-stickers {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.8);
  z-index: 1000;
}

.stickers-header {
  display: flex;
  justify-content: space-between;
  padding: 16px;
  background: #333;
  color: white;
}

.stickers-content {
  display: flex;
  flex-wrap: wrap;
  padding: 16px;
}
</style>