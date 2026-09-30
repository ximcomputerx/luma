mod atomic;
mod clock;
mod commands;
mod error;
mod fonts;
mod glass;
mod images;
mod io_docs;
mod logging;
mod print_pdf;
mod settings_store;
mod state;

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;

use rustmark_core::DocumentSession;
use tauri::{Emitter, Manager, WindowEvent};

use crate::commands::{
    close_decision, diagnostics_export, document_autosave, document_close, document_focus,
    document_new, document_open, document_save, export_html, export_pdf, folder_list, folder_open,
    fonts_list, image_paste, pdf_preview, preview_render, settings_get, settings_set,
};
use crate::state::{AppState, Session};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let log_dir = logging::init(app.handle());
            let loaded = settings_store::load_settings(app.handle());
            let frozen = loaded.frozen;
            let settings = loaded.settings.clone();
            let document = DocumentSession::untitled();
            let active = document.id;
            app.manage(AppState {
                session: Mutex::new(Session {
                    jail: rustmark_core::PathJail::default(),
                    settings: loaded.settings,
                    documents: vec![document],
                    active,
                }),
                allow_close: AtomicBool::new(false),
                settings_frozen: AtomicBool::new(frozen),
                log_dir,
            });
            if let Some(window) = app.get_webview_window("main") {
                glass::apply_glass(&window, &settings);
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                let state = window.state::<AppState>();
                if !state.allow_close.load(Ordering::SeqCst) {
                    api.prevent_close();
                    let _ = window.emit("app://close-requested", ());
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            preview_render,
            document_new,
            document_open,
            document_save,
            document_autosave,
            document_close,
            document_focus,
            folder_open,
            folder_list,
            settings_get,
            settings_set,
            close_decision,
            diagnostics_export,
            image_paste,
            export_html,
            export_pdf,
            pdf_preview,
            fonts_list
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
