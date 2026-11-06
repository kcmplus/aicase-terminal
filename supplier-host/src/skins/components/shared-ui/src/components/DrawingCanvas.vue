<template>
  <canvas
    ref="canvasRef"
    :width="width"
    :height="height"
    :style="canvasStyle"
    class="drawing-canvas"
    @mousedown="(e: MouseEvent) => handleCanvasDown(e)"
    @mousemove="handleMouseMove"
    @mouseup="handleMouseUp"
    @mouseleave="handleMouseUp"
    @touchstart="(e: TouchEvent) => handleCanvasTouchStart(e)"
    @touchmove="handleTouchMove"
    @touchend="handleTouchEnd"
    @touchcancel="handleTouchEnd"
  />
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted } from 'vue';
import { useDrawing } from '../composables/useDrawing';
import type { DrawingMode } from '../types/drawing';

interface Props {
  width: number;
  height: number;
  maskImage: string;
  mode: DrawingMode;
  brushColor: string;
  brushSize: number;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  change: [];
}>();

const canvasRef = ref<HTMLCanvasElement | null>(null);
const modeRef = ref<DrawingMode>(props.mode);
const brushColorRef = ref(props.brushColor);
const brushSizeRef = ref(props.brushSize);

// 监听 props 变化
watch(() => props.mode, (newMode) => {
  modeRef.value = newMode;
});

watch(() => props.brushColor, (newColor) => {
  brushColorRef.value = newColor;
});

watch(() => props.brushSize, (newSize) => {
  brushSizeRef.value = newSize;
});

// 使用 useDrawing Composable
const {
  canUndo,
  canRedo,
  undo,
  redo,
  clear,
  initCanvas,
  initTransparent,
  floodFill,
  saveHistory,
  isEmpty,
  onHistoryChange,
  markInitialized,
  handleMouseDown,
  handleMouseMove,
  handleMouseUp,
  handleTouchStart,
  handleTouchMove,
  handleTouchEnd,
} = useDrawing({
  canvasRef,
  mode: modeRef,
  brushColor: brushColorRef,
  brushSize: brushSizeRef,
  maxHistory: 30,
});

const handleBucketClick = (x: number, y: number) => {
  if (modeRef.value === 'bucket') {
    floodFill(x, y, brushColorRef.value);
  }
};

const getCanvasPoint = (clientX: number, clientY: number) => {
  const canvas = canvasRef.value;
  if (!canvas) return null;
  const rect = canvas.getBoundingClientRect();
  const scaleX = rect.width > 0 ? canvas.width / rect.width : 1;
  const scaleY = rect.height > 0 ? canvas.height / rect.height : 1;
  return {
    x: (clientX - rect.left) * scaleX,
    y: (clientY - rect.top) * scaleY,
  };
};

const handleCanvasDown = (e: MouseEvent) => {
  if (modeRef.value === 'bucket') {
    const point = getCanvasPoint(e.clientX, e.clientY);
    if (!point) return;
    handleBucketClick(point.x, point.y);
  } else {
    handleMouseDown(e);
  }
};

const handleCanvasTouchStart = (e: TouchEvent) => {
  if (modeRef.value === 'bucket') {
    if (e.touches.length !== 1) return;
    const touch = e.touches[0];
    const point = getCanvasPoint(touch.clientX, touch.clientY);
    if (!point) return;
    handleBucketClick(point.x, point.y);
  } else {
    handleTouchStart(e);
  }
};

onHistoryChange(() => {
  emit('change');
});

// Canvas 样式（应用遮罩）
const canvasStyle = computed(() => ({
  maskImage: props.maskImage ? `url(${props.maskImage})` : 'none',
  WebkitMaskImage: props.maskImage ? `url(${props.maskImage})` : 'none',
  maskSize: 'contain',
  WebkitMaskSize: 'contain',
  maskRepeat: 'no-repeat',
  WebkitMaskRepeat: 'no-repeat',
  maskPosition: 'center',
  WebkitMaskPosition: 'center',
}));

// 导出为 Canvas
const exportToCanvas = (): HTMLCanvasElement => {
  const exportCanvas = document.createElement('canvas');
  exportCanvas.width = props.width;
  exportCanvas.height = props.height;

  const exportCtx = exportCanvas.getContext('2d');
  if (exportCtx && canvasRef.value) {
    exportCtx.drawImage(canvasRef.value, 0, 0);
  }

  return exportCanvas;
};

// 导出为 Base64
const exportToBase64 = (): string => {
  const canvas = exportToCanvas();
  return canvas.toDataURL('image/png');
};

// 从 Base64 导入
const importFromBase64 = (base64Data: string) => {
  if (!canvasRef.value) return;

  const img = new Image();
  img.onload = () => {
    const ctx = canvasRef.value?.getContext('2d');
    if (ctx && canvasRef.value) {
      ctx.clearRect(0, 0, canvasRef.value.width, canvasRef.value.height);
      ctx.drawImage(img, 0, 0, canvasRef.value.width, canvasRef.value.height);
    }
  };
  img.src = base64Data;
};

onMounted(() => {
  nextTick(() => {
    markInitialized();
  });
});

// 暴露方法
defineExpose({
  clear,
  initCanvas,
  initTransparent,
  undo,
  redo,
  saveHistory,
  exportToCanvas,
  exportToBase64,
  importFromBase64,
  isEmpty,
  canUndo,
  canRedo,
});
</script>

<style scoped>
.drawing-canvas {
  position: absolute;
  top: 0;
  left: 0;
  cursor: crosshair;
  touch-action: none;
}
</style>
