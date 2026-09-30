//! Shared types that must not depend on the markdown parser or Tauri.
#![forbid(unsafe_code)]

mod count;
mod document;
mod folder;
mod jail;
mod newline;
mod settings;
mod url_class;

pub use count::{count_scalars, count_words};
pub use document::{
    decode_markdown, exceeds_open_limit, path_display, DecodeError, DocumentSession,
    DocumentSnapshot, RevError, MAX_OPEN_BYTES,
};
pub use folder::{list_folder, EntryKind, FolderEntry, FolderPage, FOLDER_ENTRY_LIMIT};
pub use jail::{JailError, PathJail};
pub use newline::{detect_newline, normalize_to_lf, restore_newlines, NewlineStyle};
pub use settings::{
    apply_patch, contains_secret_field, load_settings_value, mark_missing, parse_patch,
    remember_recent, GlassMode, LoadKind, MotionMode, PreviewFlags, RecentFile, Settings,
    SettingsError, SettingsPatch, Theme, ViewMode,
};
pub use url_class::{classify_image_destination, local_image_source, ImageDestination, LocalImage};
