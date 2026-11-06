<script setup lang="ts">
// 触屏虚拟键盘组件（QWERTY 布局）
// 用于在无实体键盘的触屏设备上输入短码

import { useI18n } from 'vue-i18n';

defineProps<{
  value: string
  maxLength?: number
}>();

const { t } = useI18n({ useScope: 'global' });

const emit = defineEmits<{
  (e: 'input', char: string): void
  (e: 'delete'): void
  (e: 'confirm'): void
  (e: 'close'): void
}>();

const rows = [
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
  ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
  ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
  ['Z', 'X', 'C', 'V', 'B', 'N', 'M'],
];
</script>

<template>
  <!-- 使用 Teleport 挂载到 body，避免层叠上下文问题导致键盘不显示 -->
  <Teleport to="body">
  <div class="vkb-overlay" @click.self="emit('close')">
    <div class="vkb-panel">
      <!-- 当前输入显示 -->
      <div class="vkb-display">
        <span class="vkb-value">{{ value }}</span>
        <button class="vkb-close-btn" @click="emit('close')">✕</button>
      </div>

      <!-- 按键区域 -->
      <div class="vkb-keys">
        <div v-for="(row, ri) in rows" :key="ri" class="vkb-row">
          <button
            v-for="key in row"
            :key="key"
            class="vkb-key"
            @click="emit('input', key)"
          >{{ key }}</button>

          <!-- 最后一行额外加 删除 和 确认 -->
          <template v-if="ri === rows.length - 1">
            <button class="vkb-key vkb-del" @click="emit('delete')">⌫</button>
            <button class="vkb-key vkb-confirm" @click="emit('confirm')">Enter</button>
          </template>
        </div>
      </div>
    </div>
  </div>
  </Teleport>
</template>

<style scoped>
.vkb-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 9999;
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.vkb-panel {
  width: 100%;
  max-width: 900px;
  background: #1a1a1a;
  border-radius: 20px 20px 0 0;
  padding: 16px 12px 24px;
}

.vkb-display {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #2d2d2d;
  border-radius: 12px;
  padding: 12px 16px;
  margin-bottom: 16px;
}

.vkb-value {
  font-size: 1.8rem;
  font-weight: 700;
  letter-spacing: 4px;
  color: #fff;
  font-family: monospace;
  flex: 1;
}

.vkb-close-btn {
  background: none;
  border: none;
  color: #888;
  font-size: 1.4rem;
  cursor: pointer;
  padding: 4px 8px;
}

.vkb-keys {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.vkb-row {
  display: flex;
  gap: 6px;
  justify-content: center;
}

.vkb-key {
  flex: 1;
  max-width: 70px;
  height: 56px;
  background: #3a3a3a;
  border: none;
  border-radius: 10px;
  color: #fff;
  font-size: 1.3rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s;
  font-family: monospace;
}

.vkb-key:active {
  background: #555;
}

.vkb-del {
  background: #5a2d2d;
  max-width: 90px;
  font-size: 1.5rem;
}

.vkb-del:active {
  background: #7a3d3d;
}

.vkb-confirm {
  background: #1a6b3c;
  max-width: 130px;
  font-size: 1.1rem;
}

.vkb-confirm:active {
  background: #25934f;
}
</style>
