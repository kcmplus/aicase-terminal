这是供设备供应商集成的 **POPOMO 首页 + 设备管理后台集成包**。

下载 Assets 中的 `aicase-terminal-supplier-display-only-*.zip`。解压后的 `phonecase-diy-gy/` 包含编译好的 `dist/`、集成界面源码、Tauri 入口、构建信息及交接说明。请勿使用 GitHub 自动生成的 Source code 源码压缩包代替交付包。

页面只读展示扫码入口、订单预览图、新订单提醒、待确认列表、打印进度及出货状态；长队列自动轮播，设备异常自动重连。

集成版保留密码保护的系统、支付、货道和打印管理页。二维码地址读取设备后台配置的 `h5_base_url`，设备及商家身份来自宿主。

供应商需接入自己的 `phonecase-core` 及配套模块、设备配置和驱动，核对 Tauri `build.frontendDist` 指向 `../dist` 后，签名并生成终端安装包。本 ZIP 不包含核心代码、设备凭证或签名私钥，不是可独立运行的设备应用。

**联调边界**：终端首页只读展示，不调用付款确认、放行或打印指令。客户在 H5 确认，H5 及其服务端负责放行；终端不需要注入独立放行凭证。真实订单同步、图片读取、打印和出货状态仍需供应商真机验收。

详见包内 `docs/SUPPLIER_HANDOFF.md`、`docs/CLOUD_CONNECTION.md` 和 `docs/CLOUD_ORDER_FLOW.md`。
