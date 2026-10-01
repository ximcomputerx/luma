use std::collections::VecDeque;
use std::ffi::{OsStr, OsString};
use std::fs;
use std::path::{Component, Path, PathBuf};
use std::sync::{Mutex, MutexGuard};
use std::time::{SystemTime, UNIX_EPOCH};

use rustmark_core::{remember_recent, DocumentSession, JailError, NewlineStyle};

use crate::error::{command_error, io_failed, not_utf8, rejected, too_large, CommandError};
use crate::io_docs::{read_note, ReadFailure};
use crate::state::{rebind, snapshot, Session, SnapshotResponse, TAB_LIMIT};

pub const MARKDOWN_EXTENSIONS: &[&str] = &["md", "markdown", "mdown", "mkdn"];

pub struct PreparedOpen {
    path: PathBuf,
    markdown_lf: String,
    newline: NewlineStyle,
    mtime: SystemTime,
}

pub struct OpenedDocument {
    pub snapshot: SnapshotResponse,
    pub wrote_recent: bool,
}

#[derive(Clone)]
pub struct LaunchOutcome {
    pub snapshots: Vec<SnapshotResponse>,
    pub errors: Vec<CommandError>,
    pub wrote_recent: bool,
}

struct BootMemory {
    ready: bool,
    replay: LaunchOutcome,
}

pub struct LaunchHub {
    queue: VecDeque<PathBuf>,
    boot: BootMemory,
}

impl LaunchHub {
    pub const fn new() -> Self {
        Self {
            queue: VecDeque::new(),
            boot: BootMemory {
                ready: false,
                replay: LaunchOutcome {
                    snapshots: Vec::new(),
                    errors: Vec::new(),
                    wrote_recent: false,
                },
            },
        }
    }

    fn claim_paths(&mut self) -> (bool, Vec<PathBuf>) {
        let paths: Vec<_> = self.queue.drain(..).collect();
        let initializer = !self.boot.ready;
        if initializer {
            self.boot.ready = true;
        }
        (initializer, paths)
    }

    fn complete(&mut self, initializer: bool, boot: bool, fresh: LaunchOutcome) -> LaunchOutcome {
        if initializer {
            self.boot.replay = fresh.clone();
            return fresh;
        }
        if boot && fresh.snapshots.is_empty() && fresh.errors.is_empty() {
            return self.boot.replay.clone();
        }
        fresh
    }

    pub fn enqueue(&mut self, paths: impl IntoIterator<Item = PathBuf>) {
        self.queue.extend(paths);
    }

    #[cfg(test)]
    pub fn flush(&mut self, session: &mut Session, boot: bool) -> LaunchOutcome {
        let (initializer, paths) = self.claim_paths();
        let prepared: Vec<_> = paths.iter().map(|path| prepare_open(path)).collect();
        let fresh = commit_all(session, prepared, initializer);
        self.complete(initializer, boot, fresh)
    }
}

static LAUNCH: Mutex<LaunchHub> = Mutex::new(LaunchHub::new());
static FLUSH_GATE: Mutex<()> = Mutex::new(());

fn lock_hub() -> MutexGuard<'static, LaunchHub> {
    LAUNCH.lock().unwrap_or_else(|error| error.into_inner())
}

pub struct FlushGuard {
    _guard: MutexGuard<'static, ()>,
}

/// One flush at a time, from claim through complete.
pub fn lock_flush() -> FlushGuard {
    FlushGuard {
        _guard: FLUSH_GATE.lock().unwrap_or_else(|error| error.into_inner()),
    }
}

pub fn enqueue_process_args() {
    let cwd = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
    let exe = std::env::current_exe().ok();
    let args: Vec<OsString> = std::env::args_os().collect();
    enqueue_paths(launch_paths(&args, &cwd, exe.as_deref()));
}

pub fn enqueue_instance_args(args: &[String], cwd: &str) {
    let cwd = if cwd.is_empty() {
        std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."))
    } else {
        PathBuf::from(cwd)
    };
    let exe = std::env::current_exe().ok();
    let os_args: Vec<OsString> = args.iter().map(OsString::from).collect();
    enqueue_paths(launch_paths(&os_args, &cwd, exe.as_deref()));
}

pub fn claim_launch() -> (bool, Vec<PathBuf>) {
    lock_hub().claim_paths()
}

pub fn complete_launch(initializer: bool, boot: bool, fresh: LaunchOutcome) -> LaunchOutcome {
    lock_hub().complete(initializer, boot, fresh)
}

fn enqueue_paths(paths: Vec<PathBuf>) {
    if paths.is_empty() {
        return;
    }
    lock_hub().enqueue(paths);
}

pub fn is_markdown_path(path: &Path) -> bool {
    let Some(extension) = path.extension().and_then(|ext| ext.to_str()) else {
        return false;
    };
    MARKDOWN_EXTENSIONS
        .iter()
        .any(|allowed| extension.eq_ignore_ascii_case(allowed))
}

pub fn launch_paths(args: &[OsString], cwd: &Path, current_exe: Option<&Path>) -> Vec<PathBuf> {
    let mut paths = Vec::new();
    let mut args = args.iter();
    if let Some(first) = args.next() {
        if !is_argv0(first, current_exe) {
            if let Some(path) = argument_to_path(first, cwd) {
                paths.push(path);
            }
        }
    }
    for arg in args {
        if let Some(path) = argument_to_path(arg, cwd) {
            paths.push(path);
        }
    }
    paths
}

pub fn prepare_open(path: &Path) -> Result<PreparedOpen, CommandError> {
    if path
        .components()
        .any(|component| component == Component::ParentDir)
    {
        return Err(rejected());
    }
    if !is_markdown_path(path) {
        return Err(rejected());
    }
    let meta = fs::metadata(path).map_err(|_| rejected())?;
    if !meta.is_file() {
        return Err(rejected());
    }
    let opened = match read_note(path) {
        Ok(opened) => opened,
        Err(ReadFailure::Missing) => return Err(rejected()),
        Err(ReadFailure::NotUtf8) => return Err(not_utf8()),
        Err(ReadFailure::TooLarge) => return Err(too_large()),
        Err(ReadFailure::Io) => return Err(io_failed()),
    };
    Ok(PreparedOpen {
        path: path.to_path_buf(),
        markdown_lf: opened.markdown_lf,
        newline: opened.newline,
        mtime: opened.mtime,
    })
}

pub fn commit_open(
    session: &mut Session,
    prepared: PreparedOpen,
) -> Result<OpenedDocument, CommandError> {
    let mut trial = session.jail.clone();
    let canonical = match trial.open_document(&prepared.path) {
        Ok(path) => path,
        Err(JailError::Outside) | Err(JailError::NoRoot) => return Err(rejected()),
        Err(JailError::Io) => return Err(io_failed()),
    };
    if !is_markdown_path(&canonical) {
        return Err(rejected());
    }
    if let Some(index) = session
        .documents
        .iter()
        .position(|document| document.path.as_ref() == Some(&canonical))
    {
        session.active = session.documents[index].id;
        return Ok(OpenedDocument {
            snapshot: snapshot(session),
            wrote_recent: false,
        });
    }
    if session.documents.len() >= TAB_LIMIT {
        return Err(command_error("io", "打开的标签太多。"));
    }
    session.jail = trial;
    let opened_document = DocumentSession::opened(
        canonical.clone(),
        prepared.markdown_lf,
        prepared.newline,
        Some(prepared.mtime),
    );
    session.active = opened_document.id;
    session.documents.push(opened_document);
    rebind(session);
    let shown = canonical.to_string_lossy().into_owned();
    remember_recent(&mut session.settings, &shown, now_ms());
    Ok(OpenedDocument {
        snapshot: snapshot(session),
        wrote_recent: true,
    })
}

pub fn commit_all(
    session: &mut Session,
    prepared: Vec<Result<PreparedOpen, CommandError>>,
    initializer: bool,
) -> LaunchOutcome {
    let mut snapshots = Vec::new();
    let mut errors = Vec::new();
    let mut wrote_recent = false;
    for item in prepared {
        match item {
            Ok(prepared) => match commit_open(session, prepared) {
                Ok(opened) => {
                    wrote_recent |= opened.wrote_recent;
                    snapshots.push(opened.snapshot);
                }
                Err(error) => errors.push(error),
            },
            Err(error) => errors.push(error),
        }
    }
    // External files win. A blank document is only created when nothing opened.
    if initializer && session.documents.is_empty() && !restore_session(session) {
        let document = DocumentSession::untitled();
        session.active = document.id;
        session.documents.push(document);
        snapshots.push(snapshot(session));
    }
    LaunchOutcome {
        snapshots,
        errors,
        wrote_recent,
    }
}

/// Session restore sits above a blank document. Phase 1 has nothing to restore.
fn restore_session(_session: &mut Session) -> bool {
    false
}

fn argument_to_path(arg: &OsStr, cwd: &Path) -> Option<PathBuf> {
    let text = arg.to_string_lossy();
    if text.is_empty() || text.starts_with('-') {
        return None;
    }
    // Only an explicit file URL is parsed. A Windows path like `D:\notes` is not a URL.
    if text.starts_with("file:") {
        return url::Url::parse(&text)
            .ok()
            .and_then(|parsed| parsed.to_file_path().ok());
    }
    let path = PathBuf::from(arg);
    if path.is_absolute() {
        Some(path)
    } else {
        Some(cwd.join(path))
    }
}

fn is_argv0(arg: &OsStr, current_exe: Option<&Path>) -> bool {
    let Some(exe) = current_exe else {
        return false;
    };
    let path = PathBuf::from(arg);
    if path == exe || eq_ignore_ascii_path(&path, exe) {
        return true;
    }
    match (fs::canonicalize(&path), fs::canonicalize(exe)) {
        (Ok(left), Ok(right)) => left == right,
        _ => false,
    }
}

fn eq_ignore_ascii_path(left: &Path, right: &Path) -> bool {
    left.to_string_lossy()
        .eq_ignore_ascii_case(&right.to_string_lossy())
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|time| time.as_millis() as u64)
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use rustmark_core::{PathJail, Settings};
    use uuid::Uuid;

    fn scratch() -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let dir = std::env::temp_dir().join(format!("luma-open-{nanos}"));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn empty_session() -> Session {
        Session {
            jail: PathJail::default(),
            settings: Settings::default(),
            documents: Vec::new(),
            active: Uuid::nil(),
        }
    }

    #[test]
    fn launch_args_keep_files_and_skip_the_executable_and_flags() {
        let exe = PathBuf::from(r"C:\Program Files\Luma\luma.exe");
        let cwd = PathBuf::from(r"D:\work");
        let args = vec![
            OsString::from(r"C:\Program Files\Luma\luma.exe"),
            OsString::from("--flag"),
            OsString::from(r"D:\my notes\测试.md"),
            OsString::from("b.mkdn"),
        ];
        let paths = launch_paths(&args, &cwd, Some(&exe));
        assert_eq!(paths.len(), 2);
        assert!(paths[0].ends_with("测试.md"));
        assert_eq!(paths[1], cwd.join("b.mkdn"));
    }

    #[test]
    fn a_file_argument_without_an_executable_is_kept() {
        let cwd = PathBuf::from(r"D:\work");
        let args = vec![OsString::from("note.mdown")];
        let paths = launch_paths(&args, &cwd, None);
        assert_eq!(paths, vec![cwd.join("note.mdown")]);
    }

    #[cfg(windows)]
    #[test]
    fn a_file_url_becomes_a_windows_path() {
        let cwd = PathBuf::from(r"D:\work");
        let args = vec![
            OsString::from(r"C:\Luma\luma.exe"),
            OsString::from("file:///D:/my%20notes/a.md"),
        ];
        let exe = PathBuf::from(r"C:\Luma\luma.exe");
        let paths = launch_paths(&args, &cwd, Some(&exe));
        assert_eq!(paths.len(), 1);
        assert!(paths[0].ends_with("a.md"));
        assert!(paths[0].to_string_lossy().contains("my notes"));
    }

    #[test]
    fn opening_a_file_does_not_create_a_blank_tab() {
        let dir = scratch();
        let notes = dir.join("my notes");
        fs::create_dir_all(&notes).unwrap();
        let first = dir.join("测试.md");
        let second = notes.join("test.mdown");
        fs::write(&first, "甲").unwrap();
        fs::write(&second, "乙").unwrap();
        let mut hub = LaunchHub::new();
        hub.enqueue([first, second]);
        let mut session = empty_session();
        let outcome = hub.flush(&mut session, true);
        assert!(outcome.errors.is_empty());
        assert_eq!(session.documents.len(), 2);
        assert!(session
            .documents
            .iter()
            .all(|document| document.path.is_some()));
        assert_eq!(outcome.snapshots.len(), 2);
        assert_eq!(outcome.snapshots[0].document.markdown_lf, "甲");
        assert_eq!(outcome.snapshots[1].document.markdown_lf, "乙");
        assert_eq!(session.active, session.documents[1].id);
        let again = hub.flush(&mut session, true);
        assert_eq!(session.documents.len(), 2);
        assert_eq!(again.snapshots.len(), 2);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn no_launch_file_creates_one_blank_document() {
        let mut hub = LaunchHub::new();
        let mut session = empty_session();
        let outcome = hub.flush(&mut session, true);
        assert_eq!(session.documents.len(), 1);
        assert!(session.documents[0].path.is_none());
        assert_eq!(outcome.snapshots.len(), 1);
        let again = hub.flush(&mut session, true);
        assert_eq!(session.documents.len(), 1);
        assert_eq!(again.snapshots.len(), 1);
        assert!(again.snapshots[0].document.path.is_none());
    }

    #[test]
    fn rejected_files_fall_through_to_one_blank_document() {
        let dir = scratch();
        let text = dir.join("notes.txt");
        let markdown_dir = dir.join("chapter.md");
        fs::write(&text, "x").unwrap();
        fs::create_dir_all(&markdown_dir).unwrap();
        let missing = dir.join("gone.md");
        let escaped = dir.join("..").join("outside.md");
        let mut hub = LaunchHub::new();
        hub.enqueue([text, markdown_dir, missing, escaped]);
        let mut session = empty_session();
        let outcome = hub.flush(&mut session, true);
        assert_eq!(outcome.errors.len(), 4);
        assert!(outcome.errors.iter().all(|error| error.code == "rejected"));
        assert_eq!(session.documents.len(), 1);
        assert!(session.documents[0].path.is_none());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn markdown_extensions_open_and_a_link_to_another_type_is_rejected() {
        let dir = scratch();
        for name in ["A.MD", "B.Markdown", "C.mkdn"] {
            fs::write(dir.join(name), name).unwrap();
        }
        let mut hub = LaunchHub::new();
        hub.enqueue(["A.MD", "B.Markdown", "C.mkdn"].map(|name| dir.join(name)));
        let mut session = empty_session();
        let outcome = hub.flush(&mut session, true);
        assert!(outcome.errors.is_empty());
        assert_eq!(session.documents.len(), 3);

        let target = dir.join("secret.txt");
        fs::write(&target, "secret").unwrap();
        let link = dir.join("alias.md");
        #[cfg(windows)]
        let linked = std::os::windows::fs::symlink_file(&target, &link);
        #[cfg(not(windows))]
        let linked = std::os::unix::fs::symlink(&target, &link);
        if linked.is_ok() {
            let mut linked_session = empty_session();
            let mut linked_hub = LaunchHub::new();
            linked_hub.enqueue([link]);
            let linked_outcome = linked_hub.flush(&mut linked_session, true);
            assert!(linked_outcome
                .errors
                .iter()
                .any(|error| error.code == "rejected"));
            assert!(linked_session
                .documents
                .iter()
                .all(|document| document.path.is_none()));
        }
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn opening_the_same_file_again_activates_the_existing_tab() {
        let dir = scratch();
        let file = dir.join("a.md");
        fs::write(&file, "same").unwrap();
        let mut session = empty_session();
        let first = commit_open(&mut session, prepare_open(&file).unwrap()).unwrap();
        let second = commit_open(&mut session, prepare_open(&file).unwrap()).unwrap();
        assert_eq!(session.documents.len(), 1);
        assert_eq!(
            first.snapshot.document.document_id,
            second.snapshot.document.document_id
        );
        assert!(!second.wrote_recent);
        let _ = fs::remove_dir_all(&dir);
    }
}
