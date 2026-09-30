use std::time::Instant;

use serde::{Deserialize, Serialize};
use tauri::State;
use uuid::Uuid;

use crate::error::{command_error, conflict, io_failed, outside_jail, CommandError};
use crate::images::{save_pasted_image, ImageFailure};
use crate::logging::{file_label, log_command};
use crate::state::{self, AppState};

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ImagePasteRequest {
    document_id: Uuid,
    bytes: Vec<u8>,
}

#[derive(Serialize)]
pub struct ImagePasteResponse {
    pub relative_path: String,
}

#[tauri::command]
pub fn image_paste(
    state: State<'_, AppState>,
    request: ImagePasteRequest,
) -> Result<ImagePasteResponse, CommandError> {
    let started = Instant::now();
    let bytes = request.bytes.len() as u64;
    let session = state::lock(&state);
    let document = session
        .documents
        .iter()
        .find(|document| document.id == request.document_id)
        .ok_or_else(conflict)?;
    let Some(note) = document.path.clone() else {
        log_command("image_paste", started, bytes, document.rev, "io", "-");
        return Err(command_error("io", "先保存文档，再粘贴图片。"));
    };
    let relative = match save_pasted_image(&session.jail, &note, &request.bytes) {
        Ok(relative) => relative,
        Err(ImageFailure::TooLarge) => {
            log_command(
                "image_paste",
                started,
                bytes,
                document.rev,
                "too_large",
                &file_label(Some(&note)),
            );
            return Err(too_large_image());
        }
        Err(ImageFailure::Unsupported) => {
            log_command(
                "image_paste",
                started,
                bytes,
                document.rev,
                "io",
                &file_label(Some(&note)),
            );
            return Err(command_error("io", "只能粘贴 PNG、JPEG、GIF 或 WebP。"));
        }
        Err(ImageFailure::Outside) => {
            log_command(
                "image_paste",
                started,
                bytes,
                document.rev,
                "outside_jail",
                &file_label(Some(&note)),
            );
            return Err(outside_jail());
        }
        Err(ImageFailure::Io) => {
            log_command(
                "image_paste",
                started,
                bytes,
                document.rev,
                "io",
                &file_label(Some(&note)),
            );
            return Err(io_failed());
        }
    };
    log_command(
        "image_paste",
        started,
        bytes,
        document.rev,
        "ok",
        &file_label(Some(&note)),
    );
    Ok(ImagePasteResponse {
        relative_path: relative,
    })
}

fn too_large_image() -> CommandError {
    command_error("too_large", "图片超过 8 MB。")
}
