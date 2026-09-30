use std::sync::atomic::Ordering;
use std::time::Instant;

use rustmark_core::{apply_patch, mark_missing, parse_patch, SettingsError};
use serde_json::Value;
use tauri::{AppHandle, Manager, State};

use crate::error::{invalid_settings, CommandError};
use crate::glass::apply_glass;
use crate::logging::log_command;
use crate::settings_store::{self, SettingsResponse};
use crate::state::{self, AppState};

#[tauri::command]
pub fn settings_get(state: State<'_, AppState>) -> SettingsResponse {
    let started = Instant::now();
    let session = state::lock(&state);
    let mut settings = session.settings.clone();
    drop(session);
    mark_missing(&mut settings);
    let frozen = state.settings_frozen.load(Ordering::SeqCst);
    log_command(
        "settings_get",
        started,
        0,
        settings.schema_version as u64,
        "ok",
        "settings.json",
    );
    settings_store::response(settings, frozen)
}

#[tauri::command]
pub fn settings_set(
    app: AppHandle,
    state: State<'_, AppState>,
    patch: Value,
) -> Result<SettingsResponse, CommandError> {
    let started = Instant::now();
    if state.settings_frozen.load(Ordering::SeqCst) {
        log_command(
            "settings_set",
            started,
            0,
            0,
            "invalid_settings",
            "settings.json",
        );
        return Err(crate::error::command_error(
            "invalid_settings",
            "设置文件版本较新，不会改写。",
        ));
    }
    let parsed = parse_patch(&patch).map_err(|error| {
        log_command(
            "settings_set",
            started,
            0,
            0,
            "invalid_settings",
            "settings.json",
        );
        invalid_settings(matches!(error, SettingsError::Secret))
    })?;
    let mut session = state::lock(&state);
    apply_patch(&mut session.settings, parsed).map_err(|_| invalid_settings(false))?;
    let settings = session.settings.clone();
    drop(session);
    settings_store::persist_settings(&app, &settings, false)?;
    if let Some(window) = app.get_webview_window("main") {
        apply_glass(&window, &settings);
    }
    let mut view = settings;
    mark_missing(&mut view);
    log_command(
        "settings_set",
        started,
        0,
        view.schema_version as u64,
        "ok",
        "settings.json",
    );
    Ok(settings_store::response(view, false))
}
