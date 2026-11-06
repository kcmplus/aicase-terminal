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
2. `get_device_info` 读取打印机、机械臂、网络代理的独立连接状态。
3. `get_setting_options` / `get_setting_option_config` 读取设备名称、锁定状态与 H5 入口开关；不显示、保存或记录设置密码。
4. `get_stock_list` 统计未禁用且有货的终端机型与库存。终端库存不代表手机商城中已启用且模板完整的可购买机型；以手机端校验为准。
5. `get_print_order` / `get_print_progress` 展示宿主当前任务状态。打印完成与出货完成分开；出货成功显示「已出货」，不推断已取件。
6. `get_order_list` 展示设备已排序订单，保持原顺序；区分到场待确认、待打印、打印中、已出货、退款和异常。订单列表暂不可读时单独提示，不误报空队列。
7. 先订阅供应商事件，再调用 `ui_inited`；事件通知后重读数据，同时每 15 秒核对。状态失败时收起二维码，卸载清理监听，恢复页面时重新同步。

首页没有“开始打印”、付款、核销、维护或调整库存按钮。当前所有业务命令均为读取，唯一通知命令是 `ui_inited`。宿主已有自动打印行为应由供应商确认。

## 编译与交付

已配置 [Build terminal frontend](.github/workflows/build-terminal.yml)：推送 `main`、`v*` 标签、向 main 提交 PR 或手动运行时，执行锁文件安装、接口一致性检查、测试、前端编译，上传一个 ZIP 文件，保留 30 天。

下载位置：

- 版本交付包：仓库首页右侧 **Releases** → 版本 → **Assets** → `aicase-terminal-web-*.zip`。不要选 GitHub 自动生成的 `Source code` 源码包。
- 日常构建包：**Actions → Build terminal frontend → 成功运行 → Artifacts**，保留 30 天。Actions 附件下载可能需要登录 GitHub；公开 Release 附件可直接下载。

推送 `v*` 标签时，构建与测试成功后自动创建 Release，发布同一构建的 ZIP 并核对 SHA256。普通 main 推送、PR、手动构建只保存 Artifacts，不创建版本。当前仓库公开，Release 附件也公开；流程不部署设备、不替供应商生成安装包。

发布版本时先确保 `package.json` 和 `package-lock.json` 的版本一致并提交，再执行 `git tag v0.1.0`、`git push origin v0.1.0`（以后替换为对应新版本）。标签必须等于 `v` 加 package.json 版本；带 `-beta.1` 等后缀的版本标为 Pre-release。已发布版本不覆盖，如需修改请发新版本。

可在仓库 Actions 的变量或手动构建参数中设置 `VITE_DEFAULT_LANGUAGE`，默认 en-US。二维码商城入口已固定为 `https://aicase.chunpat.cc/`，不再接受宿主地址或 `VITE_STOREFRONT_URL` 覆盖。

本地打包（Node.js 与 Python 3）：

```sh
npm ci
npm test
npm run package
```

输出 `release/aicase-terminal-web-版本-提交号.zip`。工作区有未提交改动时文件名附带 `-dirty`。ZIP 根目录是 `index.html`、`assets/`、Logo、`BUILD_INFO.json` 和集成说明；不包含源码、环境文件、依赖目录或开发示例图片。包内记录提交号、是否有未提交修改及文件校验值。

供应商解压到前端目录，把 Tauri 的 `build.frontendDist` 指向该目录，然后在他们的 Rust 工程中打包、签名和分发。独立首页交付方式不包含管理后台；需要保留后台时使用上述集成版。当前仓库缺供应商核心，无法独立构建 Windows/Linux 设备安装包。

## 手机端入口

当前入口固定为 `https://aicase.chunpat.cc/`，由 `src/domain.ts` 中的 `STOREFRONT_URL` 定义。供应商返回的 `h5_base_url` 不参与二维码生成；以后更换域名需要修改此常量并重新构建。设备和商家身份仍由宿主读取。

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
