# 终端与 H5 职责（2026-11-06）

客户确认已转到 H5。设备首页只展示，不调用 `select_order_payment(..., "free")`，不请求服务器领取放行许可，不向服务器回传放行结果。

## 供应商配置

- 通过 `get_machine_info()` 返回正确的 `device_id`、`shop_id`；二维码地址使用返回的 `h5_base_url`。
- 保留设备、库存、订单、打印进度读取接口和对应事件，以及 `ui_inited` 通知。
- 按实际订单图片路径配置 asset protocol 和图片访问权限。
- 不需要为终端首页注入 `window.POPOMO_TERMINAL_API`；即使旧宿主仍注入此对象，当前首页也不会使用它。
- 客户在 H5 确认后的处理及订单状态同步，由 H5 服务端和供应商核心完成。此仓库只验证展示侧，不证明 H5 侧已部署或真机验收。

## 二维码

二维码入口读取宿主 `get_machine_info().h5_base_url`。在设备后台「系统设置 → 账户配置 → Widermatrix H5 地址」设置并保存；输入框对应 `configs.api.h5_base_url`，通过 `save_setting_configs` 保存。供应商核心需将保存后的值同步到设备信息接口。前端订阅配置变化事件，并每 15 秒重读，无需为换地址重新编译。构建环境和页面 URL 不覆盖此配置。

保留配置地址的路径，清除原查询参数后加入 `device_id`、`shop_id`、`lang`，并设置 `#home`。身份只来自宿主，不从设备页面 URL 获取。

例如商城为 `https://aicase.chunpat.cc/`、设备为 401、商家为 146：

```text
https://aicase.chunpat.cc/?device_id=401&shop_id=146&lang=en-US#home
```

中文首页对应 `lang=zh-CN`。二维码不携带订单号、支付状态或设备密钥。

## 历史方案

`src/cloud-orders.ts`、`src/native-order-api.ts`、`src/order-api.ts` 作为历史适配和测试参考保留，未被首页入口导入。此前终端领取许可、调用 free、回传状态的部署说明已失效，不应继续按旧说明配置。
