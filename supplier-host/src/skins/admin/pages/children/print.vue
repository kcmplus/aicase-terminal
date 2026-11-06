<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { onMounted, onUnmounted, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { get_setting_configs, get_system_printers, save_setting_configs, SettingEvent, start_batch_test, start_invoice_test, stop_batch_test } from '@/api/setting'
import { listen, UnlistenFn } from '@tauri-apps/api/event'
import { start_clean_nozzle } from '@/api/print'

const { t } = useI18n()

// ==================== UI ====================
const onUnmountedUI = (async () => {

})

// ==================== 接口数据（后续编写） ====================
const optionForm = reactive({
  enable_invoice_print: false,
})

const ripWorkDirOptions = [
  { label: 'D:\\exe\\PrintImageDir', value: 'D:\\exe\\PrintImageDir' },
  { label: 'E:\\exe\\PrintImageDir', value: 'E:\\exe\\PrintImageDir' },
]
const availableCameras = ref<{ label: string, value: string; }[]>([]);
const printerForm = reactive({
  printer_name: '',
})

const printForm = reactive({
  work_dir: '',
  camera_device_id: '',
  height_enabled: false,
  print_parallel: false,
  print_testing: false,
  rip_timeout_clean: false,
  backend_type: '',
})

const availablePrinters = ref<{ label: string, value: string; }[]>([]);
const invoiceForm = reactive({
  printer_name: '',
})

const printBackendOptions = [
  { label: 'PC', value: 'pc' },
  { label: 'PZ2', value: 'pz2' },
  { label: 'PZ1-L800', value: 'pz1-l800' },
  { label: 'PZ1-XP600', value: 'pz1-xp600' },
]

const print_saving = ref(false)
const invoice_saving = ref(false)

let setting_configs_changed_unlisten: UnlistenFn | null = null;

onMounted(async () => {
  await refreshCameraList();
  await refreshPrinterList();

  setting_configs_changed_unlisten = await listen(SettingEvent.SETTING_CONFIGS_CHANGED, async (event) => {
    await update_setting_configs(false)
  })
  await update_setting_configs(true)
})

onUnmounted(async () => {
  setting_configs_changed_unlisten?.()
  await onUnmountedUI();
})

async function refreshCameraList() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    stream.getTracks().forEach(track => track.stop());
    const devices = await navigator.mediaDevices.enumerateDevices();
    availableCameras.value = devices
      .filter(d => d.kind === 'videoinput')
      .map(d => ({ value: d.deviceId, label: d.label || `Camera ${d.deviceId.slice(0, 8)}` }));
  } catch (err) {
    availableCameras.value = [];
  }
}

const handleCleanNozzle = async () => {
  await start_clean_nozzle()
}

const handleStartBatchTest = async () => {
  await start_batch_test()
}

const handleStopBatchTest = async () => {
  await stop_batch_test()
}

const handlePrintSave = async () => {
  print_saving.value = true;
  let configs = await get_setting_configs()
  configs.printer.printer_name = printerForm.printer_name || ''
  configs.print.work_dir = printForm.work_dir || ''
  configs.print.camera_device_id = printForm.camera_device_id || ''
  configs.print.backend_type = printForm.backend_type || ''
  configs.print.height_enabled = printForm.height_enabled || false
  configs.print.print_parallel = printForm.print_parallel || false
  configs.print.print_testing = printForm.print_testing || false
  configs.print.rip_timeout_clean = printForm.rip_timeout_clean || false
  await save_setting_configs(configs);
  print_saving.value = false;
  ElMessage.success(t('admin.common.saveSuccess'))
}

async function refreshPrinterList() {
  try {
    const printers = await get_system_printers();
    availablePrinters.value = printers
      .map(d => ({ value: d, label: d }));
  } catch (err) {
    availablePrinters.value = [];
  }
}

async function handleInvoiceTest() {
  try {
    await start_invoice_test()
  } catch (err) {
  }
}

const handleInvoiceSave = async () => {
  invoice_saving.value = true;
  let configs = await get_setting_configs()
  configs.invoice.printer_name = invoiceForm.printer_name || ''
  configs.option.enable_invoice_print = optionForm.enable_invoice_print;
  await save_setting_configs(configs);
  invoice_saving.value = false;
  ElMessage.success(t('admin.common.saveSuccess'))
}

const update_setting_configs = async (firsted: boolean) => {
  let configs = await get_setting_configs()
  if (!configs) {
    return;
  }
  if (configs.option && (configs.changed?.option_changed || firsted)) {
    optionForm.enable_invoice_print = configs.option.enable_invoice_print;
  }

  if (configs.printer && (configs.changed?.printer_changed || firsted)) {
    printerForm.printer_name = configs.printer.printer_name || '';
  }
  if (configs.print && (configs.changed?.print_changed || firsted)) {
    printForm.work_dir = configs.print.work_dir;
    printForm.camera_device_id = configs.print.camera_device_id || '';
    printForm.backend_type = configs.print.backend_type || '';
    printForm.height_enabled = configs.print.height_enabled;
    printForm.print_parallel = configs.print.print_parallel;
    printForm.print_testing = configs.print.print_testing || false;
    printForm.rip_timeout_clean = configs.print.rip_timeout_clean || false;
  }
  if (configs.invoice && (configs.changed?.invoice_changed || firsted)) {
    invoiceForm.printer_name = configs.invoice.printer_name;
  }
}


</script>

<template>
  <div class="system-page">
    <div class="flex flex-col gap-20 pb-20">
      <el-card shadow="never" class="system-module-card">
        <template #header>
          <span class="text-16 font-bold text-gray-800">{{ t('admin.payment.printSettings') }}</span>
        </template>
        <el-form label-width="220px" label-position="left" class="account-form">
          <el-form-item :label="t('admin.payment.ripInputDir')">
            <el-select v-model="printForm.work_dir" :placeholder="t('admin.payment.selectRipDir')" class="w-80%"
              teleported clearable>
              <el-option v-for="item in ripWorkDirOptions" :key="item.value" :label="item.label" :value="item.value" />
            </el-select>
          </el-form-item>
          <el-form-item :label="t('admin.payment.systemPrinter')">
            <el-select v-model="printerForm.printer_name" :placeholder="t('admin.payment.selectSystemPrinter')"
              class="w-60%" teleported clearable>
              <el-option v-for="item in availablePrinters" :key="item.value" :label="item.label" :value="item.value" />
            </el-select>
            <el-button class="ml-30" type="primary" @click="refreshPrinterList">
              {{ t('admin.payment.refreshPrinter') }}
            </el-button>
          </el-form-item>
          <el-form-item :label="t('admin.payment.previewCamera')">
            <el-select v-model="printForm.camera_device_id" :placeholder="t('admin.payment.selectPreviewCamera')"
              class="w-60%" teleported clearable>
              <el-option v-for="item in availableCameras" :key="item.value" :label="item.label" :value="item.value" />
            </el-select>
            <el-button class="ml-30" type="primary" @click="refreshCameraList">
              {{ t('admin.payment.refreshCamera') }}
            </el-button>
          </el-form-item>
          <el-form-item :label="t('admin.payment.backend')">
            <el-select v-model="printForm.backend_type" :placeholder="t('admin.payment.selectBackend')" class="w-60%"
              teleported clearable>
              <el-option v-for="item in printBackendOptions" :key="item.value" :label="item.label"
                :value="item.value" />
            </el-select>
          </el-form-item>
          <el-form-item :label="t('admin.payment.enableHeightLens')">
            <el-switch v-model="printForm.height_enabled" class="feature-row-switch" />
          </el-form-item>
          <!-- <el-form-item :label="t('admin.payment.print_parallel')">
            <el-switch v-model="printForm.print_parallel" class="feature-row-switch" />
          </el-form-item> -->
          <el-form-item :label="t('admin.payment.print_testing')">
            <el-switch v-model="printForm.print_testing" class="feature-row-switch" />
          </el-form-item>
          <el-form-item :label="t('admin.payment.ripTimeoutClean')">
            <el-switch v-model="printForm.rip_timeout_clean" class="feature-row-switch" />
          </el-form-item>

          <el-form-item :label="t('admin.payment.printerMaintenance')">
            <el-button type="primary" @click="handleCleanNozzle">
              {{ t('admin.payment.cleanCartridge') }}
            </el-button>
          </el-form-item>
          <el-form-item :label="t('admin.payment.batchPrintTest')">
            <el-button type="primary" @dblclick="handleStartBatchTest">
              {{ t('admin.payment.startTest') }}
            </el-button>
            <el-button type="primary" @click="handleStopBatchTest">
              {{ t('admin.payment.stopTest') }}
            </el-button>
          </el-form-item>

        </el-form>
        <div class="flex justify-end mt-8">

        </div>
        <div class="flex justify-end mt-8">
          <el-button type="primary" :loading="print_saving" @click="handlePrintSave">
            {{ t('admin.common.save') }}
          </el-button>
        </div>
      </el-card>
    </div>

    <div class="flex flex-col gap-20 pb-20">
      <el-card shadow="never" class="system-module-card">
        <template #header>
          <span class="text-16 font-bold text-gray-800">{{ t('admin.payment.invoiceSettings') }}</span>
        </template>
        <el-form label-width="220px" label-position="left" class="account-form">
          <el-form-item :label="t('admin.payment.enableInvoicePrint')">
            <el-switch v-model="optionForm.enable_invoice_print" class="feature-row-switch" />
          </el-form-item>
          <el-form-item :label="t('admin.payment.systemPrinter')">
            <el-select v-model="invoiceForm.printer_name" :placeholder="t('admin.payment.selectSystemPrinter')"
              :disabled="!optionForm.enable_invoice_print" class="w-60%" teleported clearable>
              <el-option v-for="item in availablePrinters" :key="item.value" :label="item.label" :value="item.value" />
            </el-select>
            <el-button class="ml-30" type="primary" :disabled="!optionForm.enable_invoice_print"
              @click="refreshPrinterList">
              {{ t('admin.payment.refreshPrinter') }}
            </el-button>
            <el-button type="primary" :disabled="!optionForm.enable_invoice_print" @click="handleInvoiceTest">
              {{ t('admin.payment.invoicePrintTest') }}
            </el-button>
          </el-form-item>

        </el-form>
        <div class="flex justify-end mt-8">
          <el-button type="primary" :loading="invoice_saving" @click="handleInvoiceSave">
            {{ t('admin.common.save') }}
          </el-button>
        </div>
      </el-card>
    </div>
  </div>
</template>

<style scoped>
@import '../../styles/admin-landscape.css';

.feature-row-switch {
  flex-shrink: 0;
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
</style>
