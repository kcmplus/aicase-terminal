import { logWarn } from "@/common/logger";
import { invoke } from "@tauri-apps/api/core";

export enum SettingCmd {
}

// 设置通知事件
export enum SettingEvent {
    SETTING_CONFIGS_CHANGED = 'setting_configs_changed',    // 配置设置变化通知
    SETTING_OPTIONS_CHANGED = 'setting_options_changed',    // 选项设置变化通知
    SETTING_PAYMENT_CHANGED = 'setting_payment_changed',    // 支付设置变化通知
    SETTING_LOCK_CHANGED = 'setting_lock_changed',    // 机器锁定状态变化通知
}

// App信息
export interface SettingAppConfig {
    app_ver: string,
    update_mode: string,
    upgrade_ver: string,
    upgrade_log: string,

}

// API配置
export interface SettingAPIConfig {
    ws_api_url: string,
    http_api_url: string,
    h5_base_url: string,
    username: string,
    password: string,
    device_mac: string,

}

// 网络配置
export interface SettingNetConfig {

}

// MDB配置
export interface SettingMdbConfig {
    enabled: boolean,
    port_name: string,  // 串口ID, 为空时，自动识别，建议留空
    baud_rate: number,  // 串口波特率, 为0时，自动调整为默认9600， 建议留空
    resolution: string, // MDB精度分辨率, 如果金额有小数点，选Res001,  如果没有小数点，建议选RES1
    card_resolution: string, // 刷卡器约定分辨率, 如果金额较大，可以设置放大金额，同时刷卡器也得支持，默认选RES1
    card_device: string,    // MDB刷卡器设备类型，用于保活刷卡器，默认Nayax, NVC1000设备选择NVC1000
    card_channel: string,   // MDB刷卡通道类型，MDB转换器所需参数，默认Nayax，NVC1000设备也选Nayax
    card_level: string,     // MDB协议，默认L3, Nayax选L3, NVC1000选L2
    backend_type: string,   // 后端基座类型，默认研龙底座，无需设置
}

// ME支付配置
export interface SettingMeConfig {
    enabled: boolean,
    install_dir: string,
    port_name: string,
    baud_rate: number,
}

// Salo支付配置
export interface SettingSaloConfig {
    enabled: boolean,
    port_name: string,
    baud_rate: number,
    host: string,
    port: number,
    backend_type: string,
}

// 机械臂配置
export interface SettingGripperConfig {
    host: string,
    port: number,
    backend_type: string,

}

// 打印机配置
export interface SettingPrinterConfig {
    host: string,
    port: number,
    bind_host: string,
    bind_port: number,
    printer_name: string,
    backend_type: string,
}

// 视觉器配置
export interface SettingVisionConfig {
    host: string,
    port: number,
    backend_type: string,
}

// 库存配置
export interface SettingStockConfig {
    slot_rows: number,
    slot_cols: number,
}

// 打印配置
export interface SettingPrintConfig {
    work_dir: string,
    camera_device_id: string | null
    height_enabled: boolean,
    print_parallel: boolean,
    print_testing: boolean | null,
    rip_timeout_clean: boolean | null,
    backend_type: string | null,
}

// 支付配置
export interface SettingPaymentConfig {
    currency_decimal: number,
}

// 发票配置
export interface SettingInvoiceConfig {
    printer_name: string,
}

// 媒体配置
export interface SettingMediaItem {
    mtype: string,
    interval: number,
    images: Array<string>,
    videos: Array<string>,
}

export interface SettingMediaConfig {
    home: SettingMediaItem,
    inner: SettingMediaItem,
}

// 选项配置
export interface SettingOptionConfig {
    enable_wifi_transfer: boolean,  // 是否开启WIFI传图
    enable_cloud_transfer: boolean, // 是否开启云传图
    enable_invoice_print: boolean,  // 是否启用小票打印
    enable_voice_prompt: boolean,   // 是否启用语音提示
    enable_camera_preview: boolean, // 是否启用视频预览
    enable_order_queue: boolean,    // 是否启用订单排队
    show_h5_entry: boolean,         // 是否显示H5入口
    show_feedback: boolean,         // 是否显示反馈入口
    show_customized: boolean,       // 是否显示定制入口
}

// 测试配置
export interface SettingTestConfig {
    auto_test: Boolean
}

// UI配置
export interface SettingUIConfig {
    page_timeout: number,       // 通用页面超时时间
    edit_timeout: number,       // 编辑页面超时时间
    payment_timeout: number,    // 支付页面超时时间
}

// UI配置
export interface SettingChangedConfig {
    app_changed: boolean,
    api_changed: boolean,
    net_changed: boolean,
    mdb_changed: boolean,
    me_changed: boolean,
    salo_changed: boolean,
    gripper_changed: boolean,
    printer_changed: boolean,
    vision_changed: boolean,
    stock_changed: boolean,
    print_changed: boolean,
    payment_changed: boolean,
    invoice_changed: boolean,
    media_changed: boolean,
    option_changed: boolean,
    test_changed: boolean,
    ui_changed: boolean,
}

export interface SettingConfigs {
    app: SettingAppConfig,
    api: SettingAPIConfig,
    net: SettingNetConfig,
    mdb: SettingMdbConfig,
    me: SettingMeConfig,
    salo: SettingSaloConfig,
    gripper: SettingGripperConfig,
    printer: SettingPrinterConfig,
    vision: SettingVisionConfig,
    stock: SettingStockConfig,
    print: SettingPrintConfig,
    payment: SettingPaymentConfig,
    invoice: SettingInvoiceConfig,
    media: SettingMediaConfig,
    option: SettingOptionConfig,
    test: SettingTestConfig,
    ui: SettingUIConfig,

    changed: SettingChangedConfig
}


// 设置选项信息
export interface SettingOptions {
    device_id: string,              // 设备ID
    device_num: string,             // 设备编号
    device_name: string,            // 设备名字
    device_password: string,        // 设备设置页密码
    language: string,               // 当前选中语言
    selectable_language: string,    // 当前启用语言列表
    currency_symbol: string,        // 当前选用的货币符号
    currency_decimal: number,       // 当前选用的货币小数点
    is_lock: boolean,               // 当前锁定状态
}

export function get_ws_api_options(): Array<string> {
    return ['ws://api.widermatrix.cn/socket/', 'wss://api.autovendpro.com/socket/']
}

export function get_http_api_options(): Array<string> {
    return ['http://api.widermatrix.cn', 'https://api.autovendpro.com']
}

export function get_h5_url_options(): Array<string> {
    return ['http://h5.widermatrix.cn', 'https://h5.autovendpro.com']
}
/**
 * 获取系统打印机列表
 *
 * @export
 * @return {*}  {Promise<Array<String>>}
 */
export async function get_system_printers(): Promise<Array<string>> {
    return await invoke<Array<string>>("get_system_printers");
}

/**
 * 获取设置的配置总信息
 *
 * @export
 * @return {*}  {Promise<SettingConfigs>}
 */
export async function get_setting_configs(): Promise<SettingConfigs> {
    return await invoke<SettingConfigs>("get_setting_configs");
}

/**
 * 获取设置的打印相关信息（减少内存拷贝）
 *
 * @export
 * @return {*}  {Promise<SettingConfigs>}
 */
export async function get_setting_print_config(): Promise<SettingPrintConfig> {
    return await invoke<SettingPrintConfig>("get_setting_print_config");
}

/**
 * 获取设置的选项相关信息（减少内存拷贝）
 *
 * @export
 * @return {*}  {Promise<SettingConfigs>}
 */
export async function get_setting_option_config(): Promise<SettingOptionConfig> {
    return await invoke<SettingOptionConfig>("get_setting_option_config");
}

/**
 * 获取设置的UI相关信息（减少内存拷贝）
 *
 * @export
 * @return {*}  {Promise<SettingConfigs>}
 */
export async function get_setting_ui_config(): Promise<SettingUIConfig> {
    return await invoke<SettingUIConfig>("get_setting_ui_config");
}

/**
 * 获取设置的变化标记信信息, changed标记为true, 才更新
 *
 * @export
 * @return {*}  {Promise<SettingConfigs>}
 */
export async function get_setting_changed_config(): Promise<SettingChangedConfig> {
    return await invoke<SettingChangedConfig>("get_setting_changed_config");
}

/**
 *
 * 获取设置的选项信息
 * @export
 * @return {*}  {Promise<SettingOptions>}
 */
export async function get_setting_options(): Promise<SettingOptions> {
    return await invoke<SettingOptions>("get_setting_options");
}

/**
 * 保存设置配置，内部会做差异检测，变化才会写入数据库
 *
 * @export
 * @param {SettingConfigs} configs
 * @return {*}  {Promise<void>}
 */
export async function save_setting_configs(
    configs: SettingConfigs): Promise<void> {
    return await invoke<void>("save_setting_configs", {
        configs
    }).catch((err) => {
        logWarn("invoke failed, err: ", err)
    })
}
/**
 * 小票打印测试
 *
 * @export
 * @return {*}  {Promise<void>}
 */
export async function start_invoice_test(): Promise<void> {
    return await invoke<void>("start_invoice_test", {
    }).catch((err) => {
        logWarn("invoke failed, err: ", err)
    })
}

/**
 * 开始批量打印测试
 *
 * @export
 * @return {*}  {Promise<void>}
 */
export async function start_batch_test(): Promise<void> {
    return await invoke<void>("start_batch_test", {
    }).catch((err) => {
        logWarn("invoke failed, err: ", err)
    })
}

/**
 * 停止批量打印测试
 *
 * @export
 * @return {*}  {Promise<void>}
 */
export async function stop_batch_test(): Promise<void> {
    return await invoke<void>("stop_batch_test", {
    }).catch((err) => {
        logWarn("invoke failed, err: ", err)
    })
}

