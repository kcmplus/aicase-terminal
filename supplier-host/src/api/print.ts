import { logWarn } from "@/common/logger"
import { invoke } from "@tauri-apps/api/core"

export enum PrintCmd {
}

export enum PrintEvent {
    PRINT_WARNING = 'print_warning'
}

// 打印状态
export enum PrintStatus {
    Idle = 'idle',                      // 等待处理
    Grabbing = 'grabbing',              // 抓取中
    GrabSuccess = 'grab_success',       // 抓取成功
    GrabFailed = 'grab_failed',         // 抓取失败
    Printing = 'printing',              // 打印中
    PrintSuccess = 'print_success',     // 打印成功
    PrintFailed = 'print_failed',       // 打印失败
    Delivering = 'delivering',          // 出货中
    DeliverSuccess = 'deliver_success', // 出货成功
    DeliverFailed = 'deliver_failed',   // 出货失败
}

// 打印警告
export enum PrintWarning {
    None = 'none',                      // 无警告
    GripperOffline = 'gripper_offline', // 机械臂离线
    PrinterOffline = 'printer_offline', // 打印机离线
    ShippingFull = 'shipping_full',     // 出货仓已满
}

export interface PrintWarningPayload {
    warning: PrintWarning
};

// 转化抓取状态，比如打印时，抓取状态永远是GrabSuccess
export function parse_grab_status(status: string): string {
    if (status == PrintStatus.Printing ||
        status == PrintStatus.PrintSuccess ||
        status == PrintStatus.PrintFailed ||
        status == PrintStatus.Delivering ||
        status == PrintStatus.DeliverSuccess ||
        status == PrintStatus.DeliverFailed) {
        return PrintStatus.GrabSuccess
    } else {
        return status
    }
}

// 转化打印状态
export function parse_print_status(status: string): string {
    if (status == PrintStatus.Delivering ||
        status == PrintStatus.DeliverSuccess ||
        status == PrintStatus.DeliverFailed) {
        return PrintStatus.PrintSuccess
    } else if (status == PrintStatus.Grabbing ||
        status == PrintStatus.GrabSuccess ||
        status == PrintStatus.GrabFailed) {
        return PrintStatus.Idle
    } else {
        return status
    }
}

// 转化出货状态
export function parse_deliver_status(status: string): string {
    if (status == PrintStatus.Grabbing ||
        status == PrintStatus.GrabSuccess ||
        status == PrintStatus.GrabFailed ||
        status == PrintStatus.Printing ||
        status == PrintStatus.PrintSuccess ||
        status == PrintStatus.PrintFailed) {
        return PrintStatus.Idle
    } else {
        return status
    }
}

/**
 * 清理墨盒
 *
 * @export
 * @return {*}  {Promise<string>}
 */
export async function start_clean_nozzle(): Promise<void> {
    try {
        return await invoke<void>("start_clean_nozzle");
    } catch (err) {
        logWarn("invoke failed, err: ", err);
    }
}

/**
 * 测试模式-重置状态
 *
 * @export
 * @return {*}  {Promise<void>}
 */
export async function start_testing_reset(): Promise<void> {
    try {
        return await invoke<void>("start_testing_reset");
    } catch (err) {
        logWarn("invoke failed, err: ", err);
    }
}

/**
 * 测试模式-一键执行（抓取->打印->出货）
 *
 * @export
 * @return {*}  {Promise<void>}
 */
export async function start_testing_all(): Promise<void> {
    try {
        return await invoke<void>("start_testing_all");
    } catch (err) {
        logWarn("invoke failed, err: ", err);
    }
}

/**
 * 测试模式-抓取流程
 *
 * @export
 * @return {*}  {Promise<void>}
 */
export async function start_testing_grab(): Promise<void> {
    try {
        return await invoke<void>("start_testing_grab");
    } catch (err) {
        logWarn("invoke failed, err: ", err);
    }
}

/**
 * 测试模式-打印流程
 *
 * @export
 * @return {*}  {Promise<void>}
 */
export async function start_testing_print(): Promise<void> {
    try {
        return await invoke<void>("start_testing_print");
    } catch (err) {
        logWarn("invoke failed, err: ", err);
    }
}

/**
 * 测试模式-出货流程（废料口）
 *
 * @export
 * @return {*}  {Promise<void>}
 */
export async function start_testing_deliver(): Promise<void> {
    try {
        return await invoke<void>("start_testing_deliver");
    } catch (err) {
        logWarn("invoke failed, err: ", err);
    }
}

