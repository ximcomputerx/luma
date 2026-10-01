use std::sync::atomic::Ordering;

use tauri::{AppHandle, State};

use crate::association::{current_state, launch_default_ui, register_current};
use crate::error::CommandError;
use crate::logging::log_command;
use crate::settings_store::persist_settings;
use crate::state::{self, AppState};

#[derive(serde::Serialize)]
pub struct AssociationBody {
    pub state: &'static str,
}

#[tauri::command]
pub fn association_status() -> AssociationBody {
    AssociationBody {
        state: current_state(),
    }
}

#[tauri::command]
pub async fn association_decide(
    app: AppHandle,
    state: State<'_, AppState>,
    make_default: bool,
) -> Result<AssociationBody, CommandError> {
    let started = std::time::Instant::now();
    if make_default {
        if let Err(error) = register_current() {
            log_command("association_decide", started, 0, 0, &error.code, "-");
            return Err(error);
        }
        let launched = launch_default_ui();
        let saved = remember_prompt(&app, &state);
        if let Err(error) = launched {
            log_command("association_decide", started, 0, 0, &error.code, "-");
            return Err(error);
        }
        if let Err(error) = saved {
            if error.code != "invalid_settings" {
                log_command("association_decide", started, 0, 0, &error.code, "-");
                return Err(error);
            }
        }
    } else {
        remember_prompt(&app, &state)?;
    }
    let body = association_status();
    log_command("association_decide", started, 0, 0, "ok", body.state);
    Ok(body)
}

fn remember_prompt(app: &AppHandle, state: &AppState) -> Result<(), CommandError> {
    let frozen = state.settings_frozen.load(Ordering::SeqCst);
    if frozen {
        return Err(crate::error::command_error(
            "invalid_settings",
            "设置文件版本较新，不会改写。",
        ));
    }
    let settings = {
        let mut session = state::lock(state);
        session.settings.association_prompted = true;
        session.settings.clone()
    };
    persist_settings(app, &settings, false)
}
