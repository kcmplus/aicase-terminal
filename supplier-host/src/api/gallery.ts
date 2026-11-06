import { logDebug } from "@/common/logger";
import { invoke } from "@tauri-apps/api/core";

export enum GalleryCmd {
}

export enum GalleryEvent {

}

// 图库类型
export enum GalleryType {
    Bg = "bg",          // 背景图
    Border = "border",  // 边框图
    Texture = "texture",// 贴图
    Pattern = "pattern" // 图案
}

// 图库分类结构
export interface GalleryKindItem {
    kid: string         // 分类ID
    image: string;      // 分类图标
    name: string,       // 分类名字
    lang_id: string,    // 分类语言ID
}

// 图库图片结构
export interface GalleryImageItem {
    image: string;      // 图片本地地址
}

/**
 *
 * 根据图库类型，获取图库分类列表
 * @export
 * @param {string} gallery_type 图库类型
 * @return {*}  {Promise<Array<GalleryKindItem>>}
 */
export async function get_gallery_kinds(gallery_type: string): Promise<Array<GalleryKindItem>> {
    return await invoke<Array<GalleryKindItem>>("get_gallery_kinds", {
        gallery_type,
    });
}

/**
 *
 * 根据图库类型，获取图片列表
 * @export
 * @param {string} gallery_type 图库类型
 * @param {string} kid 图库分类ID
 * @param {number} [limit] 获取大小，0是无限制
 * @return {*}  {Promise<Array<GalleryImageItem>>}
 */
export async function get_gallery_images(gallery_type: string, kid: string, limit?: number): Promise<Array<GalleryImageItem>> {
    if (kid == 'ALL') {
        kid = ''
    }
    return await invoke<Array<GalleryImageItem>>("get_gallery_images", {
        gallery_type,
        kid,
        limit,
    })
}