import { invoke } from "@tauri-apps/api/core";
import { logWarn } from "@/common/logger";

export enum UpgradeEvent {
    UPGRADE_STARTED = 'upgrade://upgrade-started',
    DOWNLOAD_PROGRESS = 'upgrade://download-progress'
}

// 更新模式
export enum UpgradeMode {
    Manual = 'manual',  // 手动更新
    Auto = 'auto'       // 自动更新
}

// App新版本信息
export interface UpgradeInfo {
    version: string,    // 新版本号
    changelog: string,  // 版本更新内容
    pub_date: string,   // 版本发布时间
    force_update: boolean, // 是否强制更新
    gray_update: boolean,   // 是否灰度更新
}

export interface UpgradeProgress {
    progress: number,
}

/**
 *
 * 检查新版本
 * @export
 * @return {*}  {Promise<UpgradeInfo>}
 */
export async function check_for_update(): Promise<UpgradeInfo | null> {
    try {
        return await invoke<UpgradeInfo | null>("check_for_update");
    } catch (err) {
        logWarn("invoke failed, err: ", err);
        throw err
    }
}

/**
 *
 * 下载并安装新版本
 * @export
 * @return {*}  {Promise<void>}
 */
export async function download_and_install_update(): Promise<void> {
    try {
        await invoke<void>("download_and_install_update");
    } catch (err) {
        logWarn("invoke failed, err: ", err);
    }
}