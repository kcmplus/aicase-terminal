// 共享的前端代码入口
// 在这里导出共享的组件、工具函数等

export const sharedVersion = '0.1.0';

// 导出涂鸦功能 Composable
export { useDrawing } from './composables/useDrawing';
export type { UseDrawingOptions, UseDrawingReturn } from './composables/useDrawing';

// 导出涂鸦画布组件
export { default as DrawingCanvas } from './components/DrawingCanvas.vue';
export type { DrawPoint, DrawingMode, PopupDrawingMode, DrawingConfig } from './types/drawing';

// 导出油漆桶填充 Composable
export { useBucketFill, createSolidColorImage } from './composables/useBucketFill';

// 导出 EyeDropper 取色器 Composable
export {
  pickColor,
  pickColorNative,
  pickColorFromOverlay,
  sampleColorAtPoint,
  isEyeDropperSupported,
  isTouchPrimary,
} from './composables/useEyeDropper';
export type { PickColorOptions } from './composables/useEyeDropper';

// 导出图层管理类型
export type { LayerCrop, LayerData, LayerTransform, LayerType } from './types/layer';

// 导出图层操作函数
export {
  moveLayerUp,
  moveLayerDown,
  removeLayer,
  reorderLayers,
  toggleLayerVisibility,
} from './composables/layerOperations';

// 导出图层管理组件
export { default as LayerPanel } from './components/LayerPanel.vue';
export { default as LayerItem } from './components/LayerItem.vue';

// 导出拖动排序 composable
export { useDragReorder } from './composables/useDragReorder';
export type { UseDragReorderOptions, UseDragReorderReturn } from './composables/useDragReorder';

// 导出触屏虚拟键盘组件
export { default as VirtualKeyboard } from './components/VirtualKeyboard.vue';

// 导出 IME 多语言虚拟键盘组件
export { default as VirtualKeyboardIME } from './components/ime/VirtualKeyboardIME.vue';
export { preloadIMEEngines } from './components/ime/engineCache';
export type { FontOption } from './components/ime/types';
export type {
  KeyDef, KeyboardLayout, IMEEngine, IMEOutput, IMEState, LanguageConfig,
} from './components/ime/types';
export { enLayout } from './components/ime/layouts/en';
export { ruLayout } from './components/ime/layouts/ru';
export { thLayout } from './components/ime/layouts/th';
export { esLayout } from './components/ime/layouts/es';
export { frLayout } from './components/ime/layouts/fr';
export { ptLayout } from './components/ime/layouts/pt';
export { koLayout } from './components/ime/layouts/ko';
export { zhuyinLayout } from './components/ime/layouts/zhuyin';
export { createAccentLayout } from './components/ime/layouts/qwerty';
export { KoreanEngine } from './components/ime/engines/KoreanEngine';
export { JapaneseEngine } from './components/ime/engines/JapaneseEngine';
export { PinyinEngine } from './components/ime/engines/PinyinEngine';
export { ZhuyinEngine, createZhuyinEngine } from './components/ime/engines/ZhuyinEngine';
export type { KanaMode } from './components/ime/engines/JapaneseEngine';

// 导出 SOS 客服求助 Composable
export { useSos } from './composables/useSos';
export type { UseSosOptions, UseSosReturn, SosStep, FaultTypeOption } from './composables/useSos';

// 导出 SOS 对话框组件
export { default as SosDialog } from './components/SosDialog.vue';

// 导出 SOS 全局浮动按钮组件（在 App.vue 顶层使用，覆盖所有页面）
export { default as SosFloatingButton } from './components/SosFloatingButton.vue';