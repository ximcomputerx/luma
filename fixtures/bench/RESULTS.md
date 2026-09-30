# Phase 0 测量

日期：2026-09-28。机器：Windows，Rust 1.94.0，release 配置。下面的数字是这次跑出来的，不是设计文档里的预算。

## 解析

`cargo run --release -p markdown-engine --bin bench_parse`

| 输入 | p50 | p99 |
| --- | --- | --- |
| 100 KiB | 2.39 ms | 2.85 ms |
| 1 MiB | 22.26 ms | 32.70 ms |

1 MiB 的 p99 低于 150 ms 预算，也低于 300 ms 的换引擎线。

## 编辑器击键

`vitest` 在 jsdom 里对 1 MiB 文档做 CodeMirror 6 的单字符插入，去掉第一次预热后 p99 是 **1.38 ms**。这量的是事务时间，不是 WebView2 里的绘制。绘制没有单独计时。1.38 ms 离 50 ms 的停止线很远，这次不把它当成失败。

## 滚动同步

纯函数测试通过：200 行代码块的中部不会映回该块第 1 行；同行的列表和列表项选中更深的项；用户滚动会占住锁，程序化滚动不会；`scrollend` 更晚时锁保持到那一刻。连续滚动 2 秒的实机回声没有用 UI 自动化跑。

## 数学和 Mermaid

- KaTeX **0.18.9**。`trust: false`、`maxSize: 10` 时，`\includegraphics` 和 `\htmlData` 不产生 `img` 或 `script`。`\rule{100000em}{100000em}` 不把测试进程打崩。
- Mermaid **12.0.0** 的 `dist/mermaid.min.js`（约 5.6 MB）没有相对 `import()`。SVG 过滤会去掉 `script`、`foreignObject` 和 `javascript:` 链接。
- 预览 iframe 的 sandbox 只有 `allow-scripts`。壳的 CSP 含 `connect-src 'none'`。
- pulldown-cmark 0.13.4 只把单行 `$$e=mc^2$$` 当成显示公式。换行包住的 `$$` 不是显示公式，样例用的是单行形式。
- 这些断言在 jsdom / Vitest 里，不在 WebView2 的开发者工具里点过。

## 打包

`npx tauri build` 成功。进程能拉起并保持运行（启动后 4 秒仍在，随后被测试关掉）。

包标识用 `dev.rustmark.desktop`。Tauri 会警告以 `.app` 结尾的标识和 macOS 包扩展名冲突，所以没有用 `dev.rustmark.app`。

## 停止条件

| # | 结果 |
| --- | --- |
| 滚动同步 | 比例、最深块、锁的测试通过。实机 2 秒滚动未自动化 |
| 1 MiB 编辑 | 解析和 jsdom 插入都远低于停止线。WebView2 绘制未计时 |
| 数学 + Mermaid 隔离 | 库选项、SVG 过滤、sandbox 和 CSP 的测试通过。未在 WebView2 里手点 |
| Windows 打包 | 通过。安装包已经生成 |

没有一条已经测到的数字越过停止线。实机滚动和 WebView2 里的公式截图还没有自动化覆盖。
