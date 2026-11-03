import { invoke } from "@tauri-apps/api/core";

export enum MachineCmd {
}

// 机器事件通知
export enum MachineEvent {
    MACHINE_INFO_CHANGED = 'machine_info_changed',  // 机器信息变化通知，重新调用get_machine_info
}

// 机器信息
export interface MachineInfo {
    device_id: string,              // 设备ID
    shop_id: string,                // 商户ID
    contact_person: string,         // 商户联系人
    contact_tel: string,            // 商户联系电话
    is_show_contact_tel: boolean,   //是否显示商户联系电话
    
    h5_base_url: string,            // H5入口域名
}

/**
 *
 * 获取机器信息
 * @export
 * @return {*}  {Promise<MachineInfo>}
 */
export async function get_machine_info(): Promise<MachineInfo> {
    return await invoke<MachineInfo>("get_machine_info");
}
