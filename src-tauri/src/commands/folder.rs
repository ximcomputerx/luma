use std::path::{Component, Path, PathBuf};
use std::time::Instant;

use rustmark_core::{list_folder, EntryKind, JailError};
use serde::Serialize;
use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;

use crate::error::{canceled, io_failed, outside_jail, rejected, CommandError};
use crate::logging::log_command;
use crate::state::{self, AppState};

#[derive(Serialize)]
pub struct TreeEntry {
    pub name: String,
    pub path: String,
    pub kind: &'static str,
}

#[derive(Serialize)]
pub struct FolderPayload {
    pub root: String,
    pub entries: Vec<TreeEntry>,
    pub truncated: bool,
}

#[derive(Serialize)]
pub struct ListPayload {
    pub entries: Vec<TreeEntry>,
    pub truncated: bool,
}

#[tauri::command]
pub async fn folder_open(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<FolderPayload, CommandError> {
    let started = Instant::now();
    let picked = app
        .dialog()
        .file()
        .set_title("打开文件夹")
        .blocking_pick_folder();
    let Some(path) = picked else {
        log_command("folder_open", started, 0, 0, "dialog_canceled", "-");
        return Err(canceled());
    };
    let path = path.into_path().map_err(|_| io_failed())?;
    open_folder(state.inner(), &path, started, "folder_open")
}

#[tauri::command]
pub fn folder_open_path(
    state: State<'_, AppState>,
    path: String,
) -> Result<FolderPayload, CommandError> {
    let started = Instant::now();
    open_folder(state.inner(), Path::new(&path), started, "folder_open_path")
}

fn open_folder(
    state: &AppState,
    path: &Path,
    started: Instant,
    command: &str,
) -> Result<FolderPayload, CommandError> {
    if path
        .components()
        .any(|component| component == Component::ParentDir)
        || !path.is_dir()
    {
        log_command(command, started, 0, 0, "rejected", &file_name(path));
        return Err(rejected());
    }
    let mut session = state::lock(state);
    let root = match session.jail.set_folder_root(path) {
        Ok(root) => root,
        Err(JailError::Io) => return Err(io_failed()),
        Err(JailError::Outside) | Err(JailError::NoRoot) => return Err(outside_jail()),
    };
    let page = list_folder(&session.jail, &root).map_err(map_jail)?;
    let payload = FolderPayload {
        root: root.to_string_lossy().into_owned(),
        entries: entries(page.entries),
        truncated: page.truncated,
    };
    log_command(
        command,
        started,
        payload.entries.len() as u64,
        0,
        "ok",
        &file_name(&root),
    );
    Ok(payload)
}

#[tauri::command]
pub fn folder_list(state: State<'_, AppState>, dir: String) -> Result<ListPayload, CommandError> {
    let started = Instant::now();
    let session = state::lock(&state);
    let page = list_folder(&session.jail, PathBuf::from(&dir).as_path()).map_err(map_jail)?;
    let payload = ListPayload {
        entries: entries(page.entries),
        truncated: page.truncated,
    };
    log_command(
        "folder_list",
        started,
        payload.entries.len() as u64,
        0,
        "ok",
        &file_name(std::path::Path::new(&dir)),
    );
    Ok(payload)
}

fn entries(items: Vec<rustmark_core::FolderEntry>) -> Vec<TreeEntry> {
    items
        .into_iter()
        .map(|entry| TreeEntry {
            name: entry.name,
            path: entry.path.to_string_lossy().into_owned(),
            kind: match entry.kind {
                EntryKind::File => "file",
                EntryKind::Dir => "dir",
            },
        })
        .collect()
}

fn map_jail(error: JailError) -> CommandError {
    match error {
        JailError::Outside | JailError::NoRoot => outside_jail(),
        JailError::Io => io_failed(),
    }
}

fn file_name(path: &std::path::Path) -> String {
    path.file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_else(|| "-".to_string())
}
