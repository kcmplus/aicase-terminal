<script setup lang="ts">
/**
 * SOS 全局浮动求助按钮
 * 固定在右下角，点击触发 SosDialog
 * 在 App.vue 顶层引入，覆盖所有页面
 */
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import SosDialog from './SosDialog.vue'

interface Props {
  onLog?: (level: 'info' | 'error', message: string, error?: unknown) => void
}

const props = defineProps<Props>()

const { t } = useI18n({ useScope: 'global' })

const showSos = ref(false)
</script>

<template>
  <div>
    <!-- 浮动 SOS 按钮（圆角矩形样式） -->
    <button
      class="sos-fab"
      @click="showSos = true"
      aria-label="SOS 求助"
    >
      {{ t('home.sos') }}
    </button>

    <!-- SOS 对话框 -->
    <SosDialog
      v-model="showSos"
      :on-log="props.onLog"
    />
  </div>
</template>

<style scoped>
.sos-fab {
  position: fixed;
  right: 2rem;
  bottom: 2rem;
  z-index: 9000;
  background: linear-gradient(135deg, #ff4444 0%, #cc0000 100%);
  color: white;
  border: none;
  border-radius: 50px;
  padding: 0.8rem 1.8rem;
  font-size: 1.1rem;
  font-weight: 700;
  cursor: pointer;
  box-shadow: 0 4px 16px rgba(204, 0, 0, 0.4);
  transition: all 0.3s ease;
}

.sos-fab:hover {
  transform: scale(1.05);
  box-shadow: 0 6px 20px rgba(204, 0, 0, 0.5);
}

.sos-fab:active {
  transform: scale(0.97);
}
</style>
