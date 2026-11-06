/**
 * SOS 客服求助 Composable
 * 提供 SOS 上报流程管理，供两个售货终端共用
 */

import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { invoke } from '@tauri-apps/api/core'

/** SOS 对话框步骤 */
export type SosStep = 'input' | 'submitting' | 'success' | 'error'

/** 故障类型选项（从后台获取） */
export interface FaultTypeOption {
  id: string
  key: string
  translations: Record<string, string>
  sortOrder: number
  enabled: boolean
}

/** Tauri 收集的日志数据 */
interface SosLogData {
  frontendLogs?: string | null
  rustLogs?: string | null
}

/** useSos 选项 */
export interface UseSosOptions {
  /** 日志回调 */
  onLog?: (level: 'info' | 'error', message: string, error?: unknown) => void
}

/** useSos 返回值类型 */
export interface UseSosReturn {
  step: ReturnType<typeof ref<SosStep>>
  description: ReturnType<typeof ref<string>>
  /** 选中的故障类型 key（单选） */
  faultType: ReturnType<typeof ref<string>>
  /** 可选故障类型列表 */
  faultTypes: ReturnType<typeof ref<FaultTypeOption[]>>
  errorMessage: ReturnType<typeof ref<string>>
  loadFaultTypes: () => Promise<void>
  submit: () => Promise<void>
  reset: () => void
}

export function useSos(options: UseSosOptions = {}): UseSosReturn {
  const { onLog } = options
  const { t } = useI18n({ useScope: 'global' })

  const step = ref<SosStep>('input')
  const description = ref('')
  const faultType = ref('')
  const faultTypes = ref<FaultTypeOption[]>([])
  const errorMessage = ref('')

  const loadFaultTypes = async (): Promise<void> => {
    try {
      const types = await invoke<FaultTypeOption[]>('get_fault_types')
      faultTypes.value = types ?? []
    } catch {
      faultTypes.value = []
    }
  }

  const submit = async (): Promise<void> => {
    step.value = 'submitting'
    errorMessage.value = ''

    try {
      onLog?.('info', '开始收集 SOS 诊断信息')

      const logs = await invoke<SosLogData>('collect_sos_logs')

      onLog?.('info', '日志收集完成，正在上报到后台')

      await invoke('submit_sos_report_new', {
        customerDescription: description.value.trim() || null,
        faultType: faultType.value || null,
        frontendLogs: logs?.frontendLogs ?? null,
        rustLogs: logs?.rustLogs ?? null,
      })

      onLog?.('info', 'SOS 上报成功')
      step.value = 'success'
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      onLog?.('error', `SOS 上报失败: ${msg}`, err)
      errorMessage.value = msg || t('sos.submitFailed')
      step.value = 'error'
    }
  }

  const reset = (): void => {
    step.value = 'input'
    description.value = ''
    faultType.value = ''
    errorMessage.value = ''
  }

  return { step, description, faultType, faultTypes, errorMessage, loadFaultTypes, submit, reset }
}
