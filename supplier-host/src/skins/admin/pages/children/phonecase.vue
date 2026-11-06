<script setup lang="ts">
import { add_batch_stock } from '@/api/stock';
import { onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

onMounted(async () => {

})

onUnmounted(async () => {

})


async function addPhonecase(brand_id: string) {
  await add_batch_stock(brand_id)
}

</script>

<template>
  <div class="system-page">
    <h2 class="text-24 font-bold text-gray-800 pb-16 mb-20 border-b border-gray-200">
      {{ t('admin.phonecase.printSettings') }}
    </h2>

    <div class="flex flex-col gap-20 pb-20">
      <el-card shadow="never" class="system-module-card">
        <template #header>
          <span class="text-16 font-bold text-gray-800">{{ t('admin.phonecase.printSettings') }}</span>
        </template>
        <div class="flex justify-end mt-8">
          <el-button type="primary" @click="addPhonecase('Apple')">
            Apple
          </el-button>
          <el-button type="primary" @click="addPhonecase('Google')">
            Google
          </el-button>
          <el-button type="primary" @click="addPhonecase('Samsung')">
            Samsung
          </el-button>
          <el-button type="primary" @click="addPhonecase('Huawei')">
            Huawei
          </el-button>
          <el-button type="primary" @click="addPhonecase('Honor')">
            Honor
          </el-button>
          <el-button type="primary" @click="addPhonecase('Xiaomi')">
            Xiaomi
          </el-button>
          <el-button type="primary" @click="addPhonecase('Oppo')">
            Oppo
          </el-button>
          <el-button type="primary" @click="addPhonecase('Vivo')">
            Vivo
          </el-button>
        </div>
      </el-card>
    </div>
  </div>
</template>

<style scoped>
.system-module-card {
  border-radius: 12px;
  border: none;
  overflow: visible !important;
}

.system-module-card :deep(.el-card__header) {
  padding: 16px 20px;
  border-bottom: 1px solid #f0f0f0;
}

.system-module-card :deep(.el-card__body) {
  padding: 20px;
  overflow: visible;
}

.account-form :deep(.el-form-item) {
  margin-bottom: 18px;
}

.account-form :deep(.el-form-item__label) {
  color: #374151;
  font-weight: 500;
}

.address-combo {
  position: relative;
  width: 100%;
}

.address-combo :deep(.el-input) {
  width: 100%;
}

.address-combo :deep(.el-input__wrapper) {
  padding-right: 40px;
}

.address-preset-select {
  position: absolute;
  right: 0;
  top: 0;
  width: 36px;
  height: 100%;
  z-index: 2;
}

.address-preset-select :deep(.el-select__wrapper) {
  box-shadow: none !important;
  background: transparent;
  padding: 0 8px;
  min-height: 100%;
  height: 100%;
  justify-content: flex-end;
  cursor: pointer;
}

.address-preset-select :deep(.el-select__selection) {
  flex: 0 0 0;
  width: 0;
  min-width: 0;
  overflow: hidden;
  opacity: 0;
  pointer-events: none;
}

.address-preset-select :deep(.el-select__suffix) {
  pointer-events: none;
}

.keyboard-overlay {
  position: fixed;
  inset: 0;
  z-index: 10000;
  background: transparent;
  pointer-events: none;
}

.keyboard-panel {
  position: absolute;
  left: 50%;
  bottom: 24px;
  width: min(1100px, calc(100% - 48px));
  margin-left: calc(min(1100px, calc(100% - 48px)) / -2);
  background: #f4f4f3;
  border-radius: 16px;
  padding: 0 20px 24px;
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.18);
  user-select: none;
  pointer-events: auto;
}

.keyboard-drag-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 0 12px;
  cursor: grab;
  touch-action: none;
}

.keyboard-drag-bar:active {
  cursor: grabbing;
}

.drag-hint {
  font-size: 13px;
  color: #9ca3af;
}

.keyboard-input-preview {
  position: relative;
  margin-bottom: 12px;
}

.keyboard-feedback-input :deep(.el-input__wrapper) {
  min-height: 48px;
  border-radius: 10px;
  box-shadow: 0 0 0 1px #dcdfe6 inset;
}

.keyboard-feedback-input :deep(.el-input__inner) {
  font-size: 18px;
  caret-color: #027bfc;
}

.keyboard-body {
  background: #fff;
  border-radius: 12px;
  padding: 16px 20px;
}

.keyboard-body.is-numeric {
  padding: 12px 16px 8px;
  min-height: 0;
}

/* 数字键盘内容矮，取消 h-full/flex-1 撑开导致的下方留白 */
.keyboard-body.is-numeric :deep(.h-full) {
  height: auto !important;
  flex: none !important;
}

.keyboard-body.is-numeric :deep(.flex-1) {
  flex: none !important;
}
</style>
