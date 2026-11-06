import { invoke } from "@tauri-apps/api/core";

// 手机壳品牌结构
export interface PcBrandItem {
    brand_id: string;   // 手机品牌ID
    image: string;      // 手机品牌Logo
    image2: string;     // 手机品牌Logo
    lang_id: string;    // 手机品牌语言ID
}

// 手机壳系列结构
export interface PcSeriesItem {
    brand_id: string;   // 手机品牌ID
    series_id: string;  // 手机品牌系列ID
    image: string;      // 手机品牌系列图片
    lang_id: string;    // 手机品牌系列语言ID
}

// 手机壳型号结构
export interface PcModelItem {
    brand_id: string;   // 手机品牌ID
    series_id: string;  // 手机系列ID
    model_id: string;   // 手机型号ID
    materials: string;  // 手机材质ID列表（A是普通材质，B是磁性材质）
    image: string;      // 手机型号产品图
    body_image: string; // 手机型号外观图
    mask_image: string; // 手机型号模板图
    lang_id: string;    // 手机型号语言ID
    height: string;     // 手机型号镜头高度

    coupon_amount: number;              // 折扣金额（显示价格=原价格-折扣金额）
    material_list: PcMaterialItem[];    // 手机型号材质列表（在库存里才有数据）
}

// 手机壳材质结构
export interface PcMaterialItem {
    material_id: string;    // 手机壳材质ID
    goods_id: number;       // 手机壳商品ID
    slot: number;           // 手机壳货道ID
    price: number;          // 手机壳价格
    count: number           // 手机壳库存
}

// 获取手机壳品牌列表(全库)
export async function get_brand_list(): Promise<Array<PcBrandItem>> {
    return await invoke<Array<PcBrandItem>>("get_brand_list");
}

// 获取手机壳系列列表(全库)（根据品牌ID过滤）
export async function get_series_list(brand_id: string): Promise<Array<PcSeriesItem>> {
    return await invoke<Array<PcSeriesItem>>("get_series_list", {
        brand_id,
    });
}

// 获取手机壳型号列表(全库)（根据系列ID过滤）
export async function get_model_list(series_id: string): Promise<Array<PcModelItem>> {
    return await invoke<Array<PcModelItem>>("get_model_list", {
        series_id
    });
}

// 获取手机壳型号信息(全库)（根据型号ID查找）
export async function get_model_by_id(model_id: string): Promise<PcModelItem | null> {
    return await invoke<PcModelItem | null>("get_model_by_id", {
        model_id
    });
}

// 获取手机壳型号信息(全库)（根据材质ID查找）
export async function get_model_by_material(material_id: string): Promise<PcModelItem | null> {
    return await invoke<PcModelItem | null>("get_model_by_material", {
        material_id,
    });
}

// 是否是特殊的镜框材质ID
export function is_special_frame(material_id: string): boolean {
    return material_id === 'A4Frame' || material_id === 'A5Frame'
}

// 是否是特殊的拼图材质ID
export function is_special_puzzle(material_id: string): boolean {
    return material_id === 'A4Puzzle' || material_id === 'A5Puzzle'
}

// 是否是特殊的拼图相框材质ID
export function is_special_puzzle_frame(material_id: string): boolean {
    return material_id === 'A4PuzzleFrame' || material_id === 'A5PuzzleFrame'
}