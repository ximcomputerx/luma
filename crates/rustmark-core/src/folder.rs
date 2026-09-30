use std::fs;
use std::path::{Path, PathBuf};

use crate::{JailError, PathJail};

pub const FOLDER_ENTRY_LIMIT: usize = 5000;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EntryKind {
    File,
    Dir,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FolderEntry {
    pub name: String,
    pub path: PathBuf,
    pub kind: EntryKind,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FolderPage {
    pub entries: Vec<FolderEntry>,
    pub truncated: bool,
}

/// One directory level. `.git` and `node_modules` directories are skipped.
pub fn list_folder(jail: &PathJail, dir: &Path) -> Result<FolderPage, JailError> {
    let canonical = jail.admit(dir)?;
    let read = fs::read_dir(&canonical).map_err(|_| JailError::Io)?;
    let mut entries = Vec::new();
    let mut truncated = false;
    for item in read {
        let item = item.map_err(|_| JailError::Io)?;
        let name = item.file_name();
        let name_text = name.to_string_lossy().into_owned();
        let file_type = item.file_type().map_err(|_| JailError::Io)?;
        let is_dir = file_type.is_dir() || (file_type.is_symlink() && item.path().is_dir());
        if is_dir && (name_text == ".git" || name_text == "node_modules") {
            continue;
        }
        if entries.len() == FOLDER_ENTRY_LIMIT {
            truncated = true;
            break;
        }
        entries.push(FolderEntry {
            name: name_text,
            path: item.path(),
            kind: if is_dir {
                EntryKind::Dir
            } else {
                EntryKind::File
            },
        });
    }
    entries.sort_by(|left, right| match (left.kind, right.kind) {
        (EntryKind::Dir, EntryKind::File) => std::cmp::Ordering::Less,
        (EntryKind::File, EntryKind::Dir) => std::cmp::Ordering::Greater,
        _ => left.name.to_lowercase().cmp(&right.name.to_lowercase()),
    });
    Ok(FolderPage { entries, truncated })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn scratch() -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let dir = std::env::temp_dir().join(format!("rustmark-folder-{nanos}"));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn skips_named_directories_and_keeps_markdown_files() {
        let root = scratch();
        fs::create_dir_all(root.join(".git")).unwrap();
        fs::create_dir_all(root.join("node_modules")).unwrap();
        fs::create_dir_all(root.join("notes")).unwrap();
        fs::write(root.join("a.md"), "a").unwrap();
        fs::write(root.join("b.txt"), "b").unwrap();
        let mut jail = PathJail::default();
        jail.set_folder_root(&root).unwrap();
        let page = list_folder(&jail, &root).unwrap();
        let names: Vec<_> = page
            .entries
            .iter()
            .map(|entry| entry.name.as_str())
            .collect();
        assert_eq!(names, vec!["notes", "a.md", "b.txt"]);
        assert!(!page.truncated);
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn outside_directory_is_rejected() {
        let root = scratch();
        let other = scratch();
        let mut jail = PathJail::default();
        jail.set_folder_root(&root).unwrap();
        assert!(matches!(
            list_folder(&jail, &other),
            Err(JailError::Outside)
        ));
        let _ = fs::remove_dir_all(&root);
        let _ = fs::remove_dir_all(&other);
    }

    #[test]
    fn thousand_entries_stay_under_the_budget() {
        let root = scratch();
        for index in 0..1000 {
            fs::write(root.join(format!("n{index}.md")), "x").unwrap();
        }
        let mut jail = PathJail::default();
        jail.set_folder_root(&root).unwrap();
        let started = std::time::Instant::now();
        let page = list_folder(&jail, &root).unwrap();
        let elapsed = started.elapsed();
        assert_eq!(page.entries.len(), 1000);
        assert!(
            elapsed.as_millis() < 100,
            "list took {} ms",
            elapsed.as_millis()
        );
        let _ = fs::remove_dir_all(&root);
    }
}
