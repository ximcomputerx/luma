use std::fs;
use std::path::{Path, PathBuf};
use std::time::{Instant, SystemTime, UNIX_EPOCH};

use rustmark_core::{remember_recent, DocumentSession, JailError, RevError};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, State};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};
use uuid::Uuid;

use crate::error::{
    canceled, command_error, conflict, io_failed, missing, not_utf8, outside_jail, too_large,
    CommandError,
};
use crate::io_docs::{read_note, write_note, ReadFailure};
use crate::logging::{file_label, log_command};
use crate::settings_store::persist_settings;
use crate::state::{
    self, close_document, rebind, snapshot, AppState, CloseEffect, CloseResponse, EmptyWorkspace,
    SnapshotResponse, TAB_LIMIT,
};

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct SaveRequest {
    document_id: Uuid,
    markdown_lf: String,
    rev: u64,
    save_as: bool,
}

#[derive(Debug, Serialize, Clone)]
#[serde(untagged)]
pub(crate) enum SaveOutcome {
    Saved {
        path: String,
        rev: u64,
        bytes: u64,
        root: String,
    },
    Skipped {
        skipped: String,
    },
}

#[derive(Clone, Serialize)]
struct SavedEvent {
    document_id: Uuid,
    path: String,
    rev: u64,
    bytes: u64,
}

#[tauri::command]
pub fn document_new(state: State<'_, AppState>) -> Result<SnapshotResponse, CommandError> {
    let started = Instant::now();
    let mut session = state::lock(&state);
    if session.documents.len() >= TAB_LIMIT {
        return Err(command_error("io", "打开的标签太多。"));
    }
    let document = DocumentSession::untitled();
    session.active = document.id;
    session.documents.push(document);
    let response = snapshot(&session);
    log_command("document_new", started, 0, response.document.rev, "ok", "-");
    Ok(response)
}

#[tauri::command]
pub fn document_focus(
    state: State<'_, AppState>,
    document_id: Uuid,
) -> Result<SnapshotResponse, CommandError> {
    let mut session = state::lock(&state);
    let index = document_index(&session, document_id)?;
    session.active = session.documents[index].id;
    Ok(snapshot(&session))
}

#[tauri::command]
pub fn document_close(
    state: State<'_, AppState>,
    document_id: Uuid,
) -> Result<CloseResponse, CommandError> {
    let started = Instant::now();
    let mut session = state::lock(&state);
    let effect = close_document(&mut session, document_id).map_err(|_| conflict())?;
    rebind(&mut session);
    if effect == CloseEffect::Empty {
        let root = session
            .jail
            .root()
            .map(|path| path.to_string_lossy().into_owned());
        log_command("document_close", started, 0, 0, "ok", "-");
        return Ok(CloseResponse::Empty(EmptyWorkspace {
            empty: true,
            tabs: Vec::new(),
            root,
        }));
    }
    let response = snapshot(&session);
    log_command(
        "document_close",
        started,
        0,
        response.document.rev,
        "ok",
        "-",
    );
    Ok(CloseResponse::Open(response))
}

fn document_index(session: &state::Session, document_id: Uuid) -> Result<usize, CommandError> {
    session
        .documents
        .iter()
        .position(|document| document.id == document_id)
        .ok_or_else(conflict)
}

#[tauri::command]
pub async fn document_open(
    app: AppHandle,
    state: State<'_, AppState>,
    path: Option<String>,
) -> Result<SnapshotResponse, CommandError> {
    let started = Instant::now();
    let chosen = match path {
        Some(path) => PathBuf::from(path),
        None => pick_markdown(&app, "打开文件", None)?,
    };
    let opened = match read_note(&chosen) {
        Ok(opened) => opened,
        Err(ReadFailure::Missing) => {
            log_command(
                "document_open",
                started,
                0,
                0,
                "io",
                &file_label(Some(&chosen)),
            );
            return Err(missing());
        }
        Err(ReadFailure::NotUtf8) => {
            log_command(
                "document_open",
                started,
                0,
                0,
                "not_utf8",
                &file_label(Some(&chosen)),
            );
            return Err(not_utf8());
        }
        Err(ReadFailure::TooLarge) => {
            log_command(
                "document_open",
                started,
                0,
                0,
                "too_large",
                &file_label(Some(&chosen)),
            );
            return Err(too_large());
        }
        Err(ReadFailure::Io) => {
            log_command(
                "document_open",
                started,
                0,
                0,
                "io",
                &file_label(Some(&chosen)),
            );
            return Err(io_failed());
        }
    };
    let bytes = opened.markdown_lf.len() as u64;
    let mut session = state::lock(&state);
    let mut trial = session.jail.clone();
    let canonical = match trial.open_document(&chosen) {
        Ok(path) => path,
        Err(JailError::Outside) | Err(JailError::NoRoot) => return Err(outside_jail()),
        Err(JailError::Io) => return Err(io_failed()),
    };
    if let Some(index) = session
        .documents
        .iter()
        .position(|document| document.path.as_ref() == Some(&canonical))
    {
        session.active = session.documents[index].id;
        let response = snapshot(&session);
        log_command(
            "document_open",
            started,
            bytes,
            response.document.rev,
            "ok",
            &file_label(Some(&canonical)),
        );
        return Ok(response);
    }
    if session.documents.len() >= TAB_LIMIT {
        return Err(command_error("io", "打开的标签太多。"));
    }
    session.jail = trial;
    let opened_document = DocumentSession::opened(
        canonical.clone(),
        opened.markdown_lf,
        opened.newline,
        Some(opened.mtime),
    );
    session.active = opened_document.id;
    session.documents.push(opened_document);
    rebind(&mut session);
    let shown = canonical.to_string_lossy().into_owned();
    remember_recent(&mut session.settings, &shown, now_ms());
    let settings = session.settings.clone();
    let frozen = state
        .settings_frozen
        .load(std::sync::atomic::Ordering::SeqCst);
    let response = snapshot(&session);
    let rev = response.document.rev;
    drop(session);
    if let Err(error) = persist_settings(&app, &settings, frozen) {
        log_command(
            "document_open",
            started,
            bytes,
            rev,
            &error.code,
            &file_label(Some(&canonical)),
        );
    }
    log_command(
        "document_open",
        started,
        bytes,
        rev,
        "ok",
        &file_label(Some(&canonical)),
    );
    Ok(response)
}

#[tauri::command]
pub async fn document_save(
    app: AppHandle,
    state: State<'_, AppState>,
    request: SaveRequest,
) -> Result<SaveOutcome, CommandError> {
    save(app, state, request, false).await
}

#[tauri::command]
pub async fn document_autosave(
    app: AppHandle,
    state: State<'_, AppState>,
    request: SaveRequest,
) -> Result<SaveOutcome, CommandError> {
    save(app, state, request, true).await
}

async fn save(
    app: AppHandle,
    state: State<'_, AppState>,
    request: SaveRequest,
    autosave: bool,
) -> Result<SaveOutcome, CommandError> {
    let started = Instant::now();
    let command = if autosave {
        "document_autosave"
    } else {
        "document_save"
    };
    let save_as = request.save_as && !autosave;
    let (current_path, newline, opened_mtime) = {
        let session = state::lock(&state);
        let index = match document_index(&session, request.document_id) {
            Ok(index) => index,
            Err(error) => return Err(error),
        };
        match session.documents[index].check_rev(request.document_id, request.rev) {
            Ok(()) => {}
            Err(RevError::Conflict) => {
                log_command(
                    command,
                    started,
                    request.markdown_lf.len() as u64,
                    request.rev,
                    "conflict",
                    "-",
                );
                return Err(conflict());
            }
        }
        (
            session.documents[index].path.clone(),
            session.documents[index].newline,
            session.documents[index].mtime,
        )
    };
    if autosave && current_path.is_none() {
        log_command(command, started, 0, request.rev, "skipped", "-");
        return Ok(SaveOutcome::Skipped {
            skipped: "untitled".to_string(),
        });
    }
    let target = if save_as || current_path.is_none() {
        let suggested = current_path
            .as_ref()
            .and_then(|path| path.file_name())
            .map(|name| name.to_string_lossy().into_owned())
            .unwrap_or_else(|| "未命名.md".to_string());
        pick_markdown(&app, "另存为", Some(suggested.as_str()))?
    } else {
        current_path.clone().unwrap_or_default()
    };
    if !save_as && disk_changed(&target, opened_mtime) && !confirm_overwrite(&app) {
        log_command(
            command,
            started,
            0,
            request.rev,
            "dialog_canceled",
            &file_label(Some(&target)),
        );
        return Err(canceled());
    }
    let mut session = state::lock(&state);
    let index = match document_index(&session, request.document_id) {
        Ok(index) => index,
        Err(_) => return Err(conflict()),
    };
    if session.documents[index]
        .check_rev(request.document_id, request.rev)
        .is_err()
    {
        log_command(
            command,
            started,
            0,
            request.rev,
            "conflict",
            &file_label(Some(&target)),
        );
        return Err(conflict());
    }
    let mut trial = session.jail.clone();
    let placed = match trial.locate_file(&target, save_as || current_path.is_none()) {
        Ok(path) => path,
        Err(JailError::Outside) | Err(JailError::NoRoot) => return Err(outside_jail()),
        Err(JailError::Io) => return Err(io_failed()),
    };
    let bytes = match write_note(&placed, &request.markdown_lf, newline) {
        Ok(bytes) => bytes,
        Err(_) => {
            log_command(
                command,
                started,
                0,
                request.rev,
                "io",
                &file_label(Some(&placed)),
            );
            return Err(io_failed());
        }
    };
    let mtime = fs::metadata(&placed).and_then(|meta| meta.modified()).ok();
    session.jail = trial;
    let index = match document_index(&session, request.document_id) {
        Ok(index) => index,
        Err(_) => return Err(conflict()),
    };
    session.documents[index].commit(placed.clone(), request.markdown_lf.clone(), mtime);
    rebind(&mut session);
    let shown = placed.to_string_lossy().into_owned();
    remember_recent(&mut session.settings, &shown, now_ms());
    let settings = session.settings.clone();
    let frozen = state
        .settings_frozen
        .load(std::sync::atomic::Ordering::SeqCst);
    let rev = session.documents[index].rev;
    let document_id = session.documents[index].id;
    let root = session
        .jail
        .root()
        .map(|path| path.to_string_lossy().into_owned())
        .unwrap_or_else(|| shown.clone());
    drop(session);
    let _ = persist_settings(&app, &settings, frozen);
    let _ = app.emit(
        "document://saved",
        SavedEvent {
            document_id,
            path: shown.clone(),
            rev,
            bytes,
        },
    );
    log_command(
        command,
        started,
        bytes,
        rev,
        "ok",
        &file_label(Some(Path::new(&shown))),
    );
    Ok(SaveOutcome::Saved {
        path: shown,
        rev,
        bytes,
        root,
    })
}

fn pick_markdown(
    app: &AppHandle,
    title: &str,
    file_name: Option<&str>,
) -> Result<PathBuf, CommandError> {
    let mut builder = app
        .dialog()
        .file()
        .add_filter("Markdown", &["md", "markdown"])
        .set_title(title);
    if let Some(file_name) = file_name {
        builder = builder.set_file_name(file_name);
    }
    let picked = if file_name.is_some() {
        builder.blocking_save_file()
    } else {
        builder.blocking_pick_file()
    };
    match picked {
        Some(path) => path.into_path().map_err(|_| io_failed()),
        None => Err(canceled()),
    }
}

fn confirm_overwrite(app: &AppHandle) -> bool {
    app.dialog()
        .message("磁盘上的文件已变化")
        .title("Luma")
        .kind(MessageDialogKind::Warning)
        .buttons(MessageDialogButtons::OkCancelCustom(
            "覆盖".into(),
            "取消".into(),
        ))
        .blocking_show()
}

fn disk_changed(path: &Path, opened: Option<SystemTime>) -> bool {
    let Some(opened) = opened else {
        return false;
    };
    if !path.exists() {
        return false;
    }
    fs::metadata(path).and_then(|meta| meta.modified()).ok() != Some(opened)
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|time| time.as_millis() as u64)
        .unwrap_or(0)
}
