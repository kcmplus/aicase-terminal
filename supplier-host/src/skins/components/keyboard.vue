<script setup lang="ts">
import { ref, onMounted, watch, onUnmounted, computed } from 'vue';
import Keyboard from 'simple-keyboard';
import 'simple-keyboard/build/css/index.css';
import { useI18n } from 'vue-i18n';
import { getOrCreateEngine } from './shared-ui/src/components/ime/engineCache';
import type { IMEEngine, IMEOutput } from '@/skins/components/shared-ui/src';
import type { KeyboardStyle } from './keyboard';

const { t, locale } = useI18n();

const props = withDefaults(defineProps<{
  modelValue: string;
  maxLength?: number;
  /** 键盘类型: 'default' 普通键盘, 'numeric' 纯数字, 'decimal' 数字+小数点 */
  type?: 'default' | 'numeric' | 'decimal';
  /** 自定义键盘样式 */
  style?: KeyboardStyle;
  /** 是否只输入英文（禁用拼音/罗马字输入法） */
  englishOnly?: boolean;
  /** 是否展示拼音候选词栏 */
  candidateBar?: boolean;
  /** 是否展示底部确定按钮 */
  showConfirm?: boolean;
}>(), {
  type: 'default',
  englishOnly: false,
  candidateBar: true,
  showConfirm: false,
});

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void;
  (e: 'delete'): void;
  (e: 'confirm'): void;
  (e: 'close'): void;
}>();

const keyboardRef = ref<HTMLDivElement | null>(null);
let keyboardInstance: Keyboard | null = null;
const isShiftActive = ref(false);

// 输入法引擎状态
const composition = ref('');
const candidates = ref<string[]>([]);
const candidatePage = ref(0);
const showCandidateBar = ref(false);
const compositionStart = ref(0);
let imeEngine: IMEEngine | null = null;

// 长按删除相关状态
let deleteInterval: number | null = null;
const isDeletePressed = ref(false);

const CANDIDATES_PER_PAGE = 5;

// 是否为数字类键盘（纯数字 / 带小数点）
const isNumericMode = computed(() => props.type === 'numeric' || props.type === 'decimal');

// 当前语言
const currentLang = computed(() => locale.value);

/** 仅拼音/IME 语言展示候选栏；英文、数字键盘不展示 */
const showCandidateBarUI = computed(() => {
  if (!props.candidateBar) return false;
  if (props.englishOnly || isNumericMode.value) return false;
  const lang = currentLang.value;
  return lang === 'zh' || lang === 'zh-CN' || lang === 'zh-TW' || lang === 'ja';
});

// 当前输入值（别名，便于阅读）
const currentValue = computed(() => props.modelValue);

// 合并后的键盘样式（使用传入样式覆盖默认值）
const mergedStyle = computed<KeyboardStyle>(() => ({
  ...props.style,
}));

// CSS 变量用于动态样式
const cssVars = computed(() => ({
  '--keyboard-bg': mergedStyle.value.keyboardBg,
  '--candidate-bar-bg': mergedStyle.value.candidateBarBg,
  '--candidate-nav-bg': mergedStyle.value.candidateNavBg,
  '--candidate-nav-disabled-opacity': mergedStyle.value.candidateNavDisabledOpacity,
  '--candidate-item-bg': mergedStyle.value.candidateItemBg,
  '--candidate-item-border': mergedStyle.value.candidateItemBorder,
  '--candidate-item-text': mergedStyle.value.candidateItemText,
  '--candidate-index-color': mergedStyle.value.candidateIndexColor,
  '--composition-bg': mergedStyle.value.compositionBg,
  '--composition-text': mergedStyle.value.compositionText,
  '--key-bg': mergedStyle.value.keyBg,
  '--key-text': mergedStyle.value.keyText,
  '--key-active-bg': mergedStyle.value.keyActiveBg,
  '--key-active-text': mergedStyle.value.keyActiveText,
  '--key-border': mergedStyle.value.keyBorder,
  '--bksp-bg': mergedStyle.value.bkspBg,
  '--bksp-text': mergedStyle.value.bkspText,
  '--bksp-border': mergedStyle.value.bkspBorder,
  '--bksp-active-bg': mergedStyle.value.bkspActiveBg,
  '--bksp-active-text': mergedStyle.value.bkspActiveText,
  '--confirm-bg': mergedStyle.value.confirmBg,
  '--confirm-text': mergedStyle.value.confirmText,
  '--confirm-border': mergedStyle.value.confirmBorder,
  '--confirm-active-bg': mergedStyle.value.confirmActiveBg,
  '--confirm-active-text': mergedStyle.value.confirmActiveText,
  '--shift-bg': mergedStyle.value.shiftBg,
  '--shift-text': mergedStyle.value.shiftText,
  '--shift-border': mergedStyle.value.shiftBorder,
  '--shift-active-bg': mergedStyle.value.shiftActiveBg,
  '--shift-active-text': mergedStyle.value.shiftActiveText,
  '--tab-bg': mergedStyle.value.tabBg,
  '--tab-text': mergedStyle.value.tabText,
  '--tab-border': mergedStyle.value.tabBorder,
  '--tab-active-bg': mergedStyle.value.tabActiveBg,
  '--tab-active-text': mergedStyle.value.tabActiveText,
  '--enter-bg': mergedStyle.value.enterBg,
  '--enter-text': mergedStyle.value.enterText,
  '--enter-border': mergedStyle.value.enterBorder,
  '--enter-active-bg': mergedStyle.value.enterActiveBg,
  '--enter-active-text': mergedStyle.value.enterActiveText,
  '--space-bg': mergedStyle.value.spaceBg,
  '--space-text': mergedStyle.value.spaceText,
  '--space-border': mergedStyle.value.spaceBorder,
  '--space-active-bg': mergedStyle.value.spaceActiveBg,
  '--space-active-text': mergedStyle.value.spaceActiveText,
}));

// 纯数字键盘（密码、库存、超时等）
const numericLayout = {
  default: ['1 2 3 4 5', '6 7 8 9 0', '{bksp} {confirm}']
};

// 数字 + 小数点（价格等）
const decimalLayout = {
  default: ['1 2 3 4 5', '6 7 8 9 0', '. {bksp} {confirm}']
};

// 英文键盘布局
const englishLayout = {
  default: [
    '` 1 2 3 4 5 6 7 8 9 0 - = {bksp}',
    '{tab} q w e r t y u i o p [ ] \\',
    '{lock} a s d f g h j k l ; \' {enter}',
    '{shift} z x c v b n m , . / {shift}',
    '.com @ {space}'
  ],
  shift: [
    '~ ! @ # $ % ^ & * ( ) _ + {bksp}',
    '{tab} Q W E R T Y U I O P { } |',
    '{lock} A S D F G H J K L : " {enter}',
    '{shift} Z X C V B N M < > ? {shift}',
    '.com @ {space}'
  ]
};

// 日语键盘布局（罗马字输入，使用QWERTY）
const japaneseLayout = {
  default: [
    '` 1 2 3 4 5 6 7 8 9 0 - = {bksp}',
    '{tab} q w e r t y u i o p [ ] \\',
    '{lock} a s d f g h j k l ; \' {enter}',
    '{shift} z x c v b n m , . / {shift}',
    '.com @ {space}'
  ],
  shift: [
    '~ ! @ # $ % ^ & * ( ) _ + {bksp}',
    '{tab} Q W E R T Y U I O P { } |',
    '{lock} A S D F G H J K L : " {enter}',
    '{shift} Z X C V B N M < > ? {shift}',
    '.com @ {space}'
  ]
};

// 中文键盘布局（与英文相同，但启用拼音输入）
const chineseLayout = {
  default: [
    '` 1 2 3 4 5 6 7 8 9 0 - = {bksp}',
    '{tab} q w e r t y u i o p [ ] \\',
    '{lock} a s d f g h j k l ; \' {enter}',
    '{shift} z x c v b n m , . / {shift}',
    '.com @ {space}'
  ],
  shift: [
    '~ ! @ # $ % ^ & * ( ) _ + {bksp}',
    '{tab} Q W E R T Y U I O P { } |',
    '{lock} A S D F G H J K L : " {enter}',
    '{shift} Z X C V B N M < > ? {shift}',
    '.com @ {space}'
  ]
};

// 韩文键盘布局（Hangul）
const koreanLayout = {
  default: [
    '` 1 2 3 4 5 6 7 8 9 0 - = {bksp}',
    '{tab} ᄇ ᄌ ᄃ ᄀ ᄉ ᅭ ᅧ ᅣ ᅢ ᅦ [ ] \\',
    '{lock} ᄆ ᄂ ᄋ ᄅ ᄒ ᅩ ᅥ ᅡ ᅵ ; \' {enter}',
    '{shift} ᄏ ᄐ ᄎ ᄑ ᅲ ᅮ ᅳ , . / {shift}',
    '.com @ {space}'
  ],
  shift: [
    '~ ! @ # $ % ^ & * ( ) _ + {bksp}',
    '{tab} ᄈ ᄍ ᄄ ᄁ ᄊ ᅬ ᅨ ᅤ ᅣ ᅧ { } |',
    '{lock} ᄇ ᄃ ᄌ ᄀ ᄉ ᅪ ᅦ ᅢ ᅶ : " {enter}',
    '{shift} ᄐ ᄏ ᄑ ᄎ ᅳ ᅲ ᅯ < > ? {shift}',
    '.com @ {space}'
  ]
};

const buttonTheme = {
  bksp: 'button-bksp',
  confirm: 'button-confirm',
  shift: 'button-shift',
  lock: 'button-lock',
  tab: 'button-tab',
  enter: 'button-enter',
  space: 'button-space'
};

// 获取当前语言对应的布局
const currentLayout = computed(() => {
  if (props.type === 'decimal') return decimalLayout;
  if (props.type === 'numeric') return numericLayout;

  const lang = currentLang.value;
  if (lang === 'ja') return japaneseLayout;
  if (lang === 'zh' || lang === 'zh-CN' || lang === 'zh-TW') return chineseLayout;
  if (lang === 'ko' || lang === 'ko-KR') return koreanLayout;
  return englishLayout;
});

const displayTexts = computed(() => {
  // 数字模式下使用国际化翻译
  if (isNumericMode.value) {
    return {
      '{bksp}': t('keyboard.delete'),
      '{confirm}': t('keyboard.confirm'),
      '{shift}': 'shift',
      '{lock}': 'caps',
      '{tab}': 'tab',
      '{enter}': 'enter',
      '{space}': ' '
    };
  }

  // 根据语言设置功能键显示文本
  const lang = currentLang.value;
  if (lang === 'ja') {
    return {
      '{bksp}': 'backspace',
      '{confirm}': '確定',
      '{shift}': 'Shift',
      '{lock}': 'Caps',
      '{tab}': 'Tab',
      '{enter}': 'Enter',
      '{space}': ' '
    };
  }
  if (lang === 'zh' || lang === 'zh-CN' || lang === 'zh-TW') {
    return {
      '{bksp}': 'backspace',
      '{confirm}': '确定',
      '{shift}': 'Shift',
      '{lock}': 'Caps',
      '{tab}': 'Tab',
      '{enter}': 'Enter',
      '{space}': ' '
    };
  }
  if (lang === 'ko' || lang === 'ko-KR') {
    return {
      '{bksp}': 'backspace',
      '{confirm}': '확인',
      '{shift}': 'Shift',
      '{lock}': 'Caps',
      '{tab}': 'Tab',
      '{enter}': 'Enter',
      '{space}': ' '
    };
  }
  // 其他语言默认英文
  return {
    '{bksp}': 'backspace',
    '{confirm}': 'confirm',
    '{shift}': 'shift',
    '{lock}': 'caps',
    '{tab}': 'tab',
    '{enter}': 'enter',
    '{space}': ' '
  };
});

// 获取当前语言对应的引擎类型
const getEngineLang = (): string => {
  const lang = currentLang.value;
  if (lang === 'zh' || lang === 'zh-CN' || lang === 'zh-TW') return 'zh';
  if (lang === 'ja') return 'ja';
  return '';
};

// 初始化输入法引擎
const initIMEEngine = async () => {
  // 先清理旧引擎
  if (imeEngine) {
    imeEngine.reset();
    imeEngine = null;
  }

  // englishOnly / 数字键盘不需要 IME
  if (props.englishOnly || isNumericMode.value) {
    composition.value = '';
    candidates.value = [];
    showCandidateBar.value = false;
    return;
  }

  const engineLang = getEngineLang();
  if (!engineLang) {
    // 不需要IME引擎的语言
    composition.value = '';
    candidates.value = [];
    showCandidateBar.value = false;
    return;
  }

  try {
    imeEngine = await getOrCreateEngine(engineLang);
  } catch (err) {
    console.error(`[Keyboard] Failed to load ${engineLang} IME engine:`, err);
    imeEngine = null;
  }
};

// 处理输入法输入
const handleIMEInput = (char: string): IMEOutput | null => {
  if (!imeEngine || isNumericMode.value) return null;

  // 只处理字母（拼音/罗马字输入）
  if (!/^[a-zA-Z]$/.test(char)) return null;

  // 大写模式下不进行拼音转换，直接输入大写字母
  if (isShiftActive.value) return null;

  // 检查长度限制
  if (props.maxLength && currentValue.value.length >= props.maxLength) return null;

  // 如果是第一次输入拼音，记录当前文本长度作为开始位置
  if (composition.value.length === 0) {
    compositionStart.value = currentValue.value.length;
  }

  const result = (imeEngine as any).input(char);
  composition.value = result.composition;
  candidates.value = result.candidates;
  candidatePage.value = 0;
  showCandidateBar.value = result.composition.length > 0 || result.candidates.length > 0;

  // 拼音输入时立即输出字母到页面
  emit('update:modelValue', currentValue.value + char.toLowerCase());

  return result;
};

// 选择候选词
const selectCandidate = (index: number) => {
  if (!imeEngine) return;

  const globalIndex = candidatePage.value * CANDIDATES_PER_PAGE + index;
  const result = (imeEngine as any).select(globalIndex);

  // 替换拼音为选中的文字
  if (result.committed && composition.value.length > 0) {
    // 获取拼音开始位置之前的文本，加上选中的文字
    const textBefore = currentValue.value.slice(0, compositionStart.value);
    emit('update:modelValue', textBefore + result.committed);
  }

  composition.value = result.composition;
  candidates.value = result.candidates;
  candidatePage.value = 0;
  showCandidateBar.value = result.composition.length > 0 || result.candidates.length > 0;

  // 如果没有剩余拼音，重置开始位置
  if (composition.value.length === 0) {
    compositionStart.value = 0;
  }
};

// 翻页
const prevCandidatePage = () => {
  if (candidatePage.value > 0) candidatePage.value--;
};

const nextCandidatePage = () => {
  if ((candidatePage.value + 1) * CANDIDATES_PER_PAGE < candidates.value.length) {
    candidatePage.value++;
  }
};

const pagedCandidates = computed(() => {
  const start = candidatePage.value * CANDIDATES_PER_PAGE;
  return candidates.value.slice(start, start + CANDIDATES_PER_PAGE);
});

const hasPrevPage = computed(() => candidatePage.value > 0);
const hasNextPage = computed(() =>
    (candidatePage.value + 1) * CANDIDATES_PER_PAGE < candidates.value.length
);

// 处理删除操作（支持长按持续删除）
const handleDelete = () => {
  if (imeEngine && composition.value.length > 0) {
    // IME模式下：先删除页面上的拼音字母，再更新IME引擎状态
    emit('update:modelValue', currentValue.value.slice(0, -1));

    const result = (imeEngine as any).backspace();
    composition.value = result.composition;
    candidates.value = result.candidates;
    candidatePage.value = 0;
    showCandidateBar.value = result.composition.length > 0 || result.candidates.length > 0;

    // 如果拼音全部删除完，重置开始位置
    if (composition.value.length === 0) {
      compositionStart.value = 0;
    }
  } else if (imeEngine && showCandidateBar.value) {
    // IME模式下，候选词栏显示但composition为空时，重置IME状态，然后删除文本
    composition.value = '';
    candidates.value = [];
    candidatePage.value = 0;
    showCandidateBar.value = false;
    compositionStart.value = 0;
    if (imeEngine) {
      imeEngine.reset();
    }
    emit('update:modelValue', currentValue.value.slice(0, -1));
  } else {
    // 无拼音时，直接删除输入文本
    emit('update:modelValue', currentValue.value.slice(0, -1));
  }
};

// 开始长按删除
const startDeleteLongPress = () => {
  isDeletePressed.value = true;
  handleDelete(); // 立即执行一次删除

  // 延迟后开始持续删除
  deleteInterval = window.setInterval(() => {
    if (isDeletePressed.value) {
      handleDelete();
    } else {
      stopDeleteLongPress();
    }
  }, 100); // 每100ms删除一次
};

// 停止长按删除
const stopDeleteLongPress = () => {
  isDeletePressed.value = false;
  if (deleteInterval) {
    clearInterval(deleteInterval);
    deleteInterval = null;
  }
};

/** 确定 / Enter：有拼音时先结束组字，无拼音时触发 confirm */
const handleConfirm = () => {
  if (imeEngine && composition.value.length > 0) {
    composition.value = '';
    candidates.value = [];
    showCandidateBar.value = false;
    compositionStart.value = 0;
    imeEngine.reset();
  } else {
    emit('confirm');
  }
};

const initKeyboard = () => {
  if (keyboardRef.value) {
    if (keyboardInstance) {
      keyboardInstance.destroy();
    }

    keyboardInstance = new Keyboard(keyboardRef.value, {
      layout: currentLayout.value,
      buttonTheme: buttonTheme as unknown as any,
      display: displayTexts.value,
      preventMouseDownDefault: true,
      disableButtonHold: false, // 启用长按功能
      useButtonTag: true,
      onChange: () => {
        // 完全禁用 onChange，所有输入都由 onKeyPress 处理
      },
      onKeyPress: (button: string) => {
        if (button === '{bksp}') {
          handleDelete();
        } else if (button === '{confirm}') {
          handleConfirm();
        } else if (button === '{shift}') {
          isShiftActive.value = !isShiftActive.value;
          if (keyboardInstance) {
            keyboardInstance.setOptions({
              layoutName: isShiftActive.value ? 'shift' : 'default'
            });
          }
          // 切换到大写模式时停止拼音输入
          if (isShiftActive.value && imeEngine && composition.value.length > 0) {
            composition.value = '';
            candidates.value = [];
            showCandidateBar.value = false;
            compositionStart.value = 0;
            imeEngine.reset();
          }
        } else if (button === '{lock}') {
          isShiftActive.value = !isShiftActive.value;
          if (keyboardInstance) {
            keyboardInstance.setOptions({
              layoutName: isShiftActive.value ? 'shift' : 'default'
            });
          }
          // 切换到大写模式时停止拼音输入
          if (isShiftActive.value && imeEngine && composition.value.length > 0) {
            composition.value = '';
            candidates.value = [];
            showCandidateBar.value = false;
            compositionStart.value = 0;
            imeEngine.reset();
          }
        } else if (button === '{space}') {
          // IME模式下空格选择第一个候选词（替换拼音为文字）
          if (imeEngine && composition.value.length > 0) {
            if (candidates.value.length > 0) {
              selectCandidate(0);
            } else {
              // 没有候选词时，停止拼音并输入空格
              composition.value = '';
              candidates.value = [];
              showCandidateBar.value = false;
              compositionStart.value = 0;
              if (imeEngine) {
                imeEngine.reset();
              }
              emit('update:modelValue', currentValue.value + ' ');
            }
          } else {
            // 无拼音时，直接输入空格
            if (props.maxLength && currentValue.value.length >= props.maxLength) return;
            emit('update:modelValue', currentValue.value + ' ');
          }
        } else if (button === '{tab}') {
          if (props.maxLength && currentValue.value.length >= props.maxLength) return;
          emit('update:modelValue', currentValue.value + '\t');
        } else if (button === '{enter}') {
          handleConfirm();
        } else {
          // 字母输入：尝试IME转换（支持中文拼音和日语罗马字）
          const imeResult = handleIMEInput(button);
          if (imeResult && imeResult.committed) {
            emit('update:modelValue', currentValue.value + imeResult.committed);
          } else if (!imeResult) {
            // 大写模式或非字母字符：如果正在拼音模式，先停止拼音再输入
            if (imeEngine && composition.value.length > 0) {
              composition.value = '';
              candidates.value = [];
              showCandidateBar.value = false;
              compositionStart.value = 0;
              imeEngine.reset();
            }
            // 直接输入字符
            if (props.maxLength && currentValue.value.length >= props.maxLength) return;
            emit('update:modelValue', currentValue.value + button);
          }
        }
      }
    });

    // 为删除按钮添加长按事件监听
    const bkspButton = keyboardRef.value.querySelector('.button-bksp');
    if (bkspButton) {
      bkspButton.addEventListener('mousedown', (e: Event) => {
        startDeleteLongPress();
      });
      bkspButton.addEventListener('touchstart', (e: Event) => {
        startDeleteLongPress();
      });
      bkspButton.addEventListener('mouseup', () => {
        stopDeleteLongPress();
      });
      bkspButton.addEventListener('touchend', () => {
        stopDeleteLongPress();
      });
      bkspButton.addEventListener('mouseleave', () => {
        stopDeleteLongPress();
      });
    }
  }
};

// 重新初始化键盘（语言或类型变化时）
const reinitKeyboard = async () => {
  await initIMEEngine();
  isShiftActive.value = false;
  composition.value = '';
  candidates.value = [];
  showCandidateBar.value = false;
  compositionStart.value = 0;
  initKeyboard();
};

onMounted(async () => {
  await reinitKeyboard();
});

watch(() => props.modelValue, (newValue) => {
  if (keyboardInstance) {
    keyboardInstance.setInput(newValue);
  }
});

watch(() => props.type, () => {
  reinitKeyboard();
});

watch(() => props.englishOnly, () => {
  reinitKeyboard();
});

// 监听语言变化
watch(currentLang, () => {
  reinitKeyboard();
});

onUnmounted(() => {
  if (imeEngine) {
    imeEngine.reset();
  }
  // 清理长按删除定时器
  stopDeleteLongPress();
});
</script>

<template>
<div class="h-full flex-1 flex flex-col items-end pb-8 overflow-hidden">
  <div class="custom-keyboard flex flex-col" :style="cssVars">
    <!-- 拼音候选词栏 -->
    <div v-if="showCandidateBarUI" class="candidate-bar">
      <button
          class="candidate-nav"
          :disabled="!hasPrevPage"
          @click="prevCandidatePage"
      >◀</button>
      <div class="candidate-list">
        <button
            v-for="(cand, i) in pagedCandidates"
            :key="i"
            class="candidate-item"
            @click="selectCandidate(i)"
        >
          <span class="candidate-index">{{ candidatePage * CANDIDATES_PER_PAGE + i + 1 }}</span>
          <span class="candidate-text">{{ cand }}</span>
        </button>
      </div>
      <button
          class="candidate-nav"
          :disabled="!hasNextPage"
          @click="nextCandidatePage"
      >▶</button>
      <div v-if="composition" class="composition-display">{{ composition }}</div>
    </div>

    <div class="flex-1">
      <div ref="keyboardRef" class="simple-keyboard"></div>
    </div>
  </div>

  <!-- <div -->
  <!--   v-if="showConfirm" -->
  <!--   class="w-151 h-41 text-center rounded-4 leading-41 text-16 mt-9 cursor-pointer" -->
  <!--   style="border: 1px solid #027bfc;" -->
  <!--   @click="handleConfirm" -->
  <!-- > -->
  <!--   {{ t('keyboard.confirm') }} -->
  <!-- </div> -->
</div>

</template>

<script lang="ts">
// 添加 CSS 变量类型声明
declare module 'vue' {
  interface CSSProperties {
    [key: `--${string}`]: string | undefined;
  }
}
</script>

<style scoped>
.custom-keyboard {
  width: 100%;
}

.candidate-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  margin-bottom: 5px;
  background: var(--candidate-bar-bg);
  border-radius: 8px;
  height: 50px;
  min-height: 50px;
  box-sizing: border-box;
  flex-shrink: 0;
}

.candidate-nav {
  width: 32px;
  height: 32px;
  background: var(--candidate-nav-bg);
  border: none;
  border-radius: 6px;
  color: #666;
  font-size: 14px;
  cursor: pointer;
  flex-shrink: 0;
  text-align: center !important;
}

.candidate-nav:disabled {
  opacity: var(--candidate-nav-disabled-opacity);
  cursor: not-allowed;
}

.candidate-list {
  display: flex;
  gap: 6px;
  flex: 1;
  overflow-x: auto;
}

.candidate-list::-webkit-scrollbar {
  height: 6px;
}

.candidate-list::-webkit-scrollbar-track {
  background: rgba(0, 0, 0, 0.05);
  border-radius: 3px;
}

.candidate-list::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.2);
  border-radius: 3px;
  transition: background-color 0.2s;
}

.candidate-list::-webkit-scrollbar-thumb:hover {
  background: rgba(0, 0, 0, 0.4);
}

.candidate-list::-webkit-scrollbar-button {
  display: none;
}

.candidate-list::-moz-scrollbar {
  height: 6px;
}

.candidate-list::-moz-scrollbar-track {
  background: rgba(0, 0, 0, 0.05);
  border-radius: 3px;
}

.candidate-list::-moz-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.2);
  border-radius: 3px;
}

.candidate-list::-moz-scrollbar-thumb:hover {
  background: rgba(0, 0, 0, 0.4);
}

.candidate-item {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  background: var(--candidate-item-bg);
  border: 1px solid var(--candidate-item-border);
  border-radius: 6px;
  color: var(--candidate-item-text);
  font-size: 16px;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.15s;
}

.candidate-index {
  font-size: 12px;
  color: var(--candidate-index-color);
}

.candidate-text {
  font-weight: 500;
  color: var(--candidate-item-text);
}

.composition-display {
  padding: 4px 8px;
  background: var(--composition-bg);
  border-radius: 4px;
  color: var(--composition-text);
  font-size: 14px;
  flex-shrink: 0;
}

.simple-keyboard {
  background: var(--keyboard-bg);
}

:deep(.simple-keyboard .hg-button) {
  /* min-height: 48px; */
  font-size: 1rem;
  border-radius: 6px;
  background: var(--key-bg) !important;
  color: var(--key-text) !important;
  border: 1px solid var(--key-border) !important;
  transition: all 0.15s ease;
}

:deep(.simple-keyboard .hg-button span) {
  color: var(--key-text) !important;
}

:deep(.simple-keyboard .hg-standardBtn) {
  background: var(--key-bg) !important;
  color: var(--key-text) !important;
  border: 1px solid var(--key-border) !important;
}

:deep(.simple-keyboard .hg-standardBtn span) {
  color: var(--key-text) !important;
}

:deep(.simple-keyboard .hg-button:active) {
  transform: scale(0.95);
  background: var(--key-active-bg) !important;
  color: var(--key-active-text) !important;
}

:deep(.simple-keyboard .hg-button:active span) {
  color: var(--key-active-text) !important;
}

:deep(.simple-keyboard .hg-standardBtn:active) {
  background: var(--key-active-bg) !important;
  color: var(--key-active-text) !important;
}

:deep(.simple-keyboard .hg-standardBtn:active span) {
  color: var(--key-active-text) !important;
}

:deep(.simple-keyboard .hg-row .hg-button.hg-functionBtn.hg-button-bksp) {
  background: var(--bksp-bg) !important;
  color: var(--bksp-text) !important;
  border: 1px solid var(--bksp-border) !important;
}

:deep(.simple-keyboard .hg-row .hg-button.hg-functionBtn.hg-button-bksp span) {
  color: var(--bksp-text) !important;
}

:deep(.simple-keyboard .hg-row .hg-button.hg-functionBtn.hg-button-bksp:active) {
  background: var(--bksp-active-bg) !important;
  color: var(--bksp-active-text) !important;
  border: 1px solid var(--bksp-border) !important;
}

:deep(.simple-keyboard .hg-row .hg-button.hg-functionBtn.hg-button-bksp:active span) {
  color: var(--bksp-active-text) !important;
}

:deep(.simple-keyboard .hg-row .hg-button.hg-functionBtn.hg-button-confirm) {
  background: var(--confirm-bg) !important;
  color: var(--confirm-text) !important;
  border: 1px solid var(--confirm-border) !important;
}

:deep(.simple-keyboard .hg-row .hg-button.hg-functionBtn.hg-button-confirm span) {
  color: var(--confirm-text) !important;
}

:deep(.simple-keyboard .hg-row .hg-button.hg-functionBtn.hg-button-confirm:active) {
  background: var(--confirm-active-bg) !important;
  color: var(--confirm-active-text) !important;
  border: 1px solid var(--confirm-border) !important;
}

:deep(.simple-keyboard .hg-row .hg-button.hg-functionBtn.hg-button-confirm:active span) {
  color: var(--confirm-active-text) !important;
}

:deep(.simple-keyboard .hg-row .hg-button.hg-functionBtn.hg-button-shift),
:deep(.simple-keyboard .hg-row .hg-button.hg-functionBtn.hg-button-lock) {
  background: var(--shift-bg) !important;
  color: var(--shift-text) !important;
  border: 1px solid var(--shift-border) !important;
}

:deep(.simple-keyboard .hg-row .hg-button.hg-functionBtn.hg-button-shift span),
:deep(.simple-keyboard .hg-row .hg-button.hg-functionBtn.hg-button-lock span) {
  color: var(--shift-text) !important;
}

:deep(.simple-keyboard .hg-row .hg-button.hg-functionBtn.hg-button-shift:active),
:deep(.simple-keyboard .hg-row .hg-button.hg-functionBtn.hg-button-lock:active) {
  background: var(--shift-active-bg) !important;
  color: var(--shift-active-text) !important;
  border: 1px solid var(--shift-border) !important;
}

:deep(.simple-keyboard .hg-row .hg-button.hg-functionBtn.hg-button-shift:active span),
:deep(.simple-keyboard .hg-row .hg-button.hg-functionBtn.hg-button-lock:active span) {
  color: var(--shift-active-text) !important;
}

:deep(.simple-keyboard .hg-row .hg-button.hg-functionBtn.hg-button-tab) {
  background: var(--tab-bg) !important;
  color: var(--tab-text) !important;
  border: 1px solid var(--tab-border) !important;
}

:deep(.simple-keyboard .hg-row .hg-button.hg-functionBtn.hg-button-tab span) {
  color: var(--tab-text) !important;
}

:deep(.simple-keyboard .hg-row .hg-button.hg-functionBtn.hg-button-tab:active) {
  background: var(--tab-active-bg) !important;
  color: var(--tab-active-text) !important;
  border: 1px solid var(--tab-border) !important;
}

:deep(.simple-keyboard .hg-row .hg-button.hg-functionBtn.hg-button-tab:active span) {
  color: var(--tab-active-text) !important;
}

:deep(.simple-keyboard .hg-row .hg-button.hg-functionBtn.hg-button-enter) {
  background: var(--enter-bg) !important;
  color: var(--enter-text) !important;
  border: 1px solid var(--enter-border) !important;
}

:deep(.simple-keyboard .hg-row .hg-button.hg-functionBtn.hg-button-enter span) {
  color: var(--enter-text) !important;
}

:deep(.simple-keyboard .hg-row .hg-button.hg-functionBtn.hg-button-enter:active) {
  background: var(--enter-active-bg) !important;
  color: var(--enter-active-text) !important;
  border: 1px solid var(--enter-border) !important;
}

:deep(.simple-keyboard .hg-row .hg-button.hg-functionBtn.hg-button-enter:active span) {
  color: var(--enter-active-text) !important;
}

:deep(.simple-keyboard .button-space) {
  min-width: 200px;
}

:deep(.simple-keyboard .hg-row .hg-button.hg-functionBtn.hg-button-space) {
  background: var(--space-bg) !important;
  color: var(--space-text) !important;
  border: 1px solid var(--space-border) !important;
}

:deep(.simple-keyboard .hg-row .hg-button.hg-functionBtn.hg-button-space > span) {
  color: var(--space-text) !important;
}

:deep(.simple-keyboard .hg-row .hg-button.hg-functionBtn.hg-button-space:active) {
  background: var(--space-active-bg) !important;
  color: var(--space-active-text) !important;
  border: 1px solid var(--space-border) !important;
}

:deep(.simple-keyboard .hg-row .hg-button.hg-functionBtn.hg-button-space:active > span) {
  color: var(--space-active-text) !important;
}

:deep(.simple-keyboard .hg-row) {
  display: flex;
  justify-content: center;
  gap: 4px;
  margin-bottom: 6px;
}

:deep(.simple-keyboard .hg-row:last-child) {
  margin-bottom: 0;
}
</style>
