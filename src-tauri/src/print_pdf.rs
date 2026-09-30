use std::path::Path;
use std::time::Duration;

use tauri::AppHandle;

use crate::error::{command_error, io_failed, CommandError};

#[derive(Clone, Copy)]
pub struct PrintMetrics {
    pub width_px: f64,
    pub height_px: f64,
    pub width_in: f64,
    pub height_in: f64,
    pub margin_in: f64,
    pub landscape: bool,
}

#[cfg(windows)]
pub async fn print_html_to_pdf(
    app: &AppHandle,
    html: &str,
    pdf: &Path,
    metrics: PrintMetrics,
) -> Result<(), CommandError> {
    use std::fs;

    let temp = std::env::temp_dir().join(format!("rustmark-print-{}.html", uuid::Uuid::new_v4()));
    fs::write(&temp, html).map_err(|_| io_failed())?;
    let printed = print_file(app, &temp, pdf, metrics).await;
    let _ = fs::remove_file(&temp);
    printed
}

#[cfg(windows)]
async fn print_file(
    app: &AppHandle,
    html_file: &Path,
    pdf: &Path,
    metrics: PrintMetrics,
) -> Result<(), CommandError> {
    use tauri::webview::PageLoadEvent;
    use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};
    use url::Url;

    if let Some(existing) = app.get_webview_window("export-pdf") {
        let _ = existing.destroy();
    }
    let file_url = Url::from_file_path(html_file).map_err(|_| io_failed())?;
    let (loaded_tx, loaded_rx) = std::sync::mpsc::channel();
    let window = WebviewWindowBuilder::new(app, "export-pdf", WebviewUrl::External(file_url))
        .title("导出 PDF")
        .inner_size(metrics.width_px, metrics.height_px)
        .visible(false)
        .on_page_load(move |_window, payload| {
            if payload.event() == PageLoadEvent::Finished {
                let _ = loaded_tx.send(());
            }
        })
        .build()
        .map_err(|_| command_error("io", "无法打开打印页面。"))?;
    if loaded_rx.recv_timeout(Duration::from_secs(8)).is_err() {
        let _ = window.destroy();
        return Err(command_error("io", "打印页面没有完成加载。"));
    }
    let (done_tx, done_rx) = std::sync::mpsc::channel();
    let pdf_path = pdf.to_path_buf();
    window
        .with_webview(move |webview| {
            if let Err(error) = start_print(webview, &pdf_path, done_tx.clone(), metrics) {
                let _ = done_tx.send(Err(error));
            }
        })
        .map_err(|_| io_failed())?;
    let printed = done_rx
        .recv_timeout(Duration::from_secs(30))
        .map_err(|_| command_error("io", "导出 PDF 超时。"))?;
    let _ = window.destroy();
    printed
}

#[cfg(windows)]
fn start_print(
    webview: tauri::webview::PlatformWebview,
    pdf: &Path,
    done: std::sync::mpsc::Sender<Result<(), CommandError>>,
    metrics: PrintMetrics,
) -> Result<(), CommandError> {
    use webview2_com::Microsoft::Web::WebView2::Win32::{
        ICoreWebView2Environment6, ICoreWebView2_7, COREWEBVIEW2_PRINT_ORIENTATION_LANDSCAPE,
        COREWEBVIEW2_PRINT_ORIENTATION_PORTRAIT,
    };
    use webview2_com::PrintToPdfCompletedHandler;
    use windows::core::{Interface, HSTRING};

    unsafe {
        let environment = webview
            .environment()
            .cast::<ICoreWebView2Environment6>()
            .map_err(|_| io_failed())?;
        let settings = environment.CreatePrintSettings().map_err(|_| io_failed())?;
        let orientation = if metrics.landscape {
            COREWEBVIEW2_PRINT_ORIENTATION_LANDSCAPE
        } else {
            COREWEBVIEW2_PRINT_ORIENTATION_PORTRAIT
        };
        settings
            .SetOrientation(orientation)
            .map_err(|_| io_failed())?;
        settings
            .SetPageWidth(metrics.width_in)
            .map_err(|_| io_failed())?;
        settings
            .SetPageHeight(metrics.height_in)
            .map_err(|_| io_failed())?;
        settings
            .SetMarginTop(metrics.margin_in)
            .map_err(|_| io_failed())?;
        settings
            .SetMarginBottom(metrics.margin_in)
            .map_err(|_| io_failed())?;
        settings
            .SetMarginLeft(metrics.margin_in)
            .map_err(|_| io_failed())?;
        settings
            .SetMarginRight(metrics.margin_in)
            .map_err(|_| io_failed())?;
        settings.SetScaleFactor(1.0).map_err(|_| io_failed())?;
        settings
            .SetShouldPrintBackgrounds(true)
            .map_err(|_| io_failed())?;
        settings
            .SetShouldPrintHeaderAndFooter(false)
            .map_err(|_| io_failed())?;
        let core = webview
            .controller()
            .CoreWebView2()
            .map_err(|_| io_failed())?;
        let core = core.cast::<ICoreWebView2_7>().map_err(|_| io_failed())?;
        let path = HSTRING::from(pdf.as_os_str());
        let handler = PrintToPdfCompletedHandler::create(Box::new(move |result, success| {
            let wrote = result.is_ok() && success;
            let _ = done.send(if wrote {
                Ok(())
            } else {
                Err(command_error("io", "导出 PDF 失败。"))
            });
            Ok(())
        }));
        core.PrintToPdf(&path, &settings, &handler)
            .map_err(|_| io_failed())?;
    }
    Ok(())
}

#[cfg(not(windows))]
pub async fn print_html_to_pdf(
    _app: &AppHandle,
    _html: &str,
    _pdf: &Path,
    _metrics: PrintMetrics,
) -> Result<(), CommandError> {
    Err(command_error(
        "io",
        "这个系统请用导出 HTML。PDF 文件导出目前只在 Windows 上写盘。",
    ))
}
