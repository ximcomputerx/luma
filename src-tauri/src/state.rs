use std::path::PathBuf;
use std::sync::atomic::AtomicBool;
use std::sync::{Mutex, MutexGuard};

use rustmark_core::{DocumentSession, PathJail, Settings};
use serde::Serialize;
use uuid::Uuid;

pub const TAB_LIMIT: usize = 32;

pub struct Session {
    pub jail: PathJail,
    pub settings: Settings,
    pub documents: Vec<DocumentSession>,
    pub active: Uuid,
}

pub struct AppState {
    pub session: Mutex<Session>,
    pub allow_close: AtomicBool,
    pub settings_frozen: AtomicBool,
    pub log_dir: PathBuf,
}

pub fn lock(state: &AppState) -> MutexGuard<'_, Session> {
    state
        .session
        .lock()
        .unwrap_or_else(|error| error.into_inner())
}

#[derive(Clone, Serialize)]
pub struct TabSummary {
    pub document_id: Uuid,
    pub title: String,
    pub path: Option<String>,
}

#[derive(Clone, Serialize)]
pub struct SnapshotResponse {
    #[serde(flatten)]
    pub document: rustmark_core::DocumentSnapshot,
    pub root: Option<String>,
    pub tabs: Vec<TabSummary>,
}

pub fn rebind(session: &mut Session) {
    session.jail.clear_bound();
    for document in &session.documents {
        let Some(path) = &document.path else {
            continue;
        };
        let Some(parent) = path
            .parent()
            .filter(|parent| !parent.as_os_str().is_empty())
        else {
            continue;
        };
        let _ = session.jail.bind_root(parent);
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum CloseEffect {
    Continue,
    Empty,
}

/// Remove one document. The last blank untitled leaves the workspace empty.
/// Any other last document is replaced by a fresh untitled tab.
pub fn close_document(session: &mut Session, document_id: Uuid) -> Result<CloseEffect, ()> {
    let index = session
        .documents
        .iter()
        .position(|document| document.id == document_id)
        .ok_or(())?;
    let closing_active = session.active == document_id;
    let removed = session.documents.remove(index);
    if session.documents.is_empty() {
        if removed.path.is_none() && removed.accepted_lf.is_empty() {
            session.active = Uuid::nil();
            return Ok(CloseEffect::Empty);
        }
        let fresh = DocumentSession::untitled();
        session.active = fresh.id;
        session.documents.push(fresh);
        return Ok(CloseEffect::Continue);
    }
    if closing_active {
        let next = index.min(session.documents.len() - 1);
        session.active = session.documents[next].id;
    }
    Ok(CloseEffect::Continue)
}

#[derive(Serialize)]
pub struct EmptyWorkspace {
    pub empty: bool,
    pub tabs: Vec<TabSummary>,
    pub root: Option<String>,
}

#[derive(Serialize)]
#[serde(untagged)]
pub enum CloseResponse {
    Empty(EmptyWorkspace),
    Open(SnapshotResponse),
}

pub fn snapshot(session: &Session) -> SnapshotResponse {
    let active = session
        .documents
        .iter()
        .find(|document| document.id == session.active)
        .or_else(|| session.documents.first())
        .expect("workspace keeps one document");
    SnapshotResponse {
        document: active.snapshot(),
        root: session
            .jail
            .root()
            .map(|path| path.to_string_lossy().into_owned()),
        tabs: session
            .documents
            .iter()
            .map(|document| TabSummary {
                document_id: document.id,
                title: document.title.clone(),
                path: document
                    .path
                    .as_ref()
                    .map(|path| path.to_string_lossy().into_owned()),
            })
            .collect(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rustmark_core::NewlineStyle;
    use std::path::PathBuf;

    fn session_with(documents: Vec<DocumentSession>) -> Session {
        let active = documents
            .first()
            .map(|document| document.id)
            .unwrap_or_else(Uuid::nil);
        Session {
            jail: PathJail::default(),
            settings: Settings::default(),
            documents,
            active,
        }
    }

    #[test]
    fn closing_the_only_blank_untitled_leaves_no_document() {
        let document = DocumentSession::untitled();
        let id = document.id;
        let mut session = session_with(vec![document]);
        assert_eq!(close_document(&mut session, id), Ok(CloseEffect::Empty));
        assert!(session.documents.is_empty());
    }

    #[test]
    fn closing_the_only_saved_file_keeps_a_fresh_untitled() {
        let document = DocumentSession::opened(
            PathBuf::from("note.md"),
            String::new(),
            NewlineStyle::Lf,
            None,
        );
        let id = document.id;
        let mut session = session_with(vec![document]);
        assert_eq!(close_document(&mut session, id), Ok(CloseEffect::Continue));
        assert_eq!(session.documents.len(), 1);
        assert!(session.documents[0].path.is_none());
        assert_ne!(session.documents[0].id, id);
    }

    #[test]
    fn closing_one_tab_keeps_the_other() {
        let first = DocumentSession::untitled();
        let second = DocumentSession::opened(
            PathBuf::from("note.md"),
            "x".to_string(),
            NewlineStyle::Lf,
            None,
        );
        let first_id = first.id;
        let second_id = second.id;
        let mut session = session_with(vec![first, second]);
        session.active = second_id;
        assert_eq!(
            close_document(&mut session, first_id),
            Ok(CloseEffect::Continue)
        );
        assert_eq!(session.documents.len(), 1);
        assert_eq!(session.documents[0].id, second_id);
        assert_eq!(session.active, second_id);
    }
}
