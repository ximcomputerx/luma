pub fn accept_family(name: &str) -> bool {
    let name = name.trim();
    !name.is_empty() && !name.starts_with('@') && name.chars().count() <= 64
}

pub fn system_font_families() -> Vec<String> {
    #[cfg(windows)]
    {
        windows_families()
    }
    #[cfg(not(windows))]
    {
        Vec::new()
    }
}

#[cfg(windows)]
fn windows_families() -> Vec<String> {
    use std::collections::BTreeSet;

    use windows::Win32::Foundation::LPARAM;
    use windows::Win32::Graphics::Gdi::{
        CreateCompatibleDC, DeleteDC, EnumFontFamiliesExW, DEFAULT_CHARSET, FONTENUMPROCW,
        LOGFONTW, TEXTMETRICW,
    };

    unsafe extern "system" fn collect(
        logfont: *const LOGFONTW,
        _metric: *const TEXTMETRICW,
        _font_type: u32,
        lparam: LPARAM,
    ) -> i32 {
        if logfont.is_null() || lparam.0 == 0 {
            return 1;
        }
        let face = unsafe { &(*logfont).lfFaceName };
        let end = face
            .iter()
            .position(|unit| *unit == 0)
            .unwrap_or(face.len());
        let name = String::from_utf16_lossy(&face[..end]);
        if accept_family(&name) {
            let names = unsafe { &mut *(lparam.0 as *mut BTreeSet<String>) };
            names.insert(name.trim().to_string());
        }
        1
    }

    let mut names = BTreeSet::new();
    let logfont = LOGFONTW {
        lfCharSet: DEFAULT_CHARSET,
        ..LOGFONTW::default()
    };
    let dc = unsafe { CreateCompatibleDC(None) };
    if dc.is_invalid() {
        return Vec::new();
    }
    let callback: FONTENUMPROCW = Some(collect);
    unsafe {
        EnumFontFamiliesExW(
            dc,
            &logfont,
            callback,
            LPARAM(&mut names as *mut BTreeSet<String> as isize),
            0,
        );
        let _ = DeleteDC(dc);
    }
    names.into_iter().collect()
}

#[cfg(test)]
mod tests {
    use super::accept_family;

    #[test]
    fn skips_vertical_and_blank_names() {
        assert!(accept_family("微软雅黑"));
        assert!(accept_family("Cascadia Code"));
        assert!(!accept_family("@宋体"));
        assert!(!accept_family("  "));
        assert!(!accept_family(""));
    }

    #[cfg(windows)]
    #[test]
    fn lists_installed_families() {
        let names = super::system_font_families();
        assert!(
            names.len() > 8,
            "expected installed fonts, got {}",
            names.len()
        );
        assert!(names.iter().all(|name| accept_family(name)));
        assert_eq!(
            names.len(),
            names
                .iter()
                .collect::<std::collections::BTreeSet<_>>()
                .len()
        );
    }
}
