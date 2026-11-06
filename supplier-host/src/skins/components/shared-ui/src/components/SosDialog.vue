<script setup lang="ts">
/**
 * SOS 客服求助对话框组件
 * 三阶段流程：填写描述 → 提交中 → 成功/失败
 * 支持故障类型单选（从后台动态获取）
 */
import {watch, computed, ref, nextTick} from 'vue'
import {useI18n} from 'vue-i18n'
import {useSos} from '../composables/useSos'
import VirtualKeyboardIME from './ime/VirtualKeyboardIME.vue'

interface Props {
  modelValue: boolean
  onLog?: (level: 'info' | 'error', message: string, error?: unknown) => void
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: false,
})

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'submitted'): void
}>()

const {t, locale} = useI18n({useScope: 'global'})
const sos = useSos({onLog: props.onLog})
const showDescriptionKeyboard = ref(false)

// 根据当前语言获取故障类型翻译
function getFaultLabel(translations: Record<string, string>): string {
  const lang = (locale.value || 'en').split('-')[0]
  return translations[lang] ?? translations['en'] ?? translations['zh'] ?? ''
}

// 是否选中了"其他"类型
const isOtherSelected = computed(() =>
    sos.faultType.value === 'other'
)

// 对话框打开时加载故障类型
watch(
    () => props.modelValue,
    (val) => {
      if (val) {
        sos.loadFaultTypes()
      } else {
        showDescriptionKeyboard.value = false
        sos.reset()
      }
    }
)

const openDescriptionKeyboard = () => {
  showDescriptionKeyboard.value = true
}

const closeDescriptionKeyboard = () => {
  showDescriptionKeyboard.value = false
}

const handleFaultTypeChange = async (faultTypeKey: string) => {
  sos.faultType.value = faultTypeKey
  if (faultTypeKey === 'other') {
    await nextTick()
    openDescriptionKeyboard()
  }
}

const close = () => {
  showDescriptionKeyboard.value = false
  emit('update:modelValue', false)
}

const handleSubmit = async () => {
  showDescriptionKeyboard.value = false
  await sos.submit()
  if (sos.step.value === 'success') {
    emit('submitted')
  }
}
</script>

<template>
  <Teleport to="body">
    <Transition name="sos-fade">
      <div v-if="modelValue" class="sos-overlay" @click.self="close">
        <div class="sos-dialog font-cjk">
          <!-- 填写阶段1 -->
          <template v-if="sos.step.value === 'input'">
            <div class="sos-header">
              <h2 class="sos-title">
                <img src="../images/repair.png" alt="">
                {{ t('sos.title') }}
              </h2>
              <p class="sos-subtitle">{{ t('sos.subtitle') }}</p>
            </div>

            <div class="sos-body">
              <!-- 故障类型单选 -->
              <template v-if="sos.faultTypes.value && sos.faultTypes.value.length > 0">
                <label class="sos-label">{{ t('sos.selectFaultType') }}</label>
                <div class="sos-fault-types">
                  <label
                      v-for="ft in sos.faultTypes.value"
                      :key="ft.key"
                      class="sos-fault-item"
                      :class="{ 'sos-fault-item--active': sos.faultType.value === ft.key }"
                  >
                    <input
                        type="radio"
                        :value="ft.key"
                        v-model="sos.faultType.value"
                        class="sos-radio"
                        @change="handleFaultTypeChange(ft.key)"
                    />
                    <span>{{ getFaultLabel(ft.translations) }}</span>
                  </label>
                </div>
              </template>

              <!-- "其他"时显示文本框；否则显示可选描述框 -->
              <label class="sos-label" :class="{ 'sos-label--mt': sos.faultTypes.value && sos.faultTypes.value.length > 0 }">
                {{ isOtherSelected ? t('sos.describeIssue') : t('sos.additionalNote') }}
              </label>
              <textarea
                  v-model="sos.description.value"
                  class="sos-textarea"
                  :placeholder="isOtherSelected ? t('sos.describeIssuePlaceholder') : t('sos.additionalNotePlaceholder')"
                  rows="3"
                  maxlength="500"
                  @focus="openDescriptionKeyboard"
                  @click="openDescriptionKeyboard"
              />
              <p class="sos-hint">
                {{ t('sos.autoCollectHint') }}
              </p>
            </div>

            <div class="sos-footer">
              <button class="sos-btn-cancel text-28! text-center" @click="close">{{ t('sos.cancel') }}</button>
              <button class="sos-btn-submit text-28! text-center" @click="handleSubmit">
               {{ t('sos.submit') }}
              </button>
            </div>
          </template>

          <!-- 提交中阶段 -->
          <template v-else-if="sos.step.value === 'submitting'">
            <div class="sos-loading-content">
              <div class="sos-spinner"/>
              <h2 class="sos-title">{{ t('sos.processing') }}</h2>
              <p class="sos-subtitle">{{ t('sos.processingSubtitle') }}</p>
              <div class="sos-progress-steps">
                <div class="sos-step sos-step-done">✓ {{ t('sos.stepCollecting') }}</div>
                <div class="sos-step sos-step-active">⟳ {{ t('sos.stepUploading') }}</div>
              </div>
            </div>
          </template>

          <!-- 成功阶段 -->
          <template v-else-if="sos.step.value === 'success'">
            <div class="sos-success-content">
              <div class="sos-icon-success">✓</div>
              <h2 class="sos-title">{{ t('sos.successTitle') }}</h2>
              <p class="sos-subtitle">{{ t('sos.successSubtitle') }}</p>
              <div class="sos-wait-info">
                <p>{{ t('sos.estimatedWait') }}<strong>{{ t('sos.waitTime') }}</strong></p>
                <p>{{ t('sos.waitInstruction') }}</p>
              </div>
            </div>
            <div class="sos-footer">
              <button class="sos-btn-submit" @click="close">{{ t('sos.understood') }}</button>
            </div>
          </template>

          <!-- 失败阶段 -->
          <template v-else-if="sos.step.value === 'error'">
            <div class="sos-error-content">
              <div class="sos-icon-error">✕</div>
              <h2 class="sos-title">{{ t('sos.errorTitle') }}</h2>
              <p class="sos-error-message">{{ sos.errorMessage.value }}</p>
              <p class="sos-subtitle">{{ t('sos.errorSubtitle') }}</p>
            </div>
            <div class="sos-footer">
              <button class="sos-btn-cancel" @click="close">{{ t('sos.close') }}</button>
              <button class="sos-btn-submit" @click="sos.reset()">{{ t('sos.retry') }}</button>
            </div>
          </template>
        </div>

        <VirtualKeyboardIME
            :model-value="sos.description.value ?? ''"
            @update:model-value="(val) => { if (sos.description) sos.description.value = val }"
            :visible="showDescriptionKeyboard"
            :initial-lang="locale"
            :placeholder="isOtherSelected ? t('sos.describeIssuePlaceholder') : t('sos.additionalNotePlaceholder')"
            confirm-label="✓"
            @confirm="closeDescriptionKeyboard"
            @close="closeDescriptionKeyboard"
        />
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.sos-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
  backdrop-filter: blur(4px);
}

.sos-dialog {
  background: #fff4f9;
  width: 90%;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  overflow: hidden;
  border: 4px solid #ffbada;
  border-radius: 40px;
  padding-top: 45px;
  padding-bottom: 45px;
  font-family: var(--font-cjk, inherit);
}

.sos-dialog,
.sos-dialog :deep(*) {
  font-family: var(--font-cjk, inherit);
}

.sos-header {
  padding: 2.5rem 2.5rem 1.5rem;
  text-align: center;
}

.sos-icon-warning {
  font-size: 3.5rem;
  margin-bottom: 0.5rem;
  line-height: 1;
}

.sos-icon-success {
  width: 72px;
  height: 72px;
  background: #e8f5e9;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 2.5rem;
  color: #4caf50;
  margin: 0 auto 1rem;
}

.sos-icon-error {
  width: 72px;
  height: 72px;
  background: #ffebee;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 2.5rem;
  color: #f44336;
  margin: 0 auto 1rem;
}

.sos-title {
  font-size: 66px;
  font-weight: 590;
  color: #ff0088;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 20px;
}

.sos-title img {
  width: 80px;
  height: 80px;
  margin-right: 20px;
}

.sos-subtitle {
  font-size: 35px;
  color: #ff0088;
  font-weight: 510;
  margin-bottom: 40px;
}

.sos-body {
  padding: 1.5rem 2.5rem;
}

.sos-label {
  display: block;
  font-size: 26px;
  font-weight: 600;
  color: #ff0088;
  margin-bottom: 0.75rem;
}

.sos-label--mt {
  margin-top: 1.25rem;
}

/* 故障类型单选列表 */
.sos-fault-types {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-bottom: 0;
}

.sos-fault-item {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.5rem 1rem;
  border: 2px solid #e0e0e0;
  border-radius: 8px;
  cursor: pointer;
  font-size: 0.9rem;
  color: #555;
  transition: all 0.15s;
  user-select: none;
}

.sos-fault-item:hover {
  border-color: #ff7043;
  color: #ff7043;
}

.sos-fault-item--active {
  border-color: #ff7043;
  background: #fff4f9;
  color: #ff7043;
  font-weight: 600;
}
.sos-textarea {
  width: 100%;
  padding: 0.875rem 1rem;
  line-height: 1.6;
  color: #333;
  resize: none;
  transition: border-color 0.2s;
  box-sizing: border-box;
  font-family: var(--font-cjk, inherit);
  background: #fff4f9;
  height: 310px;
  font-size: 25px;
  border: 2px solid #ff319f;
  margin-bottom: 12px;
  border-radius: 29px;
  &::placeholder{
    color: #d6cdd1;
  }
}

.sos-textarea:focus {
  outline: none;
  border-color: #ff7043;
}

.sos-hint {
  font-size: 26px;
  color: #ff5d99;
  line-height: 1.5;
  padding-left: 5px;
  padding-right: 5px;
  margin-bottom: 66px;
}

.sos-footer {
  padding: 1.25rem 2.5rem 2rem;
  display: flex;
  gap: 18px;
  justify-content: flex-end;
}

.sos-btn-cancel {
  padding: 0.9rem 1.75rem;
  cursor: pointer;
  transition: all 0.2s;
  background: #80bfd8;
  border-radius: 999px;
  font-size: 26px;
  font-weight: 700;
  color: #fff;
  width: 260px;
  box-shadow: 0 4px 4px rgba(0, 0, 0, 0.25);
  border: none;
}

.sos-btn-submit {
  border: none;
  padding: 0.9rem 1.75rem;
  color: #fff;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  flex: 1;
  background: #ff5d99;
  font-size: 32px;
  border-radius: 999px;
  box-shadow: 0 4px 4px rgba(0, 0, 0, 0.25);
}

.sos-btn-submit:hover {
  background: #f4511e;
  transform: translateY(-1px);
}

.sos-btn-submit:active {
  transform: translateY(0);
}

.sos-loading-content {
  padding: 3rem 2.5rem;
  text-align: center;
}

.sos-spinner {
  width: 56px;
  height: 56px;
  border: 4px solid #ffe0b2;
  border-top-color: #ff7043;
  border-radius: 50%;
  animation: sos-spin 0.8s linear infinite;
  margin: 0 auto 1.5rem;
}

@keyframes sos-spin {
  to {
    transform: rotate(360deg);
  }
}

.sos-progress-steps {
  margin-top: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  align-items: center;
}

.sos-step {
  font-size: 0.9rem;
  padding: 0.4rem 1rem;
  border-radius: 20px;
}

.sos-step-done {
  color: #4caf50;
  background: #e8f5e9;
}

.sos-step-active {
  color: #ff7043;
  background: #fff3e0;
  font-weight: 600;
}

.sos-success-content {
  padding: 2.5rem 2.5rem 1.5rem;
  text-align: center;
}

.sos-wait-info {
  margin-top: 1.5rem;
  padding: 1rem 1.5rem;
  background: #f5f5f5;
  border-radius: 10px;
  text-align: left;
  font-size: 0.95rem;
  color: #555;
  line-height: 1.8;
}

.sos-wait-info p {
  margin: 0;
}

.sos-wait-info strong {
  color: #ff7043;
}

.sos-error-content {
  padding: 2.5rem 2.5rem 1.5rem;
  text-align: center;
}

.sos-error-message {
  margin: 0.75rem 0;
  padding: 0.75rem 1rem;
  background: #ffebee;
  border-radius: 8px;
  font-size: 0.9rem;
  color: #c62828;
  word-break: break-all;
}

.sos-fade-enter-active,
.sos-fade-leave-active {
  transition: all 0.25s ease;
}

.sos-fade-enter-from,
.sos-fade-leave-to {
  opacity: 0;
}

.sos-fade-enter-from .sos-dialog,
.sos-fade-leave-to .sos-dialog {
  transform: scale(0.95) translateY(20px);
}
</style>
