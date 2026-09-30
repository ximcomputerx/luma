use std::fs;
use std::io;
use std::path::Path;
use std::time::SystemTime;

use rustmark_core::{
    decode_markdown, exceeds_open_limit, restore_newlines, DecodeError, NewlineStyle,
    MAX_OPEN_BYTES,
};

use crate::atomic::atomic_write;

#[derive(Debug, PartialEq, Eq)]
pub enum ReadFailure {
    Missing,
    NotUtf8,
    TooLarge,
    Io,
}

pub struct OpenedNote {
    pub markdown_lf: String,
    pub newline: NewlineStyle,
    pub mtime: SystemTime,
}

pub fn read_note(path: &Path) -> Result<OpenedNote, ReadFailure> {
    let meta = fs::metadata(path).map_err(|error| {
        if error.kind() == io::ErrorKind::NotFound {
            ReadFailure::Missing
        } else {
            ReadFailure::Io
        }
    })?;
    if exceeds_open_limit(meta.len()) {
        return Err(ReadFailure::TooLarge);
    }
    let bytes = fs::read(path).map_err(|_| ReadFailure::Io)?;
    if bytes.len() as u64 > MAX_OPEN_BYTES {
        return Err(ReadFailure::TooLarge);
    }
    let (markdown_lf, newline) = decode_markdown(&bytes).map_err(|error| match error {
        DecodeError::NotUtf8 => ReadFailure::NotUtf8,
    })?;
    let mtime = meta.modified().map_err(|_| ReadFailure::Io)?;
    Ok(OpenedNote {
        markdown_lf,
        newline,
        mtime,
    })
}

pub fn write_note(path: &Path, markdown_lf: &str, newline: NewlineStyle) -> io::Result<u64> {
    let encoded = restore_newlines(markdown_lf, newline).into_bytes();
    let len = encoded.len() as u64;
    atomic_write(path, &encoded)?;
    Ok(len)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs::File;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn scratch() -> std::path::PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let dir = std::env::temp_dir().join(format!("rustmark-io-{nanos}"));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn crlf_roundtrip_and_bom_is_not_written_back() {
        let dir = scratch();
        let path = dir.join("mix.md");
        let mut original = vec![0xEF, 0xBB, 0xBF];
        original.extend_from_slice(b"a\r\nb\nc\r");
        fs::write(&path, &original).unwrap();
        let opened = read_note(&path).unwrap();
        assert_eq!(opened.markdown_lf, "a\nb\nc\n");
        assert_eq!(opened.newline, NewlineStyle::Crlf);
        write_note(&path, &opened.markdown_lf, opened.newline).unwrap();
        assert_eq!(fs::read(&path).unwrap(), b"a\r\nb\r\nc\r\n");
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn non_utf8_leaves_the_file_unchanged() {
        let dir = scratch();
        let path = dir.join("bad.md");
        fs::write(&path, [0xFF, 0xFE, b'a']).unwrap();
        assert!(matches!(read_note(&path), Err(ReadFailure::NotUtf8)));
        assert_eq!(fs::read(&path).unwrap(), vec![0xFF, 0xFE, b'a']);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn oversized_length_returns_before_the_body_matters() {
        let dir = scratch();
        let path = dir.join("big.md");
        let file = File::create(&path).unwrap();
        file.set_len(MAX_OPEN_BYTES + 1).unwrap();
        assert!(matches!(read_note(&path), Err(ReadFailure::TooLarge)));
        let _ = fs::remove_dir_all(&dir);
    }
}
