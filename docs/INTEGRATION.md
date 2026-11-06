# Tauri 终端集成交接

> 已新增包含供应商管理后台的集成工程 `supplier-host/`，优先按 [集成交接说明](SUPPLIER_HANDOFF.md) 交付。下文单独替换 `dist/` 的步骤用于独立首页；不会自动保留供应商后台。

> 当前设备首页只读展示。客户确认和放行由 H5 及其服务端负责；首页不调用 `select_order_payment`，不挂载 CloudOrders，也不读取旧设备放行凭证。后台维护页面仍保留供应商原有的工作人员操作。

## 供应商操作

1. 在供应商定制的 Tauri 2 工程中接入本仓库前端，保留供应商自己的 Rust 后端、命令注册、驱动及打包配置。
2. 从 GitHub Actions 下载前端 ZIP 并解压，或者在本仓库执行 `npm ci && npm test && npm run package`。本地 `dist/` 和交付 ZIP 内的前端入口均为 `index.html`。
3. 将宿主 `build.frontendDist` 指向本仓库 `dist`（相对路径以宿主配置文件位置为准）；开发时将 `build.devUrl` 指向 `http://127.0.0.1:4180`。
4. 宿主注册下表命令，允许前端监听所列事件。按宿主实际窗口配置最小事件权限，例如 Tauri 2 的 `core:event:allow-listen` / `core:event:allow-unlisten`，不需要通用 shell、文件读写或任意 HTTP 权限。
5. 确保 `get_machine_info`、`get_setting_options` 的设备编号一致；二维码商城入口固定为 `https://aicase.chunpat.cc/`，忽略宿主 `h5_base_url`。显式设置默认语言可使用 `VITE_DEFAULT_LANGUAGE=en-US`。
6. 真机检查重启、断网、锁定、库存变更、打印失败与出货完成，然后由供应商签名、打包、分发。仓库访问权按具体人员另行配置，不分享个人 GitHub 密钥。

这是集成步骤说明，不包含可直接替换供应商工程的完整 `tauri.conf.json`。

## 当前命令清单

| 命令 | 用途 | 参考文件 |
| --- | --- | --- |
| `ui_inited` | 事件订阅后通知宿主 UI 就绪 | `global.ts` |
| `get_machine_info` | 设备 / 商家编号、H5 地址、允许展示的联系电话 | `machine.ts` |
| `get_device_info` | 打印机、机械臂、网络代理状态 | `system.ts` |
| `get_setting_options` | 名称、序列号、锁定状态 | `setting.ts` |
| `get_setting_option_config` | `show_h5_entry` 入口开关 | `setting.ts` |
| `get_stock_list` | 本机有效库存统计 | `stock.ts` |
| `get_print_order` | 当前正在处理的订单打印阶段 | `order.ts` |
| `get_print_progress` | 当前任务总进度 | `order.ts` |
| `get_order_list` | 设备端已排序订单列表 | `order.ts` |

均无入参。返回值按供应商原始类型校验；身份字段必须是字符串，数量为非负整数，开关为布尔值。若实际宿主返回格式不同，应先双方确认协议再调整，避免把格式错误当成正常设备。

订阅 `loading_finished`、`machine_info_changed`、`device_state_changed`、`setting_options_changed`、`setting_configs_changed`、`setting_lock_changed`、`stock_info_changed`、`product_info_changed`、`order_info_changed`、`order_print_started`、`order_print_finished`、`order_print_status`、`order_print_progress`、`print_warning`。事件 payload 不作为可信完整快照，收到后重读。

读取命令 10 秒超时，不会永久卡住界面。故障收起二维码；下一次事件或 15 秒轮询恢复。设备/库存变更时立即清除旧二维码并丢弃并发旧结果；高频进度通知合并读取。宿主初始化失败时每 15 秒自动重试。语言由构建配置或启动参数决定，页面没有折叠或操作入口。

## 必须确认的手机订单闭环

用户于 2026-11-03 查看介绍后已确认原流程：手机传图 → 设备编辑 → 在设备选择支付方式 → Rust 处理已付款队列。正常开印由 Rust 负责，不再作为流程归属的疑问；以下待确认项针对我方手机端设计和 Airwallex 支付如何接入这套原流程。业务确认不代表已完成真机验证。

当前 UI 已按收到的命令接入，但没有对方 Rust 工程，尚未真机联调。以下问题不能从接口封装推断：

- [ ] **云端推单**：当前约定由 `saveOrder` 创建后同步至宿主；需真机验证同步时机、初始状态和订单映射。
- [ ] **支付确认**：我方 Airwallex 支付成功怎样被宿主可靠识别？现有 `select_order_payment` / `use_order_pickup` 是供应商支付/核销体系，不能把我方订单直接标成已付款。
- [ ] **关联及幂等**：我方订单 ID、`business_number`、`trade_no` 如何对应？重复回调、重启、断网恢复如何防止重复打印？
- [ ] **确认人在现场**：手机 H5 确认人在机器前的信号如何传入；仅带设备编号的扫码入口不足以证明当前在现场。
- [ ] **图像交付**：`create_order` 的 `target_image` / `effect_image` 是本地路径还是 URL？打印图片尺寸、透明通道、镜像/旋转、定位和偏移责任、下载校验/重试由谁承担？不按字段名猜测。
- [ ] **货道与库存**：下单只指定 `goods_id`；供应商确认自动选货道、开始打印扣库存，以及失败时是否恢复。前端不锁库存、不调整库存、不指定货道。
- [ ] **状态回传**：抓取、打印、出货失败/成功如何回传我方后台？`order_print_finished` 不直接解释为出货或取件成功；请确认 `deliver_success` 的设备检测依据。
- [ ] **原子状态**：`get_print_order` 与 `get_print_progress` 分开读取且进度无订单 ID，任务切换时可能短暂不一致；请提供带 `trade_no` 的统一快照或进度关联方式。
- [ ] **告警恢复**：`print_warning` 只有事件且没有已确认的告警快照接口。收到非 `none` 告警后本页收起二维码，持续到明确收到 `none` 才解除；请确认宿主在初次连接/刷新后重发当前告警，否则无法恢复重启前的 `shipping_full` 等持续告警。
- [ ] **就绪与能力版本**：`ui_inited` 调用时机、`loading_finished` 是否可能先发生，命令可用性及错误码，提供握手版本与真实设备测试。

原始 `order.ts` 中部分下单/支付命令会捕获错误后仅写日志，不能把 Promise 完成视为成功。本项目没有直接执行这些写操作，也没有调用任何 `start_testing_*` 硬件测试。

## 验收

- [ ] 打开设备页，无需手填编号；二维码指向我方商城并带宿主设备/商家 ID。
- [ ] 修改 URL 的 `device_id` / `shop_id` 不改变宿主身份。
- [ ] 断网、锁定、禁用 H5、空库存、调用超时不显示可用二维码；恢复后能继续扫码。
- [ ] 切换设备时不会显示上一次身份的二维码；页面刷新没有重复监听。
- [ ] 真机打印进度正确，完成出货显示「已出货」，不标记「已取件」。
- [ ] 页面仅显示订单尾号与效果预览，不显示设置密码、商家 key、支付凭据或文件路径；不把图像签名地址写入日志。
- [ ] 生产包在普通浏览器加 `preview=1` 也不会模拟设备。

## 参考

- [Tauri 2 invoke](https://v2.tauri.app/develop/calling-rust/)
- [Tauri 2 事件与监听清理](https://v2.tauri.app/develop/calling-frontend/)
- [Tauri 2 isTauri](https://v2.tauri.app/reference/javascript/api/namespacecore/)
- 供应商原始 TypeScript 文件位于 `docs/vendor-api/`，仅作协议参考，不参与构建。原始压缩包未包含完整 App 工程。


## 原 ZIP 核对结果（2026-11-03）

原 ZIP SHA256：`68041c1cba38ad65fe7697eba4ca7070457e8a56efd0b683ff1434ebe3892005`。13 个 TS 文件与 `docs/vendor-api/` 按字节比对一致，原件未修改。

| 当前读取/通知 | ZIP 文件 | 对齐情况 |
| --- | --- | --- |
| `ui_inited()` | global.ts | 无参数，监听事件后通知 |
| `get_machine_info()` | machine.ts | device_id、shop_id、h5_base_url、联系电话显示开关一致 |
| `get_device_info()` | system.ts | printer/gripper/netproxy 的 dtype、state 一致；MDB 不作为本页收款入口 |
| `get_setting_options()` | setting.ts | device_id、device_num、device_name、is_lock 一致；过滤 device_password |
| `get_setting_option_config()` | setting.ts | show_h5_entry 一致；enable_order_queue 由供应商配置，当前 UI 不更改开关 |
| `get_stock_list()` | stock.ts | slot/count/disabled/model_id 一致 |
| `get_order_list()` | order.ts | 使用 trade_no、business_number、goods_id、model_id、effect_image、三类状态；保持原排序 |
| `get_print_order()` | order.ts | OrderItem 或 null，使用 trade_no 关联当前任务 |
| `get_print_progress()` | order.ts | 总进度 progress；原接口没有 trade_no，前后核对当前订单减少切单误配 |

当前订阅的 16 个事件在 ZIP 枚举中均存在；普通事件只触发重读，print_warning 的 warning 字段与原类型一致。供应商 `PayType.Free = "free"` 确实存在，`select_order_payment` 的入参是 `{trade_no, pay_type}`，两个值均为字符串；该写接口仅作为历史契约记录，当前终端首页不会调用它，也不会调用 `get_order_by_id` 进行放行核验。客户确认归 H5 处理，见 [职责说明](CLOUD_CONNECTION.md)。

构建前会执行 `tests/vendor-contract.test.ts`，从原始 TS 语法树核对本页命令、事件及支付适配参数，避免仅靠模拟数据自洽。

### 仍需供应商提供/验证

1. `model_id` 是编号、`model_lang_id` 是语言键，ZIP 没有机型显示名称或翻译字典。当前直接展示该编号；预览数据写的是可读示例名，不能据此认为真机也返回名称。需要提供翻译表或明确的名称字段。
2. `get_order_list()` 没说明已付/未付筛选，列表出现不等于我方已收款。需确认来源区分、初始 pay_status、排序和 free 后状态。
3. `effect_image` 是 string，未规定 URL/绝对路径/相对路径；本页支持 HTTP(S) 与可授权的绝对本地图片路径。相对路径需明确基准目录；宿主需放行对应 asset scope/CSP。
4. Rust 工程、命令注册、窗口事件权限、排队开关和真实返回值尚未交付验证。TS 文件只能证明接口声明匹配，不能证明命令已经在运行中的终端实现。
5. 设备/商家 ID 当前额外要求为十进制数字字符串（联调值 401/146），商品 ID 为正整数；若供应商使用其他格式，需要提前确认调整。

原 ZIP 还包含文件复制、删除、硬件测试等接口。本页面没有引入这些模块或执行这些操作；通过自己的最小适配层调用 9 个展示命令，不额外调用 get_order_by_id 或 select_order_payment。
