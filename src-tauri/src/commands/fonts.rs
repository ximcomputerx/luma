#[tauri::command]
pub fn fonts_list() -> Vec<String> {
    crate::fonts::system_font_families()
}
