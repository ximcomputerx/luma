use std::time::Instant;

use markdown_render::{render_preview_resolved, PreviewPayload, PreviewRequest};
use tauri::State;
use uuid::Uuid;

use crate::error::CommandError;
use crate::images::inline_local_image;
use crate::logging::log_command;
use crate::state::{self, AppState};

#[tauri::command]
pub fn preview_render(
    state: State<'_, AppState>,
    request: PreviewRequest,
    document_id: Option<Uuid>,
) -> Result<PreviewPayload, CommandError> {
    let started = Instant::now();
    let bytes = request.markdown_lf.len() as u64;
    let render_gen = request.render_gen;
    let (flags, note_dir, jail) = {
        let session = state::lock(&state);
        let id = document_id.unwrap_or(session.active);
        let note_dir = session
            .documents
            .iter()
            .find(|document| document.id == id)
            .and_then(|document| document.path.clone())
            .and_then(|path| path.parent().map(|parent| parent.to_path_buf()));
        (
            session.settings.preview.clone(),
            note_dir,
            session.jail.clone(),
        )
    };
    let mut resolve_local = |dest: &str| {
        let dir = note_dir.as_deref()?;
        inline_local_image(&jail, dir, dest)
    };
    let result = render_preview_resolved(&request, &flags, &mut resolve_local).map_err(|error| {
        CommandError {
            code: error.code.to_string(),
            message: error.message.to_string(),
        }
    });
    let code = match &result {
        Ok(_) => "ok".to_string(),
        Err(error) => error.code.clone(),
    };
    log_command("preview_render", started, bytes, render_gen, &code, "-");
    result
}
