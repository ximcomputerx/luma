fn main() {
    let attributes =
        tauri_build::Attributes::new().app_manifest(tauri_build::AppManifest::new().commands(&[
            "preview_render",
            "document_new",
            "document_open",
            "document_save",
            "document_autosave",
            "folder_open",
            "folder_list",
            "settings_get",
            "settings_set",
            "close_decision",
            "diagnostics_export",
            "document_close",
            "document_focus",
            "image_paste",
            "export_html",
            "export_pdf",
            "pdf_preview",
            "fonts_list",
        ]));
    tauri_build::try_build(attributes).expect("failed to run tauri-build");
}
