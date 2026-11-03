import { invoke } from "@tauri-apps/api/core";
import { PcBrandItem, PcMaterialItem, PcModelItem, PcSeriesItem } from "./pclib";

export enum ProductCmd {

}

// 产品事件
export enum ProductEvent {
    PRODUCT_INFO_CHANGED = 'product_info_changed',  // 产品列表变化（库存调整引起）
}

// 获取当前可用手机品牌列表（根据库存过滤）
export async function get_brands(): Promise<Array<PcBrandItem>> {
    return await invoke<Array<PcBrandItem>>("get_brands");
}

// 获取当前可用手机系列列表（根据品牌ID过滤）
export async function get_series(brand_id: string): Promise<Array<PcSeriesItem>> {
    return await invoke<Array<PcSeriesItem>>("get_series", {
        brand_id,
    });
}

// 获取当前可用手机型号列表（根据系列ID过滤）
export async function get_models(series_id: string): Promise<Array<PcModelItem>> {
    return await invoke<Array<PcModelItem>>("get_models", {
        series_id
    });
}

// 获取型号信息（根据型号ID过滤）
export async function get_stock_model_by_id(model_id: string): Promise<PcModelItem | null> {
    return await invoke<PcModelItem | null>("get_stock_model_by_id", {
        model_id,
    });
}

// 获取型号信息（根据材质ID过滤）
export async function get_stock_material_by_id(material_id: string): Promise<PcMaterialItem | null> {
    return await invoke<PcMaterialItem | null>("get_stock_material_by_id", {
        material_id,
    });
}