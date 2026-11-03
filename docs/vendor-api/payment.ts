import { invoke } from "@tauri-apps/api/core";

export enum PaymentCmd {

}

export enum PaymentEvent {
}

export enum MdbResolution {
    Res001 = 'res001',  // 精度 0.01
    Res1 = 'res1',// 精度 1
    Res10 = 'res10',// 精度 10
    Res100 = 'res100',// 精度 100
    Res1000 = 'res1000',// 精度 1000
}

export enum MdbCardDevice {
    Nayax = 'nayax',// 无设备
    NVC1000 = 'nvc1000',// 韩国NVC1000
    Other = 'other',
}

export enum MdbCardChannel {
    None = 'none', // 无设备
    Nayax = 'nayax', // Nayax设备
    CPI = 'cpi',   // CPI设备
    Other = 'other', // 其他刷卡器
}

export enum MdbCardLevel {
    None = 'none',
    L2 = 'L2', // L2模式
    L3 = 'L3', // L3模式
}

export enum MdbCardStatus {
    Normal = 'normal',
    Swiping = 'swiping',
    Success = 'success',
    Refund = 'refund',
}

// 支付类型
export enum PayType {
    Wechat = 'wechat',
    Alipay = 'alipay',
    Pickup = 'pickup',
    Card = 'card',
    Free = 'free',
    Reprint = 'reprint',
    DuitNowPay = 'duit_now_pay',
    PromptPay = 'prompt_pay',
    Cash = 'cash',
    Scan2Pay = 'scan2_pay',
    WechatGlobal = 'wechat_global',
    PayPay = 'pay_pay',
    ElePay = 'ele_pay',
    Magnati = 'magnati',
    PromptPayKsher = 'prompt_pay_ksher',
    Stripe = 'stripe',
    PayWay = 'pay_way',
    LinePay = 'line_pay',
    PixPay = 'pix_pay',
    GameCard = 'game_card',
    DuitkuQRIS = 'duitku_qris',
    Unknown = 'unknown',
}

// 支付状态
export enum PayStatus {
    Idle = 'idle',              // 待处理
    Paying = 'paying',          // 支付中
    Success = 'success',        // 支付成功
    Failed = 'failed',          // 支付失败
    Canceled = 'canceled',      // 支付取消
    Timeouted = 'timeouted',    // 支付超时
}

export interface PayTypeItem {
    pay_type: string,   // 支付类型
    lang_id: string     // 支付类型绑定的语言ID
}

// 获取启用的二维码支付类型列表
export async function get_qrcode_pay_types(): Promise<Array<PayTypeItem>> {
    return await invoke<Array<PayTypeItem>>("get_qrcode_pay_types");
}

// 获取是否开启现金支付
export async function get_cash_pay_type(): Promise<PayTypeItem | null> {
    return await invoke<PayTypeItem | null>("get_cash_pay_type");
}

// 获取是否开启刷卡支付
export async function get_card_pay_type(): Promise<PayTypeItem | null> {
    return await invoke<PayTypeItem | null>("get_card_pay_type");
}

// 获取是否开启pickup支付
export async function get_pickup_pay_type(): Promise<PayTypeItem | null> {
    return await invoke<PayTypeItem | null>("get_pickup_pay_type");
}

// 获取是否开启免费支付
export async function get_free_pay_type(): Promise<PayTypeItem | null> {
    return await invoke<PayTypeItem | null>("get_free_pay_type");
}

// 获取是否开启游戏卡支付
export async function get_gamecard_pay_type(): Promise<PayTypeItem | null> {
    return await invoke<PayTypeItem | null>("get_gamecard_pay_type");
}


