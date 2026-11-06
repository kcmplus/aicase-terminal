<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { ADMIN_KBD_GUARD_EVENTS } from '../utils/adminKeyboardInput'

const { t } = useI18n()

const props = withDefaults(
  defineProps<{
    modelValue: string
    placeholder?: string
    type?: 'text' | 'password'
  }>(),
  { type: 'text' }
)

const emit = defineEmits<{ focus: [FocusEvent]; paste: [string] }>()

const showPassword = ref(false)

/** 字段输入框仅作为键盘触发器，禁止直接输入；但允许 Ctrl+V 触发原生 paste 事件 */
const onKeydown = (e: KeyboardEvent) => {
  const mod = e.ctrlKey || e.metaKey
  if (mod && e.key.toLowerCase() === 'v') return
  e.preventDefault()
}

/** 读取剪贴板文本并上抛，由父组件打开键盘并填入草稿 */
const onPaste = (e: ClipboardEvent) => {
  e.preventDefault()
  const text = e.clipboardData?.getData('text/plain') || ''
  if (text) emit('paste', text)
}
</script>

<template>
  <div class="admin-kbd-field-wrap">
    <input
      class="admin-kbd-field"
      :type="type === 'password' && !showPassword ? 'password' : 'text'"
      :value="modelValue"
      inputmode="none"
      tabindex="0"
      :placeholder="placeholder"
      autocomplete="off"
      spellcheck="false"
      @focus="emit('focus', $event)"
      @keydown="onKeydown"
      @beforeinput="ADMIN_KBD_GUARD_EVENTS.beforeinput"
      @paste="onPaste"
      @cut="ADMIN_KBD_GUARD_EVENTS.cut"
      @input="ADMIN_KBD_GUARD_EVENTS.input"
    />
    <button
      v-if="type === 'password'"
      type="button"
      class="admin-kbd-field-suffix"
      :aria-label="t('admin.keyboard.togglePassword')"
      @mousedown.prevent
      @click="showPassword = !showPassword"
    >
      {{ showPassword ? t('admin.keyboard.hide') : t('admin.keyboard.show') }}
    </button>
  </div>
</template>

<style scoped>
.admin-kbd-field-wrap {
  position: relative;
  width: 100%;
  min-width: 0;
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

.admin-kbd-field::placeholder {
  color: #a8abb2;
}

.admin-kbd-field-suffix {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  padding: 2px 6px;
  font-size: 12px;
  color: #606266;
  background: transparent;
  border: none;
  cursor: pointer;
}

.admin-kbd-field-wrap:has(.admin-kbd-field-suffix) .admin-kbd-field {
  padding-right: 52px;
}
</style>
