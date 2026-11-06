# POPOMO 集成宿主入口

这是供应商 `phonecase-diy-gy` 的集成版本：POPOMO 首页 + 原设备管理后台。

- 当前仓库：先在上级目录执行 `npm run build:embedded`，再在本目录执行 `npm ci`、`npm run build`。
- 收到交付 ZIP：`src/popomo/terminal.js` 和 `dist/` 已包含；在本目录执行 `npm ci`、`npm run build` 即可重建外层 UI。
- 最终应用：供应商提供相邻的 `phonecase-core` 及其依赖、设备配置和签名环境后，运行 `npm run tauri:build:default`。
- 本目录没有核心代码、签名密钥和设备凭证，不能单独生成可运行的硬件程序。

完整说明见当前仓库 `../docs/SUPPLIER_HANDOFF.md`；交付 ZIP 中位于 `docs/SUPPLIER_HANDOFF.md`。
