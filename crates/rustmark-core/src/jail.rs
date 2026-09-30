use std::path::{Component, Path, PathBuf};

use thiserror::Error;

/// One directory root. A path is inside only when every component matches
/// after canonicalization, so `notes-evil` is not inside `notes`.
#[derive(Debug, Default, Clone)]
pub struct PathJail {
    /// Folder shown in the sidebar. Only an explicit folder choice or save-as changes it.
    root: Option<PathBuf>,
    /// Parents of other open documents. They stay writable after the sidebar moves.
    bound: Vec<PathBuf>,
}

#[derive(Debug, Error)]
pub enum JailError {
    #[error("还没有打开文件夹")]
    NoRoot,
    #[error("路径不在已打开的文件夹内")]
    Outside,
    #[error("无法解析路径")]
    Io,
}

impl PathJail {
    pub fn root(&self) -> Option<&Path> {
        self.root.as_deref()
    }

    pub fn set_folder_root(&mut self, dir: &Path) -> Result<PathBuf, JailError> {
        let canonical = canonicalize(dir)?;
        self.root = Some(canonical.clone());
        Ok(canonical)
    }

    /// Open a document that already exists. The sidebar root stays as it is.
    /// A file outside that folder is remembered through its parent so it can
    /// still be saved and previewed.
    pub fn open_document(&mut self, path: &Path) -> Result<PathBuf, JailError> {
        if !path.exists() {
            return Err(JailError::Io);
        }
        if path
            .components()
            .any(|component| component == Component::ParentDir)
        {
            return Err(JailError::Outside);
        }
        let resolved = canonicalize(path)?;
        if self.covers(&resolved) {
            return Ok(resolved);
        }
        let parent = resolved
            .parent()
            .filter(|parent| !parent.as_os_str().is_empty())
            .ok_or(JailError::Io)?;
        self.bind_root(parent)?;
        Ok(resolved)
    }

    /// Resolve a file that may not exist yet. `replace_root` is set for save-as
    /// and for opening a file. An in-place save leaves the root alone and
    /// rejects a parent outside it. `..` is not a file name.
    pub fn locate_file(
        &mut self,
        candidate: &Path,
        replace_root: bool,
    ) -> Result<PathBuf, JailError> {
        // A `..` component is rejected before canonicalize so a crafted path
        // cannot retarget the root. Dialogs and the file tree hand us absolute paths.
        if candidate
            .components()
            .any(|component| component == Component::ParentDir)
        {
            return Err(JailError::Outside);
        }
        let resolved = if candidate.exists() {
            canonicalize(candidate)?
        } else {
            let parent = candidate
                .parent()
                .filter(|path| !path.as_os_str().is_empty())
                .ok_or(JailError::Io)?;
            let name = candidate
                .file_name()
                .filter(|name| safe_file_name(name))
                .ok_or(JailError::Outside)?;
            if !parent.exists() {
                return Err(JailError::Io);
            }
            canonicalize(parent)?.join(name)
        };
        self.decide(resolved, replace_root)
    }

    /// Remember a document directory without changing the sidebar root.
    pub fn bind_root(&mut self, dir: &Path) -> Result<PathBuf, JailError> {
        let canonical = canonicalize(dir)?;
        if !self.bound.iter().any(|item| item == &canonical) {
            self.bound.push(canonical.clone());
        }
        Ok(canonical)
    }

    pub fn unbind_root(&mut self, dir: &Path) {
        if let Ok(canonical) = canonicalize(dir) {
            self.bound.retain(|item| item != &canonical);
        }
    }

    pub fn clear_bound(&mut self) {
        self.bound.clear();
    }

    fn decide(&mut self, path: PathBuf, replace_root: bool) -> Result<PathBuf, JailError> {
        if self.covers(&path) {
            return Ok(path);
        }
        if !replace_root {
            return if self.root.is_none() && self.bound.is_empty() {
                Err(JailError::NoRoot)
            } else {
                Err(JailError::Outside)
            };
        }
        let parent = path
            .parent()
            .filter(|parent| !parent.as_os_str().is_empty())
            .map(Path::to_path_buf)
            .unwrap_or_else(|| path.clone());
        self.root = Some(parent);
        Ok(path)
    }

    pub fn admit(&self, candidate: &Path) -> Result<PathBuf, JailError> {
        if self.root.is_none() && self.bound.is_empty() {
            return Err(JailError::NoRoot);
        }
        let canonical = canonicalize(candidate)?;
        if self.covers(&canonical) {
            Ok(canonical)
        } else {
            Err(JailError::Outside)
        }
    }

    /// A file that does not exist yet. The parent must already be inside a root.
    pub fn admit_new_file(&self, candidate: &Path) -> Result<PathBuf, JailError> {
        if candidate
            .components()
            .any(|component| component == Component::ParentDir)
        {
            return Err(JailError::Outside);
        }
        let parent = candidate
            .parent()
            .filter(|path| !path.as_os_str().is_empty())
            .ok_or(JailError::Io)?;
        let name = candidate
            .file_name()
            .filter(|name| safe_file_name(name))
            .ok_or(JailError::Outside)?;
        let parent = self.admit(parent)?;
        Ok(parent.join(name))
    }

    fn covers(&self, path: &Path) -> bool {
        self.root
            .iter()
            .chain(self.bound.iter())
            .any(|root| path == root || path.starts_with(root))
    }
}

fn canonicalize(path: &Path) -> Result<PathBuf, JailError> {
    dunce::canonicalize(path).map_err(|_| JailError::Io)
}

fn safe_file_name(name: &std::ffi::OsStr) -> bool {
    let text = name.to_string_lossy();
    !text.is_empty() && text != "." && text != ".." && !text.contains(['/', '\\', ':'])
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn scratch() -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let dir = std::env::temp_dir().join(format!("rustmark-jail-{nanos}"));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn sibling_prefix_is_outside() {
        let root_dir = scratch();
        let notes = root_dir.join("notes");
        let evil = root_dir.join("notes-evil");
        fs::create_dir_all(&notes).unwrap();
        fs::create_dir_all(&evil).unwrap();
        let inside = notes.join("a.md");
        fs::write(&inside, "ok").unwrap();
        fs::write(evil.join("b.md"), "no").unwrap();

        let mut jail = PathJail::default();
        jail.set_folder_root(&notes).unwrap();
        assert!(jail.admit(&inside).is_ok());
        assert!(matches!(jail.admit(&evil), Err(JailError::Outside)));
        assert!(matches!(
            jail.admit(evil.join("b.md").as_path()),
            Err(JailError::Outside)
        ));
        let _ = fs::remove_dir_all(&root_dir);
    }

    #[test]
    fn opening_a_file_does_not_replace_the_sidebar_root() {
        let root_dir = scratch();
        let notes = root_dir.join("notes");
        let other = root_dir.join("other");
        fs::create_dir_all(&notes).unwrap();
        fs::create_dir_all(&other).unwrap();
        let file = other.join("note.md");
        fs::write(&file, "x").unwrap();

        let mut jail = PathJail::default();
        jail.open_document(&file).unwrap();
        assert!(jail.root().is_none());
        assert!(jail.admit(&file).is_ok());

        jail.set_folder_root(&notes).unwrap();
        jail.open_document(&file).unwrap();
        assert_eq!(jail.root().unwrap(), dunce::canonicalize(&notes).unwrap());
        assert!(jail.admit(&file).is_ok());
        let inside = notes.join("inside.md");
        fs::write(&inside, "y").unwrap();
        assert!(jail.admit(&inside).is_ok());
        let _ = fs::remove_dir_all(&root_dir);
    }

    #[test]
    fn symlink_outside_is_not_admitted() {
        let root_dir = scratch();
        let notes = root_dir.join("notes");
        let outside = root_dir.join("outside.md");
        fs::create_dir_all(&notes).unwrap();
        fs::write(&outside, "secret").unwrap();
        let link = notes.join("link.md");
        #[cfg(windows)]
        let linked = std::os::windows::fs::symlink_file(&outside, &link);
        #[cfg(not(windows))]
        let linked = std::os::unix::fs::symlink(&outside, &link);
        if linked.is_err() {
            let _ = fs::remove_dir_all(&root_dir);
            return;
        }
        let mut jail = PathJail::default();
        jail.set_folder_root(&notes).unwrap();
        assert!(matches!(jail.admit(&link), Err(JailError::Outside)));
        let _ = fs::remove_dir_all(&root_dir);
    }

    #[test]
    fn new_file_outside_replaces_root_and_dotdot_is_rejected() {
        let root_dir = scratch();
        let notes = root_dir.join("notes");
        let other = root_dir.join("other");
        fs::create_dir_all(&notes).unwrap();
        fs::create_dir_all(&other).unwrap();
        let mut jail = PathJail::default();
        jail.set_folder_root(&notes).unwrap();
        let created = other.join("fresh.md");
        let placed = jail.locate_file(&created, true).unwrap();
        assert_eq!(
            placed,
            dunce::canonicalize(&other).unwrap().join("fresh.md")
        );
        assert_eq!(jail.root().unwrap(), dunce::canonicalize(&other).unwrap());

        jail.set_folder_root(&notes).unwrap();
        let escaped = notes.join("..").join("outside.md");
        assert!(matches!(
            jail.locate_file(&escaped, true),
            Err(JailError::Outside)
        ));
        assert_eq!(jail.root().unwrap(), dunce::canonicalize(&notes).unwrap());
        assert!(matches!(
            jail.locate_file(&created, false),
            Err(JailError::Outside)
        ));
        let _ = fs::remove_dir_all(&root_dir);
    }

    #[test]
    fn a_bound_document_root_stays_writable_after_the_sidebar_moves() {
        let root_dir = scratch();
        let notes = root_dir.join("notes");
        let other = root_dir.join("other");
        fs::create_dir_all(&notes).unwrap();
        fs::create_dir_all(&other).unwrap();
        let first = notes.join("a.md");
        let second = other.join("b.md");
        fs::write(&first, "a").unwrap();
        fs::write(&second, "b").unwrap();
        let mut jail = PathJail::default();
        jail.set_folder_root(&notes).unwrap();
        jail.bind_root(&notes).unwrap();
        jail.set_folder_root(&other).unwrap();
        assert_eq!(jail.root().unwrap(), dunce::canonicalize(&other).unwrap());
        assert!(jail.admit(&first).is_ok());
        assert!(jail.admit(&second).is_ok());
        let created = jail.admit_new_file(&notes.join("assets").join("a.png"));
        assert!(created.is_err());
        fs::create_dir_all(notes.join("assets")).unwrap();
        let placed = jail
            .admit_new_file(&notes.join("assets").join("a.png"))
            .unwrap();
        assert!(placed.ends_with("a.png"));
        assert!(jail
            .admit_new_file(&notes.join("..").join("x.png"))
            .is_err());
        jail.unbind_root(&notes);
        assert!(jail.admit(&first).is_err());
        let _ = fs::remove_dir_all(&root_dir);
    }
}
