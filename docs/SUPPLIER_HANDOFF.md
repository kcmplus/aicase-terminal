# POPOMO + 供应商管理后台集成交付

本工程以 `phonecase-diy-gy.zip` 为基线，把占位首页替换为 POPOMO 终端界面，保留系统、支付、货道和打印管理页。原包来源校验值见 `supplier-host/SOURCE.json`（交付包中位于工程根目录）。

## 交付分工

- 我方维护终端首页、订单与打印状态展示。
- 供应商保留 `phonecase-core`、其所有本地依赖和硬件驱动，在自己的完整工程环境构建、签名及发布。
- 本包含已编译的 `dist/`、集成后的界面源码和 Tauri 启动工程。不包含核心代码、运行设备配置、设备凭证、签名私钥或安装包。
- 不把本包的 Cargo.lock 和 Tauri 配置盲目覆盖到另一个核心版本；供应商先核对 API 和核心版本兼容性。

## 当前仓库开发

首次安装（Node.js 22.18+ LTS 或 24.11+ LTS）：

```sh
npm ci
npm --prefix supplier-host ci
```

独立首页仍用 `npm run dev`。集成版本用 `npm run dev:supplier`，默认端口 1423；普通浏览器没有设备接口，实际管理操作需要供应商宿主。

```sh
npm test
npm run package:supplier
```

本地按需进行界面回归检查（不在自动构建中执行）：首次执行 `npx playwright install chromium`，构建完成后执行 `npm run test:supplier`。测试仅模拟宿主接口，不连接真实设备。

输出 `release/aicase-terminal-supplier-display-only-*.zip`，解压根目录为 `phonecase-diy-gy/`。首页从本仓库 `src/terminal.ts` 构建为 `supplier-host/src/popomo/terminal.js`；该文件是生成产物，不应手工编辑。首页代码修改后重新执行构建。`npm run package` 仍只交付独立首页，不含管理后台。

## 自动构建与下载

GitHub Actions 的 `Build supplier integration package` 使用 Node.js 24，分别安装主项目和供应商界面的锁定依赖，执行逻辑测试和 `npm run package:supplier`，成功后上传 ZIP。自动构建不安装浏览器，也不运行浏览器集成测试；需要时在本地运行。

- main 推送、PR 和版本号留空的手动运行：到该次运行的 Artifacts 下载集成 ZIP，保留 30 天。
- 已有成功的 main 推送构建：Actions → Release existing build → Run workflow，选择 main，填写原 `run_id` 和新 `release_tag`。核对校验值后直接发布原 ZIP，不重复构建、不修改包内版本；Release 标签指向原提交，说明列出包内版本和来源构建。产物过期后需重新构建。
- 网页发布：Actions → Build supplier integration package → Run workflow，选择 main，`release_version` 填新版本（如 `0.1.2`，不加 `v`）。流程自动提交版本号、打标签、测试、打包并发布 Release，无需本地运行命令。已有标签不会覆盖；构建失败可在原运行中选择 Re-run failed jobs。
- 新 `v*` 标签：同时在 GitHub Release 的 Assets 发布该次构建的同一个集成 ZIP，发布前校验 SHA256。
- 不再自动上传独立首页 ZIP；旧版本附件保持不变。
- CI 不运行 Tauri 原生打包，不需要私有核心或签名密钥。

## 供应商如何打包

没有核心包时可以只调试界面：在交付工程目录执行 `npm ci`、`npm run dev:mock`，浏览器打开 `http://127.0.0.1:1423/`。右上角 MOCK 面板可切换设备和订单状态；F8 输入默认密码 `168168` 进入后台。配置和库存保存到当前浏览器的本地存储，刷新和新开同一地址的页面仍保留；MOCK 面板可恢复默认模拟设置。模拟操作不会连接设备，二维码也不连接真实商城；尚未覆盖的命令明确报错。该入口只用于 Vite 开发，不影响下面的真实 Tauri 打包流程。

Tauri 依赖按原始 `phonecase-diy-gy.zip` 的主工程 `pnpm-lock.yaml` 固定：前端 API `2.11.1`、CLI `2.11.4`、文件插件 `2.5.1`、HTTP 插件 `2.5.9`、opener 插件 `2.5.4`。主项目和集成项目的 npm 锁文件保持这些版本，避免迁移包管理器时自动升级。Rust 的 `Cargo.toml` / `Cargo.lock` 版本沿用供应商原包（Tauri `2.11.5`）；设备应用版本仍为 `2.0.1`，与我方交付标签 `v0.x` 分开管理。

mock 扫码联调可在面板设置 `device_id` / `shop_id`，必须填写商城后台登记的组合；只改 H5 地址而保留模拟编号会导致设备校验失败。此配置只用于浏览器模拟入口；真实 Tauri 设备保持读取宿主身份，不增加手动覆盖。

1. 在隔离的集成分支解压交付包，保留供应商现有的核心、驱动和设备配置。
2. 目录关系保持 `phonecase-diy-gy/src-tauri/Cargo.toml` 的 `../../phonecase-core` 可解析；核心的其他本地依赖也必须完整。
3. 包内已有 `dist/`。如需修改外层管理 UI，在 `phonecase-diy-gy/` 执行 `npm ci` 和 `npm run build`。POPOMO 首页已经以本次交付的 ES 模块包含在 `src/popomo/`，不需要访问我方仓库才能编译外层工程。
4. 配置正确的设备和商家身份。在设备后台「系统设置 → 账户配置 → Widermatrix H5 地址」设置我方商城地址并保存；首页读取 `get_machine_info().h5_base_url`。供应商核心须确保保存后的地址能从设备信息接口读出。客户确认及放行由 H5 和其服务端完成；不向终端注入 `POPOMO_TERMINAL_API`，终端也不会读取旧配置，详见 `docs/CLOUD_CONNECTION.md`。
5. 检查 Tauri `frontendDist` 指向 `../dist`，确认订单效果图可读取；终端首页不连接订单放行 API。
6. 在供应商支持的构建平台执行 `npm run tauri:build:default`。当前配置开启更新签名，需通过环境变量 `TAURI_SIGNING_PRIVATE_KEY` / `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` 提供供应商自有密钥。若只做无更新测试包，由供应商显式关闭 `bundle.createUpdaterArtifacts`。没有把更新私钥或密码随包交付。
7. 交付安装包、核心版本、前端 `BUILD_INFO.json` 和安装包校验值；双方完成真机验收。

本工程仍保留供应商原应用标识和 2.0.1 版本作为基线；正式升级版本、签名和更新地址由供应商按现有发版规则设置，不可直接作为同版本升级发布。

## 集成行为

- 首页通过 Shadow DOM 隔离样式，供应商的全局重置和管理页样式不改变终端展示。
- 首页由唯一的 TerminalController 订阅事件后发送 `ui_inited`，外层 App 不重复发送。连接失败由首页自动重试，不无限遮挡在供应商加载页。
- 切换后台时首页隐藏但不卸载，展示轮询保持单实例；返回首页不会重复初始化。终端首页不调用支付或放行命令。
- 保留 F8 和右下角连续 8 次点击的维护入口。用 pointerup 统一触摸和鼠标，避免一次触摸被计两次。所有入口都要验证密码：优先使用设备配置的 `device_password`，未配置时沿用供应商默认密码 `168168`；读取失败不允许进入，开发模式也不绕过密码。
- 管理页使用 hash 路由，直接输入管理地址或刷新页面不会继承上一次的前端授权。返回首页即清除授权。此门禁只保护前端入口，Rust 仍需实施设备管理权限检查。
- 系统、支付、货道、打印页面保留原供应商操作。原包的手机壳管理路由本来被注释，本次未擅自开启。
- 供应商原语言资源和后台语言机制保持独立；语言读取失败时用随包英文资源显示页面，让终端继续重连。普通浏览器显示等待宿主，不使用示例设备。POPOMO 首页继续使用 en-US / zh-CN，支持原有 `lang` 参数。
- 前端依赖统一使用 npm 锁文件，Vite / Vue 插件升级到兼容当前路由依赖的版本，补齐共享键盘依赖，移除强制安装 Windows 原生解析器的依赖；保留了实际构建验证的锁文件。
- 已修复原打包配置中不存在的 64x64 图标引用。更新签名备份不入仓库、不入交付包；保留 `build.ps1` 入口，但其中不包含任何签名密码。

## 工程文件保留与替换范围

- 交付包保留 `Makefile`、`build.ps1`、`.gitignore` 和 `.vscode/extensions.json`，打包后检查这些文件确实在 ZIP 中。
- `make run`、`make build`、`make clean`、`make clippy` 保留。当前依赖使用 npm 锁文件，Makefile 命令对应调整为 npm；`make build-shared-ui` 保留为整套前端编译的兼容入口，因为共享组件已由主前端直接从源码编译。
- Windows `build.ps1` 优先使用外部配置的 `TAURI_SIGNING_PRIVATE_KEY`，未配置时可读取供应商本机 `src-tauri/backup/app-signing.key` 的路径。加密密码由环境变量提供，不硬编码到脚本。
- 原 `pnpm-lock.yaml` / `pnpm-workspace.yaml` 已由当前的 `package-lock.json` 替代，不附带与修改后依赖不一致的旧锁文件。依赖安装执行 `npm ci`；如供应商需要继续使用 pnpm，应基于当前 package.json 重新生成锁文件。
- `.git`、依赖目录、Rust 编译产物及自动生成的 `src-tauri/gen` 不随包交付。签名备份、真实设备配置和凭证继续由供应商自行保管。
- 交付包不是删除清单。合并时保留供应商现有的核心模块、驱动、设备配置及本机签名文件，不要使用带删除选项的目录同步覆盖完整工程。

## 真机验收

- 冷启动首页正常显示，设备身份来自宿主，二维码指向正确手机商城。
- F8 和触屏入口均需正确密码；错误密码、断网取密码失败、直接跳管理地址不能进入。
- 四个管理页面能读取实际设备配置；供应商验证保存配置、维护操作和返回首页全屏恢复。
- 进入后台、切换页签和返回首页，不重复发送 ui_inited，不启动第二个订单轮询实例。
- 首页分别显示打印机、机械臂、网络（WebSocket）的离线、连接中、已连接、在线状态；缺货及打印告警显示独立提示，不隐藏有效二维码。设备锁定或关闭 H5 入口仍暂停展示；身份或接口读取失败时不保留旧设备二维码。扫码入口可见不代表硬件已就绪，不改变供应商的接单、付款、打印校验。
- 客户在 H5 确认后，设备订单与实际打印、出货状态正确更新；终端重启或切换后台不会发送支付/放行指令。
- 设备重启、显示器横竖屏、升级和回滚可用。

浏览器模拟验证只能覆盖页面、接口调用和生命周期，不能代替上述硬件验收。
