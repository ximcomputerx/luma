use rustmark_core::{GlassMode, Settings};
use tauri::utils::config::WindowEffectsConfig;
use tauri::webview::WebviewWindow;
use tauri::window::{Effect, EffectsBuilder};

pub fn glass_active(settings: &Settings) -> bool {
    if settings.glass != GlassMode::Auto {
        return false;
    }
    if cfg!(target_os = "linux") {
        return false;
    }
    if cfg!(target_os = "macos") {
        return true;
    }
    if cfg!(windows) {
        return windows_build() >= 22_000;
    }
    false
}

pub fn apply_glass(window: &WebviewWindow, settings: &Settings) {
    if !glass_active(settings) {
        let _ = window.set_effects(None::<WindowEffectsConfig>);
        return;
    }
    let effect = if cfg!(windows) {
        Effect::Mica
    } else {
        Effect::HudWindow
    };
    let _ = window.set_effects(EffectsBuilder::new().effect(effect).build());
}

fn windows_build() -> u32 {
    #[cfg(windows)]
    {
        #[repr(C)]
        struct Version {
            size: u32,
            major: u32,
            minor: u32,
            build: u32,
            platform: u32,
            csd: [u16; 128],
        }
        #[link(name = "ntdll")]
        extern "system" {
            fn RtlGetVersion(info: *mut Version) -> i32;
        }
        unsafe {
            let mut info = std::mem::zeroed::<Version>();
            info.size = std::mem::size_of::<Version>() as u32;
            let _ = RtlGetVersion(&mut info);
            info.build
        }
    }
    #[cfg(not(windows))]
    {
        0
    }
}
