use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_updater::{Update, UpdaterExt};
use url::Url;

use crate::atomic::atomic_write;
use crate::error::{command_error, CommandError};
use crate::logging::log_command;
use crate::state::AppState;
use crate::update::{
    self, Phase, Session, StartupDecision, UpdatePolicy, VerifyOutcome, ERR_INSTALL, ERR_VERIFY,
};

const EMIT_GAP: Duration = Duration::from_millis(250);

struct Package {
    update: Update,
    bytes: Vec<u8>,
}

struct Inner {
    session: Session,
    policy: UpdatePolicy,
    path: Option<PathBuf>,
    current_version: String,
    armed: bool,
    epoch: u64,
    package: Option<Package>,
    last_emit: Instant,
    revision: u64,
    dev_build: bool,
}

pub struct UpdateRuntime {
    inner: Mutex<Inner>,
}

impl UpdateRuntime {
    pub fn open(current_version: String, path: Option<PathBuf>) -> Self {
        let policy = path
            .as_ref()
            .and_then(|path| std::fs::read(path).ok())
            .map(|bytes| update::load_policy(&bytes))
            .unwrap_or_default();
        Self {
            inner: Mutex::new(Inner {
                session: Session::default(),
                policy,
                path,
                current_version,
                armed: false,
                epoch: 0,
                package: None,
                last_emit: Instant::now()
                    .checked_sub(EMIT_GAP)
                    .unwrap_or_else(Instant::now),
                revision: 0,
                dev_build: cfg!(debug_assertions),
            }),
        }
    }
}

fn lock(runtime: &UpdateRuntime) -> std::sync::MutexGuard<'_, Inner> {
    runtime
        .inner
        .lock()
        .unwrap_or_else(|error| error.into_inner())
}

#[derive(Clone, Serialize)]
pub struct UpdateSnapshot {
    pub phase: String,
    pub current_version: String,
    pub available_version: String,
    pub notes: String,
    pub downloaded_bytes: u64,
    pub total_bytes: u64,
    pub check_on_startup: bool,
    pub download_in_background: bool,
    pub prompt: bool,
    pub install_when_ready: bool,
    pub error: String,
    pub dev_build: bool,
    pub revision: u64,
}

impl Inner {
    fn snapshot(&self) -> UpdateSnapshot {
        UpdateSnapshot {
            phase: self.session.phase.as_str().to_string(),
            current_version: self.current_version.clone(),
            available_version: self.session.available_version.clone(),
            notes: self.session.notes.clone(),
            downloaded_bytes: self.session.downloaded_bytes,
            total_bytes: self.session.total_bytes,
            check_on_startup: self.policy.check_on_startup,
            download_in_background: self.policy.download_in_background,
            prompt: self.session.prompt,
            install_when_ready: self.session.install_when_ready,
            error: self.session.error.clone(),
            dev_build: self.dev_build,
            revision: self.revision,
        }
    }
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|time| time.as_millis() as u64)
        .unwrap_or(0)
}

fn persist(inner: &Inner) {
    let Some(path) = &inner.path else {
        return;
    };
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let Ok(bytes) = serde_json::to_vec(&inner.policy) else {
        return;
    };
    let _ = atomic_write(path, &bytes);
}

fn publish(app: &AppHandle, inner: &mut Inner, force: bool) {
    if !force && inner.last_emit.elapsed() < EMIT_GAP {
        return;
    }
    inner.revision = inner.revision.wrapping_add(1);
    inner.last_emit = Instant::now();
    let snapshot = inner.snapshot();
    let _ = app.emit("update://state", snapshot);
}

fn permit_exit(app: &AppHandle) {
    if let Some(state) = app.try_state::<AppState>() {
        state
            .allow_close
            .store(true, std::sync::atomic::Ordering::SeqCst);
    }
}

fn updater(app: &AppHandle) -> Result<tauri_plugin_updater::Updater, ()> {
    let handle = app.clone();
    app.updater_builder()
        .on_before_exit(move || permit_exit(&handle))
        .version_comparator(|current, release| update::is_newer_version(&current, &release.version))
        .build()
        .map_err(|_| ())
}

async fn content_length(url: &Url) -> u64 {
    if url.scheme() != "https" {
        return 0;
    }
    let Ok(client) = reqwest::Client::builder()
        .timeout(Duration::from_secs(3))
        .redirect(reqwest::redirect::Policy::none())
        .build()
    else {
        return 0;
    };
    let Ok(response) = client.head(url.clone()).send().await else {
        return 0;
    };
    if !response.status().is_success() {
        return 0;
    }
    response.content_length().unwrap_or(0)
}

fn classify_download(error: &tauri_plugin_updater::Error) -> VerifyOutcome {
    match error {
        tauri_plugin_updater::Error::Minisign(_)
        | tauri_plugin_updater::Error::Base64(_)
        | tauri_plugin_updater::Error::SignatureUtf8(_)
        | tauri_plugin_updater::Error::SignedVersionMismatch { .. }
        | tauri_plugin_updater::Error::MissingSignedVersion => VerifyOutcome::Rejected,
        _ => VerifyOutcome::Accepted,
    }
}

async fn run_check(
    app: &AppHandle,
    runtime: &UpdateRuntime,
    interactive: bool,
) -> Result<UpdateSnapshot, CommandError> {
    let started = Instant::now();
    {
        let mut inner = lock(runtime);
        if inner.dev_build {
            log_command("update_check", started, 0, 0, "dev", "-");
            return Ok(inner.snapshot());
        }
        if !inner.session.begin_check(interactive) {
            return Ok(inner.snapshot());
        }
        inner.epoch = inner.epoch.wrapping_add(1);
        inner.package = None;
        publish(app, &mut inner, true);
    }

    let updater = match updater(app) {
        Ok(updater) => updater,
        Err(()) => {
            return Ok(fail_check(app, runtime, interactive, started));
        }
    };
    let checked = updater.check().await;
    let update = match checked {
        Ok(update) => update,
        Err(_) => return Ok(fail_check(app, runtime, interactive, started)),
    };
    let Some(update) = update else {
        let mut inner = lock(runtime);
        update::record_success(&mut inner.policy, now_ms());
        inner.session.up_to_date();
        persist(&inner);
        publish(app, &mut inner, true);
        log_command("update_check", started, 0, 0, "current", "-");
        return Ok(inner.snapshot());
    };
    if update.download_url.scheme() != "https" {
        return Ok(fail_check(app, runtime, interactive, started));
    }
    let total = content_length(&update.download_url).await;
    let notes = update.body.clone().unwrap_or_default();
    let version = update.version.clone();
    let epoch = {
        let mut inner = lock(runtime);
        update::record_success(&mut inner.policy, now_ms());
        let remind = update::should_prompt(&inner.policy, &version, now_ms());
        let background = inner.policy.download_in_background && !interactive && remind;
        inner
            .session
            .found(&version, &notes, total, background, remind);
        inner.package = Some(Package {
            update,
            bytes: Vec::new(),
        });
        persist(&inner);
        publish(app, &mut inner, true);
        let epoch = inner.epoch;
        let start = background && inner.session.phase == Phase::UpdateAvailable;
        if start && !inner.session.begin_download(false) {
            log_command("update_check", started, total, 0, "available", "-");
            return Ok(inner.snapshot());
        }
        if start {
            publish(app, &mut inner, true);
        }
        log_command("update_check", started, total, 0, "available", "-");
        if start {
            epoch
        } else {
            return Ok(inner.snapshot());
        }
    };
    download(app, runtime, epoch).await;
    Ok(lock(runtime).snapshot())
}

fn fail_check(
    app: &AppHandle,
    runtime: &UpdateRuntime,
    interactive: bool,
    started: Instant,
) -> UpdateSnapshot {
    let mut inner = lock(runtime);
    update::record_failure(&mut inner.policy, now_ms());
    inner.session.check_failed();
    if !interactive {
        inner.session.error.clear();
    }
    inner.package = None;
    persist(&inner);
    publish(app, &mut inner, true);
    log_command(
        "update_check",
        started,
        0,
        0,
        if interactive { "network" } else { "quiet" },
        "-",
    );
    inner.snapshot()
}

async fn download(app: &AppHandle, runtime: &UpdateRuntime, epoch: u64) {
    let started = Instant::now();
    let task = {
        let inner = lock(runtime);
        if inner.epoch != epoch {
            return;
        }
        let Some(package) = inner.package.as_ref() else {
            return;
        };
        package.update.clone()
    };
    let mut received = 0_u64;
    let downloaded = task
        .download(
            |chunk, total| {
                received = received.saturating_add(chunk as u64);
                let mut inner = lock(runtime);
                if inner.epoch != epoch || inner.session.phase != Phase::Downloading {
                    return;
                }
                inner.session.progress(received, total);
                publish(app, &mut inner, false);
            },
            || {},
        )
        .await;
    let mut inner = lock(runtime);
    if inner.epoch != epoch {
        return;
    }
    match downloaded {
        Ok(bytes) => {
            if let Some(package) = inner.package.as_mut() {
                package.bytes = bytes;
            }
            inner.session.finish_download(VerifyOutcome::Accepted);
            publish(app, &mut inner, true);
            log_command("update_download", started, received, 0, "ok", "-");
        }
        Err(error) => {
            if let Some(package) = inner.package.as_mut() {
                package.bytes.clear();
            }
            match classify_download(&error) {
                VerifyOutcome::Rejected => inner.session.finish_download(VerifyOutcome::Rejected),
                VerifyOutcome::Accepted => inner.session.download_failed(),
            }
            publish(app, &mut inner, true);
            log_command(
                "update_download",
                started,
                received,
                0,
                if inner.session.error == ERR_VERIFY {
                    "verify"
                } else {
                    "network"
                },
                "-",
            );
        }
    }
}

#[tauri::command]
pub fn update_state(runtime: State<'_, UpdateRuntime>) -> UpdateSnapshot {
    lock(&runtime).snapshot()
}

#[tauri::command]
pub async fn update_arm(
    app: AppHandle,
    runtime: State<'_, UpdateRuntime>,
) -> Result<UpdateSnapshot, CommandError> {
    let decision = {
        let mut inner = lock(&runtime);
        if inner.armed {
            return Ok(inner.snapshot());
        }
        inner.armed = true;
        if inner.dev_build {
            return Ok(inner.snapshot());
        }
        update::startup_decision(&inner.policy, now_ms())
    };
    if decision == StartupDecision::Skip {
        return Ok(lock(&runtime).snapshot());
    }
    run_check(&app, &runtime, false).await
}

#[tauri::command]
pub async fn update_check(
    app: AppHandle,
    runtime: State<'_, UpdateRuntime>,
) -> Result<UpdateSnapshot, CommandError> {
    {
        let inner = lock(&runtime);
        if inner.dev_build {
            return Ok(inner.snapshot());
        }
    }
    run_check(&app, &runtime, true).await
}

#[tauri::command]
pub async fn update_download(
    app: AppHandle,
    runtime: State<'_, UpdateRuntime>,
) -> Result<UpdateSnapshot, CommandError> {
    let epoch = {
        let mut inner = lock(&runtime);
        if inner.dev_build || inner.package.is_none() {
            return Ok(inner.snapshot());
        }
        if !inner.session.begin_download(true) {
            return Ok(inner.snapshot());
        }
        inner.epoch = inner.epoch.wrapping_add(1);
        publish(&app, &mut inner, true);
        inner.epoch
    };
    download(&app, &runtime, epoch).await;
    Ok(lock(&runtime).snapshot())
}

#[tauri::command]
pub fn update_install(
    app: AppHandle,
    runtime: State<'_, UpdateRuntime>,
) -> Result<UpdateSnapshot, CommandError> {
    let started = Instant::now();
    let package = {
        let mut inner = lock(&runtime);
        if !inner.session.begin_install() {
            log_command("update_install", started, 0, 0, "rejected", "-");
            return Err(command_error("io", ERR_INSTALL));
        }
        publish(&app, &mut inner, true);
        inner.package.take()
    };
    let Some(package) = package else {
        let mut inner = lock(&runtime);
        inner.session.install_failed();
        publish(&app, &mut inner, true);
        return Err(command_error("io", ERR_INSTALL));
    };
    if package.bytes.is_empty() {
        let mut inner = lock(&runtime);
        inner.package = Some(package);
        inner.session.install_failed();
        publish(&app, &mut inner, true);
        return Err(command_error("io", ERR_INSTALL));
    }
    permit_exit(&app);
    match package.update.install(&package.bytes) {
        Ok(()) => {
            log_command(
                "update_install",
                started,
                package.bytes.len() as u64,
                0,
                "ok",
                "-",
            );
            Ok(lock(&runtime).snapshot())
        }
        Err(_) => {
            let mut inner = lock(&runtime);
            inner.package = Some(package);
            inner.session.install_failed();
            if let Some(state) = app.try_state::<AppState>() {
                state
                    .allow_close
                    .store(false, std::sync::atomic::Ordering::SeqCst);
            }
            publish(&app, &mut inner, true);
            log_command("update_install", started, 0, 0, "io", "-");
            Err(command_error("io", ERR_INSTALL))
        }
    }
}

#[tauri::command]
pub fn update_later(app: AppHandle, runtime: State<'_, UpdateRuntime>) -> UpdateSnapshot {
    let mut guard = lock(&runtime);
    let now = now_ms();
    {
        let inner = &mut *guard;
        inner.epoch = inner.epoch.wrapping_add(1);
        inner.package = None;
        let session = &mut inner.session;
        let policy = &mut inner.policy;
        session.later(policy, now);
    }
    persist(&guard);
    publish(&app, &mut guard, true);
    guard.snapshot()
}

#[tauri::command]
pub fn update_policy(
    app: AppHandle,
    runtime: State<'_, UpdateRuntime>,
    check_on_startup: bool,
    download_in_background: bool,
) -> Result<UpdateSnapshot, CommandError> {
    let mut inner = lock(&runtime);
    inner.policy.check_on_startup = check_on_startup;
    inner.policy.download_in_background = download_in_background;
    let Some(path) = inner.path.clone() else {
        return Err(command_error("io", "无法保存设置。"));
    };
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let bytes =
        serde_json::to_vec(&inner.policy).map_err(|_| command_error("io", "无法保存设置。"))?;
    atomic_write(&path, &bytes).map_err(|_| command_error("io", "无法保存设置。"))?;
    publish(&app, &mut inner, true);
    Ok(inner.snapshot())
}
