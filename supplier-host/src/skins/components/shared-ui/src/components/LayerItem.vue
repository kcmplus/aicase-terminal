<template>
  <div
    class="layer-item"
    :class="{
      selected: isSelected,
      dragging: isDragging,
      'drag-over': isDragOver,
      hidden: !layer.visible,
      locked: layer.locked
    }"
    data-layer-item
    @click.stop="$emit('select', layer.id)"
  >
    <div class="layer-main">
      <!-- 缩略图 -->
      <div class="layer-thumbnail">
          <img
            v-if="layer.type !== 'drawing' && layer.type !== 'text'"
            :src="layer.url"
            class="thumbnail-img"
            loading="lazy"
            decoding="async"
            draggable="false"
            style="object-fit: contain"
          />
          <div
            v-else-if="layer.type === 'text'"
            class="thumbnail-text"
            :style="{ color: layer.textMeta?.color || '#333' }"
          >
            {{ (layer.textMeta?.content || 'T').slice(0, 6) }}
          </div>
          <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="thumbnail-icon">
            <path d="M12 19l7-7 3 3-7 7-3-3z"/>
            <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/>
            <path d="M2 2l7.586 7.586"/>
            <circle cx="11" cy="11" r="2"/>
          </svg>
        <!-- frame 图层置顶标记 -->
        <div v-if="layer.type === 'frame'" class="frame-badge">
          <svg viewBox="0 0 24 24" fill="currentColor" width="10" height="10">
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 21 12 17.27 5.82 21 7 14.14 2 9.27l6.91-1.01L12 2z"/>
          </svg>
        </div>
      </div>

      <!-- 名称 -->
      <span class="layer-name">{{ layer.name }}</span>

      <!-- 可见性按钮 -->
      <button
        class="layer-btn visibility-btn"
        data-no-press
        :class="{ 'is-hidden': !layer.visible }"
        :aria-label="layer.visible ? visibilityVisibleText : visibilityHiddenText"
        @click.stop="$emit('toggle-visibility', layer.id)"
      >
        <svg
          class="eye-svg"
          viewBox="0 4 24 16"
          preserveAspectRatio="none"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <g class="eye-shape">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
            <circle class="eye-pupil" cx="12" cy="12" r="3" />
          </g>
          <line class="eye-slash" pathLength="1" x1="1" y1="5" x2="23" y2="19" />
        </svg>
      </button>
    </div>

    <div class="layer-actions">
      <!-- 锁定/解锁 -->
      <button
        class="layer-btn action-btn lock-btn"
        data-no-press
        :class="{ 'is-locked': layer.locked }"
        :aria-label="layer.locked ? unlockText : lockText"
        @click.stop="$emit('toggle-lock', layer.id)"
      >
        <svg
          class="lock-svg"
          viewBox="4 1 16 21"
          preserveAspectRatio="none"
          fill="none"
          :stroke="layer.locked ? '#397f9b' : 'currentColor'"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <rect class="lock-body" x="5" y="11" width="14" height="10" rx="2" ry="2" />
          <path
            class="lock-shackle"
            d="M7 11V7a5 5 0 0110 0v4"
            pathLength="1"
          />
        </svg>
      </button>
      <!-- 上移（frame 图层禁用移动） -->
      <button
        class="layer-btn action-btn"
        :disabled="isFirst || layer.type === 'frame'"
        :title="moveUpText"
        :aria-label="moveUpText"
        @click.stop="$emit('move-up', layer.id)"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="18 15 12 9 6 15"/>
        </svg>
      </button>
      <!-- 下移（frame 图层禁用移动） -->
      <button
        class="layer-btn action-btn"
        :disabled="isLast || layer.type === 'frame'"
        :title="moveDownText"
        :aria-label="moveDownText"
        @click.stop="$emit('move-down', layer.id)"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>
      <!-- 删除 -->
      <button
        class="layer-btn action-btn delete-btn"
        :title="removeText"
        :aria-label="removeText"
        @click.stop="$emit('remove', layer.id)"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="3 6 5 6 21 6"/>
          <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
        </svg>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { LayerData } from '../types/layer';

withDefaults(defineProps<{
  layer: LayerData;
  isSelected: boolean;
  isFirst: boolean;
  isLast: boolean;
  isDragging: boolean;
  isDragOver: boolean;
  visibilityVisibleText?: string;
  visibilityHiddenText?: string;
  lockText?: string;
  unlockText?: string;
  moveUpText?: string;
  moveDownText?: string;
  removeText?: string;
}>(), {
  visibilityVisibleText: '显示图层',
  visibilityHiddenText: '隐藏图层',
  lockText: '锁定图层',
  unlockText: '解锁图层',
  moveUpText: '上移图层',
  moveDownText: '下移图层',
  removeText: '删除图层',
});

defineEmits<{
  select: [id: string];
  'move-up': [id: string];
  'move-down': [id: string];
  remove: [id: string];
  'toggle-visibility': [id: string];
  'toggle-lock': [id: string];
}>();
</script>

<style scoped>
.layer-item {
  display: flex;
  flex-direction: column;
  border-radius: 8px;
  background: #fff;
  cursor: pointer;
  transition: border-color 0.15s ease, opacity 0.15s ease, background-color 0.15s ease;
  user-select: none;
  -webkit-user-drag: none;
  touch-action: none;
  border: 2px solid transparent !important;
}
.layer-item.dragging {
  opacity: 1;
}
.layer-item.drag-over {
  border-color: transparent;
}
.layer-item.hidden {
  opacity: 0.5;
}
.layer-item.locked {
  background: #fff8f0;
  border-color: rgba(255, 87, 34, 0.3);
}

.layer-main {
  display: flex;
  align-items: center;
  gap: 8px;
}

.layer-thumbnail {
  width: 36px;
  height: 36px;
  border-radius: 4px;
  overflow: visible;
  background: #f0f0f0;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
}
.thumbnail-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.thumbnail-icon {
  width: 20px;
  height: 20px;
  color: #666;
}
.thumbnail-text {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 700;
  line-height: 1.1;
  text-align: center;
  overflow: hidden;
  word-break: break-all;
  padding: 2px;
}
.frame-badge {
  position: absolute;
  top: -2px;
  right: -2px;
  width: 14px;
  height: 14px;
  background: #FF9800;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
}
.frame-badge svg {
  width: 8px;
  height: 8px;
}

.layer-name {
  flex: 1;
  font-size: 12px;
  font-weight: 600;
  color: #333;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.layer-actions {
  display: flex;
  justify-content: flex-end;
  gap: 4px;
  margin-top: 4px;
}

.layer-btn {
  border: none;
  background: transparent;
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  touch-action: none;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s ease;
}

.layer-btn:hover:not(:disabled) {
  background: rgba(0,0,0,0.08);
}
.visibility-btn:hover:not(:disabled),
.lock-btn:hover:not(:disabled) {
  background: transparent;
}
.layer-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}
.layer-btn svg {
  width: 16px;
  height: 16px;
}

.visibility-btn {
  margin-left: auto;
  color: #666;
}
.action-btn {
  color: #666;
}
.delete-btn {
  color: #f44336;
}
.lock-btn {
  color: #666;
  transition: color 0.28s ease, background 0.15s ease;
}
.lock-btn.is-locked {
  color: #397f9b !important;
}
.lock-btn.is-locked .lock-svg,
.lock-btn.is-locked .lock-body,
.lock-btn.is-locked .lock-shackle {
  stroke: #397f9b;
}

/* 眼睛：斜线绘制 + 瞳孔缩放 */
.eye-svg {
  overflow: visible;
}
.eye-shape {
  transform-origin: 12px 12px;
  transition: opacity 0.28s ease, transform 0.28s ease;
}
.eye-pupil {
  transform-origin: 12px 12px;
  transform-box: fill-box;
  transform: scale(1);
  transition: transform 0.28s cubic-bezier(0.34, 1.4, 0.64, 1), opacity 0.22s ease;
}
.eye-slash {
  stroke-dasharray: 1;
  stroke-dashoffset: 1;
  transition: stroke-dashoffset 0.32s cubic-bezier(0.4, 0, 0.2, 1);
}
.visibility-btn.is-hidden .eye-shape {
  opacity: 0.45;
  transform: scale(0.96);
}
.visibility-btn.is-hidden .eye-pupil {
  transform: scale(0);
  opacity: 0;
}
.visibility-btn.is-hidden .eye-slash {
  stroke-dashoffset: 0;
}

/* 锁：环扣抬起/落下 + 描边绘制 */
.lock-svg {
  overflow: visible;
}
.lock-body {
  transition: transform 0.28s ease;
}
.lock-shackle {
  transform-origin: 7px 11px;
  transform-box: view-box;
  stroke-dasharray: 1;
  stroke-dashoffset: 0;
  transition:
    transform 0.34s cubic-bezier(0.34, 1.3, 0.64, 1),
    stroke-dashoffset 0.34s cubic-bezier(0.4, 0, 0.2, 1);
}
.lock-btn:not(.is-locked) .lock-shackle {
  transform: rotate(-28deg) translate(-0.5px, -1px);
  stroke-dashoffset: 0.18;
}
.lock-btn.is-locked .lock-shackle {
  transform: rotate(0deg) translate(0, 0);
  stroke-dashoffset: 0;
}
</style>
