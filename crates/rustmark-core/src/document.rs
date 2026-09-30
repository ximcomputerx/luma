use std::path::{Path, PathBuf};
use std::time::SystemTime;

use serde::Serialize;
use uuid::Uuid;

use crate::{normalize_to_lf, NewlineStyle};

pub const MAX_OPEN_BYTES: u64 = 8 * 1024 * 1024;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DecodeError {
    NotUtf8,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RevError {
    Conflict,
}

/// Strip a UTF-8 BOM if present. The BOM is not part of the editor buffer and is not written back.
pub fn decode_markdown(bytes: &[u8]) -> Result<(String, NewlineStyle), DecodeError> {
    let bytes = bytes.strip_prefix(&[0xEF, 0xBB, 0xBF]).unwrap_or(bytes);
    let text = std::str::from_utf8(bytes).map_err(|_| DecodeError::NotUtf8)?;
    Ok(normalize_to_lf(text))
}

pub fn exceeds_open_limit(len: u64) -> bool {
    len > MAX_OPEN_BYTES
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct DocumentSnapshot {
    pub document_id: Uuid,
    pub path: Option<String>,
    pub title: String,
    pub markdown_lf: String,
    pub newline: NewlineStyle,
    pub rev: u64,
    pub dirty: bool,
}

#[derive(Debug, Clone)]
pub struct DocumentSession {
    pub id: Uuid,
    pub path: Option<PathBuf>,
    pub title: String,
    pub newline: NewlineStyle,
    pub rev: u64,
    pub accepted_lf: String,
    pub mtime: Option<SystemTime>,
    pub dirty: bool,
}

impl DocumentSession {
    pub fn untitled() -> Self {
        Self {
            id: Uuid::new_v4(),
            path: None,
            title: "未命名".to_string(),
            newline: NewlineStyle::Lf,
            rev: 1,
            accepted_lf: String::new(),
            mtime: None,
            dirty: true,
        }
    }

    pub fn opened(
        path: PathBuf,
        markdown_lf: String,
        newline: NewlineStyle,
        mtime: Option<SystemTime>,
    ) -> Self {
        let title = path
            .file_name()
            .map(|name| name.to_string_lossy().into_owned())
            .unwrap_or_else(|| "未命名".to_string());
        Self {
            id: Uuid::new_v4(),
            path: Some(path),
            title,
            newline,
            rev: 1,
            accepted_lf: markdown_lf,
            mtime,
            dirty: false,
        }
    }

    pub fn snapshot(&self) -> DocumentSnapshot {
        DocumentSnapshot {
            document_id: self.id,
            path: self
                .path
                .as_ref()
                .map(|path| path.to_string_lossy().into_owned()),
            title: self.title.clone(),
            markdown_lf: self.accepted_lf.clone(),
            newline: self.newline,
            rev: self.rev,
            dirty: self.dirty,
        }
    }

    pub fn check_rev(&self, document_id: Uuid, rev: u64) -> Result<(), RevError> {
        if document_id != self.id || rev != self.rev {
            Err(RevError::Conflict)
        } else {
            Ok(())
        }
    }

    pub fn commit(&mut self, path: PathBuf, markdown_lf: String, mtime: Option<SystemTime>) {
        self.title = path
            .file_name()
            .map(|name| name.to_string_lossy().into_owned())
            .unwrap_or_else(|| "未命名".to_string());
        self.path = Some(path);
        self.accepted_lf = markdown_lf;
        self.mtime = mtime;
        self.rev = self.rev.saturating_add(1);
        self.dirty = false;
    }
}

pub fn path_display(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bom_is_stripped_and_first_newline_wins() {
        let mut bytes = vec![0xEF, 0xBB, 0xBF];
        bytes.extend_from_slice(b"a\r\nb\nc");
        let (text, style) = decode_markdown(&bytes).unwrap();
        assert_eq!(text, "a\nb\nc");
        assert_eq!(style, NewlineStyle::Crlf);
        assert!(!text.starts_with('\u{feff}'));
    }

    #[test]
    fn rejects_non_utf8() {
        assert!(matches!(
            decode_markdown(&[0xFF, 0xFE]),
            Err(DecodeError::NotUtf8)
        ));
    }

    #[test]
    fn limit_is_exclusive_of_eight_mebibytes() {
        assert!(!exceeds_open_limit(MAX_OPEN_BYTES));
        assert!(exceeds_open_limit(MAX_OPEN_BYTES + 1));
    }

    #[test]
    fn mismatched_rev_does_not_advance() {
        let mut session = DocumentSession::untitled();
        assert!(session.check_rev(session.id, 2).is_err());
        assert_eq!(session.rev, 1);
        session.check_rev(session.id, 1).unwrap();
        session.commit(PathBuf::from("note.md"), "x".to_string(), None);
        assert_eq!(session.rev, 2);
        assert!(!session.dirty);
        assert!(session.check_rev(session.id, 1).is_err());
    }

    #[test]
    fn untitled_starts_clean_of_a_path_and_uses_lf() {
        let session = DocumentSession::untitled();
        assert!(session.path.is_none());
        assert_eq!(session.newline, NewlineStyle::Lf);
        assert!(session.dirty);
        assert_eq!(session.rev, 1);
        assert_eq!(session.title, "未命名");
    }
}
