<script setup lang="ts">
import { nextTick, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAdminKeyboardFeedback } from '../composables/useAdminKeyboardFeedback'

const { t } = useI18n()

const props = withDefaults(
  defineProps<{
    modelValue: string
    placeholder?: string
    inputType?: 'text' | 'password'
    replaceAllPending?: boolean
    sanitizeInput?: (raw: string) => string
  }>(),
  { inputType: 'text', replaceAllPending: false }
)

const emit = defineEmits<{
  'update:modelValue': [string]
  'update:replaceAllPending': [boolean]
  clear: []
  confirm: []
}>()

const replaceAllPendingLocal = ref(props.replaceAllPending)
/** 与 modelValue 同步的本地副本，避免物理键盘连按时尚未完成 props 回写 */
const localValue = ref(props.modelValue)
watch(
  () => props.modelValue,
  (value) => {
    localValue.value = value
  }
)
watch(
  () => props.replaceAllPending,
  (value) => {
    replaceAllPendingLocal.value = value
  }
)
watch(replaceAllPendingLocal, (value) => {
  emit('update:replaceAllPending', value)
})

const feedback = useAdminKeyboardFeedback({
  getValue: () => localValue.value,
  setValue: (value) => {
    localValue.value = value
    emit('update:modelValue', value)
  },
  replaceAllPending: replaceAllPendingLocal,
  getInputType: () => props.inputType,
  sanitizeInput: (raw: string) => (props.sanitizeInput ? props.sanitizeInput(raw) : raw),
  onConfirm: () => emit('confirm'),
})

const {
  ADMIN_KBD_GUARD_EVENTS,
  keyboardFeedbackRef,
  feedbackPreviewRef,
  feedbackSel,
  setFeedbackSelection,
  selectAllFeedbackText,
  selectAllOnOpen,
  onFeedbackSelect,
  onFeedbackClick,
  onFeedbackKeydown,
  onFeedbackPaste,
  onFeedbackCut,
  hideActionMode,
} = feedback

const onClearClick = () => {
  feedback.onClearClick()
  emit('clear')
}

defineExpose({
  feedbackSel,
  setFeedbackSelection,
  selectAllFeedbackText,
  selectAllOnOpen,
  hideActionMode,
  focusInput: () => keyboardFeedbackRef.value?.focus({ preventScroll: true }),
})

onMounted(() => {
  nextTick(() => {
    keyboardFeedbackRef.value?.focus({ preventScroll: true })
  })
})
</script>

<template>
  <div ref="feedbackPreviewRef" class="keyboard-input-preview">
    <div class="keyboard-feedback-row">
      <input
        ref="keyboardFeedbackRef"
        class="admin-kbd-field keyboard-feedback-native"
        :type="inputType"
        :value="localValue"
        inputmode="none"
        tabindex="0"
        autocomplete="off"
        spellcheck="false"
        :placeholder="placeholder"
        @keydown="onFeedbackKeydown"
        @beforeinput="ADMIN_KBD_GUARD_EVENTS.beforeinput"
        @paste="onFeedbackPaste"
        @cut="onFeedbackCut"
        @input="ADMIN_KBD_GUARD_EVENTS.input"
        @select="onFeedbackSelect"
        @click="onFeedbackClick"
      />
      <button
        v-if="localValue"
        type="button"
        class="keyboard-clear-btn"
        @mousedown.prevent
        @click.stop="onClearClick"
      >
        {{ t('admin.keyboard.clear') }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.keyboard-input-preview {
  position: relative;
  margin-bottom: 12px;
  overflow: visible;
}

.keyboard-feedback-row {
  position: relative;
}

.admin-kbd-field {
  box-sizing: border-box;
  width: 100%;
  min-height: 32px;
  padding: 1px 11px;
  font-size: 14px;
  line-height: 30px;
  color: #606266;
  background: #fff;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  outline: none;
  cursor: text;
  caret-color: #027bfc;
  user-select: text;
  -webkit-user-select: text;
}

.admin-kbd-field:focus {
  border-color: #409eff;
  box-shadow: 0 0 0 1px #409eff inset;
}

.keyboard-feedback-native {
  min-height: 48px;
  font-size: 18px;
  line-height: 46px;
  border-radius: 10px;
  caret-color: #027bfc;
  color: #303133;
  cursor: text;
  /* 允许原生文本选区（键盘 Shift+方向键、鼠标拖选、双击选词等） */
  -webkit-user-select: text;
  user-select: text;
}

.keyboard-clear-btn {
  position: absolute;
  right: 10px;
  top: 50%;
  transform: translateY(-50%);
  padding: 4px 8px;
  font-size: 13px;
  color: #909399;
  background: transparent;
  border: none;
  cursor: pointer;
}

.keyboard-feedback-row:has(.keyboard-clear-btn) .keyboard-feedback-native {
  padding-right: 56px;
}
</style>
