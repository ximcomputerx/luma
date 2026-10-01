mod association;
mod atomic;
mod clock;
mod commands;
mod error;
mod fonts;
mod glass;
mod images;
mod io_docs;
mod logging;
mod open_request;
mod print_pdf;
mod settings_store;
mod state;
mod update;

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;

use tauri::path::BaseDirectory;
use tauri::{Emitter, Manager, WindowEvent};
use uuid::Uuid;

use crate::commands::{
    association_decide, association_status, close_decision, diagnostics_export, document_autosave,
    document_close, document_focus, document_new, document_open, document_save, export_html,
    export_pdf, flush_open_queue, folder_list, folder_open, folder_open_path, fonts_list,
    image_paste, pdf_preview, preview_render, settings_get, settings_set, update_arm, update_check,
    update_download, update_install, update_later, update_policy, update_state,
};
use crate::state::{AppState, Session};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, args, cwd| {
            open_request::enqueue_instance_args(&args, &cwd);
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
            let _ = app.emit("document://queue", ());
        }))
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            open_request::enqueue_process_args();
            let log_dir = logging::init(app.handle());
            let loaded = settings_store::load_settings(app.handle());
            let frozen = loaded.frozen;
            let settings = loaded.settings.clone();
            let update_path = app
                .path()
                .resolve("update.json", BaseDirectory::AppData)
                .ok();
            app.manage(commands::UpdateRuntime::open(
                app.package_info().version.to_string(),
                update_path,
            ));
            app.manage(AppState {
                session: Mutex::new(Session {
                    jail: rustmark_core::PathJail::default(),
                    settings: loaded.settings,
                    documents: Vec::new(),
                    active: Uuid::nil(),
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
            flush_open_queue,
            document_save,
            document_autosave,
            document_close,
            document_focus,
            folder_open,
            folder_open_path,
            folder_list,
            settings_get,
            settings_set,
            close_decision,
            diagnostics_export,
            image_paste,
            export_html,
            export_pdf,
            pdf_preview,
            fonts_list,
            association_status,
            association_decide,
            update_state,
            update_arm,
            update_check,
            update_download,
            update_install,
            update_later,
            update_policy
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
