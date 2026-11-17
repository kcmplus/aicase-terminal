# POPOMO 集成宿主入口

这是供应商 `phonecase-diy-gy` 的集成版本：POPOMO 首页 + 原设备管理后台。

## 供应商一条命令调试真机

使用 Node.js 22.18+ 或 24.11+，以及供应商现有 Rust、平台编译工具和驱动环境。将交付工程放回完整工作区，保持以下关系，并保留核心的其他本地依赖：

```text
workspace/
  phonecase-core/Cargo.toml
  phonecase-diy-gy/package.json
  phonecase-diy-gy/src-tauri/Cargo.toml
```

在 `phonecase-diy-gy/` 执行（首次或依赖变化时先安装）：

```sh
npm ci
npm run dev:device
```

该命令启动 Vite 和真实 Tauri 核心，窗口默认 540×900、可调整大小、不置顶，开发模式允许打开开发者工具。Windows/Linux 可尝试 `Ctrl+Shift+I`，或右键检查元素；F8 仍使用设备后台密码。关闭已运行的同一设备应用后再启动，避免供应商单实例或硬件端口冲突。第一次需要编译 Rust，后续复用编译缓存。

原生入口在调试模式下默认使用供应商的 `config-dev.toml`；配置文件由供应商提供，其默认查找位置由核心决定。建议显式指定已有配置的绝对路径：

```sh
npm run dev:device -- --device-config "D:/device/config-dev.toml"
```

`npm run dev:device -- --check` 仅检查入口文件、已安装 CLI、核心目录及指定配置，不启动设备；它不验证 Rust 工具链、驱动和核心内部依赖。真实模式强制关闭 mock，状态、订单和后台操作来自真实宿主，可能触发供应商核心原有的自动打印行为。

修改 `src/` 下的 Vue 页面会由 Vite 更新；`src/popomo/terminal.js` 是交付时编译好的首页模块。修改我方首页源代码需在 aicase-terminal 仓库执行 `npm run build:embedded` 后重新交付该模块，不能直接修改生成文件。普通浏览器访问 Vite 地址不具备原生设备接口；没有核心时使用 `npm run dev:mock`。

只替换 `dist/` 不会更新调试源码。要使用此入口，需要合入本包配套的前端源码、package.json / package-lock.json、`scripts/dev-device.mjs` 和 `src-tauri/tauri.device-dev.json`，保留供应商自己的核心、设备配置和签名文件。

调试配置只在 `dev:device` 中显式加载；正式打包仍运行 `npm run tauri:build:default`，使用原生产配置，不加载这个窗口调试配置。

开发模式首页下方会直接显示「设备调试数据」：二维码隐藏原因和地址、每个接口的最新返回/耗时/错误、`get_order_list` 总条数，以及最近 20 条事件。凭证和打印原图字段会打码，长数组预览前 200 条、长字符串最多 2000 字符；订单总数仍显示真实返回长度。订单列表按宿主顺序展示全部状态，异常记录不会阻断正常记录。

如果需要在设备安装包里显示这块数据面板，执行 `npm run tauri:build:debug`；仅重新编译带面板的 dist 执行 `npm run build:debug`。这两个命令启用的是屏幕数据面板，不开启浏览器 mock；安装包仍使用原生产窗口配置。执行普通 `npm run build` 或 `npm run tauri:build:default` 不会启用该面板。

## 其他入口

- 当前仓库：先在上级目录执行 `npm run build:embedded`，再在本目录执行 `npm ci`、`npm run build`。
- 收到交付 ZIP：`src/popomo/terminal.js` 和 `dist/` 已包含；在本目录执行 `npm ci`、`npm run build` 即可重建外层 UI。
- 最终应用：供应商提供相邻的 `phonecase-core` 及其依赖、设备配置和签名环境后，运行 `npm run tauri:build:default`。
- 保留 `Makefile`、`build.ps1`、`.gitignore` 和 `.vscode/extensions.json`。`make run` / `make build` 继续可用；Windows 也可运行 `powershell -ExecutionPolicy Bypass -File ./build.ps1`。这些入口使用当前集成工程的 npm 锁文件。
- 本目录没有核心代码、签名密钥和设备凭证，不能单独生成可运行的硬件程序。

完整说明见当前仓库 `../docs/SUPPLIER_HANDOFF.md`；交付 ZIP 中位于 `docs/SUPPLIER_HANDOFF.md`。

## 本地 mock 的日志数据

`npm run dev:mock` 默认载入 2026-11-07 日志的 2 笔订单，左下角可切换 25 个节点；选择和后台设置保存在当前浏览器。旧设置保留，点击“使用日志设备编号”可将扫码编号设为 789 / 351。原有人工场景仍可选择。日志缺少的百分比保持为空、图片使用占位；库存维护使用明确标注的独立模拟数据。日志模式不会接收实际推单或控制设备。

设备状态默认收起在首页右上角，点击“设备状态”查看。调试模式在同一面板内勾选“开启调试日志”后才采集并显示日志，默认关闭；取消勾选停止采集并清空面板数据，不重新初始化设备。MOCK 场景控制位于左下角。
