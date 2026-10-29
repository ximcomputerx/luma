//! An HTML fragment becomes image nodes only when every tag is `img`.
//! Anything else is refused so the caller can drop the fragment.

/// `src` then `alt`. Missing attributes are empty strings.
pub(crate) fn images_from_html(raw: &str) -> Option<Vec<(String, String)>> {
    let mut cursor = Cursor { raw, index: 0 };
    let mut images = Vec::new();
    loop {
        cursor.skip_whitespace();
        if cursor.done() {
            return Some(images);
        }
        images.push(cursor.parse_img()?);
    }
}

struct Cursor<'a> {
    raw: &'a str,
    index: usize,
}

impl<'a> Cursor<'a> {
    fn done(&self) -> bool {
        self.index >= self.raw.len()
    }

    fn rest(&self) -> &'a str {
        &self.raw[self.index..]
    }

    fn peek(&self) -> Option<char> {
        self.rest().chars().next()
    }

    fn bump(&mut self) -> Option<char> {
        let ch = self.peek()?;
        self.index += ch.len_utf8();
        Some(ch)
    }

    fn eat(&mut self, token: &str) -> bool {
        if self.rest().starts_with(token) {
            self.index += token.len();
            true
        } else {
            false
        }
    }

    fn skip_whitespace(&mut self) {
        while self.peek().is_some_and(char::is_whitespace) {
            self.bump();
        }
    }

    fn parse_img(&mut self) -> Option<(String, String)> {
        if !self.eat("<") {
            return None;
        }
        let name = self.read_name()?;
        if !name.eq_ignore_ascii_case("img") {
            return None;
        }
        let mut src = String::new();
        let mut alt = String::new();
        let mut saw_src = false;
        let mut saw_alt = false;
        loop {
            self.skip_whitespace();
            if self.peek() == Some('/') {
                self.bump();
                self.skip_whitespace();
                if self.eat(">") {
                    break;
                }
                return None;
            }
            if self.eat(">") {
                break;
            }
            let attr = self.read_name()?;
            self.skip_whitespace();
            if !self.eat("=") {
                continue;
            }
            self.skip_whitespace();
            let value = self.read_value()?;
            if attr.eq_ignore_ascii_case("src") && !saw_src {
                src = value;
                saw_src = true;
            } else if attr.eq_ignore_ascii_case("alt") && !saw_alt {
                alt = value;
                saw_alt = true;
            }
        }
        Some((src, alt))
    }

    fn read_name(&mut self) -> Option<String> {
        let first = self.peek()?;
        if !first.is_ascii_alphabetic() {
            return None;
        }
        let mut name = String::new();
        while let Some(ch) = self.peek() {
            if ch.is_ascii_alphanumeric() || matches!(ch, '-' | ':' | '_') {
                name.push(ch);
                self.bump();
            } else {
                break;
            }
        }
        Some(name)
    }

    fn read_value(&mut self) -> Option<String> {
        let quote = self.peek()?;
        if quote == '"' || quote == '\'' {
            self.bump();
            let start = self.index;
            loop {
                let ch = self.bump()?;
                if ch == quote {
                    return Some(decode_entities(
                        &self.raw[start..self.index - quote.len_utf8()],
                    ));
                }
            }
        }
        let start = self.index;
        while let Some(ch) = self.peek() {
            if ch.is_whitespace() || matches!(ch, '<' | '>' | '"' | '\'' | '`') {
                break;
            }
            if ch == '/'
                && self.raw[self.index + ch.len_utf8()..]
                    .trim_start()
                    .starts_with('>')
            {
                break;
            }
            self.bump();
        }
        if self.index == start {
            return None;
        }
        Some(decode_entities(&self.raw[start..self.index]))
    }
}

pub(crate) fn scan_html_tags(chunk: &str, depth: &mut u32, swallow: &mut bool) {
    let mut rest = chunk;
    while let Some(start) = rest.find('<') {
        rest = &rest[start..];
        if rest.starts_with("<!--") {
            if let Some(end) = rest.find("-->") {
                rest = &rest[end + 3..];
                continue;
            }
            *swallow = true;
            *depth = depth.saturating_add(1);
            return;
        }
        let closing = rest.as_bytes().get(1) == Some(&b'/');
        let name_at = 1 + usize::from(closing);
        if name_at > rest.len() {
            return;
        }
        let name_len = html_name_len(&rest[name_at..]);
        if name_len == 0 {
            let skip = rest.chars().next().map(char::len_utf8).unwrap_or(1);
            rest = &rest[skip..];
            continue;
        }
        let name = &rest[name_at..name_at + name_len];
        let after = &rest[name_at + name_len..];
        let Some(end) = after.find('>') else {
            *swallow = true;
            *depth = depth.saturating_add(1);
            return;
        };
        let self_close = after[..end].trim_end().ends_with('/');
        if closing {
            *depth = depth.saturating_sub(1);
        } else if !self_close && !is_void(name) {
            if is_swallow_tag(name) {
                *swallow = true;
            }
            *depth = depth.saturating_add(1);
        }
        rest = &after[end + 1..];
    }
}

fn html_name_len(raw: &str) -> usize {
    let mut len = 0;
    for ch in raw.chars() {
        if len == 0 && !ch.is_ascii_alphabetic() {
            break;
        }
        if ch.is_ascii_alphanumeric() || matches!(ch, '-' | ':' | '_') {
            len += ch.len_utf8();
        } else {
            break;
        }
    }
    len
}

fn is_void(name: &str) -> bool {
    matches!(
        ascii_lower(name).as_str(),
        "area"
            | "base"
            | "br"
            | "col"
            | "embed"
            | "hr"
            | "img"
            | "input"
            | "link"
            | "meta"
            | "param"
            | "source"
            | "track"
            | "wbr"
    )
}

fn is_swallow_tag(name: &str) -> bool {
    matches!(
        ascii_lower(name).as_str(),
        "script"
            | "style"
            | "iframe"
            | "textarea"
            | "title"
            | "noscript"
            | "noembed"
            | "xmp"
            | "object"
    )
}

fn ascii_lower(name: &str) -> String {
    name.to_ascii_lowercase()
}

fn decode_entities(raw: &str) -> String {
    let mut out = String::with_capacity(raw.len());
    let mut rest = raw;
    while let Some(start) = rest.find('&') {
        out.push_str(&rest[..start]);
        let after = &rest[start..];
        let Some(end) = after.find(';') else {
            out.push_str(after);
            return out;
        };
        let entity = &after[..=end];
        let decoded = match entity {
            "&amp;" => Some("&"),
            "&quot;" => Some("\""),
            "&#39;" => Some("'"),
            "&lt;" => Some("<"),
            "&gt;" => Some(">"),
            _ => None,
        };
        if let Some(decoded) = decoded {
            out.push_str(decoded);
            rest = &after[entity.len()..];
        } else {
            out.push('&');
            rest = &after[1..];
        }
    }
    out.push_str(rest);
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_src_and_alt_only() {
        let images = images_from_html(
            "<IMG SRC='docs/a.png' ALT=\"say &quot;hi&quot;\" width=\"720\" onerror=\"alert(1)\" />\n<img src=b.png alt=图>",
        )
        .unwrap();
        assert_eq!(
            images,
            vec![
                ("docs/a.png".to_string(), "say \"hi\"".to_string()),
                ("b.png".to_string(), "图".to_string()),
            ]
        );
    }

    #[test]
    fn refuses_anything_that_is_not_only_images() {
        for raw in [
            "<div><img src=\"a.png\"></div>",
            "<img src=\"a.png\"><script>alert(1)</script>",
            "<script>alert(1)</script>",
            "see <img src=\"a.png\">",
            "<img src=\"a.png\"> tail",
            "<img src=\"a.png\"",
        ] {
            assert!(images_from_html(raw).is_none(), "{raw}");
        }
    }

    #[test]
    fn decodes_the_five_named_entities() {
        let images = images_from_html("<img src=\"a&amp;b&#39;c.png\" alt=\"&lt;x&gt;\">").unwrap();
        assert_eq!(images, vec![("a&b'c.png".to_string(), "<x>".to_string())]);
    }
}
