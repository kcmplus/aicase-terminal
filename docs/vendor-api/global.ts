import { invoke } from "@tauri-apps/api/core"
import { logWarn } from "@/common/logger";

export enum UIError {
    SUCCESS = 0,
    PARAM_ERROR = 10001,
}

// UI发送给Rust的指令
export enum UICmd {
    UI_INITED = 'ui_inited',    // UI初始化完成
    UI_TESTING = 'ui_testing'   // 测试专用
}

// Rust事件
export enum UIEvent {
    LOADING_PROGRESS = 'loading_progress',  // Loading进度通知
    LOADING_FINISHED = 'loading_finished'   // Loading完成通知
}

// Loading进度信息
export interface LoadingInfo {
    percent: number // 百分比
    text: string    // 显示文本
}

// 全局配置
export interface GlobalConfig {
    app_cache_dir: string,  // App缓存目录，windows为 ~\AppData\Local\com.wm.phonecase-diy
    app_is_japan: boolean,
}

// 多媒体结构
export interface MediaItem {
    mtype: string,
    interval: number,
    images: Array<string>,
    videos: Array<string>,
}
/**
 *
 * 获取串口名字列表
 * @export
 * @return {*}  {Promise<Array<string>>}
 */
export async function get_serial_ports(): Promise<Array<string>> {
    return await invoke<Array<string>>("get_serial_ports");
}

/**
 *
 * 获取全局配置
 * @export
 * @return {*}  {Promise<GlobalConfig>}
 */
export async function get_global_config(): Promise<GlobalConfig> {
    return await invoke<GlobalConfig>("get_global_config");
}

/**
 *
 * 获取媒体配置信息
 * @export
 * @param {string} page_type home=首页，inner=内页
 * @return {*}  {(Promise<MediaItem | null>)}
 */
export async function get_media_info(page_type: string): Promise<MediaItem | null> {
    return await invoke<MediaItem | null>("get_media_info", { page_type });
}

/**
 *
 * 当前是否全屏
 * @export
 * @return {*}  {Promise<boolean>}
 */
export async function is_fullscreen(): Promise<boolean> {
    return await invoke<boolean>("is_fullscreen");
}

/**
 *
 * 设置全屏
 * @export
 * @param {boolean} fullscreen， 是否全屏
 * @return {*}  {Promise<string>}
 */
export async function set_fullscreen(fullscreen: boolean): Promise<void> {
    try {
        await invoke<string>("set_fullscreen", {
            fullscreen
        });
    } catch (err) {
        logWarn("invoke failed, err: ", err);
    }
}

/**
 *
 * 返回App缓存目录拼合的目录，比如: ~\AppData\Local\com.wm.phonecase-diy\orders
 * @export
 * @param {string} dir
 * @return {*}  {Promise<string>}
 */
export async function join_app_cache_dir(dir: string): Promise<string> {
    return await invoke<string>("join_app_cache_dir", { dir });
}

/**
 *
 * 返回App缓存目录拼合的文件，比如: ~\AppData\Local\com.wm.phonecase-diy\orders
 * @export
 * @param {string} dir
 * @return {*}  {Promise<string>}
 */
export async function join_app_cache_file(dir: string, file: string): Promise<string> {
    return await invoke<string>("join_app_cache_file", { dir, file });
}


/**
 *
 * 清理某个目录里所有内容
 * @export
 * @param {string} dir 目录路径
 * @return {*}  {Promise<string>}
 */
export async function clear_directory(dir: string): Promise<string> {
    return await invoke<string>("clear_directory", { dir });
}

/**
 *
 * 拷贝文件
 * @export
 * @param {string} src_file 源文件
 * @param {string} dst_file 目标文件
 * @return {*}  {Promise<void>}
 */
export async function copy_file(src_file: string, dst_file: string): Promise<void> {
    try {
        await invoke<string>("copy_file", { src_file, dst_file });
    } catch (err) {
        logWarn("invoke failed, err: ", err);
    }
}

/**
 *
 * 保存文件
 * @export
 * @param {string} filename 文件路径
 * @param {Uint8Array} data 文件内容
 * @return {*}  {Promise<string>}
 */
export async function save_file(filename: string, data: Uint8Array): Promise<void> {
    try {
        await invoke<string>("save_file", { filename, data });
    } catch (err) {
        logWarn("invoke failed, err: ", err);
        throw err
    }
}



/**
 *
 * 保存文件
 * @export
 * @param {string} filename 文件路径
 * @param {Uint8Array} data 文件内容
 * @return {*}  {Promise<string>}
 */
export async function save_file_raw(filename: string, data: Uint8Array): Promise<void> {
    try {
        await invoke<string>("save_file_raw", data, {
            headers: { "x-save-path": encode_path(filename) },
        })
    } catch (err) {
        logWarn("invoke failed, err: ", err);
        throw err
    }
}

function encode_path(path: string): string {
    const bytes = new TextEncoder().encode(path)
    let bin = ''
    for (const b of bytes) bin += String.fromCharCode(b)
    return btoa(bin)
}

/**
 *
 * UI初始化
 * @export
 * @return {*}  {Promise<void>}
 */
export async function ui_inited(): Promise<void> {
    await invoke<void>("ui_inited");
}
/**
 *
 * UI键盘事件
 * @export
 * @param {string} key
 * @return {*}  {Promise<void>}
 */
export async function ui_keyboard_event(key: string): Promise<void> {
    await invoke<void>("ui_keyboard_event", { key });
}

/**
 *
 * UI 测试事件
 * @export
 * @param {string} key
 * @return {*}  {Promise<void>}
 */
export async function ui_testing(key: string): Promise<void> {
    await invoke<void>("ui_testing", { key });
}