这是供设备供应商集成的 **POPOMO Terminal 前端联调包**。

下载 Assets 中的 `aicase-terminal-web-*.zip`，解压后包含 `index.html`、JS、CSS、Logo 和构建信息。请勿使用 GitHub 自动生成的 Source code 源码压缩包代替编译包。

页面只读展示扫码入口、订单预览图、新订单提醒、待确认列表、打印进度及出货状态；长队列自动轮播，设备异常自动重连。

供应商需将解压目录接入 Tauri 的 `build.frontendDist`，保留自己的 Rust 命令、硬件驱动和打包配置，再生成终端安装包。本 ZIP 不是可独立运行的设备应用。

**联调边界**：终端首页只读展示，不调用付款确认、放行或打印指令。客户在 H5 确认，H5 及其服务端负责放行；终端不需要注入独立放行凭证。真实订单同步、图片读取、打印和出货状态仍需供应商真机验收。

详见仓库 `docs/INTEGRATION.md` 和 `docs/CLOUD_ORDER_FLOW.md`。
