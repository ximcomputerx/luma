use std::fs;
use std::path::PathBuf;

use rustmark_core::{load_settings_value, LoadKind, Settings};
use serde::Serialize;
use serde_json::Value;
use tauri::path::BaseDirectory;
use tauri::{AppHandle, Manager, Runtime};
use tauri_plugin_store::StoreExt;

use crate::atomic::atomic_write;
use crate::error::{command_error, CommandError};
use crate::glass::glass_active;

#[derive(Serialize)]
pub struct SettingsResponse {
    #[serde(flatten)]
    pub settings: Settings,
    pub glass_active: bool,
    pub settings_frozen: bool,
}

pub struct LoadedSettings {
    pub settings: Settings,
    pub frozen: bool,
    #[allow(dead_code)]
    pub dropped: Vec<String>,
}

pub fn settings_file<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, CommandError> {
    app.path()
        .resolve("settings.json", BaseDirectory::AppData)
        .map_err(|_| command_error("io", "无法读取设置。"))
}

pub fn load_settings(app: &AppHandle) -> LoadedSettings {
    let Ok(path) = settings_file(app) else {
        return LoadedSettings {
            settings: Settings::default(),
            frozen: false,
            dropped: Vec::new(),
        };
    };
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    if !path.exists() {
        let settings = Settings::default();
        let _ = write_settings_file(&path, &settings);
        let _ = open_store(app);
        return LoadedSettings {
            settings,
            frozen: false,
            dropped: Vec::new(),
        };
    }
    match read_value(&path) {
        Ok(value) => finish_load(app, &path, value),
        Err(_) => recover(app, &path),
    }
}

pub fn persist_settings(
    app: &AppHandle,
    settings: &Settings,
    frozen: bool,
) -> Result<(), CommandError> {
    if frozen {
        return Err(command_error(
            "invalid_settings",
            "设置文件版本较新，不会改写。",
        ));
    }
    let path = settings_file(app)?;
    if path.exists() {
        let backup = path.with_file_name("settings.json.bak");
        let _ = fs::copy(&path, &backup);
    }
    write_settings_file(&path, settings)?;
    if open_store(app).is_err() {
        tracing::info!(target: "rustmark", command = "settings_save", code = "io", file = "settings.json");
    }
    Ok(())
}

fn finish_load(app: &AppHandle, path: &std::path::Path, value: Value) -> LoadedSettings {
    match load_settings_value(&value) {
        LoadKind::Ready { settings, dropped } => {
            for name in &dropped {
                tracing::info!(target: "rustmark", command = "settings_load", field = %name, code = "dropped");
            }
            let migrated = value
                .get("schema_version")
                .and_then(|item| item.as_u64())
                .unwrap_or(0)
                != 1
                || !dropped.is_empty();
            if migrated {
                let _ = persist_settings(app, &settings, false);
            } else {
                let _ = open_store(app);
            }
            LoadedSettings {
                settings,
                frozen: false,
                dropped,
            }
        }
        LoadKind::Newer { version } => {
            tracing::info!(target: "rustmark", command = "settings_load", code = "newer", rev = version);
            let _ = open_store(app);
            LoadedSettings {
                settings: Settings::default(),
                frozen: true,
                dropped: Vec::new(),
            }
        }
        LoadKind::Corrupt => recover(app, path),
    }
}

fn recover(app: &AppHandle, path: &std::path::Path) -> LoadedSettings {
    let broken = path.with_file_name("settings.json.broken");
    let _ = fs::remove_file(&broken);
    let _ = fs::rename(path, &broken);
    let backup = path.with_file_name("settings.json.bak");
    if let Ok(value) = read_value(&backup) {
        if let LoadKind::Ready { settings, dropped } = load_settings_value(&value) {
            let _ = write_settings_file(path, &settings);
            let _ = open_store(app);
            return LoadedSettings {
                settings,
                frozen: false,
                dropped,
            };
        }
    }
    let settings = Settings::default();
    let _ = write_settings_file(path, &settings);
    let _ = open_store(app);
    tracing::info!(target: "rustmark", command = "settings_load", code = "reset", file = "settings.json");
    LoadedSettings {
        settings,
        frozen: false,
        dropped: Vec::new(),
    }
}

fn read_value(path: &std::path::Path) -> Result<Value, ()> {
    let bytes = fs::read(path).map_err(|_| ())?;
    serde_json::from_slice(&bytes).map_err(|_| ())
}

fn write_settings_file(path: &std::path::Path, settings: &Settings) -> Result<(), CommandError> {
    let bytes =
        serde_json::to_vec_pretty(settings).map_err(|_| command_error("io", "无法保存设置。"))?;
    atomic_write(path, &bytes).map_err(|_| command_error("io", "无法保存设置。"))
}

fn open_store(app: &AppHandle) -> Result<(), CommandError> {
    if app.get_store("settings.json").is_some() {
        if let Some(store) = app.get_store("settings.json") {
            store
                .reload_ignore_defaults()
                .map_err(|_| command_error("io", "无法读取设置。"))?;
        }
        return Ok(());
    }
    app.store_builder("settings.json")
        .disable_auto_save()
        .build()
        .map(|_| ())
        .map_err(|_| command_error("io", "无法读取设置。"))
}

pub fn response(settings: Settings, frozen: bool) -> SettingsResponse {
    let active = glass_active(&settings);
    SettingsResponse {
        settings,
        glass_active: active,
        settings_frozen: frozen,
    }
}
