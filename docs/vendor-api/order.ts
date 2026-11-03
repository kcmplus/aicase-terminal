import { logWarn } from "@/common/logger";
import { invoke } from "@tauri-apps/api/core";
import { PayStatus } from "./payment";
import { PrintStatus } from "./print";

export enum OrderCmd {

}

export enum OrderEvent {
    ORDER_SESSION = 'order_session',                        // 创建临时订单会话
    ORDER_IMAGE_PROGRESS = 'order_image_progress',          // 订单上传图片下载进度
    ORDER_CREATED = 'order_created',                        // 创建订单
    ORDER_INFO_CHANGED = 'order_info_changed',              // 订单信息变化，订单列表发生变化时
    ORDER_PICKUP_VERIFIED = 'order_pickup_verified',        // 订单Pickup码校验结果
    ORDER_PICKUP_USED = 'order_pickup_used',                // 订单Pickup码使用结果
    ORDER_QRCODE_GENERATED = 'order_qrcode_generated',      // 订单支付二维码生成
    ORDER_PAY_FAILED = 'order_pay_failed',                  // 订单支付失败
    ORDER_PRINT_STARTED = 'order_print_started',            // 订单开始打印
    ORDER_PRINT_FINISHED = 'order_print_finished',          // 订单打印完成
    ORDER_PRINT_STATUS = 'order_print_status',              // 订单打印状态
    ORDER_PRINT_PROGRESS = 'order_print_progress',          // 订单打印进度变化
}

export enum OrderStatus {
    None = 'none',          // 待处理
    Polling = 'polling',    // 未完成
    Success = 'success',    // 已完成
    Refunded = 'refunded',  // 退款
    Canceled = 'canceled',  // 已取消
    Failed = 'failed',      // 已失败
}

export interface OrderSessionResult {
    business_number: string,    // 业务码编号
    upload_img_url: string,     // 上传图片地址
};

export interface OrderImageProgress {
    progress: number,
};

export interface OrderCreatedResult {
    business_number: string,    // 订单业务号
    trade_no: string,           // 订单号
    errcode: number             // 是否错误，非0错误，对应Errcode
};

export interface OrderInfoChanged {
    trade_no: string,
};

export interface OrderPickupVerified {
    pickup_code: string,
    amount: number
    errcode: number
};

export interface OrderPickupUsed {
    trade_no: string,
    amount: number
    errcode: number
};

export interface OrderQRCodeGenerated {
    trade_no: string,
    pay_type: string,
    qrcode: string,
    qrimage: string,
    timeout: number
};

export interface OrderPayFailed {
    trade_no: string,
    errcode: number
};

export interface OrderPrintStarted {
    trade_no: string
};

export interface OrderPrintFinished {
    trade_no: string,
    errcode: number,
};

export interface OrderPrintStatusPayload {
    trade_no: string,
};

export interface OrderPrintProgressPayload {
    trade_no: string,
};

export interface OrderItem {
    trade_no: string,               // 订单ID
    business_number: string,        // 订单业务ID
    order_id: string,               // 订单号

    material_id: string,            // 材质ID
    goods_id: number,               // 商品ID
    slot: number,                   // 库存货道，绑定仓库号
    price: number,                  // 价格
    model_id: string,               // 型号ID
    model_lang_id: string,          // 型号绑定的语言ID
    model_body_image: string,       // 手机壳图(打印)

    target_image: string,           // 目标图(打印)
    effect_image: string,           // 效果图(预览)

    amount: number,                 // 金额
    pay_type: string | null         // 支付类型
    pay_amount: number,             // 支付金额
    discount_type: string | null,   // 抵扣类型
    discount_amount: number,        // 抵扣金额
    required_amount: number,        // 仍需金额

    pay_status: string,             // 支付状态
    print_status: string,           // 打印状态
    status: string,                 // 订单状态

    created_at: number,             // 创建时间
    payment_at: number | null,      // 支付时间
}

export interface OrderPrintProgress {
    grab_status: string,        // 抓取状态，对应PrintStatus
    print_status: string,       // 打印状态，对应PrintStatus
    deliver_status: string,     // 取壳状态，对应PrintStatus
    grabbing: number,           // 抓取进度1-100%
    printing: number,           // 打印进度1-100%
    delivering: number,         // 出货进度1-100%
    progress: number,           // 总进度1-100%
};

/**
 * 获取当前订单数目
 *
 * @export
 * @return {*}  {Promise<number>}
 */
export async function get_order_size(): Promise<number> {
    return await invoke<number>("get_order_size");
}

/**
 *
 * 获取当前订单列表（已排序）
 * @export
 * @return {*}  {Promise<Array<OrderItem>>}
 */
export async function get_order_list(): Promise<Array<OrderItem>> {
    return await invoke<Array<OrderItem>>("get_order_list");
}
/**
 * 根据订单ID 获取订单信息
 *
 * @export
 * @param {string} trade_no 订单ID
 * @return {*}  {(Promise<OrderItem | null>)}
 */
export async function get_order_by_id(trade_no: string): Promise<OrderItem | null> {
    return await invoke<OrderItem | null>("get_order_by_id", {
        trade_no
    });
}

/**
 *
 * 获取订单列表的第一个订单
 * @export
 * @return {*}  {(Promise<OrderItem | null>)}
 */
export async function get_first_order(): Promise<OrderItem | null> {
    return await invoke<OrderItem | null>("get_first_order");
}

/**
 * 获取当前正在打印的订单
 * @export
 * @return {*}  {(Promise<OrderItem | null>)}
 */
export async function get_print_order(): Promise<OrderItem | null> {
    return await invoke<OrderItem | null>("get_print_order");
}

/**
 * 获取当前打印的订单进度
 *
 * @export
 * @return {*}  {(Promise<OrderPrintProgress | null>)}
 */
export async function get_print_progress(): Promise<OrderPrintProgress | null> {
    return await invoke<OrderPrintProgress | null>("get_print_progress");
}

/**
 * 是否有可打印的订单（已支付）
 *
 * @export
 * @return {*}  {(Promise<OrderPrintProgress | null>)}
 */
export async function get_printable_order(): Promise<boolean> {
    return await invoke<boolean>("get_printable_order");
}

/**
 * 生成业务码ID
 *
 * @export
 * @return {*}  {Promise<string>}
 */
export async function generate_business_number(): Promise<string> {
    return await invoke<string>("generate_business_number");
}


/**
 * 下载上传的图片
 *
 * @export
 * @param {string} url 上传的图片下载地址，对应的业务会话ID
 * @param {string} business_number
 * @return {*}  {Promise<string>}
 */
export async function download_upload_image(url: string, business_number: string): Promise<string> {
    try {
        return await invoke<string>("download_upload_image", {
            url,
            business_number
        });
    } catch (err) {
        logWarn("invoke failed, err: ", err);
        return "";
    }
}

/**
 * 拷贝订单照片
 *
 * @export
 * @param {string} src_file 源文件路径
 * @param {string} business_number 业务会话ID
 * @param {string} filename 保存的文件名字
 * @return {*}  {Promise<string>}
 */
export async function copy_canvas_image(src_file: string, business_number: string, filename: string): Promise<string> {
    try {
        return await invoke<string>("copy_canvas_image", {
            src_file,
            business_number,
            filename,
        });
    } catch (err) {
        logWarn("invoke failed, err: ", err);
        throw err
    }
}


/**
 * 保存编辑的图片
 *
 * @export
 * @param {string} data， bash64图片数据
 * @param {string} business_number 业务会话ID
 * @param {string} filename 保存的文件名字
 * @return {*}  {Promise<string>}
 */
export async function save_canvas_image(data: string, business_number: string, filename: string): Promise<string> {
    try {
        return await invoke<string>("save_canvas_image", {
            data,
            business_number,
            filename,
        });
    } catch (err) {
        logWarn("invoke failed, err: ", err);
        throw err
    }
}


/**
 * 创建订单
 *
 * @export
 * @param {string} business_number 业务会话ID
 * @param {number} goods_id 手机壳对应的商品ID
 * @param {string} target_image 编辑后的目标图片（用于打印）
 * @param {string} effect_image 编辑后的效果图片（用于预览）
 * @return {*}  {Promise<void>}
 */
export async function create_order(
    business_number: string,
    goods_id: number,
    target_image: string,
    effect_image: string): Promise<void> {
    return await invoke<void>("create_order", {
        business_number,
        goods_id,
        target_image,
        effect_image
    }).catch((err) => {
        logWarn("invoke failed, err: ", err)
    })
}

/**
 * 取消订单
 *
 * @export
 * @param {string} trade_no 订单ID
 * @return {*}  {Promise<void>}
 */
export async function cancel_order(
    trade_no: string): Promise<void> {
    return await invoke<void>("cancel_order", {
        trade_no
    }).catch((err) => {
        logWarn("invoke failed, err: ", err)
    })
}


/**
 * 校验核销码
 *
 * @export
 * @param {string} pickup_code 核销码
 * @param {number} goods_id 手机壳商品ID
 * @param {number} amount 订单金额
 * @return {*}  {Promise<void>}
 */
export async function verify_order_pickup(
    pickup_code: string,
    goods_id: number,
    amount: number,
): Promise<void> {
    return await invoke<void>("verify_order_pickup", {
        pickup_code,
        goods_id,
        amount,
    }).catch((err) => {
        logWarn("invoke failed, err: ", err)
    })
}

/**
 * 使用核销码
 *
 * @export
 * @param {string} trade_no 订单ID
 * @param {string} pickup_code 核销码
 * @param {number} amount 订单金额
 * @return {*}  {Promise<void>}
 */
export async function use_order_pickup(
    trade_no: string,
    pickup_code: string,
    amount: number,
): Promise<void> {
    return await invoke<void>("use_order_pickup", {
        trade_no,
        pickup_code,
        amount,
    }).catch((err) => {
        logWarn("invoke failed, err: ", err)
    })
}

/**
 * 选择支付类型
 *
 * @export
 * @param {string} trade_no 订单ID
 * @param {string} pay_type 支付类型，对应PayType
 * @return {*}  {Promise<void>}
 */
export async function select_order_payment(
    trade_no: string,
    pay_type: string,
): Promise<void> {
    return await invoke<void>("select_order_payment", {
        trade_no,
        pay_type
    }).catch((err) => {
        logWarn("invoke failed, err: ", err)
    })
}


/**
 * 关闭支付，用于取消已选支付的状态，比如退出刷卡支付
 *
 * @export
 * @param {string} trade_no
 * @return {*}  {Promise<void>}
 */
export async function finish_order_payment(
    trade_no: string
): Promise<void> {
    return await invoke<void>("finish_order_payment", {
        trade_no,
    }).catch((err) => {
        logWarn("invoke failed, err: ", err)
    })
}

export function parse_order_status(
    pay_status: string,
    print_status: string
): string {
    if (pay_status != PayStatus.Success) {
        return "idle";
    } else if (print_status == PrintStatus.Idle) {
        return "waiting";
    } else {
        return "printing";
    }
}
