use std::fs;
use std::path::{Path, PathBuf};
use std::time::Instant;

use markdown_render::{
    export_html as render_export_html, export_pdf_document, PdfMeta, PdfProfile,
};
use rustmark_core::{classify_image_destination, ImageDestination};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;
use uuid::Uuid;

use crate::clock::local_stamp;
use crate::error::{canceled, command_error, conflict, io_failed, too_large, CommandError};
use crate::images::inline_local_image;
use crate::logging::{file_label, log_command};
use crate::print_pdf::{print_html_to_pdf, PrintMetrics};
use crate::state::{self, AppState};

const MAX_EXPORT_BYTES: usize = 8 * 1024 * 1024;

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ExportRequest {
    document_id: Uuid,
    markdown_lf: String,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PdfExportRequest {
    document_id: Uuid,
    markdown_lf: String,
    profile: PdfProfile,
}

#[derive(Serialize)]
pub struct ExportResponse {
    pub path: String,
}

#[derive(Serialize)]
pub struct PdfPreviewResponse {
    pub html: String,
}

const FIXTURE_IMAGE: &str = "luma-fixture.svg";
const FIXTURE_SRC: &str = "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNDAiIGhlaWdodD0iMTIwIj48cmVjdCB3aWR0aD0iMjQwIiBoZWlnaHQ9IjEyMCIgZmlsbD0iI2U3ZTJkOCIvPjwvc3ZnPg==";
const PDF_SETTINGS: &str = "导出设置无效。";

struct ExportContext {
    title: String,
    parent: Option<PathBuf>,
    suggested: String,
    remote: bool,
    note_dir: Option<PathBuf>,
    jail: rustmark_core::PathJail,
}

#[tauri::command]
pub async fn export_html(
    app: AppHandle,
    state: State<'_, AppState>,
    request: ExportRequest,
) -> Result<ExportResponse, CommandError> {
    write_export(&app, &state, request, "export_html", "html", "HTML").await
}

#[tauri::command]
pub async fn export_pdf(
    app: AppHandle,
    state: State<'_, AppState>,
    request: PdfExportRequest,
) -> Result<ExportResponse, CommandError> {
    let started = Instant::now();
    let bytes = request.markdown_lf.len() as u64;
    if request.markdown_lf.len() > MAX_EXPORT_BYTES {
        log_command("export_pdf", started, bytes, 0, "too_large", "-");
        return Err(too_large());
    }
    let context = match export_context(&state, request.document_id) {
        Ok(context) => context,
        Err(error) => {
            log_command("export_pdf", started, bytes, 0, &error.code, "-");
            return Err(error);
        }
    };
    let path = match pick_export(&app, "导出 PDF", "pdf", &context) {
        Ok(path) => path,
        Err(error) => {
            log_command("export_pdf", started, bytes, 0, &error.code, "-");
            return Err(error);
        }
    };
    let filename = path
        .file_stem()
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_else(|| context.suggested.clone());
    let document = match compose_pdf(&request.markdown_lf, &context, &filename, &request.profile) {
        Ok(document) => document,
        Err(error) => {
            log_command(
                "export_pdf",
                started,
                bytes,
                0,
                &error.code,
                &file_label(Some(&path)),
            );
            return Err(error);
        }
    };
    let metrics = metrics_of(&document.page);
    if let Err(error) = print_html_to_pdf(&app, &document.html, &path, metrics).await {
        log_command(
            "export_pdf",
            started,
            bytes,
            0,
            &error.code,
            &file_label(Some(&path)),
        );
        return Err(error);
    }
    log_command(
        "export_pdf",
        started,
        bytes,
        0,
        "ok",
        &file_label(Some(&path)),
    );
    Ok(ExportResponse {
        path: path.to_string_lossy().into_owned(),
    })
}

#[tauri::command]
pub fn pdf_preview(
    state: State<'_, AppState>,
    request: PdfExportRequest,
) -> Result<PdfPreviewResponse, CommandError> {
    let started = Instant::now();
    let bytes = request.markdown_lf.len() as u64;
    if request.markdown_lf.len() > MAX_EXPORT_BYTES {
        log_command("pdf_preview", started, bytes, 0, "too_large", "-");
        return Err(too_large());
    }
    let context = match export_context(&state, request.document_id) {
        Ok(context) => context,
        Err(error) => {
            log_command("pdf_preview", started, bytes, 0, &error.code, "-");
            return Err(error);
        }
    };
    let filename = context.suggested.clone();
    let document = match compose_pdf(&request.markdown_lf, &context, &filename, &request.profile) {
        Ok(document) => document,
        Err(error) => {
            log_command("pdf_preview", started, bytes, 0, &error.code, "-");
            return Err(error);
        }
    };
    log_command("pdf_preview", started, bytes, 0, "ok", "-");
    Ok(PdfPreviewResponse {
        html: document.html,
    })
}

async fn write_export(
    app: &AppHandle,
    state: &State<'_, AppState>,
    request: ExportRequest,
    command: &str,
    extension: &str,
    label: &str,
) -> Result<ExportResponse, CommandError> {
    let started = Instant::now();
    if request.markdown_lf.len() > MAX_EXPORT_BYTES {
        log_command(
            command,
            started,
            request.markdown_lf.len() as u64,
            0,
            "too_large",
            "-",
        );
        return Err(too_large());
    }
    let context = export_context(state, request.document_id)?;
    let bytes = request.markdown_lf.len() as u64;
    let html = render_export_html(&request.markdown_lf, &context.title);
    let path = match pick_export(app, &format!("导出 {label}"), extension, &context) {
        Ok(path) => path,
        Err(error) => {
            log_command(command, started, bytes, 0, &error.code, "-");
            return Err(error);
        }
    };
    if fs::write(&path, html.as_bytes()).is_err() {
        log_command(command, started, bytes, 0, "io", &file_label(Some(&path)));
        return Err(io_failed());
    }
    log_command(command, started, bytes, 0, "ok", &file_label(Some(&path)));
    Ok(ExportResponse {
        path: path.to_string_lossy().into_owned(),
    })
}

fn compose_pdf(
    markdown: &str,
    context: &ExportContext,
    filename: &str,
    profile: &PdfProfile,
) -> Result<markdown_render::PdfDocument, CommandError> {
    let created = local_stamp();
    let jail = context.jail.clone();
    let note_dir = context.note_dir.clone();
    let remote = context.remote;
    export_pdf_document(
        markdown,
        PdfMeta {
            title: &context.title,
            filename,
            created: &created,
        },
        profile,
        remote,
        |dest| map_pdf_image(&jail, note_dir.as_deref(), remote, dest),
    )
    .map_err(|_| command_error("invalid_settings", PDF_SETTINGS))
}

fn map_pdf_image(
    jail: &rustmark_core::PathJail,
    note_dir: Option<&Path>,
    remote: bool,
    dest: &str,
) -> Option<String> {
    if dest == FIXTURE_IMAGE {
        return Some(FIXTURE_SRC.to_string());
    }
    if let Some(dir) = note_dir {
        if let Some(data) = inline_local_image(jail, dir, dest) {
            return Some(data);
        }
    }
    if remote {
        if let ImageDestination::AllowedHttps(url) = classify_image_destination(dest) {
            return Some(url);
        }
    }
    None
}

fn metrics_of(page: &markdown_render::PdfPage) -> PrintMetrics {
    PrintMetrics {
        width_px: page.width_px,
        height_px: page.height_px,
        width_in: page.width_in,
        height_in: page.height_in,
        margin_in: page.margin_in,
        landscape: page.landscape,
    }
}

fn export_context(
    state: &State<'_, AppState>,
    document_id: Uuid,
) -> Result<ExportContext, CommandError> {
    let session = state::lock(state);
    let document = session
        .documents
        .iter()
        .find(|document| document.id == document_id)
        .ok_or_else(conflict)?;
    let parent = document
        .path
        .as_ref()
        .and_then(|path| path.parent().map(|parent| parent.to_path_buf()));
    let stem = document
        .path
        .as_ref()
        .and_then(|path| path.file_stem())
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_else(|| "未命名".to_string());
    Ok(ExportContext {
        title: document.title.clone(),
        parent: parent.clone(),
        suggested: stem,
        remote: session.settings.preview.remote_images,
        note_dir: parent,
        jail: session.jail.clone(),
    })
}

fn pick_export(
    app: &AppHandle,
    title: &str,
    extension: &str,
    context: &ExportContext,
) -> Result<PathBuf, CommandError> {
    let mut builder = app
        .dialog()
        .file()
        .add_filter(title, &[extension])
        .set_title(title)
        .set_file_name(&format!("{}.{}", context.suggested, extension));
    if let Some(parent) = &context.parent {
        builder = builder.set_directory(parent);
    }
    match builder.blocking_save_file() {
        Some(path) => path.into_path().map_err(|_| io_failed()),
        None => Err(canceled()),
    }
}
