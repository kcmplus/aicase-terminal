<template>
    <div
      ref="listRef"
      class="panel-list"
      v-bind="containerHandlers"
    >
      <div
        v-for="(layer, displayIndex) in reversedLayers"
        :key="layer.id"
        class="layer-drag-wrapper bg-#feecf5 pt-17 px-10 pb-21"
        :class="{ 'is-selected': selectedLayerId === layer.id }"
        :data-layer-item="true"
        v-bind="getItemAttrs(displayIndex)"
      >
        <div
          class="layer-divider w-full h-1px mb-24"
          :class="selectedLayerId === layer.id ? 'is-selected' : ''"
        />
        <LayerItem
          :layer="layer"
          :is-selected="selectedLayerId === layer.id"
          :is-first="displayIndex === 0"
          :is-last="displayIndex === reversedLayers.length - 1"
          :is-dragging="draggingIndex === displayIndex"
          :is-drag-over="dragOverIndex === displayIndex"
          :visibility-visible-text="visibilityVisibleText"
          :visibility-hidden-text="visibilityHiddenText"
          :lock-text="lockText"
          :unlock-text="unlockText"
          :move-up-text="moveUpText"
          :move-down-text="moveDownText"
          :remove-text="removeText"
          @select="$emit('select', $event)"
          @move-up="$emit('move-up', $event)"
          @move-down="$emit('move-down', $event)"
          @remove="$emit('remove', $event)"
          @toggle-visibility="$emit('toggle-visibility', $event)"
          @toggle-lock="$emit('toggle-lock', $event)"
        />
      </div>
      <div v-if="reversedLayers.length === 0" class="empty-hint">
        {{ emptyText }}
      </div>
    </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import type { LayerData } from '../types/layer';
import LayerItem from './LayerItem.vue';
import { useDragReorder } from '../composables/useDragReorder';

const props = withDefaults(defineProps<{
  layers: LayerData[];
  selectedLayerId: string | null;
  title?: string;
  emptyText?: string;
  visibilityVisibleText?: string;
  visibilityHiddenText?: string;
  lockText?: string;
  unlockText?: string;
  moveUpText?: string;
  moveDownText?: string;
  removeText?: string;
}>(), {
  title: '图层',
  emptyText: '暂无图层',
  visibilityVisibleText: '显示图层',
  visibilityHiddenText: '隐藏图层',
  lockText: '锁定图层',
  unlockText: '解锁图层',
  moveUpText: '上移图层',
  moveDownText: '下移图层',
  removeText: '删除图层',
});

const emit = defineEmits<{
  select: [id: string];
  'move-up': [id: string];
  'move-down': [id: string];
  remove: [id: string];
  reorder: [fromIndex: number, toIndex: number];
  'toggle-visibility': [id: string];
  'toggle-lock': [id: string];
}>();

const titleText = computed(() => props.title);
const emptyText = computed(() => props.emptyText);

const reversedLayers = computed(() => [...props.layers].reverse());

const listRef = ref<HTMLElement | null>(null);

const { draggingIndex, dragOverIndex, containerHandlers, getItemAttrs, bindContainer } = useDragReorder({
  onReorder: (fromIndex, toIndex) => {
    emit('reorder', fromIndex, toIndex);
  },
  onActivate: (displayIndex) => {
    const layer = reversedLayers.value[displayIndex];
    if (layer) emit('select', layer.id);
  },
});

watch(listRef, (el) => {
  bindContainer(el);
}, { flush: 'post', immediate: true });

onBeforeUnmount(() => {
  bindContainer(null);
});
</script>

<style scoped>
.layer-panel {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  border-radius: 12px;
  overflow: hidden;
  width: 160px;
  max-height: 500px;
}

.panel-header {
  padding: 10px 12px;
  font-size: 13px;
  font-weight: 700;
  color: #333;
  border-bottom: 1px solid #eee;
  text-align: center;
}

.panel-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
  padding: 6px;
  display: flex;
  flex-direction: column;
  gap: 16px !important;
  /* 触摸滚动由 JS 手动驱动，避免子元素抢手势导致滚不动 */
  touch-action: none;
}

.layer-drag-wrapper {
  touch-action: none;
  flex-shrink: 0;
  position: relative;
  transition: margin 0.18s ease, max-height 0.18s ease, opacity 0.18s ease, border-color 0.15s ease;
  border-radius: 13px !important;
  box-shadow:
    0 2px 5px 0 rgba(0, 0, 0, 0.25),
    inset 0 4px 4px 0 rgba(255, 216, 228, 0.4);
  border: 3px solid transparent;
}

.layer-drag-wrapper.is-selected {
  border-color: #80bfd8;
}

.layer-divider {
  background-color: #ffbada;
  transition: background-color 0.15s ease;
}

.layer-divider.is-selected {
  background-color: #80bfd8;
}

.layer-drag-wrapper.layer-dragging {
  /* 原项收起；悬浮缩小克隆在 body 上 */
  pointer-events: none;
  overflow: hidden;
}
 
.layer-drag-wrapper.layer-dragging.layer-drag-slot {
  overflow: visible;
  opacity: 1;
}

/* 原位空隙：被拖项占位槽本身画虚线框 */
.layer-drag-wrapper.layer-drag-slot::before {
  content: '';
  position: absolute;
  inset: 4px;
  border-radius: 10px;
  border: 1.5px dashed rgba(33, 150, 243, 0.55);
  background: rgba(33, 150, 243, 0.08);
  box-sizing: border-box;
  pointer-events: none;
}

.layer-drag-wrapper.layer-drag-over {
  border-top: none;
}

.layer-drag-wrapper.layer-drag-over::before {
  content: '';
  position: absolute;
  left: 4px;
  right: 4px;
  top: calc(-1 * var(--layer-drop-gap, 0px) + 4px);
  height: calc(var(--layer-drop-gap, 0px) - 8px);
  border-radius: 10px;
  border: 1.5px dashed rgba(33, 150, 243, 0.55);
  background: rgba(33, 150, 243, 0.08);
  box-sizing: border-box;
  pointer-events: none;
}

.layer-drag-wrapper.layer-drag-over-after {
  border-top: none;
  border-bottom: none;
}

.layer-drag-wrapper.layer-drag-over-after::after {
  content: '';
  position: absolute;
  left: 4px;
  right: 4px;
  bottom: calc(-1 * var(--layer-drop-gap, 0px) + 4px);
  height: calc(var(--layer-drop-gap, 0px) - 8px);
  border-radius: 10px;
  border: 1.5px dashed rgba(33, 150, 243, 0.55);
  background: rgba(33, 150, 243, 0.08);
  box-sizing: border-box;
  pointer-events: none;
}

.empty-hint {
  padding: 20px 10px;
  text-align: center;
  color: #999;
  font-size: 12px;
}
</style>
