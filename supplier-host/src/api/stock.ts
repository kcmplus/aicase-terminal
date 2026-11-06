import { invoke } from "@tauri-apps/api/core";

export enum StockCmd {

}

export enum StockEvent {
    STOCK_INFO_CHANGED = 'stock_info_changed', // 库存信息变化（包括库存每个货道的扫描状态）
    STOCK_SCAN_STATUS = 'stock_scan_status',  // 库存扫描状态变化
}

// 库存模板结构
export interface StockTpl {
    slot_rows: number;  // 货道行数
    slot_cols: number;  // 货道列数
    slot_volume: number;// 货道容量（单货道库存上限）
}

// 库存货道结构
export interface StockItem {
    slot: number;           // 货道ID
    row: number;            // 货道行
    col: number;            // 货道列
    material_id: string;    // 材质ID
    goods_id: number;       // 商品ID
    price: number;          // 价格
    count: number;          // 库存数
    disabled: boolean;      // 是否禁用

    model_id: string;       // 对应型号ID
    model_lang_id: string;  // 对应型号语言
    model_body_image: string;   // 对应型号产品图

    scanning: boolean   // 是否扫描中
}

export interface StockInfoChanged {
    slot: number;
}

// 获取货道模版
export async function get_stock_tpl(): Promise<StockTpl> {
    return await invoke<StockTpl>("get_stock_tpl");
}

// 获取货道商品
export async function get_stock_list(): Promise<Array<StockItem>> {
    return await invoke<Array<StockItem>>("get_stock_list");
}

// 获取库存扫描状态
export async function get_stock_scanning(): Promise<boolean> {
    return await invoke<boolean>("get_stock_scanning");
}

// 按品牌添加库存
export async function add_batch_stock(brand_id: string): Promise<void> {
    await invoke<void>("add_batch_stock", {
        brand_id
    });
}

// 开始库存扫描
export async function start_scan_stock(): Promise<void> {
    await invoke<void>("start_scan_stock");
}

// 取消库存扫描
export async function cancel_scan_stock(): Promise<void> {
    await invoke<void>("cancel_scan_stock");
}

// 更新库存货道信息
export async function update_slot_item(slot: number, material_id: string, price: number, count: number, disabled: boolean): Promise<void> {
    await invoke<void>("update_slot_item", {
        slot,
        material_id,
        price,
        count,
        disabled,
    });
}

// 更新库存所有货道库存数
export async function update_slot_count_all(count: number): Promise<void> {
    await invoke<void>("update_slot_count_all", {
        count,
    });
}


