# Luma

本地优先的 Markdown 编辑器。当前是 Phase 2：单文档、打开文件、打开文件夹、保存队列、设置、三栏预览，以及英文和简体中文界面。

显示名是 Luma，定义在 `frontend/src/brand.ts`。桌面包名是 `luma`，安装包标识是 `dev.luma.desktop`。内部库 `rustmark-core` 保持原名。语言存在 `luma.locale.v1`。旧的 `rustmark.writing.v1` 会在读取时抄到 `luma.writing.v1`。

产品规格在 `docs/DESIGN.md`。Phase 0 的测量在 `fixtures/bench/RESULTS.md`。

## 运行

在这个目录：

```text
npm install
npm --prefix frontend install
npm run dev
```

工具链钉在 Rust 1.94.0。Tauri 2.12 的最低版本是 1.90。

## 测试

```text
cargo test --workspace
npm --prefix frontend test
npm run build
```

前端不依赖 `@tauri-apps/plugin-fs`、`plugin-store` 或 `plugin-http`。文件、设置和对话框只从 Rust 命令进入。
