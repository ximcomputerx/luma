use std::fs;
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

use rustmark_core::{local_image_source, JailError, LocalImage, PathJail};

pub const MAX_PASTE_BYTES: usize = 8 * 1024 * 1024;
pub const MAX_INLINE_BYTES: usize = 1_500_000;

#[derive(Debug)]
pub enum ImageFailure {
    TooLarge,
    Unsupported,
    Outside,
    Io,
}

pub fn save_pasted_image(
    jail: &PathJail,
    note: &Path,
    bytes: &[u8],
) -> Result<String, ImageFailure> {
    if bytes.len() > MAX_PASTE_BYTES {
        return Err(ImageFailure::TooLarge);
    }
    let (ext, _) = sniff(bytes).ok_or(ImageFailure::Unsupported)?;
    let parent = note
        .parent()
        .filter(|path| !path.as_os_str().is_empty())
        .ok_or(ImageFailure::Io)?;
    let parent = jail.admit(parent).map_err(map_jail)?;
    let assets = parent.join("assets");
    fs::create_dir_all(&assets).map_err(|_| ImageFailure::Io)?;
    let _ = jail.admit(&assets).map_err(map_jail)?;
    let name = unique_name(&assets, ext)?;
    let placed = jail.admit_new_file(&assets.join(&name)).map_err(map_jail)?;
    crate::atomic::atomic_write(&placed, bytes).map_err(|_| ImageFailure::Io)?;
    Ok(format!("assets/{name}"))
}

pub fn inline_local_image(jail: &PathJail, note_dir: &Path, dest: &str) -> Option<String> {
    let path = match local_image_source(dest)? {
        LocalImage::Relative(relative) => note_dir.join(relative),
        LocalImage::File(path) => path,
    };
    let admitted = jail.admit(&path).ok()?;
    let bytes = fs::read(&admitted).ok()?;
    if bytes.is_empty() || bytes.len() > MAX_INLINE_BYTES {
        return None;
    }
    let (_, mime) = sniff(&bytes)?;
    Some(format!("data:{mime};base64,{}", base64_encode(&bytes)))
}

fn map_jail(error: JailError) -> ImageFailure {
    match error {
        JailError::Outside | JailError::NoRoot => ImageFailure::Outside,
        JailError::Io => ImageFailure::Io,
    }
}

fn unique_name(dir: &Path, ext: &str) -> Result<String, ImageFailure> {
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|time| time.as_millis())
        .unwrap_or(0);
    for index in 0..1000 {
        let name = if index == 0 {
            format!("paste-{millis}.{ext}")
        } else {
            format!("paste-{millis}-{index}.{ext}")
        };
        if !dir.join(&name).exists() {
            return Ok(name);
        }
    }
    Err(ImageFailure::Io)
}

fn sniff(bytes: &[u8]) -> Option<(&'static str, &'static str)> {
    if bytes.starts_with(&[0x89, b'P', b'N', b'G', b'\r', b'\n', 0x1A, b'\n']) {
        return Some(("png", "image/png"));
    }
    if bytes.starts_with(&[0xFF, 0xD8, 0xFF]) {
        return Some(("jpg", "image/jpeg"));
    }
    if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") {
        return Some(("gif", "image/gif"));
    }
    if bytes.len() >= 12 && &bytes[0..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
        return Some(("webp", "image/webp"));
    }
    None
}

fn base64_encode(bytes: &[u8]) -> String {
    const TABLE: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity(bytes.len().div_ceil(3) * 4);
    let mut index = 0;
    while index + 3 <= bytes.len() {
        let value = ((bytes[index] as u32) << 16)
            | ((bytes[index + 1] as u32) << 8)
            | bytes[index + 2] as u32;
        out.push(TABLE[((value >> 18) & 63) as usize] as char);
        out.push(TABLE[((value >> 12) & 63) as usize] as char);
        out.push(TABLE[((value >> 6) & 63) as usize] as char);
        out.push(TABLE[(value & 63) as usize] as char);
        index += 3;
    }
    if index < bytes.len() {
        let first = bytes[index] as u32;
        let second = if index + 1 < bytes.len() {
            bytes[index + 1] as u32
        } else {
            0
        };
        let value = (first << 16) | (second << 8);
        out.push(TABLE[((value >> 18) & 63) as usize] as char);
        out.push(TABLE[((value >> 12) & 63) as usize] as char);
        if index + 1 < bytes.len() {
            out.push(TABLE[((value >> 6) & 63) as usize] as char);
            out.push('=');
        } else {
            out.push('=');
            out.push('=');
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn scratch() -> std::path::PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let dir = std::env::temp_dir().join(format!("rustmark-image-{nanos}"));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn paste_writes_a_sibling_asset_and_preview_inlines_it() {
        let root = scratch();
        let notes = root.join("notes");
        fs::create_dir_all(&notes).unwrap();
        let note = notes.join("a.md");
        fs::write(&note, "x").unwrap();
        let mut jail = PathJail::default();
        jail.open_document(&note).unwrap();
        let png: &[u8] = &[
            0x89, b'P', b'N', b'G', b'\r', b'\n', 0x1A, b'\n', 0, 0, 0, 0,
        ];
        let relative = save_pasted_image(&jail, &note, png).unwrap();
        assert!(relative.starts_with("assets/paste-"));
        assert!(relative.ends_with(".png"));
        let inlined = inline_local_image(&jail, notes.as_path(), &relative).unwrap();
        assert!(inlined.starts_with("data:image/png;base64,"));
        assert!(inline_local_image(&jail, notes.as_path(), "../outside.png").is_none());
        assert!(save_pasted_image(&jail, &note, b"<svg></svg>").is_err());
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn base64_pads() {
        assert_eq!(base64_encode(b"Man"), "TWFu");
        assert_eq!(base64_encode(b"Ma"), "TWE=");
        assert_eq!(base64_encode(b"M"), "TQ==");
    }
}
