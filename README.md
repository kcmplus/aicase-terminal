# POPOMO Terminal

[下载编译包 · Releases](https://github.com/kcmplus/aicase-terminal/releases) · [构建记录 · Actions](https://github.com/kcmplus/aicase-terminal/actions/workflows/build-terminal.yml)

POPOMO 设备端独立前端项目。设备屏只读展示扫码入口、订单预览图、待确认列表及打印/出货进度；顾客在手机端完成操作，长队列自动轮播。

本仓库由我方维护终端界面，由供应商负责 **Tauri 2 / Rust 核心、硬件驱动、最终打包、签名与分发**。新增 `supplier-host/`，基于供应商提供的 `phonecase-diy-gy.zip` 接入 POPOMO 首页并保留系统、支付、货道、打印管理后台。原包依赖的 `phonecase-core` 及其配套模块未交付，最终应用仍须在供应商的完整工程中构建。

**集成版交付**：[供应商交接说明](docs/SUPPLIER_HANDOFF.md)。首次执行 `npm --prefix supplier-host ci`，之后 `npm run package:supplier` 生成包含完整前端、界面源码和 Tauri 入口的供应商集成 ZIP；它不是安装包。`npm run package` 继续生成原独立首页 ZIP，不含供应商管理后台。

**当前约定（2026-11-06）**：客户在 H5 确认，H5 及其服务端完成后续放行。设备首页只读取并展示二维码、订单和打印状态，不调用 `select_order_payment`，不领取服务器放行许可，也不需要 `POPOMO_TERMINAL_API` 凭证。流程见 [订单展示说明](docs/CLOUD_ORDER_FLOW.md)。

## 本地开发

推荐 Node.js 22 LTS（至少 22.12），使用随附的锁文件。

```sh
npm ci
npm run dev
```

- 浏览器示例预览：<http://127.0.0.1:4180/?preview=1&lang=zh-CN>。顶部明确标注「示例数据」，通过 URL 的 `scenario=printing|queue|ready|delivered|offline|empty|locked|error` 选择场景，设备页没有操作按钮。二维码指向测试站，编号使用联调设备 401 / 商家 146。
- 正常入口：<http://127.0.0.1:4180/>。在普通浏览器中提示等待终端，不会自动使用模拟数据。
- Tauri 内始终优先真实宿主。生产构建不包含浏览器模拟入口；`preview=1` 不能开启模拟桥接。
- `npm test`：协议、二维码隔离、状态与事件生命周期测试。
- `npm run build`：类型检查并构建。

## 已接入

1. `get_machine_info` 读取当前设备和商家身份。设备身份不接受 URL 参数覆盖。
2. 打印机、机械臂、网络代理（WebSocket）的独立连接状态只从宿主 `device_state_changed` 事件更新，不调用或轮询 `get_device_info`。尚未收到状态时显示“等待状态通知”，不影响有效二维码。
3. `get_setting_options` / `get_setting_option_config` 读取设备名称、锁定状态与 H5 入口开关；不显示、保存或记录设置密码。
4. `get_stock_list` 统计未禁用且有货的终端机型与库存。终端库存不代表手机商城中已启用且模板完整的可购买机型；以手机端校验为准。
5. `get_print_order` / `get_print_progress` 展示宿主当前任务状态。打印完成与出货完成分开；出货成功显示「已出货」，不推断已取件。
6. `get_order_list` 展示设备已排序订单，保持原顺序；区分到场待确认、待打印、打印中、已出货、退款和异常。订单列表暂不可读时单独提示，不误报空队列。
7. 先订阅供应商事件，再调用 `ui_inited`；硬件状态事件直接合并到页面，不触发查询。身份、配置、库存、订单等数据仍按相关事件重读并每 15 秒核对。设备身份或接口读取失败时收起二维码，卸载清理监听，恢复页面时重新同步。

首页没有“开始打印”、付款、核销、维护或调整库存按钮。当前所有业务命令均为读取，唯一通知命令是 `ui_inited`。宿主已有自动打印行为应由供应商确认。

首页分别展示打印机、机械臂、网络（WebSocket）连接状态。离线、缺货和打印告警只显示提示，不再隐藏扫码入口；后台锁定设备或关闭 H5 入口仍暂停展示。二维码显示不代表设备已就绪，订单确认和打印条件仍由手机端、服务端及供应商核心判断。

## 编译与交付

### 无核心包的浏览器调试

安装依赖后，在仓库根目录运行：

```sh
npm ci
npm --prefix supplier-host ci
npm run dev:mock
```

打开 `http://127.0.0.1:1423/?lang=zh-CN`。右上角展开 **MOCK 调试**，可切换待机、订单队列、打印中、已出货、离线、缺货、锁定，并模拟新订单。按 F8 或连续点击右下角 8 次，用 `168168` 进入管理后台。MOCK 面板的有效扫码编号、场景切换和新增模拟订单会自动保存；后台设置点击保存后，和库存编辑一起保存在当前浏览器的本地存储中，刷新、返回或打开同一地址的新页面仍保留；点击“恢复默认模拟设置”可清除。二维码使用 `example.invalid`，不能用于真实下单；硬件操作只显示模拟提示，未覆盖的命令会明确报错。

此命令只启动 Vite，不运行 Rust/Tauri，不需要 `phonecase-core`。mock 仅在 `DEV` 且 `VITE_MOCK=1` 时启用，正式构建不会加载 mock。供应商拿到集成 ZIP 后，也可在 `phonecase-diy-gy/` 执行 `npm ci` 和 `npm run dev:mock`。原生工程及真实核心的打包入口保持原样。

扫码联调时，除了在后台设置 H5 地址，还需在 MOCK 面板填写后台已登记的 `device_id` / `shop_id` 并点“保存扫码目标”，然后重新扫码。例如已验证的设备/商家组合为 `401` / `146`。默认模拟编号 `900001` / `900001` 未在线上登记，直接用于真实 H5 会提示设备校验失败。编号保存在当前浏览器；该设置只改变扫码目标，不会让 mock 接收真实订单或控制打印。真实设备仍直接读取供应商宿主的设备与商家编号，不使用此覆盖设置。

管理后台源码修改支持 Vite 热更新；修改根目录 `src/` 的 POPOMO 首页后，另开终端执行 `npm run build:embedded`，再刷新预览。浏览器回归测试使用 `npm run test:mock`（需要本地 Playwright 浏览器）。

已配置 [Build supplier integration package](.github/workflows/build-terminal.yml)：推送 `main`、`v*` 标签、向 main 提交 PR 或手动运行时，安装主项目与 `supplier-host` 的锁定依赖、运行接口测试、执行 `npm run package:supplier`，成功后上传一个供应商集成 ZIP，保留 30 天。构建使用 Node.js 24，不需要供应商私有核心或 Rust 编译环境。

下载位置：

- 版本交付包：仓库首页右侧 **Releases** → 版本 → **Assets** → `aicase-terminal-supplier-display-only-*.zip`。不要选 GitHub 自动生成的 `Source code` 源码包。
- 日常构建包：**Actions → Build supplier integration package → 成功运行 → Artifacts**，保留 30 天。Actions 附件下载可能需要登录 GitHub；公开 Release 附件可直接下载。

推送 `v*` 标签或手动填写发布版本时，构建与测试成功后自动创建 Release，发布同一构建的集成 ZIP 并核对 SHA256。普通 main 推送、PR、版本号留空的手动构建只保存 Artifacts，不创建版本。旧版本中的 `aicase-terminal-web-*.zip` 不会被覆盖。当前仓库公开，Release 附件也公开；流程不部署设备、不替供应商生成安装包。

已有成功构建时，直接在 GitHub 网页发布原包，无需再次安装依赖或构建：

1. 打开 **Actions → Release existing build → Run workflow**，选择 **main**。
2. `run_id` 填原构建链接末尾的数字，例如 `42194105926`。
3. `release_tag` 填未使用的新标签，例如 `v0.1.2`，点击运行。
4. 流程核对原构建来自本仓库 main 推送且成功、下载未过期的 ZIP、校验 SHA256 和包内提交号，然后发布到 **Releases → Assets**。

此入口原样发布 ZIP，标签指向原构建的提交，不修改 main 或包内版本。例如运行 `42194105926` 的包内版本仍为 `0.1.1`，即使交付标签是 `v0.1.2`，发布说明也会明确列出两者。需要包内版本同步更新时，使用下方“构建新版本”入口。已有标签不会覆盖；PR 构建、失败构建及过期产物不能发布。发布时先创建草稿，附件上传完成后才公开；若发布失败并留下草稿，先在 Releases 检查草稿和附件，再决定完成发布或删除草稿后重试。

之后的 main 构建摘要也提供 **Release existing build** 入口及当前 `run_id`。已经结束的旧运行不会补上新按钮，直接从 Actions 左侧选择该流程即可。

需要更新版本号并构建新版本时：

1. 打开 **Actions → Build supplier integration package → Run workflow**。
2. 分支选择 **main**，`release_version` 填新版本，例如 **0.1.2**（不加 `v`），选择默认语言。
3. 点击 **Run workflow**。流程会从最新 main 自动更新根目录的 `package.json` / `package-lock.json`、提交版本号、创建并推送 `v0.1.2` 标签，然后在同一次运行中测试、打包、发布 Release。
4. 全部成功后，在 **Releases → v0.1.2 → Assets** 下载供应商集成 ZIP。

网页入口只接受比当前版本更高的正式版本号；已有标签不覆盖。若版本准备成功，但后续构建或发布失败，修复外部问题后用该运行的 **Re-run failed jobs** 重试；需要改代码时请发布更高版本。仓库规则需允许 Actions 向 main 提交版本号和创建标签；推送失败会停止发布，不绕过保护规则。

也可继续手动打标签：先确保 `package.json` 和 `package-lock.json` 的版本一致并提交，再创建对应的新 `v*` 标签并推送。标签必须等于 `v` 加 package.json 版本；带 `-beta.1` 等后缀的版本标为 Pre-release。已发布版本不覆盖，如需修改请发新版本。

可在仓库 Actions 的变量或手动构建参数中设置 `VITE_DEFAULT_LANGUAGE`，默认 en-US。二维码商城入口读取宿主 `h5_base_url`，在设备管理后台设置；不接受 `VITE_STOREFRONT_URL` 覆盖。

本地完整交付（Node.js 24 与 Python 3）：

```sh
npm ci
npm --prefix supplier-host ci
npm test
npm run package:supplier
```

浏览器界面测试改为本地按需运行，不再阻塞自动构建：

```sh
npx playwright install chromium
npm run test:supplier
```

输出 `release/aicase-terminal-supplier-display-only-版本-提交号.zip`。工作区有未提交改动时文件名附带 `-dirty`。解压后的 `phonecase-diy-gy/` 含编译后的 `dist/`、集成 UI 源码、Tauri 入口、`BUILD_INFO.json` 和交接文档；不含依赖目录、原始压缩包、设备凭证或签名私钥。包内记录提交号和文件校验值，本地另生成 ZIP 的 `.sha256` 文件，CI 构建摘要和 Release 说明也记录校验值。

供应商按包内 `docs/SUPPLIER_HANDOFF.md` 接入其完整核心、驱动和设备配置，完成签名、安装包和真机验收。当前仓库缺供应商核心，无法独立构建 Windows/Linux 设备安装包。

`npm run package` 保留为本地独立首页打包命令，仅输出 `aicase-terminal-web-*.zip`，不包含管理后台，不再作为自动构建或新版本发布的交付物。

## 手机端入口

入口读取宿主 `get_machine_info().h5_base_url`。在设备管理后台「系统设置 → 账户配置 → Widermatrix H5 地址」设置商城地址（如 `https://aicase.chunpat.cc/`）并保存，无需重新编译前端。该设置写入 `configs.api.h5_base_url`；供应商核心需把保存后的值反映到 `get_machine_info()`。配置变化事件或 15 秒轮询会重新读取。设备和商家身份仍由宿主提供。

二维码保留入口路径，重新生成仅含 `device_id`、`shop_id`、`lang` 的查询参数及 `#home`。拒绝本机回环地址、带账号密码的链接和非 HTTP(S) 协议。该码只是访问入口，不是设备身份认证或打印授权。

## 与现有 aicase 项目的边界

| 项目 | 职责 |
| --- | --- |
| `aicase` | 手机端设计、商城、支付、后台、订单及库存同步 |
| `aicase-terminal` | 设备屏 UI、Tauri IPC 适配、设备状态和打印进度展示 |
| 供应商 Tauri / Rust 宿主 | 原生命令、硬件控制、文件下载、驱动、安装包及分发 |

本仓库不依赖 `aicase` 的源码路径，不包含其 `.env`、后台、支付配置或商家凭证。主项目原有 `device.html` 暂时保留兼容；后续终端前端在本仓库维护。

详细交接：[供应商集成说明](docs/INTEGRATION.md)。原始接口参考：[来源记录](docs/vendor-api/SOURCE.txt)。

## 订单接口复核与模拟联调

[压缩包接口复核](docs/INTERFACE_AUDIT.md) 保留早期接口分析。`src/order-api.ts`、`src/cloud-orders.ts` 和 `src/native-order-api.ts` 作为历史适配与测试参考保留，不被独立首页或集成首页导入，不进入首页运行逻辑。客户确认和放行已转交 H5 及其服务端。本仓库不代表 H5 侧已部署或验收。

`npm test` 包含展示逻辑和历史适配器测试；`npm run test:supplier` 验证集成页、维护入口和只读边界，包括即使存在旧设备凭证也不会发起云端轮询或支付放行。
