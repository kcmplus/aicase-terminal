<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { computed, nextTick, onMounted, onUnmounted, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import Keyboard from '@/skins/components/keyboard.vue'
import AdminKeyboardDragBar from '../../components/AdminKeyboardDragBar.vue'
import {
  applyVirtualKeyboardModelUpdate,
  selectAllOnFocusTarget,
} from '../../utils/adminKeyboardInput'
import { get_setting_configs, save_setting_configs, SettingEvent } from '@/api/setting'
import { listen, UnlistenFn } from '@tauri-apps/api/event'
import { MdbCardChannel, MdbCardDevice, MdbCardLevel, MdbResolution } from '@/api/payment'
import { get_serial_ports } from '@/api/global'

const { t } = useI18n()

// ==================== UI ====================
type KeyboardScope = 'saloConfig'
type saloKeyboardField = 'sock_host' | 'sock_port'

/** 表单下拉选项 */
const portnameOptions = ref<Array<{
  label: string;
  value: string;
}>>([])

const mdbResolutionOptions = [
  { label: 'Res001', value: MdbResolution.Res001 },
  { label: 'Res1', value: MdbResolution.Res1 },
  { label: 'Res10', value: MdbResolution.Res10 },
  { label: 'Res100', value: MdbResolution.Res100 },
]
const mdbCardResolutionOptions = [
  { label: 'Res001', value: MdbResolution.Res001 },
  { label: 'Res1', value: MdbResolution.Res1 },
  { label: 'Res10', value: MdbResolution.Res10 },
  { label: 'Res100', value: MdbResolution.Res100 },
  { label: 'Res1000', value: MdbResolution.Res1000 },
]

const mdbDeviceTypeOptions = computed(() => [
  { label: t('admin.payment.nayaxDevice'), value: MdbCardDevice.Nayax },
  { label: 'NVC1000', value: MdbCardDevice.NVC1000 },
  { label: t('admin.payment.otherDevice'), value: MdbCardDevice.Other },
])
const mdbChannelOptions = computed(() => [
  { label: t('admin.payment.nayaxDevice'), value: MdbCardChannel.Nayax },
  { label: t('admin.payment.cpiDevice'), value: MdbCardChannel.CPI },
  { label: t('admin.payment.otherDevice'), value: MdbCardChannel.Other },
])
const mdbProtocolOptions = [
  { label: 'L2', value: MdbCardLevel.L2 },
  { label: 'L3', value: MdbCardLevel.L3 },
]
const mdbBackendOptions = [
  { label: 'YL', value: 'yl' },
  { label: 'ZX', value: 'zx' },
]

const meInstallOptions = [
  { label: 'D:\\apps\\me_delivery', value: 'D:\\apps\\me_delivery' },
  { label: 'E:\\apps\\me_delivery', value: 'E:\\apps\\me_delivery' },
]

const saloBackendOptions = [
  { label: 'SERIAL', value: 'serial' },
  { label: 'TCP', value: 'tcp' },
]

/** 虚拟键盘 */
const keyboardVisible = ref(false)
const keyboardScope = ref<KeyboardScope>('saloConfig')
const keyboardField = ref<string | null>(null)
const keyboardType = ref<'default' | 'numeric'>('default')
const keyboardPos = reactive({ x: 0, y: 0 })
const isDragging = ref(false)
const keyboardInputRef = ref<HTMLInputElement | null>(null)
const keyboardReplaceAllPending = ref(false)

const keyboardFieldLabels = computed<Record<string, string>>(() => ({
  sock_host: t('admin.payment.kbdSockHost'),
  sock_port: t('admin.payment.kbdSockPort'),
}))

const keyboardLabel = computed(() => {
  if (!keyboardField.value) return t('admin.common.inputContent')
  return keyboardFieldLabels.value[keyboardField.value]
})

const keyboardSanitize = computed(() =>
  keyboardField.value === 'baud_rate'
    ? (raw: string) => raw.replace(/[^\d]/g, '')
    : undefined
)

const keyboardValue = computed({
  get: () => {
    if (!keyboardField.value) return ''
    if (keyboardScope.value === 'saloConfig') {
      return saloForm[keyboardField.value as saloKeyboardField]
    }
    return saloForm[keyboardField.value as saloKeyboardField]
  },
  set: (value: string) => {
    if (!keyboardField.value) return
    if (keyboardScope.value === 'saloConfig') {
      saloForm[keyboardField.value as saloKeyboardField] = value
      return
    }
    saloForm[keyboardField.value as saloKeyboardField] = value
  }
})

const openKeyboard = (
  field: saloKeyboardField,
  type: 'default' | 'numeric' = 'default',
  focusEvent?: FocusEvent
) => {
  keyboardField.value = field
  keyboardType.value = type
  keyboardPos.x = 0
  keyboardPos.y = 0
  if (focusEvent) selectAllOnFocusTarget(focusEvent)
  keyboardVisible.value = true
  nextTick(() => {
    requestAnimationFrame(() => {
      const len = keyboardValue.value.length
      keyboardReplaceAllPending.value = len > 0
      const input = keyboardInputRef.value
      if (input) {
        input.focus()
        input.select()
      }
    })
  })
}

const closeKeyboard = () => {
  keyboardVisible.value = false
  keyboardField.value = null
  keyboardReplaceAllPending.value = false
  isDragging.value = false
}

const onVirtualKeyboardUpdate = (newVal: string) => {
  const input = keyboardInputRef.value
  if (!input) return
  const sel = {
    start: input.selectionStart ?? 0,
    end: input.selectionEnd ?? 0,
  }
  const oldVal = keyboardValue.value
  const sanitize = (raw: string) =>
    keyboardField.value === 'baud_rate' ? raw.replace(/[^\d]/g, '') : raw
  const { value, selection, consumedReplaceAll } = applyVirtualKeyboardModelUpdate(
    oldVal,
    newVal,
    sel,
    sanitize,
    { replaceAllPending: keyboardReplaceAllPending.value }
  )
  if (consumedReplaceAll) keyboardReplaceAllPending.value = false
  keyboardValue.value = value
  nextTick(() => {
    requestAnimationFrame(() => {
      input.setSelectionRange(selection.start, selection.end)
    })
  })
}

/** 物理键盘输入：原生输入框直接处理，此处仅做 sanitize */
const onNativeInput = () => {
  const input = keyboardInputRef.value
  if (!input) return
  const raw = input.value
  const sanitize = keyboardSanitize.value
  keyboardReplaceAllPending.value = false
  if (!sanitize) return
  const sanitized = sanitize(raw)
  if (sanitized === raw) return
  const cursorPos = input.selectionStart ?? raw.length
  const beforeCursor = raw.slice(0, cursorPos)
  const newCursorPos = sanitize(beforeCursor).length
  keyboardValue.value = sanitized
  nextTick(() => {
    input.setSelectionRange(newCursorPos, newCursorPos)
  })
}

/** 选区变化时：若不再是全选则清除 replaceAllPending */
const onNativeSelect = () => {
  if (!keyboardReplaceAllPending.value) return
  const input = keyboardInputRef.value
  if (!input) return
  const start = input.selectionStart ?? 0
  const end = input.selectionEnd ?? 0
  const len = keyboardValue.value.length
  if (len > 0 && !(start === 0 && end === len)) {
    keyboardReplaceAllPending.value = false
  }
}

const onFeedbackClear = () => {
  keyboardValue.value = ''
  keyboardReplaceAllPending.value = false
}

/** 字段输入框直接粘贴：将剪贴板文本填入表单并同步到键盘预览 */
const onFieldPaste = (e: ClipboardEvent) => {
  e.preventDefault()
  const text = e.clipboardData?.getData('text/plain') || ''
  if (!text || !keyboardField.value) return
  const sanitize = keyboardSanitize.value
  keyboardValue.value = sanitize ? sanitize(text) : text
  keyboardReplaceAllPending.value = false
  nextTick(() => {
    requestAnimationFrame(() => {
      const input = keyboardInputRef.value
      if (input) input.select()
    })
  })
}

let dragStartX = 0
let dragStartY = 0
let dragOriginX = 0
let dragOriginY = 0

const getPoint = (e: MouseEvent | TouchEvent) => {
  if ('touches' in e) {
    return e.touches[0] || e.changedTouches[0]
  }
  return e
}

const onDragMove = (e: MouseEvent | TouchEvent) => {
  if (!isDragging.value) return
  e.preventDefault()
  const point = getPoint(e)
  keyboardPos.x = dragOriginX + (point.clientX - dragStartX)
  keyboardPos.y = dragOriginY + (point.clientY - dragStartY)
}

const onDragEnd = () => {
  isDragging.value = false
  window.removeEventListener('mousemove', onDragMove)
  window.removeEventListener('mouseup', onDragEnd)
  window.removeEventListener('touchmove', onDragMove)
  window.removeEventListener('touchend', onDragEnd)
}

const onDragStart = (e: MouseEvent | TouchEvent) => {
  const point = getPoint(e)
  isDragging.value = true
  dragStartX = point.clientX
  dragStartY = point.clientY
  dragOriginX = keyboardPos.x
  dragOriginY = keyboardPos.y
  window.addEventListener('mousemove', onDragMove, { passive: false })
  window.addEventListener('mouseup', onDragEnd)
  window.addEventListener('touchmove', onDragMove, { passive: false })
  window.addEventListener('touchend', onDragEnd)
}

const onUnmountedUI = (async () => {
  onDragEnd()
})

// ==================== 接口数据（后续编写） ====================

const currencyDecimalOptions = [
  { label: '0', value: 0 },
  { label: '1', value: 1 },
  { label: '2', value: 2 },
]
const paymentForm = reactive({
  currency_decimal: 0,
})
const payment_saving = ref(false)


/** 页面表单 */
const mdbForm = reactive({
  enabled: false,
  port_name: '',
  baud_rate: '',
  resolution: '',
  card_resolution: '',
  card_device: '',
  card_channel: '',
  card_level: '',
  backend_type: '',
})
const mdb_saving = ref(false)

const meForm = reactive({
  enabled: false,
  install_dir: '',
  port_name: '',
  baud_rate: '',
})
const me_saving = ref(false)

const saloForm = reactive({
  enabled: false,
  port_name: '',
  baud_rate: '',
  sock_host: '',
  sock_port: '',
  backend_type: '',
})
const salo_saving = ref(false)


let setting_configs_changed_unlisten: UnlistenFn | null = null;

onMounted(async () => {
  await refreshPortList()

  setting_configs_changed_unlisten = await listen(SettingEvent.SETTING_CONFIGS_CHANGED, async (event) => {
    await update_setting_configs(false)
  })
  await update_setting_configs(true)
})

onUnmounted(async () => {
  closeKeyboard()
  setting_configs_changed_unlisten?.()
  await onUnmountedUI();
})

async function refreshPortList() {
  portnameOptions.value = [];
  let ports = await get_serial_ports();
  for (const port of ports) {
    portnameOptions.value.push({
      label: port,
      value: port
    });
  }
}

/** 保存当前表单到后端 */
const handlePaymentSave = async () => {
  payment_saving.value = true;
  const configs = await get_setting_configs()
  configs.payment.currency_decimal = paymentForm.currency_decimal || 0
  await save_setting_configs(configs);
  payment_saving.value = false;
  ElMessage.success(t('admin.common.saveSuccess'))
}

const handleMdbSave = async () => {
  mdb_saving.value = true;
  let configs = await get_setting_configs()
  configs.mdb.enabled = mdbForm.enabled || false
  configs.mdb.port_name = mdbForm.port_name || ''
  configs.mdb.baud_rate = Number(mdbForm.baud_rate) || 0
  configs.mdb.resolution = mdbForm.resolution || ''
  configs.mdb.card_resolution = mdbForm.card_resolution || ''
  configs.mdb.card_device = mdbForm.card_device || ''
  configs.mdb.card_channel = mdbForm.card_channel || ''
  configs.mdb.card_level = mdbForm.card_level || ''
  configs.mdb.backend_type = mdbForm.backend_type || ''
  await save_setting_configs(configs);
  mdb_saving.value = false;
  ElMessage.success(t('admin.common.saveSuccess'))
}

const handleMeSave = async () => {
  me_saving.value = true;
  let configs = await get_setting_configs()
  configs.me.enabled = meForm.enabled || false
  configs.me.install_dir = meForm.install_dir || ''
  configs.me.port_name = meForm.port_name || ''
  configs.me.baud_rate = Number(meForm.baud_rate) || 0
  await save_setting_configs(configs);
  me_saving.value = false;
  ElMessage.success(t('admin.common.saveSuccess'))
}

const handleSaloSave = async () => {
  salo_saving.value = true;
  let configs = await get_setting_configs()
  configs.salo.enabled = saloForm.enabled || false
  configs.salo.port_name = saloForm.port_name || ''
  configs.salo.baud_rate = Number(saloForm.baud_rate) || 0
  configs.salo.host = saloForm.sock_host || ''
  configs.salo.port = Number(saloForm.sock_port) || 0
  configs.salo.backend_type = saloForm.backend_type || ''
  await save_setting_configs(configs);
  salo_saving.value = false;
  ElMessage.success(t('admin.common.saveSuccess'))
}

const update_setting_configs = async (firsted: boolean) => {
  let configs = await get_setting_configs()
  if (!configs) {
    return;
  }
  if (configs.payment && (configs.changed?.payment_changed || firsted)) {
    paymentForm.currency_decimal = configs.payment.currency_decimal;
  }
  if (configs.mdb && (configs.changed?.mdb_changed || firsted)) {
    mdbForm.enabled = configs.mdb.enabled;
    mdbForm.port_name = configs.mdb.port_name;
    mdbForm.baud_rate = configs.mdb.baud_rate.toString();
    mdbForm.resolution = configs.mdb.resolution;
    mdbForm.card_resolution = configs.mdb.card_resolution;
    mdbForm.card_device = configs.mdb.card_device;
    mdbForm.card_channel = configs.mdb.card_channel;
    mdbForm.card_level = configs.mdb.card_level;
    mdbForm.backend_type = configs.mdb.backend_type;
  }
  if (configs.me && (configs.changed?.me_changed || firsted)) {
    meForm.enabled = configs.me.enabled;
    meForm.install_dir = configs.me.install_dir;
    meForm.port_name = configs.me.port_name;
    meForm.baud_rate = configs.me.baud_rate.toString();
  }
  if (configs.salo && (configs.changed?.salo_changed || firsted)) {
    saloForm.enabled = configs.salo.enabled;
    saloForm.port_name = configs.salo.port_name;
    saloForm.baud_rate = configs.salo.baud_rate.toString();
    saloForm.sock_host = configs.salo.host;
    saloForm.sock_port = configs.salo.port.toString();
    saloForm.backend_type = configs.salo.backend_type;
  }
}


</script>

<template>
  <div class="system-page">

    <div class="flex flex-col gap-20 pb-20">
      <el-card shadow="never" class="system-module-card">
        <template #header>
          <span class="text-16 font-bold text-gray-800">{{ t('admin.payment.paymentSettings') }}</span>
        </template>
        <el-form label-width="220px" label-position="left" class="account-form">
          <el-form-item :label="t('admin.payment.decimalPlaces')">
            <el-select v-model="paymentForm.currency_decimal" :placeholder="t('admin.payment.selectDecimal')"
              class="flex-1" teleported clearable>
              <el-option v-for="item in currencyDecimalOptions" :key="item.value" :label="item.label"
                :value="item.value" />
            </el-select>
          </el-form-item>
        </el-form>
        <div class="flex justify-end mt-8">
          <el-button type="primary" :loading="payment_saving" @click="handlePaymentSave">
            {{ t('admin.common.save') }}
          </el-button>
        </div>
      </el-card>
    </div>

    <div class="flex flex-col gap-20 pb-20">
      <el-card shadow="never" class="system-module-card">
        <template #header>
          <span class="text-16 font-bold text-gray-800">{{ t('admin.payment.mdbSettings') }}</span>
        </template>

        <el-form label-width="220px" label-position="left" class="account-form">
          <el-form-item :label="t('admin.payment.enableMdbPayment')">
            <el-switch v-model="mdbForm.enabled" class="feature-row-switch" />
          </el-form-item>

          <el-form-item :label="t('admin.payment.portName')">
            <div class="address-combo">
              <el-select v-model="mdbForm.port_name" :placeholder="t('admin.payment.selectOrEnterPort')" class="w-60%"
                :disabled="!mdbForm.enabled" teleported clearable>
                <el-option v-for="item in portnameOptions" :key="item.value" :label="item.label" :value="item.value" />
              </el-select>
              <el-button class="ml-30" type="primary" :disabled="!mdbForm.enabled" @click="refreshPortList">
                {{ t('admin.payment.refreshPortList') }}
              </el-button>
            </div>
          </el-form-item>

          <el-form-item :label="t('admin.payment.mdbResolution')">
            <el-select v-model="mdbForm.resolution" :placeholder="t('admin.payment.selectResolution')" class="w-full"
              :disabled="!mdbForm.enabled" teleported clearable>
              <el-option v-for="item in mdbResolutionOptions" :key="item.value" :label="item.label"
                :value="item.value" />
            </el-select>
          </el-form-item>

          <el-form-item :label="t('admin.payment.cardResolution')">
            <el-select v-model="mdbForm.card_resolution" :placeholder="t('admin.payment.selectResolution')"
              class="w-full" :disabled="!mdbForm.enabled" teleported clearable>
              <el-option v-for="item in mdbCardResolutionOptions" :key="item.value" :label="item.label"
                :value="item.value" />
            </el-select>
          </el-form-item>

          <el-form-item :label="t('admin.payment.deviceType')">
            <el-select v-model="mdbForm.card_device" :placeholder="t('admin.payment.selectDeviceType')" class="w-full"
              :disabled="!mdbForm.enabled" teleported clearable>
              <el-option v-for="item in mdbDeviceTypeOptions" :key="item.value" :label="item.label"
                :value="item.value" />
            </el-select>
          </el-form-item>

          <el-form-item :label="t('admin.payment.deviceChannel')">
            <el-select v-model="mdbForm.card_channel" :placeholder="t('admin.payment.selectDeviceChannel')"
              class="w-full" :disabled="!mdbForm.enabled" teleported clearable>
              <el-option v-for="item in mdbChannelOptions" :key="item.value" :label="item.label" :value="item.value" />
            </el-select>
          </el-form-item>

          <el-form-item :label="t('admin.payment.protocolLevel')">
            <el-select v-model="mdbForm.card_level" :placeholder="t('admin.payment.selectProtocol')" class="w-full"
              :disabled="!mdbForm.enabled" teleported clearable>
              <el-option v-for="item in mdbProtocolOptions" :key="item.value" :label="item.label" :value="item.value" />
            </el-select>
          </el-form-item>

          <el-form-item :label="t('admin.payment.backend')">
            <el-select v-model="mdbForm.backend_type" :placeholder="t('admin.payment.selectBackend')" class="w-full"
              :disabled="!mdbForm.enabled" teleported clearable>
              <el-option v-for="item in mdbBackendOptions" :key="item.value" :label="item.label" :value="item.value" />
            </el-select>
          </el-form-item>
        </el-form>

        <div class="flex justify-end mt-8">
          <el-button type="primary" :loading="mdb_saving" @click="handleMdbSave">
            {{ t('admin.common.save') }}
          </el-button>
        </div>
      </el-card>
    </div>

    <div class="flex flex-col gap-20 pb-20">
      <el-card shadow="never" class="system-module-card">
        <template #header>
          <span class="text-16 font-bold text-gray-800">{{ t('admin.payment.meSettings') }}</span>
        </template>

        <el-form label-width="220px" label-position="left" class="account-form">
          <el-form-item :label="t('admin.payment.enableMePayment')">
            <el-switch v-model="meForm.enabled" class="feature-row-switch" />
          </el-form-item>

          <el-form-item :label="t('admin.payment.meInstallDir')">
            <el-select v-model="meForm.install_dir" :placeholder="t('admin.payment.selectMeInstallDir')" class="w-80%"
              :disabled="!meForm.enabled" teleported clearable>
              <el-option v-for="item in meInstallOptions" :key="item.value" :label="item.label" :value="item.value" />
            </el-select>
          </el-form-item>

          <el-form-item :label="t('admin.payment.portName')">
            <div class="address-combo">
              <el-select v-model="meForm.port_name" :placeholder="t('admin.payment.selectOrEnterPort')" class="w-60%"
                :disabled="!meForm.enabled" teleported clearable>
                <el-option v-for="item in portnameOptions" :key="item.value" :label="item.label" :value="item.value" />
              </el-select>
              <el-button class="ml-30" type="primary" :disabled="!meForm.enabled" @click="refreshPortList">
                {{ t('admin.payment.refreshPortList') }}
              </el-button>
            </div>
          </el-form-item>
        </el-form>

        <div class="flex justify-end mt-8">
          <el-button type="primary" :loading="me_saving" @click="handleMeSave">
            {{ t('admin.common.save') }}
          </el-button>
        </div>
      </el-card>
    </div>


    <div class="flex flex-col gap-20 pb-20">
      <el-card shadow="never" class="system-module-card">
        <template #header>
          <span class="text-16 font-bold text-gray-800">{{ t('admin.payment.saloSettings') }}</span>
        </template>
        <el-form label-width="220px" label-position="left" class="account-form">
          <el-form-item :label="t('admin.payment.enableSaloPayment')">
            <el-switch v-model="saloForm.enabled" class="feature-row-switch" />
          </el-form-item>

          <el-form-item :label="t('admin.payment.portName')">
            <div class="address-combo">
              <el-select v-model="saloForm.port_name" :placeholder="t('admin.payment.selectOrEnterPort')" class="w-60%"
                :disabled="!saloForm.enabled" teleported clearable>
                <el-option v-for="item in portnameOptions" :key="item.value" :label="item.label" :value="item.value" />
              </el-select>
              <el-button class="ml-30" type="primary" :disabled="!saloForm.enabled" @click="refreshPortList">
                {{ t('admin.payment.refreshPortList') }}
              </el-button>
            </div>
          </el-form-item>

          <el-form-item :label="t('admin.payment.sockHost')">
            <div class="address-combo">
              <el-input v-model="saloForm.sock_host" readonly :placeholder="t('admin.payment.enterSockHost')"
                @focus="openKeyboard('sock_host', 'default', $event)" @paste="onFieldPaste"
                :disabled="!saloForm.enabled" />
            </div>
          </el-form-item>

          <el-form-item :label="t('admin.payment.sockPort')">
            <el-input v-model="saloForm.sock_port" readonly :placeholder="t('admin.payment.enterSockPort')"
              @focus="openKeyboard('sock_port', 'numeric', $event)" @paste="onFieldPaste"
              :disabled="!saloForm.enabled" />
          </el-form-item>

          <el-form-item :label="t('admin.payment.backend')">
            <el-select v-model="saloForm.backend_type" :placeholder="t('admin.payment.selectBackend')" class="w-full"
              :disabled="!saloForm.enabled" teleported clearable>
              <el-option v-for="item in saloBackendOptions" :key="item.value" :label="item.label" :value="item.value" />
            </el-select>
          </el-form-item>
        </el-form>

        <div class="flex justify-end mt-8">
          <el-button type="primary" :loading="salo_saving" @click="handleSaloSave">
            {{ t('admin.common.save') }}
          </el-button>
        </div>
      </el-card>
    </div>

    <!-- 虚拟键盘：Teleport 到 body，无蒙版 -->
    <Teleport to="body">
      <div v-if="keyboardVisible" class="keyboard-overlay">
        <div class="keyboard-panel" :style="{ transform: `translate(${keyboardPos.x}px, ${keyboardPos.y}px)` }"
          @mousedown.stop @click.stop>
          <AdminKeyboardDragBar @close="closeKeyboard" @drag-start="onDragStart" />
          <div class="keyboard-preview">
            <input ref="keyboardInputRef" v-model="keyboardValue" class="keyboard-input" type="text" inputmode="none"
              :placeholder="t('admin.common.pleaseEnterField', { field: keyboardLabel })" @input="onNativeInput"
              @select="onNativeSelect" @keydown.enter="closeKeyboard" />
            <button v-if="keyboardValue" type="button" class="keyboard-clear-btn" @click="onFeedbackClear">×</button>
          </div>
          <div class="keyboard-body" :class="{ 'is-numeric': keyboardType === 'numeric' }">
            <Keyboard :model-value="keyboardValue" :type="keyboardType" english-only :candidate-bar="false"
              @update:model-value="onVirtualKeyboardUpdate" @confirm="closeKeyboard" @close="closeKeyboard" />
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
@import '../../styles/admin-landscape.css';

.keyboard-preview {
  position: relative;
  margin-bottom: 12px;
}

.keyboard-input {
  box-sizing: border-box;
  width: 100%;
  min-height: 48px;
  padding: 1px 48px 1px 11px;
  font-size: 18px;
  line-height: 46px;
  color: #303133;
  background: #fff;
  border: 1px solid #dcdfe6;
  border-radius: 10px;
  outline: none;
  cursor: text;
  caret-color: #027bfc;
  -webkit-user-select: text;
  user-select: text;
}

.keyboard-input:focus {
  border-color: #409eff;
  box-shadow: 0 0 0 1px #409eff inset;
}

.keyboard-clear-btn {
  position: absolute;
  right: 10px;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  font-size: 16px;
  color: #909399;
  background: #f0f2f5;
  border: none;
  border-radius: 50%;
  cursor: pointer;
}

.keyboard-clear-btn:hover {
  color: #606266;
  background: #e4e7ed;
}

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
  white-space: nowrap;
  line-height: 1.4;
}

.account-form :deep(.el-form-item__label-wrap) {
  margin-right: 0 !important;
  margin-left: 0 !important;
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
