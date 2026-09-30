use std::fs;
use std::sync::atomic::Ordering;
use std::time::Instant;

use rustmark_core::mark_missing;
use serde::Serialize;
use serde_json::json;
use tauri::{AppHandle, Manager, State};
use tauri_plugin_dialog::DialogExt;

use crate::atomic::atomic_write;
use crate::error::{canceled, io_failed, CommandError};
use crate::logging::{log_command, log_tail};
use crate::state::{self, AppState};

#[derive(Serialize)]
pub struct DiagnosticsResult {
    pub path: String,
}

#[tauri::command]
pub async fn diagnostics_export(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<DiagnosticsResult, CommandError> {
    let started = Instant::now();
    let picked = app
        .dialog()
        .file()
        .set_title("导出诊断")
        .set_file_name("luma-diagnostics.json")
        .blocking_save_file();
    let Some(path) = picked else {
        log_command("diagnostics_export", started, 0, 0, "dialog_canceled", "-");
        return Err(canceled());
    };
    let path = path.into_path().map_err(|_| io_failed())?;
    let (mut settings, current_path, schema) = {
        let session = state::lock(&state);
        let current_path = session
            .documents
            .iter()
            .find(|document| document.id == session.active)
            .and_then(|document| document.path.as_ref())
            .map(|item| item.to_string_lossy().into_owned());
        (
            session.settings.clone(),
            current_path,
            session.settings.schema_version,
        )
    };
    mark_missing(&mut settings);
    let panic_text = fs::read_to_string(state.log_dir.join("crash.log"))
        .ok()
        .map(|text| text.chars().take(16_000).collect::<String>());
    let report = json!({
        "app_version": env!("CARGO_PKG_VERSION"),
        "os": std::env::consts::OS,
        "arch": std::env::consts::ARCH,
        "webview_user_agent": webview_user_agent(),
        "schema_version": schema,
        "settings_frozen": state.settings_frozen.load(Ordering::SeqCst),
        "settings": settings,
        "current_path": current_path,
        "log_tail": log_tail(&state.log_dir),
        "panic": panic_text,
    });
    let bytes = serde_json::to_vec_pretty(&report).map_err(|_| io_failed())?;
    atomic_write(&path, &bytes).map_err(|_| io_failed())?;
    log_command(
        "diagnostics_export",
        started,
        bytes.len() as u64,
        schema as u64,
        "ok",
        "diagnostics.json",
    );
    Ok(DiagnosticsResult {
        path: path.to_string_lossy().into_owned(),
    })
}

#[tauri::command]
pub fn close_decision(
    app: AppHandle,
    state: State<'_, AppState>,
    action: String,
) -> Result<(), CommandError> {
    let started = Instant::now();
    match action.as_str() {
        "cancel" => {
            log_command("close_decision", started, 0, 0, "cancel", "-");
            Ok(())
        }
        "save" | "discard" => {
            state.allow_close.store(true, Ordering::SeqCst);
            if let Some(window) = app.get_webview_window("main") {
                if window.destroy().is_err() {
                    state.allow_close.store(false, Ordering::SeqCst);
                    log_command("close_decision", started, 0, 0, "io", "-");
                    return Err(io_failed());
                }
            }
            log_command("close_decision", started, 0, 0, action.as_str(), "-");
            Ok(())
        }
        _ => {
            log_command("close_decision", started, 0, 0, "io", "-");
            Err(crate::error::command_error("io", "无法关闭窗口。"))
        }
    }
}

fn webview_user_agent() -> String {
    #[cfg(windows)]
    {
        for key in [
            r"HKLM\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}",
            r"HKLM\SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}",
        ] {
            let output = std::process::Command::new("reg")
                .args(["query", key, "/v", "pv"])
                .output();
            if let Ok(output) = output {
                let text = String::from_utf8_lossy(&output.stdout);
                for line in text.lines() {
                    let mut parts = line.split_whitespace();
                    if parts.next() == Some("pv") {
                        if let Some(version) = parts.last() {
                            return format!("WebView2/{version}");
                        }
                    }
                }
            }
        }
    }
    format!("unknown/{}", std::env::consts::OS)
}
