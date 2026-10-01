use serde::{Deserialize, Serialize};

pub const CHECK_INTERVAL_MS: u64 = 24 * 60 * 60 * 1000;
pub const FAILURE_BACKOFF_MS: u64 = 60 * 60 * 1000;
pub const REMIND_DELAY_MS: u64 = 24 * 60 * 60 * 1000;
pub const NOTES_LIMIT: usize = 4_000;

pub const ERR_CHECK: &str = "无法检查更新";
pub const ERR_VERIFY: &str = "无法验证更新";
pub const ERR_DOWNLOAD: &str = "无法下载更新";
pub const ERR_INSTALL: &str = "无法安装更新";

fn default_true() -> bool {
    true
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct UpdatePolicy {
    #[serde(default = "default_true")]
    pub check_on_startup: bool,
    #[serde(default)]
    pub download_in_background: bool,
    #[serde(default)]
    pub last_check_ms: u64,
    #[serde(default)]
    pub last_attempt_ms: u64,
    #[serde(default)]
    pub remind_after_ms: u64,
    #[serde(default)]
    pub seen_version: String,
}

impl Default for UpdatePolicy {
    fn default() -> Self {
        Self {
            check_on_startup: true,
            download_in_background: false,
            last_check_ms: 0,
            last_attempt_ms: 0,
            remind_after_ms: 0,
            seen_version: String::new(),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum StartupDecision {
    Skip,
    Check,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Phase {
    Idle,
    Checking,
    UpdateAvailable,
    Downloading,
    Downloaded,
    Installing,
}

impl Phase {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Idle => "idle",
            Self::Checking => "checking",
            Self::UpdateAvailable => "update_available",
            Self::Downloading => "downloading",
            Self::Downloaded => "downloaded",
            Self::Installing => "installing",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum VerifyOutcome {
    Accepted,
    Rejected,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Session {
    pub phase: Phase,
    pub interactive: bool,
    pub prompt: bool,
    pub install_when_ready: bool,
    pub error: String,
    pub available_version: String,
    pub notes: String,
    pub downloaded_bytes: u64,
    pub total_bytes: u64,
}

impl Default for Session {
    fn default() -> Self {
        Self {
            phase: Phase::Idle,
            interactive: false,
            prompt: false,
            install_when_ready: false,
            error: String::new(),
            available_version: String::new(),
            notes: String::new(),
            downloaded_bytes: 0,
            total_bytes: 0,
        }
    }
}

pub fn load_policy(bytes: &[u8]) -> UpdatePolicy {
    serde_json::from_slice(bytes).unwrap_or_default()
}

pub fn startup_decision(policy: &UpdatePolicy, now_ms: u64) -> StartupDecision {
    if !policy.check_on_startup {
        return StartupDecision::Skip;
    }
    if policy.last_attempt_ms > policy.last_check_ms {
        if now_ms.saturating_sub(policy.last_attempt_ms) < FAILURE_BACKOFF_MS {
            return StartupDecision::Skip;
        }
        return StartupDecision::Check;
    }
    if policy.last_check_ms > 0 && now_ms.saturating_sub(policy.last_check_ms) < CHECK_INTERVAL_MS {
        return StartupDecision::Skip;
    }
    StartupDecision::Check
}

pub fn record_success(policy: &mut UpdatePolicy, now_ms: u64) {
    policy.last_check_ms = now_ms;
}

pub fn record_failure(policy: &mut UpdatePolicy, now_ms: u64) {
    policy.last_attempt_ms = now_ms;
}

pub fn remind_later(policy: &mut UpdatePolicy, version: &str, now_ms: u64) {
    policy.seen_version = version.to_string();
    policy.remind_after_ms = now_ms.saturating_add(REMIND_DELAY_MS);
}

pub fn should_prompt(policy: &UpdatePolicy, version: &str, now_ms: u64) -> bool {
    if policy.seen_version != version {
        return true;
    }
    now_ms >= policy.remind_after_ms
}

pub fn is_newer(current: &str, remote: &str) -> bool {
    match (parse_version(current), parse_version(remote)) {
        (Some(current), Some(remote)) => is_newer_version(&current, &remote),
        _ => false,
    }
}

pub fn is_newer_version(current: &semver::Version, remote: &semver::Version) -> bool {
    if !remote.pre.is_empty() && current.pre.is_empty() {
        return false;
    }
    remote > current
}

fn parse_version(raw: &str) -> Option<semver::Version> {
    let trimmed = raw.trim();
    let trimmed = trimmed
        .strip_prefix('v')
        .or_else(|| trimmed.strip_prefix('V'))
        .unwrap_or(trimmed);
    semver::Version::parse(trimmed).ok()
}

pub fn display_notes(notes: &str) -> String {
    let mut count = 0;
    for (index, _) in notes.char_indices() {
        if count == NOTES_LIMIT {
            return notes[..index].to_string();
        }
        count += 1;
    }
    notes.to_string()
}

pub fn can_check(phase: Phase) -> bool {
    matches!(
        phase,
        Phase::Idle | Phase::UpdateAvailable | Phase::Downloaded
    )
}

pub fn can_install(phase: Phase) -> bool {
    phase == Phase::Downloaded
}

impl Session {
    pub fn begin_check(&mut self, interactive: bool) -> bool {
        if !can_check(self.phase) {
            return false;
        }
        self.interactive = interactive;
        self.phase = Phase::Checking;
        self.prompt = false;
        self.install_when_ready = false;
        self.error.clear();
        true
    }

    pub fn check_failed(&mut self) {
        let interactive = self.interactive;
        *self = Session {
            interactive,
            error: if interactive {
                ERR_CHECK.to_string()
            } else {
                String::new()
            },
            ..Session::default()
        };
    }

    pub fn up_to_date(&mut self) {
        let interactive = self.interactive;
        *self = Session {
            interactive,
            ..Session::default()
        };
    }

    pub fn found(
        &mut self,
        version: &str,
        notes: &str,
        total_bytes: u64,
        background: bool,
        remind: bool,
    ) {
        self.available_version = version.to_string();
        self.notes = display_notes(notes);
        self.total_bytes = total_bytes;
        self.downloaded_bytes = 0;
        self.install_when_ready = false;
        self.error.clear();
        if !self.interactive && !remind {
            self.phase = Phase::Idle;
            self.prompt = false;
            return;
        }
        self.phase = Phase::UpdateAvailable;
        self.prompt = self.interactive || !background;
    }

    pub fn begin_download(&mut self, install_after: bool) -> bool {
        if self.phase != Phase::UpdateAvailable {
            return false;
        }
        if install_after {
            self.interactive = true;
        }
        self.phase = Phase::Downloading;
        self.install_when_ready = install_after;
        self.downloaded_bytes = 0;
        self.error.clear();
        self.prompt = self.interactive;
        true
    }

    pub fn progress(&mut self, downloaded_bytes: u64, total_bytes: Option<u64>) {
        if self.phase != Phase::Downloading {
            return;
        }
        self.downloaded_bytes = downloaded_bytes;
        if let Some(total) = total_bytes {
            if total > 0 {
                self.total_bytes = total;
            }
        }
    }

    pub fn finish_download(&mut self, outcome: VerifyOutcome) {
        match outcome {
            VerifyOutcome::Accepted => {
                self.phase = Phase::Downloaded;
                self.error.clear();
                self.prompt = true;
                if self.total_bytes == 0 {
                    self.total_bytes = self.downloaded_bytes;
                }
            }
            VerifyOutcome::Rejected => {
                self.phase = Phase::UpdateAvailable;
                self.downloaded_bytes = 0;
                self.install_when_ready = false;
                self.error = ERR_VERIFY.to_string();
                self.prompt = true;
            }
        }
    }

    pub fn download_failed(&mut self) {
        self.phase = Phase::UpdateAvailable;
        self.downloaded_bytes = 0;
        self.install_when_ready = false;
        self.error = ERR_DOWNLOAD.to_string();
        self.prompt = true;
    }

    pub fn begin_install(&mut self) -> bool {
        if !can_install(self.phase) {
            return false;
        }
        self.phase = Phase::Installing;
        self.prompt = true;
        self.install_when_ready = false;
        self.error.clear();
        true
    }

    pub fn install_failed(&mut self) {
        self.phase = Phase::Downloaded;
        self.prompt = true;
        self.install_when_ready = false;
        self.error = ERR_INSTALL.to_string();
    }

    pub fn later(&mut self, policy: &mut UpdatePolicy, now_ms: u64) {
        if !self.available_version.is_empty() {
            remind_later(policy, &self.available_version, now_ms);
        }
        let interactive = self.interactive;
        *self = Session {
            interactive,
            ..Session::default()
        };
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const DAY: u64 = CHECK_INTERVAL_MS;
    const HOUR: u64 = FAILURE_BACKOFF_MS;

    #[test]
    fn semver_orders_minor_and_patch_numerically() {
        assert!(is_newer("1.1.0", "1.2.0"));
        assert!(is_newer("1.9.0", "1.10.0"));
        assert!(!is_newer("1.2.0", "1.2.0"));
        assert!(is_newer("1.2.0", "v1.2.1"));
        assert!(!is_newer("1.2.0", "1.3.0-beta.1"));
        assert!(is_newer("1.2.0-beta.1", "1.2.0"));
        assert!(!is_newer("1.2.0", "1.1.9"));
        assert!(!is_newer("nope", "1.0.0"));
    }

    #[test]
    fn startup_waits_a_day_and_backs_off_after_failure() {
        let mut policy = UpdatePolicy::default();
        assert_eq!(startup_decision(&policy, 0), StartupDecision::Check);
        record_success(&mut policy, 1_000);
        assert_eq!(
            startup_decision(&policy, 1_000 + DAY - 1),
            StartupDecision::Skip
        );
        assert_eq!(
            startup_decision(&policy, 1_000 + DAY),
            StartupDecision::Check
        );

        record_failure(&mut policy, 5_000);
        assert_eq!(policy.last_check_ms, 1_000);
        assert_eq!(
            startup_decision(&policy, 5_000 + HOUR - 1),
            StartupDecision::Skip
        );
        assert_eq!(
            startup_decision(&policy, 5_000 + HOUR),
            StartupDecision::Check
        );

        record_success(&mut policy, 9_000);
        assert_eq!(
            startup_decision(&policy, 9_000 + HOUR),
            StartupDecision::Skip
        );
    }

    #[test]
    fn disabled_startup_check_never_runs() {
        let policy = UpdatePolicy {
            check_on_startup: false,
            ..UpdatePolicy::default()
        };
        assert_eq!(startup_decision(&policy, 0), StartupDecision::Skip);
    }

    #[test]
    fn later_hides_one_version_until_the_next_day() {
        let mut policy = UpdatePolicy::default();
        let mut session = Session::default();
        session.found("1.2.0", "notes", 10, false, true);
        session.later(&mut policy, 100);
        assert_eq!(session.phase, Phase::Idle);
        assert!(!session.prompt);
        assert!(!should_prompt(&policy, "1.2.0", 100 + DAY - 1));
        assert!(should_prompt(&policy, "1.2.0", 100 + DAY));
        assert!(should_prompt(&policy, "1.3.0", 100));
    }

    #[test]
    fn notes_stay_plain_text_and_stop_at_four_thousand_chars() {
        let notes = format!("<script>alert(1)</script>{}", "中".repeat(NOTES_LIMIT));
        let shown = display_notes(&notes);
        assert!(shown.starts_with("<script>alert(1)</script>"));
        assert_eq!(shown.chars().count(), NOTES_LIMIT);
        assert_eq!(shown, notes.chars().take(NOTES_LIMIT).collect::<String>());
    }

    #[test]
    fn install_requires_a_verified_package() {
        let mut session = Session::default();
        assert!(!session.begin_install());
        session.found("1.2.0", "body", 4, false, true);
        assert!(!can_install(session.phase));
        assert!(session.begin_download(true));
        session.finish_download(VerifyOutcome::Accepted);
        assert!(can_install(session.phase));
        assert!(session.begin_install());
        assert_eq!(session.phase, Phase::Installing);
    }

    #[test]
    fn rejected_signature_returns_to_the_offer() {
        let mut session = Session::default();
        session.interactive = true;
        session.found("1.2.0", "body", 4, false, true);
        assert!(session.begin_download(true));
        session.finish_download(VerifyOutcome::Rejected);
        assert_eq!(session.phase, Phase::UpdateAvailable);
        assert_eq!(session.error, ERR_VERIFY);
        assert_eq!(session.downloaded_bytes, 0);
        assert!(!session.install_when_ready);
        assert!(session.prompt);
    }

    #[test]
    fn automatic_check_failure_stays_quiet() {
        let mut session = Session::default();
        assert!(session.begin_check(false));
        session.check_failed();
        assert_eq!(session.phase, Phase::Idle);
        assert!(session.error.is_empty());
        assert!(!session.prompt);

        assert!(session.begin_check(true));
        session.check_failed();
        assert_eq!(session.error, ERR_CHECK);
    }

    #[test]
    fn background_download_waits_to_show_the_card() {
        let mut session = Session::default();
        session.interactive = false;
        session.found("1.2.0", "body", 99, true, true);
        assert_eq!(session.phase, Phase::UpdateAvailable);
        assert!(!session.prompt);
        assert!(session.begin_download(false));
        assert!(!session.prompt);
        session.finish_download(VerifyOutcome::Accepted);
        assert_eq!(session.phase, Phase::Downloaded);
        assert!(session.prompt);
        assert!(!session.install_when_ready);
    }

    #[test]
    fn download_failure_can_be_retried() {
        let mut session = Session::default();
        session.found("1.2.0", "body", 1, false, true);
        assert!(session.begin_download(true));
        session.download_failed();
        assert_eq!(session.phase, Phase::UpdateAvailable);
        assert_eq!(session.error, ERR_DOWNLOAD);
        assert!(session.begin_download(true));
    }

    #[test]
    fn remind_window_suppresses_a_startup_offer() {
        let mut session = Session::default();
        session.found("1.2.0", "body", 1, false, false);
        assert_eq!(session.phase, Phase::Idle);
        assert!(!session.prompt);
    }

    #[test]
    fn corrupt_policy_uses_defaults() {
        let policy = load_policy(br#"{"check_on_startup": false, "extra": 1}"#);
        assert!(!policy.check_on_startup);
        assert!(!policy.download_in_background);
        assert_eq!(load_policy(b"not json").check_on_startup, true);
        assert!(load_policy(b"{}").check_on_startup);
    }
}
