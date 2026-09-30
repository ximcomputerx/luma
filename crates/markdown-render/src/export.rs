//! Standalone HTML export. The preview iframe is not the source of this file.
//! Ammonia runs on the fragment we generate. The document shell and its CSS
//! stay outside that cleaner.

use std::borrow::Cow;
use std::collections::HashMap;

use ammonia::{Builder, UrlRelative};
use markdown_engine::{parse, AlertKind, Block, BlockKind, Inline, NewlineStyle};
use rustmark_core::{classify_image_destination, local_image_source, ImageDestination, LocalImage};

const CSS: &str = r#"
body { margin: 0; padding: 32px 24px 64px; color: #1f1e1b; background: #fffcf7;
  font: 16px/1.75 "Iowan Old Style", Palatino, "Songti SC", "Noto Serif CJK SC", serif; }
article { max-width: 72ch; margin: 0 auto; }
h1, h2, h3, h4, h5, h6 { line-height: 1.25; font-weight: 650; }
h1 { font-size: 1.8em; } h2 { font-size: 1.4em; } h3 { font-size: 1.15em; }
pre, code { font-family: ui-monospace, "Cascadia Code", "Sarasa Gothic SC", monospace; }
pre { background: #f0ece4; padding: 12px 14px; overflow: auto; }
table { border-collapse: collapse; }
td, th { border: 1px solid #e4e0d8; padding: 4px 8px; }
blockquote { margin-left: 0; padding-left: 12px; border-left: 3px solid #2f5d50; color: #6b675f; }
img { max-width: 100%; height: auto; }
a { color: #2f5d50; }
"#;

pub fn export_html(markdown: &str, title: &str) -> String {
    export_html_with(markdown, title, safe_href)
}

pub fn export_html_with(
    markdown: &str,
    title: &str,
    mut href_for: impl FnMut(&str) -> Option<String>,
) -> String {
    let cleaned = render_fragment(markdown, false, &mut href_for);
    format!(
        "<!DOCTYPE html>\n<html lang=\"zh-CN\">\n<head>\n<meta charset=\"utf-8\">\n<title>{}</title>\n<style>{CSS}</style>\n</head>\n<body>\n<article>\n{cleaned}\n</article>\n</body>\n</html>\n",
        escape(title)
    )
}

fn safe_href(dest: &str) -> Option<String> {
    match classify_image_destination(dest) {
        ImageDestination::AllowedHttps(url) => Some(url),
        ImageDestination::Placeholder => match local_image_source(dest) {
            Some(LocalImage::Relative(path)) => Some(path.to_string_lossy().replace('\\', "/")),
            _ => None,
        },
        ImageDestination::Rejected => None,
    }
}

pub(crate) fn render_fragment(
    markdown: &str,
    code_caption: bool,
    href_for: &mut impl FnMut(&str) -> Option<String>,
) -> String {
    let document = parse(markdown, NewlineStyle::Lf);
    let mut body = String::new();
    for block in &document.blocks {
        write_block(&mut body, block, href_for, code_caption, &mut None);
    }
    clean_fragment(&body)
}

pub(crate) fn render_pdf_fragment(
    markdown: &str,
    code_caption: bool,
    toc: bool,
    toc_title: &str,
    href_for: &mut impl FnMut(&str) -> Option<String>,
) -> String {
    let document = parse(markdown, NewlineStyle::Lf);
    let mut body = String::new();
    let mut pdf = Some(PdfPass {
        toc,
        used: HashMap::new(),
        headings: Vec::new(),
    });
    for block in &document.blocks {
        write_block(&mut body, block, href_for, code_caption, &mut pdf);
    }
    let mut full = String::new();
    if let Some(pass) = pdf.as_ref() {
        if pass.toc && !pass.headings.is_empty() {
            write_toc(&mut full, &pass.headings, toc_title);
        }
    }
    full.push_str(&body);
    clean_pdf_fragment(&full)
}

pub(crate) fn clean_fragment(body: &str) -> String {
    Builder::default()
        .url_relative(UrlRelative::PassThrough)
        .add_url_schemes(["data"])
        .link_rel(Some("noopener noreferrer"))
        .clean(body)
        .to_string()
}

pub(crate) fn clean_pdf_fragment(body: &str) -> String {
    Builder::default()
        .url_relative(UrlRelative::PassThrough)
        .add_url_schemes(["data"])
        .link_rel(Some("noopener noreferrer"))
        .add_tag_attributes("h1", &["id"])
        .add_tag_attributes("h2", &["id"])
        .add_tag_attributes("h3", &["id"])
        .add_allowed_classes("div", &["page-break"])
        .attribute_filter(|element, attribute, value| match (element, attribute) {
            ("h1" | "h2" | "h3", "id") if heading_id(value) => Some(Cow::Borrowed(value)),
            ("div", "class") if value == "page-break" => Some(Cow::Borrowed(value)),
            (_, "id" | "class") => None,
            _ => Some(Cow::Borrowed(value)),
        })
        .clean(body)
        .to_string()
}

struct TocHeading {
    level: u8,
    id: String,
    text: String,
}

struct PdfPass {
    toc: bool,
    used: HashMap<u32, u32>,
    headings: Vec<TocHeading>,
}

impl PdfPass {
    fn heading_id(&mut self, level: u8, block: &Block) -> Option<String> {
        if !self.toc || !(1..=3).contains(&level) {
            return None;
        }
        let text = inline_plain(&block.inlines);
        if text.trim().is_empty() {
            return None;
        }
        let line = block.source.start_line.max(1);
        let seen = self.used.entry(line).or_insert(0);
        *seen += 1;
        let id = if *seen == 1 {
            format!("h-{line}")
        } else {
            format!("h-{line}-{seen}")
        };
        self.headings.push(TocHeading {
            level,
            id: id.clone(),
            text,
        });
        Some(id)
    }
}

fn write_block(
    out: &mut String,
    block: &Block,
    href_for: &mut impl FnMut(&str) -> Option<String>,
    code_caption: bool,
    pdf: &mut Option<PdfPass>,
) {
    match &block.kind {
        BlockKind::Paragraph => {
            if pdf.is_some() && is_page_break(&block.inlines) {
                out.push_str("<div class=\"page-break\">&#8203;</div>\n");
                return;
            }
            out.push_str("<p>");
            write_inlines(out, &block.inlines, href_for);
            out.push_str("</p>\n");
        }
        BlockKind::Heading { level } => {
            let level = (*level).clamp(1, 6);
            let id = pdf.as_mut().and_then(|pass| pass.heading_id(level, block));
            out.push_str(&format!("<h{level}"));
            if let Some(id) = id {
                out.push_str(" id=\"");
                out.push_str(&id);
                out.push('"');
            }
            out.push('>');
            write_inlines(out, &block.inlines, href_for);
            out.push_str(&format!("</h{level}>\n"));
        }
        BlockKind::BulletList => {
            wrap_children(out, "ul", &block.children, href_for, code_caption, pdf);
        }
        BlockKind::OrderedList { start } => {
            if *start == 1 {
                wrap_children(out, "ol", &block.children, href_for, code_caption, pdf);
            } else {
                out.push_str(&format!("<ol start=\"{start}\">\n"));
                for child in &block.children {
                    write_block(out, child, href_for, code_caption, pdf);
                }
                out.push_str("</ol>\n");
            }
        }
        BlockKind::ListItem { checked } => {
            out.push_str("<li>");
            if let Some(checked) = checked {
                out.push_str(if *checked { "☑ " } else { "☐ " });
            }
            if block.children.is_empty() {
                write_inlines(out, &block.inlines, href_for);
            } else {
                for child in &block.children {
                    write_block(out, child, href_for, code_caption, pdf);
                }
            }
            out.push_str("</li>\n");
        }
        BlockKind::BlockQuote { alert } => {
            out.push_str("<blockquote>");
            if let Some(alert) = alert {
                out.push_str("<p>");
                out.push_str(alert_label(*alert));
                out.push_str("</p>");
            }
            for child in &block.children {
                write_block(out, child, href_for, code_caption, pdf);
            }
            out.push_str("</blockquote>\n");
        }
        BlockKind::Code { source, lang } => {
            if code_caption {
                write_caption(out, lang.as_deref());
            }
            out.push_str("<pre><code>");
            out.push_str(&escape(source));
            out.push_str("</code></pre>\n");
        }
        BlockKind::Diagram { source, .. } => {
            if code_caption {
                write_caption(out, Some("mermaid"));
            }
            out.push_str("<pre><code>");
            out.push_str(&escape(source));
            out.push_str("</code></pre>\n");
        }
        BlockKind::Table { .. } => {
            out.push_str("<table>\n");
            for row in &block.children {
                let BlockKind::TableRow { header } = row.kind else {
                    continue;
                };
                out.push_str("<tr>");
                let cell = if header { "th" } else { "td" };
                for child in &row.children {
                    out.push('<');
                    out.push_str(cell);
                    out.push('>');
                    write_inlines(out, &child.inlines, href_for);
                    out.push_str("</");
                    out.push_str(cell);
                    out.push('>');
                }
                out.push_str("</tr>\n");
            }
            out.push_str("</table>\n");
        }
        BlockKind::TableRow { .. } | BlockKind::TableCell { .. } => {}
        BlockKind::ThematicBreak => out.push_str("<hr>\n"),
        BlockKind::MathDisplay { tex } => {
            out.push_str("<pre><code>");
            out.push_str(&escape(tex));
            out.push_str("</code></pre>\n");
        }
    }
}

fn write_caption(out: &mut String, lang: Option<&str>) {
    let Some(lang) = lang.map(str::trim).filter(|lang| !lang.is_empty()) else {
        return;
    };
    let shown: String = lang.chars().take(32).collect();
    out.push_str("<p><small>");
    out.push_str(&escape(&shown));
    out.push_str("</small></p>\n");
}

fn wrap_children(
    out: &mut String,
    tag: &str,
    children: &[Block],
    href_for: &mut impl FnMut(&str) -> Option<String>,
    code_caption: bool,
    pdf: &mut Option<PdfPass>,
) {
    out.push('<');
    out.push_str(tag);
    out.push_str(">\n");
    for child in children {
        write_block(out, child, href_for, code_caption, pdf);
    }
    out.push_str("</");
    out.push_str(tag);
    out.push_str(">\n");
}

fn write_inlines(
    out: &mut String,
    inlines: &[Inline],
    href_for: &mut impl FnMut(&str) -> Option<String>,
) {
    for inline in inlines {
        match inline {
            Inline::Text(text) => out.push_str(&escape(text)),
            Inline::SoftBreak | Inline::HardBreak => out.push_str("<br>"),
            Inline::Emphasis(children) => {
                out.push_str("<em>");
                write_inlines(out, children, href_for);
                out.push_str("</em>");
            }
            Inline::Strong(children) => {
                out.push_str("<strong>");
                write_inlines(out, children, href_for);
                out.push_str("</strong>");
            }
            Inline::Strike(children) => {
                out.push_str("<s>");
                write_inlines(out, children, href_for);
                out.push_str("</s>");
            }
            Inline::Code(text) | Inline::Math(text) => {
                out.push_str("<code>");
                out.push_str(&escape(text));
                out.push_str("</code>");
            }
            Inline::Link { dest, children, .. } => {
                if let Some(href) = href_for(dest) {
                    out.push_str("<a href=\"");
                    out.push_str(&escape(&href));
                    out.push_str("\">");
                    write_inlines(out, children, href_for);
                    out.push_str("</a>");
                } else {
                    write_inlines(out, children, href_for);
                }
            }
            Inline::Image { dest, alt } => {
                if let Some(src) = href_for(dest) {
                    out.push_str("<img src=\"");
                    out.push_str(&escape(&src));
                    out.push_str("\" alt=\"");
                    out.push_str(&escape(alt));
                    out.push_str("\">");
                } else if !alt.is_empty() {
                    out.push_str(&escape(alt));
                }
            }
        }
    }
}

fn is_page_break(inlines: &[Inline]) -> bool {
    let mut text = String::new();
    for inline in inlines {
        match inline {
            Inline::Text(value) => text.push_str(value),
            _ => return false,
        }
    }
    text.trim() == "\\pagebreak"
}

fn inline_plain(inlines: &[Inline]) -> String {
    let mut out = String::new();
    push_plain(&mut out, inlines);
    out
}

fn push_plain(out: &mut String, inlines: &[Inline]) {
    for inline in inlines {
        match inline {
            Inline::Text(text) | Inline::Code(text) | Inline::Math(text) => out.push_str(text),
            Inline::SoftBreak | Inline::HardBreak => out.push(' '),
            Inline::Emphasis(children)
            | Inline::Strong(children)
            | Inline::Strike(children)
            | Inline::Link { children, .. } => push_plain(out, children),
            Inline::Image { alt, .. } => out.push_str(alt),
        }
    }
}

fn write_toc(out: &mut String, headings: &[TocHeading], title: &str) {
    out.push_str("<nav>\n<p>");
    out.push_str(&escape(title));
    out.push_str("</p>\n");
    let mut depth = 0u8;
    for heading in headings {
        let level = heading.level.clamp(1, 3);
        if depth == 0 {
            out.push_str("<ol>\n<li>");
            depth = 1;
            while depth < level {
                out.push_str("<ol>\n<li>");
                depth += 1;
            }
        } else if level > depth {
            while depth < level {
                out.push_str("<ol>\n<li>");
                depth += 1;
            }
        } else {
            while depth > level {
                out.push_str("</li>\n</ol>\n");
                depth -= 1;
            }
            out.push_str("</li>\n<li>");
        }
        out.push_str("<a href=\"#");
        out.push_str(&heading.id);
        out.push_str("\">");
        out.push_str(&escape(&heading.text));
        out.push_str("</a>");
    }
    while depth > 0 {
        out.push_str("</li>\n</ol>\n");
        depth -= 1;
    }
    out.push_str("</nav>\n");
}

fn heading_id(value: &str) -> bool {
    let mut parts = value.split('-');
    if parts.next() != Some("h") {
        return false;
    }
    let Some(line) = parts.next() else {
        return false;
    };
    if !positive_id(line) {
        return false;
    }
    match parts.next() {
        None => true,
        Some(extra) => positive_id(extra) && parts.next().is_none(),
    }
}

fn positive_id(value: &str) -> bool {
    let mut chars = value.chars();
    matches!(chars.next(), Some('1'..='9')) && chars.all(|ch| ch.is_ascii_digit())
}

fn alert_label(alert: AlertKind) -> &'static str {
    match alert {
        AlertKind::Note => "注意",
        AlertKind::Tip => "提示",
        AlertKind::Important => "重要",
        AlertKind::Warning => "警告",
        AlertKind::Caution => "小心",
    }
}

pub(crate) fn escape(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    for ch in text.chars() {
        match ch {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            '"' => out.push_str("&quot;"),
            '\'' => out.push_str("&#39;"),
            _ => out.push(ch),
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn export_drops_scripts_events_and_javascript_urls() {
        let html = export_html(
            "# 标题\n\n`<script>alert(1)</script>`\n\n<script>alert(1)</script>\n\n[点我](javascript:alert(1))\n\n![图](javascript:alert(1))\n\n![图](https://127.0.0.1/a.png)\n\n![本地](assets/a.png)\n\n[站](https://example.com/a)\n",
            "笔记",
        );
        let lower = html.to_ascii_lowercase();
        assert!(!lower.contains("<script"));
        assert!(!lower.contains("onerror"));
        assert!(!lower.contains("javascript:"));
        assert!(!html.contains("127.0.0.1"));
        assert!(html.contains("assets/a.png"));
        assert!(html.contains("https://example.com/a"));
        assert!(html.contains("<h1>"));
        assert!(html.contains("<style>"));
        assert!(!html.contains("\"html\""));
    }

    #[test]
    fn data_urls_from_the_caller_survive_the_cleaner() {
        let html = export_html_with("![图](assets/a.png)\n", "笔记", |dest| {
            if dest == "assets/a.png" {
                Some("data:image/png;base64,AAAA".to_string())
            } else {
                None
            }
        });
        assert!(html.contains("data:image/png;base64,AAAA"));
        assert!(!html.contains("<script"));
    }

    #[test]
    fn html_export_keeps_a_page_break_as_text() {
        let html = export_html("\\pagebreak\n", "笔记");
        assert!(html.contains("\\pagebreak"));
        assert!(!html.contains("page-break"));
        assert!(!html.contains("id=\"h-"));
    }

    #[test]
    fn pdf_cleaner_keeps_only_heading_ids_and_the_page_break_class() {
        let html = clean_pdf_fragment(
            "<h1 id=\"h-1\">A&amp;B</h1><h1 id=\"bad\" onclick=\"alert(1)\">B</h1><div class=\"page-break\">&#8203;</div><div class=\"evil\"></div><p class=\"page-break\">no</p><script>alert(1)</script>",
        );
        assert!(html.contains("id=\"h-1\""));
        assert!(html.contains("A&amp;B"));
        assert!(!html.contains("id=\"bad\""));
        assert!(!html.contains("onclick"));
        assert!(!html.contains("evil"));
        assert!(!html.to_ascii_lowercase().contains("<script"));
        assert_eq!(html.matches("page-break").count(), 1);
    }
}
