这是供设备供应商集成的 **POPOMO Terminal 前端联调包**。

下载 Assets 中的 `aicase-terminal-web-*.zip`，解压后包含 `index.html`、JS、CSS、Logo 和构建信息。请勿使用 GitHub 自动生成的 Source code 源码压缩包代替编译包。

页面只读展示扫码入口、订单预览图、新订单提醒、待确认列表、打印进度及出货状态；长队列自动轮播，设备异常自动重连。

供应商需将解压目录接入 Tauri 的 `build.frontendDist`，保留自己的 Rust 命令、硬件驱动和打包配置，再生成终端安装包。本 ZIP 不是可独立运行的设备应用。

**联调边界**：设备屏不提供付款、到场确认或打印按钮；我方支付校验、手机到场确认及 free 放行完整链路尚待接通，真实图片权限及设备状态仍需上机验证。不要把此包视为已完成打印全流程验收。

详见仓库 `docs/INTEGRATION.md` 和 `docs/CLOUD_ORDER_FLOW.md`。
