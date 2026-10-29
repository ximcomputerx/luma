# Luma

[English](README.en.md)

<img src="luma.png" alt="Luma" width="96">

Luma 是 Windows 上的本地 Markdown 写作工具。笔记就是磁盘上的普通 Markdown 文件。

## 功能

- 三种版面：只看源码、只看预览、左右分栏。编辑器是 CodeMirror 6，中文输入使用系统输入法。
- 预览支持标题、强调、列表、任务列表、表格、引用、代码块、KaTeX 数学公式和 Mermaid 图。预览画在沙箱 iframe 里。
- 多标签、文件夹树、最近文件。可打开的扩展名是 `.md`、`.markdown`、`.mdown`、`.mkdn`。
- 查找、大纲、自动保存、关闭前确认未保存的修改、粘贴图片。
- 导出 HTML 和 PDF。
- 十二套写作主题：象牙纸、暖棕阅读、雾灰、樱花纸、森林绿、蓝灰、素白、深色、北欧夜、咖啡夜、墨夜、松夜。界面语言为简体中文和 English。
- 命令面板。Luma 已经打开时，再次用它打开文件会进入当前窗口。
- 可以在应用设置里把 Luma 选为 Windows 的默认 Markdown 程序。安装程序保持系统里现有的默认程序。

## 现状

- 版本 0.1.0，已在 Windows x64 上打包。
- 安装包是当前用户的 NSIS 安装程序。
- 应用里有检查更新的流程。发布地址仍是占位配置，所以现在检查更新得不到可用的新版本。
- 安装包还没有 Authenticode 签名。Windows 可能会因此显示未知发布者提示。

## 从源码运行

环境：

- Windows 10 或 Windows 11，x64
- Node.js 22
- Rust 1.94.0（仓库里的 `rust-toolchain.toml` 会选定这个版本）
- Visual Studio 生成工具，含 MSVC
- WebView2 运行时（Windows 11 通常已经带有）

在仓库根目录：

```text
npm install
npm --prefix frontend install
npm run dev
```

`npm run dev` 启动的是开发版程序。它带有控制台窗口，界面从 `http://localhost:1420` 加载。资源管理器里的「打开方式」应指向安装后的 `%LOCALAPPDATA%\Luma\luma.exe`。

## 测试

```text
npm run test:js
npm run test:rust
```

## 打出安装包

`npm run build` 会生成 `target/release/bundle/nsis/Luma_0.1.0_x64-setup.exe`。文件名里的版本与 `src-tauri/tauri.conf.json` 的 `version` 一致。

安装包带有更新签名，构建前需要一把自己的 minisign 密钥。下面的命令在 PowerShell 里执行，生成时会提示设置口令：

```powershell
npx tauri signer generate -w "$env:USERPROFILE\.tauri\luma.key"
```

已有密钥时不要加 `--force`，否则会覆盖那把密钥。

在同一个 PowerShell 窗口里设置环境变量后再构建。`TAURI_SIGNING_PRIVATE_KEY` 填密钥文件的路径：

```powershell
$env:TAURI_SIGNING_PRIVATE_KEY = "$env:USERPROFILE\.tauri\luma.key"
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = "<生成密钥时设置的口令>"
npm run build
```

密钥文件和口令留在本机，不要放进仓库。

安装程序把 Luma 装到当前用户的 `%LOCALAPPDATA%\Luma`。卸载会保留用户的 Markdown 文件，也会保留 `%APPDATA%\dev.luma.desktop` 里的设置。

## 目录

技术栈是 Tauri 2.12、Rust、React 19、TypeScript 和 CodeMirror 6。

- `frontend/`：界面，React 与 Vite。
- `src-tauri/`：Tauri 桌面壳。Windows 安装钩子在 `src-tauri/windows/`。
- `crates/rustmark-core/`：文档、路径和设置的内部库。对外产品名是 Luma。
- `crates/markdown-engine/`：基于 pulldown-cmark 的 Markdown 解析。
- `crates/markdown-render/`：预览数据与导出。

## 许可

本仓库以 [Apache License 2.0](LICENSE) 授权。
