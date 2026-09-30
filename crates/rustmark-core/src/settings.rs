use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

/// Preview policy owned by Rust. The webview cannot turn these on by itself.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PreviewFlags {
    #[serde(default = "default_true")]
    pub math: bool,
    #[serde(default = "default_true")]
    pub mermaid: bool,
    #[serde(default)]
    pub remote_images: bool,
}

impl Default for PreviewFlags {
    fn default() -> Self {
        Self {
            math: true,
            mermaid: true,
            remote_images: false,
        }
    }
}

fn default_true() -> bool {
    true
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Theme {
    System,
    Light,
    Dark,
}

impl Default for Theme {
    fn default() -> Self {
        Self::System
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ViewMode {
    Split,
    Source,
    Preview,
}

impl Default for ViewMode {
    fn default() -> Self {
        Self::Split
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum GlassMode {
    Auto,
    Off,
}

impl Default for GlassMode {
    fn default() -> Self {
        Self::Auto
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MotionMode {
    System,
    On,
    Off,
}

impl Default for MotionMode {
    fn default() -> Self {
        Self::System
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct RecentFile {
    pub path: String,
    pub opened_at_ms: u64,
    #[serde(default)]
    pub missing: bool,
}

/// Schema v1. Unknown keys are removed before this struct is parsed.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Settings {
    #[serde(default)]
    pub schema_version: u32,
    #[serde(default)]
    pub theme: Theme,
    #[serde(default)]
    pub view_mode: ViewMode,
    #[serde(default = "default_font")]
    pub prose_font_size_px: u8,
    #[serde(default = "default_true")]
    pub autosave_enabled: bool,
    #[serde(default = "default_interval")]
    pub autosave_interval_ms: u32,
    #[serde(default)]
    pub glass: GlassMode,
    #[serde(default)]
    pub reduced_motion: MotionMode,
    #[serde(default)]
    pub recent_files: Vec<RecentFile>,
    #[serde(default)]
    pub preview: PreviewFlags,
}

fn default_font() -> u8 {
    16
}

fn default_interval() -> u32 {
    1500
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            schema_version: 1,
            theme: Theme::System,
            view_mode: ViewMode::Split,
            prose_font_size_px: 16,
            autosave_enabled: true,
            autosave_interval_ms: 1500,
            glass: GlassMode::Auto,
            reduced_motion: MotionMode::System,
            recent_files: Vec::new(),
            preview: PreviewFlags::default(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SettingsError {
    Invalid,
    Secret,
}

/// Closed patch set. `api_key` and `token` are not variants.
#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(tag = "field", rename_all = "snake_case", deny_unknown_fields)]
pub enum SettingsPatch {
    Theme { value: Theme },
    ViewMode { value: ViewMode },
    ProseFontSizePx { value: u8 },
    AutosaveEnabled { value: bool },
    AutosaveIntervalMs { value: u32 },
    Glass { value: GlassMode },
    ReducedMotion { value: MotionMode },
    PreviewMath { value: bool },
    PreviewMermaid { value: bool },
    PreviewRemoteImages { value: bool },
    ForgetRecent { path: String },
}

#[derive(Debug)]
pub enum LoadKind {
    Ready {
        settings: Settings,
        dropped: Vec<String>,
    },
    Newer {
        version: u64,
    },
    Corrupt,
}

const TOP_KEYS: &[&str] = &[
    "schema_version",
    "theme",
    "view_mode",
    "prose_font_size_px",
    "autosave_enabled",
    "autosave_interval_ms",
    "glass",
    "reduced_motion",
    "recent_files",
    "preview",
];

const PREVIEW_KEYS: &[&str] = &["math", "mermaid", "remote_images"];
const RECENT_KEYS: &[&str] = &["path", "opened_at_ms", "missing"];

pub fn contains_secret_field(value: &Value) -> bool {
    match value {
        Value::Object(map) => map.iter().any(|(key, child)| {
            let lower = key.to_ascii_lowercase();
            lower.contains("api_key")
                || lower.contains("apikey")
                || lower == "token"
                || lower.contains("secret")
                || contains_secret_field(child)
        }),
        Value::Array(items) => items.iter().any(contains_secret_field),
        _ => false,
    }
}

pub fn load_settings_value(value: &Value) -> LoadKind {
    let Some(object) = value.as_object() else {
        return LoadKind::Corrupt;
    };
    let version = match object.get("schema_version") {
        None => 0,
        Some(Value::Number(number)) => number.as_u64().unwrap_or(u64::MAX),
        Some(_) => return LoadKind::Corrupt,
    };
    if version > 1 {
        return LoadKind::Newer { version };
    }
    let mut dropped = Vec::new();
    let mut cleaned = Map::new();
    for (key, child) in object {
        if !TOP_KEYS.contains(&key.as_str()) {
            dropped.push(key.clone());
            continue;
        }
        cleaned.insert(key.clone(), child.clone());
    }
    if let Some(Value::Object(preview)) = cleaned.get_mut("preview") {
        let mut keep = Map::new();
        for (key, child) in preview.iter() {
            if PREVIEW_KEYS.contains(&key.as_str()) {
                keep.insert(key.clone(), child.clone());
            } else {
                dropped.push(format!("preview.{key}"));
            }
        }
        *preview = keep;
    }
    if let Some(Value::Array(items)) = cleaned.get_mut("recent_files") {
        for item in items.iter_mut() {
            let Some(entry) = item.as_object() else {
                continue;
            };
            let mut keep = Map::new();
            for (key, child) in entry {
                if RECENT_KEYS.contains(&key.as_str()) {
                    keep.insert(key.clone(), child.clone());
                } else {
                    dropped.push(format!("recent_files.{key}"));
                }
            }
            *item = Value::Object(keep);
        }
    }
    let mut settings: Settings = match serde_json::from_value(Value::Object(cleaned)) {
        Ok(settings) => settings,
        Err(_) => return LoadKind::Corrupt,
    };
    repair(&mut settings, &mut dropped);
    settings.schema_version = 1;
    LoadKind::Ready { settings, dropped }
}

fn repair(settings: &mut Settings, dropped: &mut Vec<String>) {
    if !(14..=22).contains(&settings.prose_font_size_px) {
        settings.prose_font_size_px = 16;
        dropped.push("prose_font_size_px".to_string());
    }
    if !(500..=10_000).contains(&settings.autosave_interval_ms) {
        settings.autosave_interval_ms = 1500;
        dropped.push("autosave_interval_ms".to_string());
    }
    if settings.recent_files.len() > 20 {
        settings.recent_files.truncate(20);
        dropped.push("recent_files".to_string());
    }
}

pub fn parse_patch(value: &Value) -> Result<SettingsPatch, SettingsError> {
    if contains_secret_field(value) {
        return Err(SettingsError::Secret);
    }
    serde_json::from_value(value.clone()).map_err(|_| SettingsError::Invalid)
}

pub fn apply_patch(settings: &mut Settings, patch: SettingsPatch) -> Result<(), SettingsError> {
    match patch {
        SettingsPatch::Theme { value } => settings.theme = value,
        SettingsPatch::ViewMode { value } => settings.view_mode = value,
        SettingsPatch::ProseFontSizePx { value } => {
            if !(14..=22).contains(&value) {
                return Err(SettingsError::Invalid);
            }
            settings.prose_font_size_px = value;
        }
        SettingsPatch::AutosaveEnabled { value } => settings.autosave_enabled = value,
        SettingsPatch::AutosaveIntervalMs { value } => {
            if !(500..=10_000).contains(&value) {
                return Err(SettingsError::Invalid);
            }
            settings.autosave_interval_ms = value;
        }
        SettingsPatch::Glass { value } => settings.glass = value,
        SettingsPatch::ReducedMotion { value } => settings.reduced_motion = value,
        SettingsPatch::PreviewMath { value } => settings.preview.math = value,
        SettingsPatch::PreviewMermaid { value } => settings.preview.mermaid = value,
        SettingsPatch::PreviewRemoteImages { value } => settings.preview.remote_images = value,
        SettingsPatch::ForgetRecent { path } => {
            settings.recent_files.retain(|item| item.path != path);
        }
    }
    Ok(())
}

pub fn remember_recent(settings: &mut Settings, path: &str, now_ms: u64) {
    settings.recent_files.retain(|item| item.path != path);
    settings.recent_files.insert(
        0,
        RecentFile {
            path: path.to_string(),
            opened_at_ms: now_ms,
            missing: false,
        },
    );
    settings.recent_files.truncate(20);
}

pub fn mark_missing(settings: &mut Settings) {
    for item in &mut settings.recent_files {
        item.missing = !std::path::Path::new(&item.path).exists();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn missing_version_migrates_and_drops_unknown_names() {
        let loaded = load_settings_value(&json!({
            "api_key": "nope",
            "preview": { "math": false, "token": "x" }
        }));
        match loaded {
            LoadKind::Ready { settings, dropped } => {
                assert_eq!(settings.schema_version, 1);
                assert!(!settings.preview.math);
                assert!(!settings.preview.remote_images);
                assert!(dropped.iter().any(|name| name == "api_key"));
                assert!(dropped.iter().any(|name| name == "preview.token"));
            }
            _ => panic!("expected ready"),
        }
    }

    #[test]
    fn newer_schema_is_not_rewritten_as_ready() {
        match load_settings_value(&json!({"schema_version": 2, "theme": "dark"})) {
            LoadKind::Newer { version } => assert_eq!(version, 2),
            _ => panic!("expected newer"),
        }
    }

    #[test]
    fn secret_patch_is_rejected() {
        let value = json!({"field": "theme", "value": "dark", "api_key": "sk"});
        assert!(matches!(parse_patch(&value), Err(SettingsError::Secret)));
    }

    #[test]
    fn font_and_interval_bounds() {
        let mut settings = Settings::default();
        assert!(apply_patch(&mut settings, SettingsPatch::ProseFontSizePx { value: 13 }).is_err());
        assert!(apply_patch(
            &mut settings,
            SettingsPatch::AutosaveIntervalMs { value: 200 }
        )
        .is_err());
        apply_patch(&mut settings, SettingsPatch::ProseFontSizePx { value: 18 }).unwrap();
        assert_eq!(settings.prose_font_size_px, 18);
    }

    #[test]
    fn recent_files_dedupe_and_cap() {
        let mut settings = Settings::default();
        for index in 0..25 {
            remember_recent(&mut settings, &format!("C:\\notes\\{index}.md"), index);
        }
        remember_recent(&mut settings, "C:\\notes\\3.md", 100);
        assert_eq!(settings.recent_files.len(), 20);
        assert_eq!(settings.recent_files[0].path, "C:\\notes\\3.md");
        assert_eq!(
            settings
                .recent_files
                .iter()
                .filter(|item| item.path == "C:\\notes\\3.md")
                .count(),
            1
        );
    }
}
