use std::net::IpAddr;
use std::path::{Component, Path, PathBuf};

use url::{Host, Url};

/// What the preview may do with an image destination.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ImageDestination {
    /// Relative path or `file:`. Phase 0 never fetches these.
    Placeholder,
    /// `https` URL with a DNS host, no userinfo, and port 443.
    AllowedHttps(String),
    /// Explicitly refused: IP literals, localhost, odd ports, non-https schemes.
    Rejected,
}

/// A local image the shell is not allowed to read by itself.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum LocalImage {
    /// Path relative to the note's directory. No `..`, no scheme, no drive.
    Relative(PathBuf),
    /// `file:` URL. Still has to pass the jail before any byte is read.
    File(PathBuf),
}

/// Relative note assets and `file:` URLs. Everything else is not a local read.
pub fn local_image_source(raw: &str) -> Option<LocalImage> {
    let raw = raw.trim();
    if raw.is_empty()
        || raw.len() > 1024
        || raw.contains(['\0', '\n', '\r', '\\'])
        || raw.starts_with("//")
    {
        return None;
    }
    if !has_scheme(raw) {
        let path = Path::new(raw);
        if path.is_absolute()
            || path.components().any(|component| {
                matches!(
                    component,
                    Component::ParentDir | Component::RootDir | Component::Prefix(_)
                )
            })
            || path.components().next().is_none()
        {
            return None;
        }
        return Some(LocalImage::Relative(path.to_path_buf()));
    }
    let scheme = raw.split(':').next()?.to_ascii_lowercase();
    if scheme != "file" {
        return None;
    }
    let url = Url::parse(raw).ok()?;
    let path = url.to_file_path().ok()?;
    if path
        .components()
        .any(|component| component == Component::ParentDir)
    {
        return None;
    }
    Some(LocalImage::File(path))
}

/// Classify a markdown image destination.
///
/// Protocol-relative URLs and backslash tricks are rejected. Hostnames are not
/// resolved, so a public name that later redirects remains a known gap.
pub fn classify_image_destination(raw: &str) -> ImageDestination {
    let raw = raw.trim();
    if raw.is_empty() {
        return ImageDestination::Placeholder;
    }
    if raw.starts_with("//") || raw.contains('\\') || raw.len() > 2048 {
        return ImageDestination::Rejected;
    }
    if !has_scheme(raw) {
        return ImageDestination::Placeholder;
    }
    let scheme = raw.split(':').next().unwrap_or("").to_ascii_lowercase();
    if scheme == "file" {
        return ImageDestination::Placeholder;
    }
    if scheme != "https" {
        return ImageDestination::Rejected;
    }
    let Ok(url) = Url::parse(raw) else {
        return ImageDestination::Rejected;
    };
    if !url.username().is_empty() || url.password().is_some() {
        return ImageDestination::Rejected;
    }
    if !matches!(url.port(), None | Some(443)) {
        return ImageDestination::Rejected;
    }
    match url.host() {
        Some(Host::Domain(domain)) if domain_is_public_dns(domain) => {
            ImageDestination::AllowedHttps(url.to_string())
        }
        _ => ImageDestination::Rejected,
    }
}

fn has_scheme(raw: &str) -> bool {
    let Some((scheme, _)) = raw.split_once(':') else {
        return false;
    };
    let mut chars = scheme.chars();
    let Some(first) = chars.next() else {
        return false;
    };
    first.is_ascii_alphabetic()
        && chars.all(|c| c.is_ascii_alphanumeric() || c == '+' || c == '-' || c == '.')
}

fn domain_is_public_dns(domain: &str) -> bool {
    if domain.parse::<IpAddr>().is_ok() {
        return false;
    }
    let trimmed = domain.trim_end_matches('.').to_ascii_lowercase();
    if trimmed == "localhost" || trimmed.starts_with("localhost.") {
        return false;
    }
    trimmed.chars().any(|c| c.is_ascii_alphabetic())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_plain_https() {
        let class = classify_image_destination("https://example.com/a.png");
        assert!(matches!(class, ImageDestination::AllowedHttps(_)));
    }

    #[test]
    fn rejects_private_and_tricky_targets() {
        for raw in [
            "https://127.0.0.1/a.png",
            "https://[::1]/a.png",
            "https://10.1.2.3/a.png",
            "https://169.254.169.254/latest",
            "https://localhost/a.png",
            "https://LOCALHOST/a.png",
            "https://example.com:8443/a.png",
            "https://user@example.com/a.png",
            "http://example.com/a.png",
            "//example.com/a.png",
            "https://example.com\\@evil.test/a.png",
            "javascript:alert(1)",
        ] {
            assert!(
                matches!(classify_image_destination(raw), ImageDestination::Rejected),
                "{raw}"
            );
        }
    }

    #[test]
    fn local_sources_reject_escapes() {
        assert!(matches!(
            local_image_source("assets/a.png"),
            Some(LocalImage::Relative(_))
        ));
        assert!(local_image_source("../secret.png").is_none());
        assert!(local_image_source("/etc/passwd").is_none());
        assert!(local_image_source("C:/secret.png").is_none());
        assert!(local_image_source("https://example.com/a.png").is_none());
        assert!(local_image_source("javascript:alert(1)").is_none());
        assert!(local_image_source(r"assets\a.png").is_none());
    }

    #[test]
    fn relative_and_file_are_placeholders() {
        assert!(matches!(
            classify_image_destination("assets/a.png"),
            ImageDestination::Placeholder
        ));
        assert!(matches!(
            classify_image_destination("file:///C:/secret.png"),
            ImageDestination::Placeholder
        ));
    }
}
