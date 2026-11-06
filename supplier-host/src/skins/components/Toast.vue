<script setup lang="ts">
import { ref, watch, onMounted } from 'vue';

export type ToastType = 'success' | 'warning' | 'error' | 'info';

interface Props {
  message: string;
  type?: ToastType;
  duration?: number;
  visible?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  type: 'info',
  duration: 3000,
  visible: false
});

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const isVisible = ref(props.visible);
let timer: ReturnType<typeof setTimeout> | null = null;

watch(() => props.visible, (newVal) => {
  isVisible.value = newVal;

  if (newVal && props.duration > 0) {
    if (timer !== null) {
      clearTimeout(timer);
    }

    timer = setTimeout(() => {
      close();
    }, props.duration);
  }
});

const close = () => {
  isVisible.value = false;
  emit('close');

  if (timer !== null) {
    clearTimeout(timer);
    timer = null;
  }
};

onMounted(() => {
  if (props.visible && props.duration > 0) {
    timer = setTimeout(() => {
      close();
    }, props.duration);
  }
});

const getIcon = () => {
  switch (props.type) {
    case 'success':
      return '\u2713';
    case 'error':
      return '\u2716';
    case 'warning':
      return '\u26A0';
    case 'info':
    default:
      return '\u2139';
  }
};
</script>

<template>
  <Teleport to="body">
    <Transition name="toast-fade">
      <div v-if="isVisible" class="toast-container">
        <div class="toast-wrapper" :class="`toast-${type}`" @click="close">
          <div class="toast-icon">{{ getIcon() }}</div>
          <div class="toast-message">{{ message }}</div>
          <button class="toast-close" @click.stop="close">&times;</button>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.toast-container {
  position: fixed;
  top: 2rem;
  left: 50%;
  transform: translateX(-50%);
  z-index: 9999;
  pointer-events: none;
}

.toast-wrapper {
  display: flex;
  align-items: center;
  gap: 1rem;
  min-width: 300px;
  max-width: 500px;
  padding: 1rem 1.5rem;
  background: #ffffff;
  border-radius: 12px;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.2);
  pointer-events: auto;
  cursor: pointer;
  transition: transform 0.2s ease;
}

.toast-wrapper:hover {
  transform: scale(1.02);
}

.toast-icon {
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.2rem;
  font-weight: bold;
  border-radius: 50%;
}

.toast-message {
  flex: 1;
  font-size: 1rem;
  font-weight: 500;
  line-height: 1.5;
  color: #333333;
}

.toast-close {
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  font-size: 1.5rem;
  color: #999999;
  cursor: pointer;
  transition: color 0.2s ease;
  padding: 0;
}

.toast-close:hover {
  color: #333333;
}

.toast-success {
  border-left: 4px solid #4caf50;
}

.toast-success .toast-icon {
  background: #e8f5e9;
  color: #4caf50;
}

.toast-error {
  border-left: 4px solid #f44336;
}

.toast-error .toast-icon {
  background: #ffebee;
  color: #f44336;
}

.toast-warning {
  border-left: 4px solid #ff9800;
}

.toast-warning .toast-icon {
  background: #fff3e0;
  color: #ff9800;
}

.toast-info {
  border-left: 4px solid #2196f3;
}

.toast-info .toast-icon {
  background: #e3f2fd;
  color: #2196f3;
}

.toast-fade-enter-active,
.toast-fade-leave-active {
  transition: all 0.3s ease;
}

.toast-fade-enter-from {
  opacity: 0;
  transform: translateX(-50%) translateY(-20px);
}

.toast-fade-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(-20px);
}

@media (max-width: 768px) {
  .toast-wrapper {
    min-width: 280px;
    max-width: 90vw;
    padding: 0.8rem 1.2rem;
  }

  .toast-message {
    font-size: 0.9rem;
  }
}
</style>
