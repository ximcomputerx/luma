use std::fs::{self, OpenOptions};
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::Instant;

use tauri::{AppHandle, Manager};

const LIMIT: u64 = 1024 * 1024;

pub fn init(app: &AppHandle) -> PathBuf {
    let dir = app
        .path()
        .app_log_dir()
        .unwrap_or_else(|_| std::env::temp_dir().join("rustmark-log"));
    let _ = fs::create_dir_all(&dir);
    if let Ok(rolling) = Rolling::open(&dir) {
        let shared = Arc::new(Mutex::new(rolling));
        let writer = shared.clone();
        let _ = tracing_subscriber::fmt()
            .with_max_level(tracing::Level::INFO)
            .with_ansi(false)
            .with_target(true)
            .with_writer(move || SharedLog(writer.clone()))
            .try_init();
    }
    install_panic_hook(&dir);
    dir
}

pub fn log_command(command: &str, started: Instant, bytes: u64, rev: u64, code: &str, file: &str) {
    tracing::info!(
        target: "rustmark",
        command,
        elapsed_ms = started.elapsed().as_millis() as u64,
        bytes,
        rev,
        code,
        file
    );
}

pub fn file_label(path: Option<&std::path::Path>) -> String {
    path.and_then(|path| path.file_name())
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_else(|| "-".to_string())
}

fn install_panic_hook(log_dir: &Path) {
    let log_dir = log_dir.to_path_buf();
    let previous = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        let mut text = String::new();
        text.push_str(&info.to_string());
        text.push('\n');
        if let Some(location) = info.location() {
            text.push_str(&location.to_string());
            text.push('\n');
        }
        text.push_str(&std::backtrace::Backtrace::force_capture().to_string());
        let _ = fs::write(log_dir.join("crash.log"), text);
        previous(info);
    }));
}

struct SharedLog(Arc<Mutex<Rolling>>);

impl Write for SharedLog {
    fn write(&mut self, buf: &[u8]) -> io::Result<usize> {
        self.0
            .lock()
            .unwrap_or_else(|error| error.into_inner())
            .write(buf)
    }

    fn flush(&mut self) -> io::Result<()> {
        self.0
            .lock()
            .unwrap_or_else(|error| error.into_inner())
            .flush()
    }
}

struct Rolling {
    dir: PathBuf,
    file: fs::File,
    size: u64,
}

impl Rolling {
    fn open(dir: &Path) -> io::Result<Self> {
        fs::create_dir_all(dir)?;
        let path = dir.join("rustmark.log");
        let file = OpenOptions::new().create(true).append(true).open(&path)?;
        let size = file.metadata()?.len();
        Ok(Self {
            dir: dir.to_path_buf(),
            file,
            size,
        })
    }

    fn rotate(&mut self) -> io::Result<()> {
        self.file.flush()?;
        let current = self.dir.join("rustmark.log");
        let previous = self.dir.join("rustmark.log.1");
        let _ = fs::remove_file(&previous);
        let _ = fs::rename(&current, &previous);
        self.file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(&current)?;
        self.size = 0;
        Ok(())
    }
}

impl Write for Rolling {
    fn write(&mut self, buf: &[u8]) -> io::Result<usize> {
        if self.size > 0 && self.size.saturating_add(buf.len() as u64) > LIMIT {
            self.rotate()?;
        }
        let written = self.file.write(buf)?;
        self.size = self.size.saturating_add(written as u64);
        Ok(written)
    }

    fn flush(&mut self) -> io::Result<()> {
        self.file.flush()
    }
}

pub fn log_tail(dir: &Path) -> Vec<String> {
    let mut lines = Vec::new();
    for name in ["rustmark.log.1", "rustmark.log"] {
        if let Ok(text) = fs::read_to_string(dir.join(name)) {
            lines.extend(text.lines().map(|line| line.to_string()));
        }
    }
    let start = lines.len().saturating_sub(200);
    lines
        .into_iter()
        .skip(start)
        .filter(|line| {
            !line.contains("markdown_lf") && !line.to_ascii_lowercase().contains("api_key")
        })
        .map(|line| {
            if line.chars().count() > 2000 {
                line.chars().take(2000).collect()
            } else {
                line
            }
        })
        .collect()
}
