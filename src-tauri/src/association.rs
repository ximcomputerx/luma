use std::path::Path;

use crate::error::{association_failed, CommandError};
use crate::open_request::MARKDOWN_EXTENSIONS;

pub const PROG_ID: &str = "Luma.md";
pub const APP_NAME: &str = "Luma";
const DESCRIPTION: &str = "Luma Markdown Document";
const CAPABILITIES: &str = r"Software\Luma\Capabilities";

pub fn open_command(exe: &Path) -> String {
    format!("\"{}\" \"%1\"", exe.display())
}

pub fn icon_location(exe: &Path) -> String {
    format!("\"{}\",0", exe.display())
}

/// `choices` is one UserChoice ProgId per markdown extension, in extension order.
pub fn state_from(registered: bool, choices: &[Option<&str>]) -> &'static str {
    if !registered {
        return "unregistered";
    }
    if choices.len() == MARKDOWN_EXTENSIONS.len()
        && choices.iter().all(|choice| *choice == Some(PROG_ID))
    {
        "default"
    } else {
        "registered"
    }
}

pub fn current_state() -> &'static str {
    platform::current_state()
}

pub fn register_current() -> Result<(), CommandError> {
    let exe = std::env::current_exe().map_err(|_| association_failed())?;
    platform::register(&exe)
}

pub fn launch_default_ui() -> Result<(), CommandError> {
    platform::launch_default_ui()
}

#[cfg(windows)]
mod platform {
    use std::path::Path;

    use windows::core::PCWSTR;
    use windows::Win32::Foundation::ERROR_SUCCESS;
    use windows::Win32::System::Com::{
        CoCreateInstance, CoInitializeEx, CoUninitialize, CLSCTX_INPROC_SERVER,
        COINIT_APARTMENTTHREADED,
    };
    use windows::Win32::System::Registry::{
        RegCloseKey, RegCreateKeyW, RegOpenKeyExW, RegQueryValueExW, RegSetValueExW, HKEY,
        HKEY_CURRENT_USER, KEY_QUERY_VALUE, KEY_READ, REG_SZ,
    };
    use windows::Win32::UI::Shell::{
        ApplicationAssociationRegistrationUI, IApplicationAssociationRegistrationUI,
        SHChangeNotify, SHCNE_ASSOCCHANGED, SHCNF_FLUSHNOWAIT, SHCNF_IDLIST,
    };

    use super::{
        icon_location, open_command, state_from, APP_NAME, CAPABILITIES, DESCRIPTION, PROG_ID,
    };
    use crate::error::{association_failed, CommandError};
    use crate::open_request::MARKDOWN_EXTENSIONS;

    pub fn current_state() -> &'static str {
        let registered = key_exists(r"Software\Classes\Luma.md");
        let choices: Vec<Option<String>> = MARKDOWN_EXTENSIONS
            .iter()
            .map(|ext| {
                query_sz(
                    &format!(
                        r"Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\.{ext}\UserChoice"
                    ),
                    "ProgId",
                )
            })
            .collect();
        let borrowed: Vec<Option<&str>> = choices.iter().map(|item| item.as_deref()).collect();
        state_from(registered, &borrowed)
    }

    pub fn register(exe: &Path) -> Result<(), CommandError> {
        let command = open_command(exe);
        let icon = icon_location(exe);
        set_sz(r"Software\Classes\Luma.md", "", DESCRIPTION)?;
        set_sz(r"Software\Classes\Luma.md\DefaultIcon", "", &icon)?;
        set_sz(r"Software\Classes\Luma.md\shell\open\command", "", &command)?;
        for ext in MARKDOWN_EXTENSIONS {
            set_sz(
                &format!(r"Software\Classes\.{ext}\OpenWithProgids"),
                PROG_ID,
                "",
            )?;
        }
        set_sz(CAPABILITIES, "ApplicationName", APP_NAME)?;
        set_sz(CAPABILITIES, "ApplicationDescription", DESCRIPTION)?;
        set_sz(CAPABILITIES, "ApplicationIcon", &icon)?;
        for ext in MARKDOWN_EXTENSIONS {
            set_sz(
                &format!(r"{CAPABILITIES}\FileAssociations"),
                &format!(".{ext}"),
                PROG_ID,
            )?;
        }
        set_sz(r"Software\RegisteredApplications", APP_NAME, CAPABILITIES)?;
        unsafe {
            SHChangeNotify(
                SHCNE_ASSOCCHANGED,
                SHCNF_IDLIST | SHCNF_FLUSHNOWAIT,
                None,
                None,
            );
        }
        Ok(())
    }

    pub fn launch_default_ui() -> Result<(), CommandError> {
        let joined = std::thread::Builder::new()
            .name("luma-association".to_string())
            .spawn(|| unsafe { show_association_ui() })
            .map_err(|_| association_failed())?;
        joined.join().unwrap_or(Err(association_failed()))
    }

    unsafe fn show_association_ui() -> Result<(), CommandError> {
        let started = unsafe { CoInitializeEx(None, COINIT_APARTMENTTHREADED) };
        if started.is_err() {
            return Err(association_failed());
        }
        let owned = started == windows::core::HRESULT(0);
        let app_name = wide_name(APP_NAME);
        let result = unsafe {
            CoCreateInstance::<_, IApplicationAssociationRegistrationUI>(
                &ApplicationAssociationRegistrationUI,
                None,
                CLSCTX_INPROC_SERVER,
            )
            .and_then(|ui| ui.LaunchAdvancedAssociationUI(pcw(&app_name)))
        };
        if owned {
            unsafe { CoUninitialize() };
        }
        result.map_err(|_| association_failed())
    }

    fn set_sz(key: &str, name: &str, value: &str) -> Result<(), CommandError> {
        unsafe {
            let key_units = wide_name(key);
            let name_units = wide_name(name);
            let mut raw = HKEY::default();
            let created = RegCreateKeyW(HKEY_CURRENT_USER, pcw(&key_units), &mut raw);
            if created != ERROR_SUCCESS {
                return Err(association_failed());
            }
            let bytes = utf16_bytes(value);
            let written = RegSetValueExW(raw, pcw(&name_units), Some(0), REG_SZ, Some(&bytes));
            let _ = RegCloseKey(raw);
            if written == ERROR_SUCCESS {
                Ok(())
            } else {
                Err(association_failed())
            }
        }
    }

    fn query_sz(key: &str, name: &str) -> Option<String> {
        unsafe {
            let key_units = wide_name(key);
            let name_units = wide_name(name);
            let mut raw = HKEY::default();
            if RegOpenKeyExW(
                HKEY_CURRENT_USER,
                pcw(&key_units),
                Some(0),
                KEY_QUERY_VALUE,
                &mut raw,
            ) != ERROR_SUCCESS
            {
                return None;
            }
            let mut size = 0u32;
            let probed = RegQueryValueExW(raw, pcw(&name_units), None, None, None, Some(&mut size));
            if probed != ERROR_SUCCESS || size < 2 {
                let _ = RegCloseKey(raw);
                return None;
            }
            let mut buffer = vec![0u8; size as usize];
            let read = RegQueryValueExW(
                raw,
                pcw(&name_units),
                None,
                None,
                Some(buffer.as_mut_ptr()),
                Some(&mut size),
            );
            let _ = RegCloseKey(raw);
            if read != ERROR_SUCCESS {
                return None;
            }
            let words = (size as usize / 2).min(buffer.len() / 2);
            let units: Vec<u16> = buffer
                .chunks_exact(2)
                .take(words)
                .map(|pair| u16::from_le_bytes([pair[0], pair[1]]))
                .take_while(|unit| *unit != 0)
                .collect();
            Some(String::from_utf16_lossy(&units))
        }
    }

    fn key_exists(key: &str) -> bool {
        unsafe {
            let key_units = wide_name(key);
            let mut raw = HKEY::default();
            let opened = RegOpenKeyExW(
                HKEY_CURRENT_USER,
                pcw(&key_units),
                Some(0),
                KEY_READ,
                &mut raw,
            );
            if opened == ERROR_SUCCESS {
                let _ = RegCloseKey(raw);
                true
            } else {
                false
            }
        }
    }

    fn wide_name(text: &str) -> Vec<u16> {
        text.encode_utf16().chain(std::iter::once(0)).collect()
    }

    fn pcw(units: &[u16]) -> PCWSTR {
        PCWSTR(units.as_ptr())
    }

    fn utf16_bytes(text: &str) -> Vec<u8> {
        text.encode_utf16()
            .chain(std::iter::once(0))
            .flat_map(|unit| unit.to_le_bytes())
            .collect()
    }
}

#[cfg(not(windows))]
mod platform {
    use std::path::Path;

    use crate::error::{association_failed, CommandError};

    pub fn current_state() -> &'static str {
        "unsupported"
    }

    pub fn register(_exe: &Path) -> Result<(), CommandError> {
        Err(association_failed())
    }

    pub fn launch_default_ui() -> Result<(), CommandError> {
        Err(association_failed())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    #[test]
    fn open_command_quotes_spaces() {
        let exe = Path::new(r"C:\Program Files\Luma\luma.exe");
        assert_eq!(
            open_command(exe),
            r#""C:\Program Files\Luma\luma.exe" "%1""#
        );
        assert_eq!(icon_location(exe), r#""C:\Program Files\Luma\luma.exe",0"#);
    }

    #[test]
    fn default_requires_every_extension() {
        assert_eq!(state_from(false, &[Some(PROG_ID); 4]), "unregistered");
        assert_eq!(state_from(true, &[Some(PROG_ID); 4]), "default");
        assert_eq!(
            state_from(
                true,
                &[Some(PROG_ID), Some(PROG_ID), None, Some("VSCode.md")]
            ),
            "registered"
        );
        assert_eq!(state_from(true, &[None, None, None, None]), "registered");
    }
}
