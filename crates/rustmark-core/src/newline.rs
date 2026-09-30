/// Newline style of a file on disk. The editor and parser always see `\n`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum NewlineStyle {
    Lf,
    Crlf,
    Cr,
}

/// The first line ending in `input` wins. An empty or single-line buffer is LF.
pub fn detect_newline(input: &str) -> NewlineStyle {
    let bytes = input.as_bytes();
    let mut index = 0;
    while index < bytes.len() {
        match bytes[index] {
            b'\n' => return NewlineStyle::Lf,
            b'\r' => {
                if bytes.get(index + 1) == Some(&b'\n') {
                    return NewlineStyle::Crlf;
                }
                return NewlineStyle::Cr;
            }
            _ => index += 1,
        }
    }
    NewlineStyle::Lf
}

pub fn normalize_to_lf(input: &str) -> (String, NewlineStyle) {
    let style = detect_newline(input);
    let mut out = String::with_capacity(input.len());
    let mut rest = input;
    while !rest.is_empty() {
        if let Some(stripped) = rest.strip_prefix("\r\n") {
            out.push('\n');
            rest = stripped;
        } else if let Some(stripped) = rest.strip_prefix('\r') {
            out.push('\n');
            rest = stripped;
        } else {
            let ch = rest.chars().next().expect("rest is not empty");
            out.push(ch);
            rest = &rest[ch.len_utf8()..];
        }
    }
    (out, style)
}

pub fn restore_newlines(markdown_lf: &str, style: NewlineStyle) -> String {
    match style {
        NewlineStyle::Lf => markdown_lf.to_string(),
        NewlineStyle::Crlf => markdown_lf.replace('\n', "\r\n"),
        NewlineStyle::Cr => markdown_lf.replace('\n', "\r"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mixed_file_keeps_the_first_ending() {
        let (lf, style) = normalize_to_lf("a\r\nb\nc\r");
        assert_eq!(style, NewlineStyle::Crlf);
        assert_eq!(lf, "a\nb\nc\n");
        assert_eq!(restore_newlines(&lf, style), "a\r\nb\r\nc\r\n");
    }

    #[test]
    fn no_newline_is_lf() {
        assert_eq!(detect_newline("hello"), NewlineStyle::Lf);
    }
}
