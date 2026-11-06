<script setup lang="ts">
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

defineProps<{ hint?: string }>()

const emit = defineEmits<{
  close: []
  dragStart: [MouseEvent | TouchEvent]
}>()

const onClose = () => emit('close')
</script>

<template>
  <div class="keyboard-drag-bar">
    <div
      class="keyboard-drag-handle"
      @mousedown="emit('dragStart', $event)"
      @touchstart.prevent="emit('dragStart', $event)"
    >
      <span class="drag-hint">{{ hint ?? t('admin.keyboard.dragHint') }}</span>
    </div>
    <button
      type="button"
      class="keyboard-close-btn"
      @click.stop="onClose"
      @touchend.stop.prevent="onClose"
      @touchstart.stop
      @mousedown.stop
    >
      {{ t('admin.keyboard.close') }}
    </button>
  </div>
</template>

<style scoped>
.keyboard-drag-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 0 12px;
}

.keyboard-drag-handle {
  flex: 1;
  min-width: 0;
  cursor: grab;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
}

.keyboard-drag-handle:active {
  cursor: grabbing;
}

.drag-hint {
  font-size: 13px;
  color: #9ca3af;
}

.keyboard-close-btn {
  flex-shrink: 0;
  padding: 6px 12px;
  font-size: 14px;
  line-height: 1.4;
  color: #409eff;
  background: transparent;
  border: none;
  cursor: pointer;
  touch-action: manipulation;
}

.keyboard-close-btn:active {
  opacity: 0.75;
}
</style>
