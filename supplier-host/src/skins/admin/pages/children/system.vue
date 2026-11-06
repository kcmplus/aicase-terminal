<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import type { UploadProps, UploadRawFile, UploadUserFile } from 'element-plus'
import Keyboard from '@/skins/components/keyboard.vue'
import AdminKeyboardDragBar from '../../components/AdminKeyboardDragBar.vue'
import { selectAllOnFocusTarget, applyVirtualKeyboardModelUpdate } from '../../utils/adminKeyboardInput'
import { convertFileSrc } from '@tauri-apps/api/core'
import { listen, UnlistenFn } from '@tauri-apps/api/event'
import { getVersion } from '@tauri-apps/api/app'
import { clear_directory, join_app_cache_dir, join_app_cache_file, save_file, save_file_raw } from '@/api/global'
import { get_setting_configs, get_h5_url_options, get_http_api_options, get_ws_api_options, save_setting_configs, SettingEvent, SettingMediaItem, SettingOptions, get_setting_options } from '@/api/setting'
import { check_for_update, download_and_install_update, UpgradeEvent, UpgradeMode, UpgradeProgress } from '@/api/upgrade'

const { t } = useI18n()

type AccountField = 'h5Url' | 'apiUrl' | 'wsUrl' | 'pcAccount' | 'pcPassword' | 'deviceToken'
type TimeoutField = 'pageTimeout' | 'paymentTimeout' | 'editTimeout'
type MediaKey = 'home' | 'inner'
type KeyboardScope = 'accountConfig' | 'timeoutConfig' | 'mediaConfig'

enum MediaType {
  Image = 'image',
  Video = 'video',
}

interface MediaItem {
  type: MediaType
  interval: string
  imageFileList: UploadUserFile[]
  videoFileList: UploadUserFile[]
  videoUrl: string
  videoName: string
}

// ==================== UI ====================
const keyboardVisible = ref(false)
const keyboardScope = ref<KeyboardScope>('accountConfig')
const keyboardField = ref<string | null>(null)
const keyboardType = ref<'default' | 'numeric'>('default')
const keyboardPos = reactive({ x: 0, y: 0 })
const isDragging = ref(false)
const imagePreviewVisible = ref(false)
const imagePreviewUrl = ref('')

const updateModeOptions = computed(() => [
  { label: t('admin.system.autoUpdate'), value: UpgradeMode.Auto },
  { label: t('admin.system.manualUpdate'), value: UpgradeMode.Manual },
])

const keyboardFieldLabels = computed<Record<string, string>>(() => ({
  h5Url: t('admin.system.kbdH5Url'),
  apiUrl: t('admin.system.kbdApiUrl'),
  wsUrl: t('admin.system.kbdWsUrl'),
  pcAccount: t('admin.system.kbdPcAccount'),
  pcPassword: t('admin.system.kbdPcPassword'),
  deviceToken: t('admin.system.kbdDeviceToken'),
  pageTimeout: t('admin.system.kbdPageTimeout'),
  paymentTimeout: t('admin.system.kbdPaymentTimeout'),
  editTimeout: t('admin.system.kbdEditTimeout'),
  home: t('admin.system.kbdHomeInterval'),
  inner: t('admin.system.kbdInnerInterval'),
}))

const keyboardLabel = computed(() => {
  if (!keyboardField.value) return t('admin.common.inputContent')
  return keyboardFieldLabels.value[keyboardField.value] || t('admin.common.inputContent')
})

const isKeyboardPassword = computed(() => keyboardField.value === 'pcPassword')

const keyboardSanitize = computed(() =>
  keyboardType.value === 'numeric'
    ? (raw: string) => raw.replace(/[^\d]/g, '')
    : undefined
)

const keyboardInputRef = ref<HTMLInputElement | null>(null)
const keyboardReplaceAllPending = ref(false)

const onVirtualKeyboardUpdate = (newVal: string) => {
  const input = keyboardInputRef.value
  if (!input) return
  const sel = {
    start: input.selectionStart ?? 0,
    end: input.selectionEnd ?? 0,
  }
  const oldVal = keyboardValue.value
  const sanitize =
    keyboardType.value === 'numeric' ? (raw: string) => raw.replace(/[^\d]/g, '') : undefined
  const { value, selection, consumedReplaceAll } = applyVirtualKeyboardModelUpdate(
    oldVal,
    newVal,
    sel,
    sanitize,
    { replaceAllPending: keyboardReplaceAllPending.value }
  )
  if (consumedReplaceAll) keyboardReplaceAllPending.value = false
  if (value === oldVal) return
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

const openKeyboard = (
  scope: KeyboardScope,
  field: AccountField | TimeoutField | MediaKey,
  type: 'default' | 'numeric' = 'default',
  focusEvent?: FocusEvent
) => {
  keyboardScope.value = scope
  keyboardField.value = field
  keyboardType.value = type
  keyboardPos.x = 0
  keyboardPos.y = 0
  if (focusEvent) selectAllOnFocusTarget(focusEvent)
  keyboardReplaceAllPending.value = keyboardValue.value.length > 0
  keyboardVisible.value = true
  nextTick(() => {
    requestAnimationFrame(() => {
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

const createObjectUrl = (file?: File) => (file ? URL.createObjectURL(file) : '')

const revokeObjectUrl = (url?: string) => {
  if (url && url.startsWith('blob:')) {
    URL.revokeObjectURL(url)
  }
}

/** 网页常见可展示图片（img 标签）；accept 仅作文件框默认过滤，真正以扩展名校验拦截 */
const IMAGE_ACCEPT = 'image/jpeg,image/png,image/gif,image/webp,image/bmp,image/avif,.jpg,.jpeg,.png,.gif,.webp,.bmp,.avif'
const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.avif'])
const IMAGE_FORMAT_TIP = 'JPG、JPEG、PNG、GIF、WebP、BMP、AVIF'

/** 网页 HTML5 video 常见可播放格式 */
const VIDEO_ACCEPT = 'video/mp4,video/webm,video/ogg,.mp4,.webm,.ogg,.ogv'
const VIDEO_EXT = new Set(['.mp4', '.webm', '.ogg', '.ogv'])
const VIDEO_FORMAT_TIP = 'MP4、WebM、OGG'

const getUploadFileExt = (name: string) => {
  const i = name.lastIndexOf('.')
  return i >= 0 ? name.slice(i).toLowerCase() : ''
}

/** 必须以扩展名命中白名单（系统文件框切到“所有文件”时也能拦） */
const isAllowedImageFile = (file?: File | UploadRawFile | null) => {
  if (!file?.name) return false
  return IMAGE_EXT.has(getUploadFileExt(file.name))
}

const isAllowedVideoFile = (file?: File | UploadRawFile | null) => {
  if (!file?.name) return false
  return VIDEO_EXT.has(getUploadFileExt(file.name))
}

const toImageUploadFile = (item: UploadUserFile): UploadUserFile => {
  if (!item.url && item.raw) {
    return { ...item, url: createObjectUrl(item.raw) }
  }
  return item
}

const handleImagePreview: UploadProps['onPreview'] = (file) => {
  imagePreviewUrl.value = file.url || ''
  imagePreviewVisible.value = true
}

/** 同步剔除非法图片；先清空再写回，避免 el-upload 内部状态把非法文件留住 */
const syncImageFileList = async (key: MediaKey, uploadFiles: UploadUserFile[]) => {
  const media = systemSettings.mediaConfig[key]
  const validFiles: UploadUserFile[] = []
  let rejected = 0

  for (const item of uploadFiles) {
    // 已落盘的历史文件无 raw，按扩展名校验；新选文件必须带合法扩展名
    const name = item.name || item.raw?.name || ''
    const allowed = item.raw
      ? isAllowedImageFile(item.raw)
      : IMAGE_EXT.has(getUploadFileExt(name))
    if (!allowed) {
      rejected += 1
      revokeObjectUrl(item.url)
      continue
    }
    validFiles.push(toImageUploadFile(item))
  }

  if (rejected > 0) {
    ElMessage.warning(t('admin.system.ignoredImages', { count: rejected, formats: IMAGE_FORMAT_TIP }))
  }

  media.imageFileList = []
  await nextTick()
  media.imageFileList = validFiles
}

const handleImageChange = (key: MediaKey): UploadProps['onChange'] => {
  return (_uploadFile, uploadFiles) => {
    void syncImageFileList(key, uploadFiles)
  }
}

const handleImageRemove = (key: MediaKey): UploadProps['onRemove'] => {
  return (uploadFile, uploadFiles) => {
    revokeObjectUrl(uploadFile.url)
    systemSettings.mediaConfig[key].imageFileList = uploadFiles
  }
}

const rejectVideoFile = (key: MediaKey, uploadFile?: UploadUserFile) => {
  ElMessage.warning(t('admin.system.unsupportedVideo', { formats: VIDEO_FORMAT_TIP }))
  const media = systemSettings.mediaConfig[key]
  if (uploadFile) {
    media.videoFileList = media.videoFileList.filter((f) => f.uid !== uploadFile.uid)
  }
}

const applyVideoFile = (key: MediaKey, raw: UploadRawFile, name: string, uid?: number) => {
  const media = systemSettings.mediaConfig[key]
  revokeObjectUrl(media.videoUrl)
  const url = createObjectUrl(raw)
  media.videoFileList = [{
    name,
    uid: uid ?? Date.now(),
    status: 'ready',
    raw,
    url,
  }]
  media.videoUrl = url
  media.videoName = name
}

const handleVideoChange = (key: MediaKey): UploadProps['onChange'] => {
  return async (uploadFile) => {
    if (!uploadFile.raw || !isAllowedVideoFile(uploadFile.raw)) {
      rejectVideoFile(key, uploadFile)
      const media = systemSettings.mediaConfig[key]
      const kept = media.videoFileList.filter(
        (f) => f.uid !== uploadFile.uid && (!f.raw || isAllowedVideoFile(f.raw))
      )
      media.videoFileList = []
      await nextTick()
      media.videoFileList = kept
      return
    }
    applyVideoFile(key, uploadFile.raw, uploadFile.name, uploadFile.uid)
  }
}

const handleVideoExceed = (key: MediaKey): UploadProps['onExceed'] => {
  return (files) => {
    const raw = files[0] as UploadRawFile
    if (!raw) return
    if (!isAllowedVideoFile(raw)) {
      rejectVideoFile(key)
      return
    }
    applyVideoFile(key, raw, raw.name)
  }
}

const handleVideoRemove = (key: MediaKey) => {
  const media = systemSettings.mediaConfig[key]
  revokeObjectUrl(media.videoUrl)
  media.videoFileList = []
  media.videoUrl = ''
  media.videoName = ''
}

/** 检查更新 */
const onUnmountedUI = async () => {
  onDragEnd();
  (['home', 'inner'] as MediaKey[]).forEach((key) => {
    const media = systemSettings.mediaConfig[key]
    media.imageFileList.forEach((file) => revokeObjectUrl(file.url))
    revokeObjectUrl(media.videoUrl)
  })
}

/** 检查更新 */
const handleCheckUpdate = async () => {
  if (!systemSettings.softwareUpdate.updateVersion) {
    upgrade_checking.value = true
    try {
      let upgrade_info = await check_for_update();
      if (upgrade_info) {
        systemSettings.softwareUpdate.updateVersion = upgrade_info.version;
      } else {
        ElMessage.success(t('admin.system.alreadyLatest'))
      }
    } catch (e) {
      ElMessage.error(t('admin.system.versionGetFailed'))
    } finally {
      upgrade_checking.value = false
    }
    return;
  }
  upgrade_installing.value = true
  await download_and_install_update()
  upgrade_installing.value = false
}

/** 保存账户配置 */
const handleSaveUpdate = async () => {
  app_saving.value = true;
  let configs = await get_setting_configs()
  configs.app.update_mode = systemSettings.softwareUpdate.updateMode || ''
  await save_setting_configs(configs);
  app_saving.value = false;
  ElMessage.success(t('admin.common.saveSuccess'))
}

/** 保存账户配置 */
const handleSaveAccount = async () => {
  api_saving.value = true;
  let configs = await get_setting_configs()
  configs.api.ws_api_url = systemSettings.accountConfig.wsUrl || '';
  configs.api.http_api_url = systemSettings.accountConfig.apiUrl || '';
  configs.api.h5_base_url = systemSettings.accountConfig.h5Url || '';
  configs.api.username = systemSettings.accountConfig.pcAccount || '';
  configs.api.password = systemSettings.accountConfig.pcPassword || '';
  configs.api.device_mac = systemSettings.accountConfig.deviceToken || '';
  await save_setting_configs(configs);
  api_saving.value = false;
  ElMessage.success(t('admin.common.saveSuccess'))
}


/** 保存背景媒体 */
function get_file_name(path: string): string {
  const normalized = path.split('\\').join('/');
  const segments = normalized.split('/').filter(s => s !== '');
  if (segments.length === 0) return '';
  return segments[segments.length - 1];
}

function get_file_name_without_ext(path: string): string {
  const fullName = get_file_name(path);
  const dotIndex = fullName.lastIndexOf('.');
  return dotIndex > 0 ? fullName.slice(0, dotIndex) : fullName;
}

function get_file_ext(filename: string): string {
  const dotIndex = filename.lastIndexOf('.');
  if (dotIndex <= 0) return '';
  return filename.substring(dotIndex).toLowerCase();
}

async function get_blob_buffer(url: string): Promise<Uint8Array> {
  const res = await fetch(url);
  const blob = await res.blob();
  const buf = await blob.arrayBuffer();
  return new Uint8Array(buf);
}

async function generate_media_config(config: SettingMediaItem, item: MediaItem, save_files: Map<string, string>) {
  config.mtype = item.type
  config.interval = Number(item.interval)
  for (const file of item.imageFileList) {
    if (file.uid && file.url) {
      if (file.url.indexOf('blob:') !== -1) {
        let path = await join_app_cache_file("media", file.uid + get_file_ext(file.name));
        config.images.push(path)
        save_files.set(path, file.url)
      } else {
        config.images.push(file.name)
        save_files.set(file.name, file.url)
      }
    }
  }
  for (const file of item.videoFileList) {
    if (file.uid && file.url) {
      if (file.url.indexOf('blob:') !== -1) {
        let path = await join_app_cache_file("media", file.uid + get_file_ext(file.name));
        config.videos.push(path)
        save_files.set(path, file.url)
      } else {
        config.videos.push(file.name)
        save_files.set(file.name, file.url)
      }
    }
  }
}

const handleSaveMedia = async () => {
  media_saving.value = true;
  let configs = await get_setting_configs()

  configs.media.home.images.length = 0;
  configs.media.home.videos.length = 0;
  configs.media.inner.images.length = 0;
  configs.media.inner.videos.length = 0;

  const save_files = new Map<string, string>();
  await generate_media_config(configs.media.home, systemSettings.mediaConfig.home, save_files);
  await generate_media_config(configs.media.inner, systemSettings.mediaConfig.inner, save_files);
  if (save_files.size > 0) {
    // 如果所有资源都重新设置，先情况目录
    let changed_cnt = 0;
    for (const [path, url] of save_files) {
      if (url.indexOf('blob:') !== -1) {
        changed_cnt++
      }
    }
    if (changed_cnt >= save_files.size) {
      let media_dir = await join_app_cache_dir("media");
      await clear_directory(media_dir);
    }
    // 保存文件到AppCache目录
    try {
      for (const [path, url] of save_files) {
        if (url.indexOf('blob:') !== -1) {
          let data = await get_blob_buffer(url)
          await save_file_raw(path, data)
        }
      }
    } catch (e) {
      ElMessage.success(t('admin.common.failed'))
    }

  } else {
    let media_dir = await join_app_cache_dir("media");
    await clear_directory(media_dir);
  }
  await save_setting_configs(configs);
  media_saving.value = false;
  ElMessage.success(t('admin.common.saveSuccess'))
}

/** 保存无操作超时设置 */
const handleSaveTimeout = async () => {
  ui_saving.value = true;
  let configs = await get_setting_configs()
  configs.ui.page_timeout = Number(systemSettings.timeoutConfig.pageTimeout);
  configs.ui.edit_timeout = Number(systemSettings.timeoutConfig.editTimeout);
  configs.ui.payment_timeout = Number(systemSettings.timeoutConfig.paymentTimeout);
  await save_setting_configs(configs);
  ui_saving.value = false;
  ElMessage.success(t('admin.common.saveSuccess'))
}


/** 保存选项配置 */
const handleSaveOption = async () => {
  option_saving.value = true;
  let configs = await get_setting_configs()
  configs.option.enable_voice_prompt = systemSettings.featureConfig.voiceBroadcast;
  configs.option.enable_wifi_transfer = systemSettings.featureConfig.wifiTransfer;
  configs.option.enable_cloud_transfer = systemSettings.featureConfig.networkTransfer;
  configs.option.enable_invoice_print = systemSettings.featureConfig.receiptPrint;
  configs.option.enable_camera_preview = systemSettings.featureConfig.camera;
  configs.option.show_h5_entry = systemSettings.featureConfig.homeQrcode;
  configs.option.enable_order_queue = systemSettings.featureConfig.queue;
  await save_setting_configs(configs);
  option_saving.value = false
  ElMessage.success(t('admin.common.saveSuccess'))
}

const setting_options = ref<SettingOptions | null>(null)
const app_saving = ref(false)
const api_saving = ref(false)
const media_saving = ref(false)
const ui_saving = ref(false)
const option_saving = ref(false)
const upgrade_checking = ref(false)
const upgrade_installing = ref(false)
const download_progress = ref(0.0)

let setting_configs_changed_unlisten: UnlistenFn | null = null;
let setting_options_changed_unlisten: UnlistenFn | null = null;
let download_progress_unlisten: UnlistenFn | null = null;

onMounted(async () => {
  setting_configs_changed_unlisten = await listen(SettingEvent.SETTING_CONFIGS_CHANGED, async (_event) => {
    await update_setting_configs(false)
  })
  setting_options_changed_unlisten = await listen(SettingEvent.SETTING_OPTIONS_CHANGED, async (_event) => {
    await update_setting_options()
  })

  download_progress_unlisten = await listen<UpgradeProgress>(UpgradeEvent.DOWNLOAD_PROGRESS, async (event) => {
    download_progress.value = event.payload.progress
  })

  await update_setting_configs(true)
  await update_setting_options()
})

onUnmounted(async () => {
  closeKeyboard()
  setting_configs_changed_unlisten?.()
  setting_options_changed_unlisten?.()
  download_progress_unlisten?.()
  await onUnmountedUI();
})

const update_setting_options = async () => {
  setting_options.value = await get_setting_options()
}

const update_setting_configs = async (firsted: boolean) => {
  let configs = await get_setting_configs()
  if (!configs) {
    return;
  }

  if (configs.app && (configs.changed.app_changed || firsted)) {
    systemSettings.softwareUpdate.currentVersion = await getVersion()
    systemSettings.softwareUpdate.updateMode = configs.app.update_mode || UpgradeMode.Manual
  }

  if (configs.api && (configs.changed.api_changed || firsted)) {
    systemSettings.accountConfig.wsUrl = configs.api.ws_api_url || ''
    systemSettings.accountConfig.apiUrl = configs.api.http_api_url || ''
    systemSettings.accountConfig.h5Url = configs.api.h5_base_url || ''
    systemSettings.accountConfig.pcAccount = configs.api.username || ''
    systemSettings.accountConfig.pcPassword = configs.api.password || ''
    systemSettings.accountConfig.deviceToken = configs.api.device_mac || ''
  }

  if (configs.media && (configs.changed.media_changed || firsted)) {
    // 首页
    systemSettings.mediaConfig.home.type = configs.media.home.mtype as MediaType;
    systemSettings.mediaConfig.home.interval = configs.media.home.interval.toString();
    systemSettings.mediaConfig.inner.videoUrl = ''
    systemSettings.mediaConfig.inner.videoName = ''
    systemSettings.mediaConfig.home.imageFileList.length = 0;
    systemSettings.mediaConfig.home.videoFileList.length = 0;
    if (configs.media.home.images.length > 0) {
      for (const [index, file] of configs.media.home.images.entries()) {
        systemSettings.mediaConfig.home.imageFileList[index] = {
          uid: Number(get_file_name_without_ext(file)),
          name: file,
          url: convertFileSrc(file),
          status: 'success'
        }
      }
    }
    if (configs.media.home.videos.length > 0) {
      for (const [index, file] of configs.media.home.videos.entries()) {
        systemSettings.mediaConfig.home.videoFileList[index] = {
          uid: Number(get_file_name_without_ext(file)),
          name: file,
          url: convertFileSrc(file),
          status: 'success'
        }
      }
      let file = configs.media.home.videos[0];
      systemSettings.mediaConfig.home.videoUrl = convertFileSrc(file)
      systemSettings.mediaConfig.home.videoName = file
    }

    // 内页
    systemSettings.mediaConfig.inner.type = configs.media.inner.mtype as MediaType;
    systemSettings.mediaConfig.inner.interval = configs.media.inner.interval.toString();
    systemSettings.mediaConfig.inner.videoUrl = ''
    systemSettings.mediaConfig.inner.videoName = ''
    systemSettings.mediaConfig.inner.imageFileList.length = 0;
    systemSettings.mediaConfig.inner.videoFileList.length = 0;
    if (configs.media.inner.images.length > 0) {
      for (const [index, file] of configs.media.inner.images.entries()) {
        systemSettings.mediaConfig.inner.imageFileList[index] = {
          uid: Number(get_file_name_without_ext(file)),
          name: file,
          url: convertFileSrc(file),
          status: 'success'
        }
      }
    }
    if (configs.media.inner.videos.length > 0) {
      for (const [index, file] of configs.media.inner.videos.entries()) {
        systemSettings.mediaConfig.inner.videoFileList[index] = {
          uid: Number(get_file_name_without_ext(file)),
          name: file,
          url: convertFileSrc(file),
          status: 'success'
        }
      }
      let file = configs.media.inner.videos[0];
      systemSettings.mediaConfig.inner.videoUrl = convertFileSrc(file)
      systemSettings.mediaConfig.inner.videoName = file
    }
  }

  if (configs.ui && (configs.changed.ui_changed || firsted)) {
    systemSettings.timeoutConfig.pageTimeout = configs.ui.page_timeout.toString() || ''
    systemSettings.timeoutConfig.editTimeout = configs.ui.edit_timeout.toString() || ''
    systemSettings.timeoutConfig.paymentTimeout = configs.ui.payment_timeout.toString() || ''

  }
  if (configs.option && (configs.changed.option_changed || firsted)) {
    systemSettings.featureConfig.voiceBroadcast = configs.option.enable_voice_prompt || false
    systemSettings.featureConfig.wifiTransfer = configs.option.enable_wifi_transfer || false
    systemSettings.featureConfig.networkTransfer = configs.option.enable_cloud_transfer || false
    systemSettings.featureConfig.receiptPrint = configs.option.enable_invoice_print || false
    systemSettings.featureConfig.camera = configs.option.enable_camera_preview || false
    systemSettings.featureConfig.homeQrcode = configs.option.show_h5_entry || false
    systemSettings.featureConfig.queue = configs.option.enable_order_queue || false
  }

}

// ==================== 数据 ====================
/** H5 / API 地址下拉可选项（独立配置） */
const addressOptions = {
  ws_api: get_ws_api_options(),
  http_api: get_http_api_options(),
  h5_url: get_h5_url_options(),
}

const createMediaItem = (): MediaItem => ({
  type: MediaType.Image,
  interval: '500',
  imageFileList: [],
  videoFileList: [],
  videoUrl: '',
  videoName: ''
})

/** 系统设置页全部模块数据 */
const systemSettings = reactive({
  /** 软件更新 */
  softwareUpdate: {
    currentVersion: '',
    updateMode: '',
    updateVersion: ''
  },
  /** 账户配置 */
  accountConfig: {
    h5Url: '',
    apiUrl: '',
    wsUrl: '',
    pcAccount: '',
    pcPassword: '',
    deviceToken: ''
  },
  /** 无操作超时设置 */
  timeoutConfig: {
    pageTimeout: '',
    paymentTimeout: '',
    editTimeout: ''
  },
  /** 背景媒体 */
  mediaConfig: {
    home: createMediaItem(),
    inner: createMediaItem()
  },
  /** 功能开关 */
  featureConfig: {
    voiceBroadcast: false,
    wifiTransfer: true,
    networkTransfer: true,
    receiptPrint: false,
    camera: false,
    homeQrcode: false,
    queue: false
  }
  // 后续模块数据在此追加
})

const timeoutModules = computed(() => [
  {
    key: 'pageTimeout' as TimeoutField,
    title: t('admin.system.pageTimeoutTitle')
  },
  {
    key: 'editTimeout' as TimeoutField,
    title: t('admin.system.editTimeoutTitle')
  },
  {
    key: 'paymentTimeout' as TimeoutField,
    title: t('admin.system.paymentTimeoutTitle')
  }
])

const mediaModules = computed(() => [
  { key: 'home' as MediaKey, title: t('admin.system.homeMedia') },
  { key: 'inner' as MediaKey, title: t('admin.system.innerMedia') }
])

type FeatureKey = keyof typeof systemSettings.featureConfig

const featureModules = computed(() => [
  {
    title: t('admin.system.featVoiceTitle'),
    items: [
      {
        key: 'voiceBroadcast' as FeatureKey,
        label: t('admin.system.featVoiceLabel'),
        desc: t('admin.system.featVoiceDesc')
      }
    ]
  },
  {
    title: t('admin.system.featTransferTitle'),
    items: [
      {
        key: 'wifiTransfer' as FeatureKey,
        label: t('admin.system.featWifiLabel'),
        desc: t('admin.system.featWifiDesc')
      },
      {
        key: 'networkTransfer' as FeatureKey,
        label: t('admin.system.featCloudLabel'),
        desc: t('admin.system.featCloudDesc')
      }
    ]
  },
  {
    title: t('admin.system.featInvoiceTitle'),
    items: [
      {
        key: 'receiptPrint' as FeatureKey,
        label: t('admin.system.featInvoiceLabel'),
        desc: t('admin.system.featInvoiceDesc')
      }
    ]
  },
  {
    title: t('admin.system.featCameraTitle'),
    items: [
      {
        key: 'camera' as FeatureKey,
        label: t('admin.system.featCameraLabel'),
        desc: t('admin.system.featCameraDesc')
      }
    ]
  },
  {
    title: t('admin.system.featQrTitle'),
    items: [
      {
        key: 'homeQrcode' as FeatureKey,
        label: t('admin.system.featQrLabel'),
        desc: t('admin.system.featQrDesc')
      }
    ]
  },
  {
    title: t('admin.system.featQueueTitle'),
    items: [
      {
        key: 'queue' as FeatureKey,
        label: t('admin.system.featQueueLabel'),
        desc: t('admin.system.featQueueDesc')
      }
    ]
  }
])

const keyboardValue = computed({
  get: () => {
    if (!keyboardField.value) return ''
    if (keyboardScope.value === 'timeoutConfig') {
      return systemSettings.timeoutConfig[keyboardField.value as TimeoutField]
    }
    if (keyboardScope.value === 'mediaConfig') {
      return systemSettings.mediaConfig[keyboardField.value as MediaKey].interval
    }
    return systemSettings.accountConfig[keyboardField.value as AccountField]
  },
  set: (value: string) => {
    if (!keyboardField.value) return
    if (keyboardScope.value === 'timeoutConfig') {
      systemSettings.timeoutConfig[keyboardField.value as TimeoutField] = value
      return
    }
    if (keyboardScope.value === 'mediaConfig') {
      systemSettings.mediaConfig[keyboardField.value as MediaKey].interval = value
      return
    }
    systemSettings.accountConfig[keyboardField.value as AccountField] = value
  }
})
</script>

<template>
  <div class="system-page">
    <!-- <h2 class="text-24 font-bold text-gray-800 pb-16 mb-20 border-b border-gray-200">{{ t('admin.system.title') }}</h2> -->

    <div class="flex flex-col gap-20 pb-20">
      <!-- 软件更新 -->
      <el-card shadow="never" class="system-module-card">
        <template #header>
          <span class="text-16 font-bold text-gray-800">{{ t('admin.system.deviceInfo') }}</span>
        </template>

        <div class="flex items-center justify-between mb-18">
          <div class="text-14 text-gray-700">
            {{ t('admin.system.deviceName') }}
            <span class="text-gray-900">{{ setting_options?.device_name }} </span>
          </div>
        </div>
        <div class="flex items-center justify-between mb-18">
          <div class="text-14 text-gray-700">
            {{ t('admin.system.deviceNum') }}
            <span class="text-gray-900">{{ setting_options?.device_num }} </span>
          </div>
        </div>

        <div class="flex items-center justify-between mb-24">
          <div class="text-14 text-gray-700">
            {{ t('admin.system.softwareVersion') }}
            <span class="text-gray-900">{{ systemSettings.softwareUpdate.currentVersion }}</span>
          </div>
          <div v-if="systemSettings.softwareUpdate.updateVersion" class="text-14 text-gray-700">
            {{ t('admin.system.latestVersion') }}
            <span class="text-gray-900">{{ systemSettings.softwareUpdate.updateVersion }}</span>
          </div>
          <div v-if="upgrade_installing" class="text-14 text-gray-700">
            {{ t('admin.system.downloadProgress') }}
            <span class="text-gray-900">{{ download_progress.toFixed(1) }}</span>
          </div>
          <el-button type="primary" :loading="upgrade_checking || upgrade_installing" @click="handleCheckUpdate">
            {{ !systemSettings.softwareUpdate.updateVersion ? t('admin.system.checkUpdate') :
              t('admin.system.updateVersion') }}
          </el-button>
        </div>

        <div class="text-14 font-bold text-gray-800 mb-12">{{ t('admin.system.updateMode') }}</div>
        <el-select v-model="systemSettings.softwareUpdate.updateMode" :placeholder="t('admin.system.selectUpdateMode')"
          class="w-full max-w-400">
          <el-option v-for="item in updateModeOptions" :key="item.value" :label="item.label" :value="item.value" />
        </el-select>
        <p class="mt-10 text-12 text-gray-400 leading-relaxed">
          {{ t('admin.system.autoUpdateHint') }}
        </p>

        <div class="flex justify-end mt-8">
          <el-button type="primary" :loading="app_saving" @click="handleSaveUpdate">
            {{ t('admin.common.save') }}
          </el-button>
        </div>
      </el-card>

      <!-- 账户配置 -->
      <el-card shadow="never" class="system-module-card">
        <template #header>
          <span class="text-16 font-bold text-gray-800">{{ t('admin.system.accountConfig') }}</span>
        </template>

        <el-form label-width="auto" label-position="left" class="account-form">
          <div class="account-form-col">
            <el-form-item :label="t('admin.system.wsUrl')">
              <div class="address-combo">
                <el-input v-model="systemSettings.accountConfig.wsUrl" readonly
                  :placeholder="t('admin.system.enterWsUrl')"
                  @focus="openKeyboard('accountConfig', 'wsUrl', 'default', $event)" @paste="onFieldPaste" />
                <el-select v-model="systemSettings.accountConfig.wsUrl" class="address-preset-select" placeholder=" "
                  teleported>
                  <el-option v-for="item in addressOptions.ws_api" :key="item" :label="item" :value="item" />
                </el-select>
              </div>
            </el-form-item>
            <el-form-item :label="t('admin.system.apiUrl')">
              <div class="address-combo">
                <el-input v-model="systemSettings.accountConfig.apiUrl" readonly
                  :placeholder="t('admin.system.selectOrEnterApiUrl')"
                  @focus="openKeyboard('accountConfig', 'apiUrl', 'default', $event)" @paste="onFieldPaste" />
                <el-select v-model="systemSettings.accountConfig.apiUrl" class="address-preset-select" placeholder=" "
                  teleported>
                  <el-option v-for="item in addressOptions.http_api" :key="item" :label="item" :value="item" />
                </el-select>
              </div>
            </el-form-item>
            <el-form-item :label="t('admin.system.h5Url')">
              <div class="address-combo">
                <el-input v-model="systemSettings.accountConfig.h5Url" readonly
                  :placeholder="t('admin.system.selectOrEnterH5Url')"
                  @focus="openKeyboard('accountConfig', 'h5Url', 'default', $event)" @paste="onFieldPaste" />
                <el-select v-model="systemSettings.accountConfig.h5Url" class="address-preset-select" placeholder=" "
                  teleported>
                  <el-option v-for="item in addressOptions.h5_url" :key="item" :label="item" :value="item" />
                </el-select>
              </div>
            </el-form-item>
          </div>
          <div class="account-form-col">
            <el-form-item :label="t('admin.system.pcAccount')">
              <el-input v-model="systemSettings.accountConfig.pcAccount" readonly
                :placeholder="t('admin.system.enterPcAccount')"
                @focus="openKeyboard('accountConfig', 'pcAccount', 'default', $event)" @paste="onFieldPaste" />
            </el-form-item>
            <el-form-item :label="t('admin.system.pcPassword')">
              <el-input v-model="systemSettings.accountConfig.pcPassword" type="password" show-password readonly
                :placeholder="t('admin.system.enterPcPassword')"
                @focus="openKeyboard('accountConfig', 'pcPassword', 'default', $event)" @paste="onFieldPaste" />
            </el-form-item>
            <el-form-item :label="t('admin.system.deviceToken')">
              <el-input v-model="systemSettings.accountConfig.deviceToken" readonly
                :placeholder="t('admin.system.enterDeviceToken')"
                @focus="openKeyboard('accountConfig', 'deviceToken', 'default', $event)" @paste="onFieldPaste" />
            </el-form-item>
          </div>
        </el-form>

        <div class="flex justify-end mt-8">
          <el-button type="primary" :loading="api_saving" @click="handleSaveAccount">
            {{ t('admin.common.save') }}
          </el-button>
        </div>
      </el-card>


      <!-- 背景媒体：左首页 / 右内页 -->
      <el-card shadow="never" class="system-module-card media-module-card">
        <template #header>
          <span class="text-16 font-bold text-gray-800">{{ t('admin.system.backgroundMedia') }}</span>
        </template>
        <div class="media-grid">
          <div v-for="item in mediaModules" :key="item.key" class="media-item" :class="`media-item--${item.key}`">
            <div class="text-16 font-bold text-gray-800 mb-20">{{ item.title }}</div>

            <el-form label-width="100px" label-position="left" class="media-form">
              <el-form-item :label="t('admin.system.mediaType')">
                <div class="flex items-center justify-between gap-16 w-full">
                  <el-radio-group v-model="systemSettings.mediaConfig[item.key].type">
                    <el-radio value="image">{{ t('admin.system.image') }}</el-radio>
                    <el-radio value="video">{{ t('admin.system.video') }}</el-radio>
                  </el-radio-group>
                  <span class="media-tip shrink-0">
                    {{ systemSettings.mediaConfig[item.key].type === 'image'
                      ? t('admin.system.imageCarouselTip', { formats: IMAGE_FORMAT_TIP })
                      : t('admin.system.videoFormatTip', { formats: VIDEO_FORMAT_TIP }) }}
                  </span>
                </div>
              </el-form-item>

              <template v-if="systemSettings.mediaConfig[item.key].type === 'image'">
                <el-form-item :label="t('admin.system.pollInterval')">
                  <div class="flex items-center gap-10 w-full">
                    <el-input v-model="systemSettings.mediaConfig[item.key].interval" readonly class="flex-1"
                      :placeholder="t('admin.system.enterPollInterval')"
                      @focus="openKeyboard('mediaConfig', item.key, 'numeric')" @paste="onFieldPaste" />
                    <span class="text-14 text-gray-600">{{ t('admin.common.seconds') }}</span>
                  </div>
                </el-form-item>

                <el-form-item :label="t('admin.system.imageFile')">
                  <el-upload v-model:file-list="systemSettings.mediaConfig[item.key].imageFileList"
                    list-type="picture-card" :accept="IMAGE_ACCEPT" multiple :auto-upload="false"
                    :on-change="handleImageChange(item.key)" :on-remove="handleImageRemove(item.key)"
                    :on-preview="handleImagePreview">
                    <span class="upload-trigger-text">{{ t('admin.system.selectFile') }}</span>
                  </el-upload>
                </el-form-item>
              </template>

              <template v-else>
                <el-form-item :label="t('admin.system.videoFile')">
                  <div class="flex items-center gap-12 flex-wrap">
                    <el-upload v-model:file-list="systemSettings.mediaConfig[item.key].videoFileList"
                      :accept="VIDEO_ACCEPT" :limit="1" :auto-upload="false" :show-file-list="false"
                      :on-change="handleVideoChange(item.key)" :on-exceed="handleVideoExceed(item.key)">
                      <el-button>
                        {{ systemSettings.mediaConfig[item.key].videoName ? t('admin.system.reselectFile') :
                          t('admin.system.selectFile') }}
                      </el-button>
                    </el-upload>
                    <span v-if="systemSettings.mediaConfig[item.key].videoName" class="text-14 text-gray-600">
                      {{ systemSettings.mediaConfig[item.key].videoName }}
                    </span>
                    <el-button v-if="systemSettings.mediaConfig[item.key].videoName" type="danger" link
                      @click="handleVideoRemove(item.key)">
                      {{ t('admin.common.delete') }}
                    </el-button>
                  </div>
                </el-form-item>

                <el-form-item :label="t('admin.system.preview')">
                  <div class="video-preview">
                    <video v-if="systemSettings.mediaConfig[item.key].videoUrl"
                      :src="systemSettings.mediaConfig[item.key].videoUrl" controls class="video-player" />
                    <div v-else class="video-empty">{{ t('admin.system.noVideo') }}</div>
                  </div>
                </el-form-item>
              </template>
            </el-form>
          </div>
        </div>
        <div class="flex justify-end mt-8">
          <el-button type="primary" :loading="media_saving" @click="handleSaveMedia">
            {{ t('admin.common.save') }}
          </el-button>
        </div>
      </el-card>

      <!-- 无操作超时设置 -->
      <el-card shadow="never" class="system-module-card timeout-module-card">
        <template #header>
          <span class="text-16 font-bold text-gray-800">{{ t('admin.system.timeoutSettings') }}</span>
        </template>
        <div class="timeout-grid">
          <div v-for="item in timeoutModules" :key="item.key" class="timeout-item">
            <div class="text-16 font-bold text-gray-800 mb-16">{{ item.title }}</div>
            <div class="text-14 text-gray-700 mb-10">{{ t('admin.system.timeoutSeconds') }}</div>
            <el-input v-model="systemSettings.timeoutConfig[item.key]" readonly
              :placeholder="t('admin.system.enterTimeout')" @focus="openKeyboard('timeoutConfig', item.key, 'numeric')"
              @paste="onFieldPaste" />
            <p class="mt-10 text-12 text-gray-400 leading-relaxed">
              {{ t('admin.system.timeoutHint') }}
            </p>
          </div>
        </div>
        <div class="flex justify-end mt-8">
          <el-button type="primary" :loading="ui_saving" @click="handleSaveTimeout">
            {{ t('admin.common.save') }}
          </el-button>
        </div>
      </el-card>

      <!-- 功能开关 -->
      <el-card shadow="never" class="system-module-card feature-module-card">
        <template #header>
          <span class="text-16 font-bold text-gray-800">{{ t('admin.system.featureSwitches') }}</span>
        </template>
        <div class="feature-list">
          <section v-for="group in featureModules" :key="group.title" class="feature-section">
            <h3 class="feature-section-title">{{ group.title }}</h3>
            <div class="feature-rows">
              <div v-for="item in group.items" :key="item.key" class="feature-row">
                <div class="feature-row-text">
                  <div class="feature-row-label">{{ item.label }}</div>
                  <p class="feature-row-desc">{{ item.desc }}</p>
                </div>
                <el-switch v-model="systemSettings.featureConfig[item.key]" class="feature-row-switch" />
              </div>
            </div>
          </section>
        </div>
        <div class="flex justify-end mt-8">
          <el-button type="primary" :loading="option_saving" @click="handleSaveOption">
            {{ t('admin.common.save') }}
          </el-button>
        </div>
      </el-card>
    </div>

    <el-image-viewer v-if="imagePreviewVisible" :url-list="[imagePreviewUrl]" @close="imagePreviewVisible = false" />

    <!-- 虚拟键盘：Teleport 到 body，无蒙版 -->
    <Teleport to="body">
      <div v-if="keyboardVisible" class="keyboard-overlay">
        <div class="keyboard-panel" :style="{ transform: `translate(${keyboardPos.x}px, ${keyboardPos.y}px)` }"
          @mousedown.stop @click.stop>
          <AdminKeyboardDragBar @close="closeKeyboard" @drag-start="onDragStart" />
          <div class="keyboard-preview">
            <input ref="keyboardInputRef" v-model="keyboardValue" class="keyboard-input"
              :type="isKeyboardPassword ? 'password' : 'text'" inputmode="none"
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

.max-w-400 {
  max-width: 400px;
}

.account-form :deep(.el-form-item) {
  margin-bottom: 18px;
}

.account-form-col :deep(.el-form-item) {
  margin-bottom: 18px;
}

.account-form-col :deep(.el-form-item:last-child) {
  margin-bottom: 0;
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

.timeout-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 20px 24px;
  align-items: start;
}

.timeout-module-card :deep(.el-card__body) {
  padding-left: 24px;
  padding-right: 24px;
}

.timeout-item {
  min-width: 0;
  padding: 16px;
  background: #fafbfc;
  border: 1px solid #eef1f4;
  border-radius: 10px;
}

@media (orientation: portrait) {
  .timeout-grid {
    grid-template-columns: 1fr;
    gap: 16px;
  }
}

.media-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 32px;
  align-items: start;
}

.media-module-card :deep(.el-card__body) {
  padding-left: 24px;
  padding-right: 24px;
}

.media-item {
  min-width: 0;
}

.media-item--home {
  padding-right: 16px;
  border-right: 1px solid #eef1f4;
}

.media-item--inner {
  padding-left: 16px;
}

@media (orientation: portrait) {
  .media-grid {
    grid-template-columns: 1fr;
    gap: 28px 0;
  }

  .media-item--home {
    padding-right: 0;
    padding-bottom: 28px;
    border-right: none;
    border-bottom: 1px solid #eef1f4;
  }

  .media-item--inner {
    padding-left: 0;
  }
}

.feature-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px 20px;
}

.feature-section {
  min-width: 0;
  padding: 14px 16px 6px;
  background: #fafbfc;
  border: 1px solid #eef1f4;
  border-radius: 10px;
}

.feature-section-title {
  margin: 0 0 8px;
  padding: 0 2px;
  font-size: 13px;
  font-weight: 600;
  color: #6b7280;
  letter-spacing: 0.02em;
}

.feature-rows {
  display: flex;
  flex-direction: column;
}

.feature-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 2px;
  border-top: 1px solid #eef1f4;
}

.feature-row:first-child {
  border-top: none;
}

.feature-row-text {
  min-width: 0;
  flex: 1;
}

.feature-row-label {
  font-size: 14px;
  font-weight: 500;
  color: #1f2937;
  line-height: 1.4;
}

.feature-row-desc {
  margin: 4px 0 0;
  font-size: 12px;
  color: #9ca3af;
  line-height: 1.5;
}

.feature-row-switch {
  flex-shrink: 0;
}

.feature-module-card :deep(.el-switch.is-checked .el-switch__core) {
  background-color: #027bfc;
  border-color: #027bfc;
}

.media-form :deep(.el-form-item) {
  margin-bottom: 18px;
}

.media-form :deep(.el-form-item__content) {
  flex: 1;
  min-width: 0;
}

.media-tip {
  color: #c0c4cc;
  font-size: 12px;
  line-height: 1.4;
  font-weight: 400;
}

.upload-trigger-text {
  font-size: 13px;
  color: #606266;
  padding: 0 6px;
  text-align: center;
  line-height: 1.3;
}

.video-preview {
  width: 100%;
  max-width: 320px;
  min-height: 220px;
  background: #111;
  border-radius: 8px;
  overflow: clip;
  display: flex;
  align-items: center;
  justify-content: center;
}

.video-player {
  width: 100%;
  max-height: 420px;
  display: block;
  background: #000;
}

.video-empty {
  color: #9ca3af;
  font-size: 13px;
  padding: 24px;
  text-align: center;
}

.address-combo {
  position: relative;
  width: 100%;
}

.address-combo :deep(.el-input) {
  width: 100%;
}

/* 给右侧箭头留出点击区，避免输入框拦截下拉点击 */
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

/* 隐藏已选文案，但保留可点的 caret（勿用 display:none，否则 EP 下拉点击失效） */
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

.keyboard-drag-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 0 12px;
  cursor: grab;
  touch-action: none;
}

.keyboard-drag-bar:active {
  cursor: grabbing;
}

.drag-hint {
  font-size: 13px;
  color: #9ca3af;
}

.keyboard-input-preview {
  position: relative;
  margin-bottom: 12px;
  user-select: text;
  -webkit-user-select: text;
  touch-action: none;
  overflow: visible;
}

.keyboard-feedback-input :deep(.el-input__wrapper) {
  min-height: 48px;
  border-radius: 10px;
  box-shadow: 0 0 0 1px #dcdfe6 inset;
}

.keyboard-feedback-input :deep(.el-input__inner) {
  font-size: 18px;
  user-select: text;
  -webkit-user-select: text;
  caret-color: #027bfc;
}

.sel-highlight {
  position: absolute;
  z-index: 2;
  background: rgba(2, 123, 252, 0.28);
  pointer-events: none;
  border-radius: 2px;
}

.sel-handle {
  position: absolute;
  z-index: 5;
  width: 20px;
  margin-left: -10px;
  touch-action: none;
  cursor: ew-resize;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.sel-handle-line {
  width: 2px;
  flex: 1;
  min-height: 0;
  background: #027bfc;
  border-radius: 1px;
  pointer-events: none;
}

.sel-handle-knob {
  width: 8px;
  height: 8px;
  background: #1a1a1a;
  flex-shrink: 0;
  pointer-events: none;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.25);
}

/* 左侧：水滴在竖线顶部，尖角朝下衔接竖线 */
.sel-handle-start {
  flex-direction: column;
}

.sel-handle-start .sel-handle-knob {
  order: -1;
  border-radius: 50% 50% 50% 0;
  transform: rotate(-45deg);
  margin-bottom: -2px;
}

/* 右侧：水滴在竖线底部，尖角朝上衔接竖线 */
.sel-handle-end {
  flex-direction: column;
}

.sel-handle-end .sel-handle-knob {
  order: 1;
  border-radius: 50% 50% 50% 0;
  transform: rotate(135deg);
  margin-top: -2px;
}

.android-action-mode {
  position: fixed;
  z-index: 10001;
  display: flex;
  align-items: stretch;
  min-width: 268px;
  background: #424242;
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.28);
  overflow: hidden;
  pointer-events: auto;
}

.android-action-item {
  flex: 1;
  border: none;
  background: transparent;
  color: #fff;
  font-size: 14px;
  padding: 12px 10px;
  cursor: pointer;
  white-space: nowrap;
}

.android-action-item+.android-action-item {
  border-left: 1px solid rgba(255, 255, 255, 0.12);
}

.android-action-item:disabled {
  color: rgba(255, 255, 255, 0.34);
  cursor: not-allowed;
}

.android-action-item:not(:disabled):active,
.android-action-item:not(:disabled):hover {
  background: rgba(255, 255, 255, 0.12);
}

.keyboard-body {
  background: #fff;
  border-radius: 12px;
  padding: 16px 20px;
  min-height: 280px;
}

.keyboard-body.is-numeric {
  min-height: 0;
  padding: 12px 16px 8px;
}

.keyboard-body.is-numeric :deep(.h-full) {
  height: auto !important;
  flex: none !important;
}

.keyboard-body.is-numeric :deep(.flex-1) {
  flex: none !important;
}
</style>
