<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import type { KeyDef, KeyboardLayout, IMEEngine, LanguageConfig, FontOption } from './types';
import { enLayout } from './layouts/en';
import { ruLayout } from './layouts/ru';
import { thLayout } from './layouts/th';
import { esLayout } from './layouts/es';
import { frLayout } from './layouts/fr';
import { ptLayout } from './layouts/pt';
import { koLayout } from './layouts/ko';
import { zhuyinLayout } from './layouts/zhuyin';
import { JapaneseEngine } from './engines/JapaneseEngine';
import { getOrCreateEngine } from './engineCache';
import type { KanaMode } from './engines/JapaneseEngine';

interface Props {
  modelValue: string;
  visible?: boolean;
  /** 可用语言列表 (默认全部) */
  languages?: string[];
  /** 初始语言 */
  initialLang?: string;
  /** 占位文本 */
  placeholder?: string;
  /** 确认按钮文本 */
  confirmLabel?: string;
  /** 外部语言配置（覆盖内置） */
  languageConfigs?: LanguageConfig[];
  /** 颜色预设列表 */
  colorPresets?: string[];
  /** 当前文字颜色 */
  fontColor?: string;
  /** 当前字号 */
  fontSize?: number;
  /** 当前字体 family */
  fontFamily?: string;
  /** 可用字体列表 */
  fontList?: FontOption[];
}

const props = withDefaults(defineProps<Props>(), {
  visible: true,
  languages: () => ['en', 'zh', 'zh-TW', 'ja', 'ko', 'ru', 'es', 'fr', 'pt', 'th'],
  initialLang: 'en',
  placeholder: '',
  confirmLabel: '✓',
  colorPresets: () => [
    '#000000', '#FFFFFF', '#FF0000', '#FF6B00', '#FFD600',
    '#00C853', '#2979FF', '#AA00FF', '#FF4081', '#795548',
  ],
  fontColor: '#000000',
  fontSize: 48,
  fontFamily: 'sans-serif',
  fontList: () => [],
});

const emit = defineEmits<{
  'update:modelValue': [value: string];
  'confirm': [];
  'close': [];
  'lang-change': [lang: string];
  'update:fontColor': [color: string];
  'update:fontSize': [size: number];
  'update:fontFamily': [family: string];
}>();

// ── 字体/颜色/字号 ──

const showFontDropdown = ref(false);
const showColorPicker = ref(false);

const selectColor = (color: string) => {
  emit('update:fontColor', color);
  showColorPicker.value = false;
};

const selectFont = (font: FontOption) => {
  emit('update:fontFamily', font.family);
  showFontDropdown.value = false;
};

const adjustFontSize = (delta: number) => {
  const newSize = Math.max(12, Math.min(200, props.fontSize + delta));
  emit('update:fontSize', newSize);
};

const currentFontName = computed(() => {
  if (props.fontList.length > 0) {
    const found = props.fontList.find(f => f.family === props.fontFamily);
    if (found) return found.name;
  }
  if (props.fontFamily === 'sans-serif') return 'Sans';
  if (props.fontFamily === 'serif') return 'Serif';
  return props.fontFamily;
});

// ── 内置布局注册 ──

const builtinLayouts: Record<string, KeyboardLayout> = {
  en: enLayout,
  ru: ruLayout,
  th: thLayout,
  es: esLayout,
  fr: frLayout,
  pt: ptLayout,
  ko: koLayout,
  zh: { ...enLayout, lang: 'zh', name: '拼', hasIME: true },
  'zh-TW': zhuyinLayout,
  ja: { ...enLayout, lang: 'ja', name: 'あ', hasIME: true },
};

// ── 响应式状态 ──

const currentLang = ref(props.initialLang);
const isShift = ref(false);
const isNumberMode = ref(false);
const composition = ref('');
const candidates = ref<string[]>([]);
const candidatePage = ref(0);
const activeEngine = ref<IMEEngine | null>(null);
const showVariants = ref(false);
const variantChars = ref<string[]>([]);
const longPressTimer = ref<ReturnType<typeof setTimeout> | null>(null);
const kanaMode = ref<KanaMode>('hiragana');

// 每页候选词数量
const CANDIDATES_PER_PAGE = 5;

// ── 计算属性 ──

const availableLanguages = computed(() =>
  props.languages.filter(lang => builtinLayouts[lang] || props.languageConfigs?.find(c => c.code === lang))
);

const currentLayout = computed((): KeyboardLayout => {
  const ext = props.languageConfigs?.find(c => c.code === currentLang.value);
  if (ext) return ext.layout;
  return builtinLayouts[currentLang.value] || enLayout;
});

const displayRows = computed(() => {
  if (isNumberMode.value) {
    return [currentLayout.value.numberRow, ...currentLayout.value.rows.slice(1)];
  }
  return currentLayout.value.rows;
});

const pagedCandidates = computed(() => {
  const start = candidatePage.value * CANDIDATES_PER_PAGE;
  return candidates.value.slice(start, start + CANDIDATES_PER_PAGE);
});

const hasPrevPage = computed(() => candidatePage.value > 0);
const hasNextPage = computed(() =>
  (candidatePage.value + 1) * CANDIDATES_PER_PAGE < candidates.value.length
);

const showCandidateBar = computed(() =>
  currentLayout.value.hasIME && (composition.value.length > 0 || candidates.value.length > 0)
);

const isJapanese = computed(() => currentLang.value === 'ja');
const isKorean = computed(() => currentLang.value === 'ko');

// ── 方法 ──

const getKeyLabel = (key: KeyDef): string => {
  if (key.action) {
    if (key.action === 'enter') return props.confirmLabel;
    return key.label || '';
  }
  if (isShift.value && key.shift) return key.shift;
  return key.char || key.label || '';
};

const getKeyValue = (key: KeyDef): string => {
  if (isShift.value && key.shift) return key.shift;
  return key.char || '';
};

const getKeyClass = (key: KeyDef): Record<string, boolean> => ({
  'ime-key': true,
  'ime-key--action': !!key.action,
  'ime-key--shift': key.action === 'shift',
  'ime-key--shift-active': key.action === 'shift' && isShift.value,
  'ime-key--backspace': key.action === 'backspace',
  'ime-key--space': key.action === 'space',
  'ime-key--enter': key.action === 'enter',
  'ime-key--lang': key.action === 'lang',
  'ime-key--number': key.action === 'number',
  'ime-key--number-active': key.action === 'number' && isNumberMode.value,
  'ime-key--has-variants': !!key.variants && key.variants.length > 0,
});

const getKeyWidth = (key: KeyDef): string => {
  const w = key.width || 1;
  if (key.action === 'space') return `${w * 60}px`;
  return `${w * 42}px`;
};

const commitText = (text: string) => {
  emit('update:modelValue', props.modelValue + text);
};

const handleBackspace = () => {
  if (activeEngine.value && activeEngine.value.getState().hasComposition) {
    const result = activeEngine.value.backspace();
    composition.value = result.composition;
    candidates.value = result.candidates;
    candidatePage.value = 0;
    if (result.committed) commitText(result.committed);
  } else if (props.modelValue.length > 0) {
    emit('update:modelValue', props.modelValue.slice(0, -1));
  }
};

const handleCharInput = (char: string) => {
  if (activeEngine.value) {
    const result = activeEngine.value.input(char);
    composition.value = result.composition;
    candidates.value = result.candidates;
    candidatePage.value = 0;
    if (result.committed) commitText(result.committed);
  } else {
    commitText(char);
  }
  // 自动关闭 Shift（单次大写）
  if (isShift.value) isShift.value = false;
};

const handleKeyPress = (key: KeyDef) => {
  if (showVariants.value) {
    showVariants.value = false;
    return;
  }
  if (key.action) {
    switch (key.action) {
      case 'shift':
        isShift.value = !isShift.value;
        break;
      case 'backspace':
        handleBackspace();
        break;
      case 'space':
        if (activeEngine.value && activeEngine.value.getState().hasComposition) {
          if (candidates.value.length > 0) {
            selectCandidate(0);
          } else if ('commit' in activeEngine.value && typeof (activeEngine.value as any).commit === 'function') {
            // Korean/Japanese: commit buffer then add space
            const result = (activeEngine.value as any).commit();
            if (result.committed) commitText(result.committed);
            composition.value = '';
            candidates.value = [];
            commitText(' ');
          } else {
            handleCharInput(' ');
          }
        } else {
          commitText(' ');
        }
        break;
      case 'enter':
        // 有未提交的组合先提交
        if (activeEngine.value && activeEngine.value.getState().hasComposition) {
          const state = activeEngine.value.getState();
          if (state.candidates.length > 0) {
            selectCandidate(0);
          }
          activeEngine.value.reset();
          composition.value = '';
          candidates.value = [];
        }
        emit('confirm');
        break;
      case 'lang':
        switchLanguage();
        break;
      case 'number':
        isNumberMode.value = !isNumberMode.value;
        break;
    }
  } else {
    const value = getKeyValue(key);
    if (value) handleCharInput(value);
  }
};

const handleKeyLongPress = (key: KeyDef) => {
  if (key.variants && key.variants.length > 0) {
    variantChars.value = key.variants;
    showVariants.value = true;
  }
};

const handlePointerDown = (key: KeyDef) => {
  if (key.action) return;
  longPressTimer.value = setTimeout(() => {
    handleKeyLongPress(key);
  }, 500);
};

const handlePointerUp = () => {
  if (longPressTimer.value) {
    clearTimeout(longPressTimer.value);
    longPressTimer.value = null;
  }
};

const selectVariant = (char: string) => {
  handleCharInput(char);
  showVariants.value = false;
};

const selectCandidate = (index: number) => {
  const globalIndex = candidatePage.value * CANDIDATES_PER_PAGE + index;
  if (activeEngine.value && globalIndex < candidates.value.length) {
    const result = activeEngine.value.select(globalIndex);
    composition.value = result.composition;
    candidates.value = result.candidates;
    candidatePage.value = 0;
    if (result.committed) commitText(result.committed);
  }
};

const switchLanguage = () => {
  const langs = availableLanguages.value;
  const idx = langs.indexOf(currentLang.value);
  const nextLang = langs[(idx + 1) % langs.length];
  setLanguage(nextLang);
};

const setLanguage = async (lang: string) => {
  // 提交旧引擎剩余组合
  if (activeEngine.value) {
    const state = activeEngine.value.getState();
    if (state.hasComposition && state.composition) {
      commitText(state.composition);
    }
    activeEngine.value.reset();
    activeEngine.value = null;
  }
  composition.value = '';
  candidates.value = [];
  candidatePage.value = 0;
  isShift.value = false;
  isNumberMode.value = false;
  currentLang.value = lang;

  // 创建新引擎：优先外部配置，其次全局缓存
  try {
    const ext = props.languageConfigs?.find(c => c.code === lang);
    if (ext?.createEngine) {
      activeEngine.value = await ext.createEngine();
    } else {
      activeEngine.value = await getOrCreateEngine(lang);
    }
  } catch (err) {
    console.error(`[IME] Failed to create engine for ${lang}:`, err);
    activeEngine.value = null;
  }
  emit('lang-change', lang);
};

const toggleKanaMode = () => {
  if (currentLang.value === 'ja' && activeEngine.value instanceof JapaneseEngine) {
    const newMode: KanaMode = kanaMode.value === 'hiragana' ? 'katakana' : 'hiragana';
    kanaMode.value = newMode;
    (activeEngine.value as JapaneseEngine).setMode(newMode);
  }
};

const prevCandidatePage = () => {
  if (hasPrevPage.value) candidatePage.value--;
};

const nextCandidatePage = () => {
  if (hasNextPage.value) candidatePage.value++;
};

// ── 监听 ──

watch(() => props.initialLang, (lang) => {
  if (lang !== currentLang.value) setLanguage(lang);
});

// 键盘变为可见时，确保引擎已初始化
watch(() => props.visible, (isVisible) => {
  if (isVisible && !activeEngine.value) {
    setLanguage(currentLang.value);
  }
});

onMounted(() => {
  // 预加载引擎（组件挂载时即开始加载，提前缓存动态 import）
  setLanguage(currentLang.value);
});

onUnmounted(() => {
  // 引擎在全局缓存中，不销毁，仅 reset
  if (activeEngine.value) {
    activeEngine.value.reset();
    activeEngine.value = null;
  }
  if (longPressTimer.value) clearTimeout(longPressTimer.value);
});

// ── 暴露给父组件 ──

defineExpose({
  setLanguage,
  currentLang,
  toggleKanaMode,
  kanaMode,
});
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="ime-overlay" @click.self="emit('close')">
      <div class="ime-panel">
        <!-- 输入显示区 -->
        <div class="ime-display">
          <div class="ime-text">
            <span v-if="modelValue" class="ime-text-content">{{ modelValue }}</span>
            <span v-else class="ime-text-placeholder">{{ placeholder }}</span>
            <span v-if="composition" class="ime-composition">{{ composition }}</span>
            <span class="ime-cursor">|</span>
          </div>
          <button class="ime-close-btn" @click="emit('close')">✕</button>
        </div>

        <!-- 样式工具栏：颜色 + 字体 + 字号 -->
        <div class="ime-style-bar">
          <!-- 颜色选择 -->
          <div class="ime-style-section ime-color-section">
            <button
              class="ime-color-trigger"
              :style="{ background: fontColor }"
              @click="showColorPicker = !showColorPicker; showFontDropdown = false"
            ></button>
            <div v-if="showColorPicker" class="ime-color-dropdown">
              <button
                v-for="c in colorPresets"
                :key="c"
                class="ime-color-dot"
                :class="{ active: c === fontColor }"
                :style="{ background: c }"
                @click="selectColor(c)"
              ></button>
            </div>
          </div>

          <!-- 字体选择 -->
          <div v-if="fontList.length > 0" class="ime-style-section ime-font-section">
            <button
              class="ime-font-trigger"
              @click="showFontDropdown = !showFontDropdown; showColorPicker = false"
            >
              <span class="ime-font-name">{{ currentFontName }}</span>
              <span class="ime-font-arrow">▾</span>
            </button>
            <div v-if="showFontDropdown" class="ime-font-dropdown">
              <button
                v-for="f in fontList"
                :key="f.family"
                class="ime-font-option"
                :class="{ active: f.family === fontFamily }"
                :style="{ fontFamily: f.family }"
                @click="selectFont(f)"
              >{{ f.name }}</button>
            </div>
          </div>

          <!-- 字号调节 -->
          <div class="ime-style-section ime-size-section">
            <button class="ime-size-btn" @click="adjustFontSize(-4)">−</button>
            <span class="ime-size-value">{{ fontSize }}</span>
            <button class="ime-size-btn" @click="adjustFontSize(4)">+</button>
          </div>
        </div>

        <!-- 候选栏 -->
        <div v-if="showCandidateBar" class="ime-candidates">
          <button
            class="ime-cand-nav"
            :disabled="!hasPrevPage"
            @click="prevCandidatePage"
          >◀</button>
          <div class="ime-cand-list">
            <button
              v-for="(cand, i) in pagedCandidates"
              :key="i"
              class="ime-cand-item"
              @click="selectCandidate(i)"
            >
              <span class="ime-cand-index">{{ candidatePage * CANDIDATES_PER_PAGE + i + 1 }}</span>
              <span class="ime-cand-text">{{ cand }}</span>
            </button>
          </div>
          <button
            class="ime-cand-nav"
            :disabled="!hasNextPage"
            @click="nextCandidatePage"
          >▶</button>
        </div>

        <!-- 语言选择栏 -->
        <div v-if="availableLanguages.length > 1" class="ime-lang-bar">
          <button
            v-for="lang in availableLanguages"
            :key="lang"
            :class="['ime-lang-btn', { active: lang === currentLang }]"
            @click="setLanguage(lang)"
          >{{ builtinLayouts[lang]?.name || lang }}</button>
          <!-- 日语假名切换 -->
          <button
            v-if="isJapanese"
            class="ime-lang-btn ime-kana-toggle"
            @click="toggleKanaMode"
          >{{ kanaMode === 'hiragana' ? 'カナ' : 'かな' }}</button>
        </div>

        <!-- 变体选择浮层 -->
        <div v-if="showVariants" class="ime-variants-overlay" @click="showVariants = false">
          <div class="ime-variants-popup" @click.stop>
            <button
              v-for="v in variantChars"
              :key="v"
              class="ime-variant-btn"
              @click="selectVariant(v)"
            >{{ v }}</button>
          </div>
        </div>

        <!-- 按键区 -->
        <div class="ime-keys">
          <div v-for="(row, ri) in displayRows" :key="ri" class="ime-row">
            <button
              v-for="(key, ki) in row"
              :key="ki"
              :class="getKeyClass(key)"
              :style="{ width: getKeyWidth(key) }"
              @click="handleKeyPress(key)"
              @pointerdown="handlePointerDown(key)"
              @pointerup="handlePointerUp"
              @pointerleave="handlePointerUp"
            >{{ getKeyLabel(key) }}</button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.ime-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 11000;
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.ime-panel {
  width: 100%;
  max-width: 960px;
  background: #1a1a1a;
  border-radius: 20px 20px 0 0;
  padding: 12px 10px 20px;
  position: relative;
}

/* 输入显示区 */
.ime-display {
  display: flex;
  align-items: center;
  background: #2d2d2d;
  border-radius: 12px;
  padding: 10px 14px;
  margin-bottom: 8px;
  min-height: 48px;
}

.ime-text {
  flex: 1;
  font-size: 1.4rem;
  color: #fff;
  font-family: system-ui, sans-serif;
  overflow-x: auto;
  white-space: nowrap;
}

.ime-text-content {
  color: #fff;
}

.ime-text-placeholder {
  color: #666;
}

.ime-composition {
  color: #4FC3F7;
  text-decoration: underline;
  text-underline-offset: 3px;
}

.ime-cursor {
  color: #4FC3F7;
  animation: blink 1s infinite;
}

@keyframes blink {
  0%, 50% { opacity: 1; }
  51%, 100% { opacity: 0; }
}

.ime-close-btn {
  background: none;
  border: none;
  color: #888;
  font-size: 1.3rem;
  cursor: pointer;
  padding: 4px 8px;
  flex-shrink: 0;
}

/* 候选栏 */
.ime-candidates {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 4px;
  margin-bottom: 6px;
  background: #252525;
  border-radius: 10px;
  min-height: 40px;
}

.ime-cand-nav {
  width: 32px;
  height: 32px;
  background: #3a3a3a;
  border: none;
  border-radius: 8px;
  color: #ccc;
  font-size: 0.9rem;
  cursor: pointer;
  flex-shrink: 0;
}

.ime-cand-nav:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.ime-cand-list {
  display: flex;
  gap: 4px;
  flex: 1;
  overflow-x: auto;
}

.ime-cand-item {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  background: #3a3a3a;
  border: none;
  border-radius: 8px;
  color: #fff;
  font-size: 1.1rem;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.15s;
}

.ime-cand-item:hover {
  background: #4a4a4a;
}

.ime-cand-index {
  font-size: 0.75rem;
  color: #888;
}

.ime-cand-text {
  font-weight: 500;
}

/* 语言选择栏 */
.ime-lang-bar {
  display: flex;
  gap: 4px;
  padding: 4px;
  margin-bottom: 6px;
  overflow-x: auto;
}

.ime-lang-btn {
  padding: 5px 10px;
  background: #2d2d2d;
  border: 1.5px solid transparent;
  border-radius: 8px;
  color: #aaa;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.15s;
}

.ime-lang-btn.active {
  background: #1565C0;
  color: #fff;
  border-color: #1E88E5;
}

.ime-lang-btn:hover:not(.active) {
  background: #3a3a3a;
}

.ime-kana-toggle {
  background: #1a3a2a;
  border-color: #2a6a4a;
  color: #8edfb5;
  margin-left: auto;
}

.ime-kana-toggle:hover {
  background: #2a5a3a !important;
}

/* 变体浮层 */
.ime-variants-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
}

.ime-variants-popup {
  display: flex;
  gap: 6px;
  background: #2d2d2d;
  border-radius: 14px;
  padding: 10px 14px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
}

.ime-variant-btn {
  width: 48px;
  height: 48px;
  background: #3a3a3a;
  border: none;
  border-radius: 10px;
  color: #fff;
  font-size: 1.3rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s;
}

.ime-variant-btn:hover {
  background: #1565C0;
}

/* 按键区 */
.ime-keys {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.ime-row {
  display: flex;
  gap: 5px;
  justify-content: center;
}

.ime-key {
  height: 50px;
  min-width: 32px;
  background: #3a3a3a;
  border: none;
  border-radius: 8px;
  color: #fff;
  font-size: 1.15rem;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.12s;
  font-family: system-ui, sans-serif;
  display: flex;
  align-items: center;
  justify-content: center;
  user-select: none;
  -webkit-user-select: none;
  touch-action: manipulation;
}

.ime-key:active {
  background: #555;
}

/* 功能键 */
.ime-key--action {
  background: #2d2d2d;
  font-size: 1rem;
}

.ime-key--shift-active {
  background: #1565C0 !important;
}

.ime-key--backspace {
  background: #5a2d2d;
  font-size: 1.3rem;
}

.ime-key--backspace:active {
  background: #7a3d3d;
}

.ime-key--enter {
  background: #1a6b3c;
  font-size: 1.1rem;
  font-weight: 700;
}

.ime-key--enter:active {
  background: #25934f;
}

.ime-key--space {
  background: #444;
  font-size: 0;
}

.ime-key--number-active {
  background: #1565C0 !important;
}

.ime-key--lang {
  font-size: 1.2rem;
}

.ime-key--has-variants {
  position: relative;
}

.ime-key--has-variants::after {
  content: '';
  position: absolute;
  bottom: 4px;
  right: 4px;
  width: 5px;
  height: 5px;
  background: #4FC3F7;
  border-radius: 50%;
}

/* 样式工具栏 */
.ime-style-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  margin-bottom: 6px;
  background: #252525;
  border-radius: 10px;
}

.ime-style-section {
  display: flex;
  align-items: center;
  position: relative;
}

/* 颜色选择 */
.ime-color-trigger {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  border: 3px solid #555;
  cursor: pointer;
  transition: border-color 0.15s;
}

.ime-color-trigger:hover {
  border-color: #888;
}

.ime-color-dropdown {
  position: absolute;
  bottom: 40px;
  left: 0;
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  max-width: 240px;
  padding: 10px;
  background: #2d2d2d;
  border-radius: 12px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
  z-index: 20;
}

.ime-color-dot {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 2px solid transparent;
  cursor: pointer;
  transition: all 0.15s;
}

.ime-color-dot:hover {
  transform: scale(1.15);
}

.ime-color-dot.active {
  border-color: #fff;
  box-shadow: 0 0 0 2px #1565C0;
}

/* 字体选择 */
.ime-font-trigger {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  background: #3a3a3a;
  border: none;
  border-radius: 8px;
  color: #ddd;
  font-size: 0.85rem;
  cursor: pointer;
  max-width: 140px;
  transition: background 0.15s;
}

.ime-font-trigger:hover {
  background: #4a4a4a;
}

.ime-font-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ime-font-arrow {
  font-size: 0.7rem;
  color: #888;
  flex-shrink: 0;
}

.ime-font-dropdown {
  position: absolute;
  bottom: 40px;
  left: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: 200px;
  min-width: 160px;
  overflow-y: auto;
  padding: 6px;
  background: #2d2d2d;
  border-radius: 12px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
  z-index: 20;
}

.ime-font-option {
  padding: 6px 10px;
  background: none;
  border: none;
  border-radius: 6px;
  color: #ddd;
  font-size: 0.9rem;
  text-align: left;
  cursor: pointer;
  transition: background 0.15s;
  white-space: nowrap;
}

.ime-font-option:hover {
  background: #3a3a3a;
}

.ime-font-option.active {
  background: #1565C0;
  color: #fff;
}

/* 字号调节 */
.ime-size-section {
  gap: 4px;
  margin-left: auto;
}

.ime-size-btn {
  width: 30px;
  height: 30px;
  background: #3a3a3a;
  border: none;
  border-radius: 8px;
  color: #ddd;
  font-size: 1.1rem;
  font-weight: 700;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s;
}

.ime-size-btn:hover {
  background: #4a4a4a;
}

.ime-size-btn:active {
  background: #555;
}

.ime-size-value {
  min-width: 32px;
  text-align: center;
  color: #ddd;
  font-size: 0.85rem;
  font-weight: 600;
}
</style>
