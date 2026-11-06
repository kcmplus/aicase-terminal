import { invoke } from "@tauri-apps/api/core";
import { MdbCardStatus } from "./payment";


export enum SystemEvent {
    DEVICE_STATE_CHANGED = 'device_state_changed',  // 设备状态变化
    MDB_CARD_STATUS = 'mdb_card_status',      // Mdb状态变化
}

// mdb: Mdb设备，gripper: 机械臂，printer: 打印机，netproxy: 网络代理（websocket）
export type DeviceType = 'mdb' | 'gripper' | 'printer' | 'netproxy'

// 常见设备状态
export enum DeviceState {
    DISCONNECTED = 'disconnected',  // 离线
    CONNECTING = 'connecting',      // 连接中
    CONNECTED = 'connected',        // 已连接
    ONLINE = 'online',              // 已在线
}

export interface DeviceItem {
    dtype: DeviceType,  // 设备类型
    state: DeviceState, // 设备状态
}

export interface DeviceInfo {
    mdb: DeviceItem,        // Mdb设备
    gripper: DeviceItem,    // 机械臂
    printer: DeviceItem,    // 打印机
    netproxy: DeviceItem,   // 网络代理（websocket）
    mdb_card_status: MdbCardStatus
}

// 获取设备状态信息
export async function get_device_info(): Promise<DeviceInfo> {
    return await invoke<DeviceInfo>("get_device_info");
}
