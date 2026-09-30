//! Print document for PDF export. The HTML export stylesheet stays in `export`.

use serde::Deserialize;

use crate::export::{escape, render_pdf_fragment};

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PdfProfile {
    pub base: String,
    pub body_font: String,
    pub heading_font: String,
    pub code_font: String,
    pub font_size_px: u8,
    pub line_height: f64,
    pub paragraph: String,
    pub measure: String,
    pub text: String,
    pub heading: String,
    pub link: String,
    pub code_bg: String,
    pub paper_color: String,
    pub paper: String,
    pub orientation: String,
    pub margin_mm: u8,
    pub header: String,
    pub footer_page: bool,
    pub footer_created: bool,
    pub footer_author: bool,
    pub author: String,
    pub lang: String,
    pub toc: bool,
    pub code_break: String,
    pub image_max_percent: u8,
    pub widows: u8,
}

pub struct PdfMeta<'a> {
    pub title: &'a str,
    pub filename: &'a str,
    pub created: &'a str,
}

#[derive(Debug, Clone, Copy)]
pub struct PdfPage {
    pub width_in: f64,
    pub height_in: f64,
    pub width_px: f64,
    pub height_px: f64,
    pub margin_in: f64,
    pub landscape: bool,
}

pub struct PdfDocument {
    pub html: String,
    pub page: PdfPage,
}

#[derive(Debug)]
pub struct PdfError;

#[derive(Clone, Copy)]
enum Base {
    Modern,
    Academic,
    Book,
    Minimal,
    Technical,
}

#[derive(Clone, Copy)]
enum Measure {
    Full,
    Standard,
    Narrow,
}

#[derive(Clone, Copy)]
enum Header {
    Off,
    Title,
    Filename,
}

struct Style {
    base: Base,
    body_stack: String,
    heading_stack: String,
    code_stack: String,
    font_size: u8,
    line_height: String,
    gap: &'static str,
    measure: Measure,
    text: String,
    heading: String,
    link: String,
    code_bg: String,
    paper_color: String,
    paper_name: &'static str,
    page: PdfPage,
    margin_mm: u8,
    margin_px: i64,
    inset_mm: i64,
    header: Header,
    footer_page: bool,
    footer_created: bool,
    footer_author: bool,
    author: String,
    lang: &'static str,
    remote: bool,
    toc: bool,
    code_keep: bool,
    image_max: u8,
    widows: u8,
}

pub fn export_pdf_document(
    markdown: &str,
    meta: PdfMeta<'_>,
    profile: &PdfProfile,
    remote_images: bool,
    mut href_for: impl FnMut(&str) -> Option<String>,
) -> Result<PdfDocument, PdfError> {
    let style = resolve(profile, remote_images)?;
    let toc_title = if style.lang == "en-US" {
        "Contents"
    } else {
        "目录"
    };
    let body = render_pdf_fragment(
        markdown,
        matches!(style.base, Base::Technical),
        style.toc,
        toc_title,
        &mut href_for,
    );
    let html = document_html(&style, meta, &body);
    Ok(PdfDocument {
        html,
        page: style.page,
    })
}

fn resolve(profile: &PdfProfile, remote: bool) -> Result<Style, PdfError> {
    let base = parse_base(&profile.base)?;
    let body_stack = font_stack(&profile.body_font)?;
    let heading_stack = if profile.heading_font == "match" {
        body_stack.clone()
    } else {
        font_stack(&profile.heading_font)?
    };
    let code_stack = code_stack(&profile.code_font)?;
    if !(12..=24).contains(&profile.font_size_px) {
        return Err(PdfError);
    }
    let line_height = line_height(profile.line_height)?;
    let gap = match profile.paragraph.as_str() {
        "compact" => "0.45em",
        "standard" => "0.85em",
        "loose" => "1.25em",
        _ => return Err(PdfError),
    };
    let measure = match profile.measure.as_str() {
        "full" => Measure::Full,
        "standard" => Measure::Standard,
        "narrow" => Measure::Narrow,
        _ => return Err(PdfError),
    };
    let text = ink(&profile.text, true)?;
    let heading = ink(&profile.heading, true)?;
    let link = ink(&profile.link, false)?;
    let code_bg = ink(&profile.code_bg, false)?;
    let paper_color = ink(&profile.paper_color, true)?;
    let (paper_name, portrait) = match profile.paper.as_str() {
        "a4" => ("A4", (210.0 / 25.4, 297.0 / 25.4)),
        "letter" => ("letter", (8.5, 11.0)),
        "a5" => ("A5", (148.0 / 25.4, 210.0 / 25.4)),
        _ => return Err(PdfError),
    };
    let landscape = match profile.orientation.as_str() {
        "portrait" => false,
        "landscape" => true,
        _ => return Err(PdfError),
    };
    if !matches!(profile.margin_mm, 10 | 15 | 18 | 20 | 30) {
        return Err(PdfError);
    }
    let header = match profile.header.as_str() {
        "off" => Header::Off,
        "title" => Header::Title,
        "filename" => Header::Filename,
        _ => return Err(PdfError),
    };
    if profile.author.chars().count() > 80
        || profile.author.chars().any(|ch| ch == '\n' || ch == '\r')
    {
        return Err(PdfError);
    }
    let lang = match profile.lang.as_str() {
        "en-US" => "en-US",
        "zh-CN" => "zh-CN",
        _ => return Err(PdfError),
    };
    let code_keep = match profile.code_break.as_str() {
        "split" => false,
        "keep" => true,
        _ => return Err(PdfError),
    };
    if !(40..=100).contains(&profile.image_max_percent) || !matches!(profile.widows, 2 | 3 | 4) {
        return Err(PdfError);
    }
    let (width_in, height_in): (f64, f64) = if landscape {
        (portrait.1, portrait.0)
    } else {
        portrait
    };
    let width_px = (width_in * 96.0).round();
    let height_px = (height_in * 96.0).round();
    let margin_in = f64::from(profile.margin_mm) / 25.4;
    let margin_px = (margin_in * 96.0).round() as i64;
    let content_w = width_px as i64 - margin_px * 2;
    let content_h = height_px as i64 - margin_px * 2;
    if content_w < 120 || content_h < 120 {
        return Err(PdfError);
    }
    let inset_mm = (i64::from(profile.margin_mm) - 6).max(2);
    Ok(Style {
        base,
        body_stack,
        heading_stack,
        code_stack,
        font_size: profile.font_size_px,
        line_height,
        gap,
        measure,
        text,
        heading,
        link,
        code_bg,
        paper_color,
        paper_name,
        page: PdfPage {
            width_in,
            height_in,
            width_px,
            height_px,
            margin_in,
            landscape,
        },
        margin_mm: profile.margin_mm,
        margin_px,
        inset_mm,
        header,
        footer_page: profile.footer_page,
        footer_created: profile.footer_created,
        footer_author: profile.footer_author,
        author: profile.author.clone(),
        lang,
        remote,
        toc: profile.toc,
        code_keep,
        image_max: profile.image_max_percent,
        widows: profile.widows,
    })
}

fn parse_base(value: &str) -> Result<Base, PdfError> {
    match value {
        "modern" => Ok(Base::Modern),
        "academic" => Ok(Base::Academic),
        "book" => Ok(Base::Book),
        "minimal" => Ok(Base::Minimal),
        "technical" => Ok(Base::Technical),
        _ => Err(PdfError),
    }
}

fn line_height(value: f64) -> Result<String, PdfError> {
    if !value.is_finite() {
        return Err(PdfError);
    }
    let scaled = (value * 20.0).round();
    if !(24.0..=50.0).contains(&scaled) || (value - scaled / 20.0).abs() > 0.001 {
        return Err(PdfError);
    }
    let height = scaled / 20.0;
    Ok(format!("{height:.2}")
        .trim_end_matches('0')
        .trim_end_matches('.')
        .to_string())
}

fn ink(value: &str, reject_black: bool) -> Result<String, PdfError> {
    let bytes = value.as_bytes();
    if bytes.len() != 7 || bytes[0] != b'#' || !bytes[1..].iter().all(u8::is_ascii_hexdigit) {
        return Err(PdfError);
    }
    let color = value.to_ascii_lowercase();
    if reject_black && color == "#000000" {
        return Err(PdfError);
    }
    Ok(color)
}

fn font_stack(value: &str) -> Result<String, PdfError> {
    let stack = match value {
        "system" => "\"Microsoft YaHei UI\", \"Segoe UI\", \"PingFang SC\", \"Noto Sans CJK SC\", sans-serif",
        "serif" => "\"Iowan Old Style\", \"Palatino Linotype\", \"Songti SC\", \"Noto Serif CJK SC\", serif",
        "sans" => "\"Segoe UI\", \"Microsoft YaHei UI\", \"PingFang SC\", \"Noto Sans CJK SC\", sans-serif",
        "微软雅黑" | "Microsoft YaHei" => {
            "\"Microsoft YaHei\", \"微软雅黑\", \"Microsoft YaHei UI\", \"PingFang SC\", \"Noto Sans CJK SC\", sans-serif"
        }
        other => {
            let family = css_family(other)?;
            return Ok(format!(
                "\"{family}\", \"Segoe UI\", \"PingFang SC\", \"Noto Sans CJK SC\", sans-serif"
            ));
        }
    };
    Ok(stack.to_string())
}

fn code_stack(value: &str) -> Result<String, PdfError> {
    let stack = match value {
        "cascadia" => "\"Cascadia Code\", \"Cascadia Mono\", ui-monospace, monospace",
        "jetbrains" => "\"JetBrains Mono\", \"Cascadia Code\", ui-monospace, monospace",
        "fira" => "\"Fira Code\", \"Cascadia Code\", ui-monospace, monospace",
        "system" => "ui-monospace, \"Cascadia Mono\", monospace",
        other => {
            let family = css_family(other)?;
            return Ok(format!("\"{family}\", ui-monospace, monospace"));
        }
    };
    Ok(stack.to_string())
}

fn css_family(value: &str) -> Result<String, PdfError> {
    let name = value.split_whitespace().collect::<Vec<_>>().join(" ");
    if name.is_empty() || name.starts_with('@') || name.chars().count() > 64 {
        return Err(PdfError);
    }
    if !name.chars().all(|ch| {
        ch.is_alphanumeric()
            || matches!(
                ch,
                ' ' | '.' | '(' | ')' | '+' | ',' | '&' | '\'' | '_' | '-'
            )
    }) {
        return Err(PdfError);
    }
    Ok(name)
}

fn document_html(style: &Style, meta: PdfMeta<'_>, body: &str) -> String {
    let mut html = String::new();
    html.push_str("<!DOCTYPE html>\n<html lang=\"");
    html.push_str(style.lang);
    html.push_str("\">\n<head>\n<meta charset=\"utf-8\">\n<meta http-equiv=\"Content-Security-Policy\" content=\"");
    html.push_str(csp(style.remote));
    html.push_str("\">\n<title>");
    html.push_str(&escape(meta.title));
    html.push_str("</title>\n<style>\n");
    push_css(&mut html, style);
    html.push_str("</style>\n</head>\n<body>\n<div class=\"sheet\">\n");
    push_header(&mut html, style, &meta);
    html.push_str("<div class=\"spread\"><article class=\"pdf-article ");
    html.push_str(base_class(style.base));
    html.push(' ');
    html.push_str(measure_class(style.measure));
    html.push_str("\">\n");
    html.push_str(body);
    html.push_str("</article></div>\n");
    push_footer(&mut html, style, &meta);
    html.push_str("</div>\n</body>\n</html>\n");
    html
}

fn csp(remote: bool) -> &'static str {
    if remote {
        "default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src data: https:; font-src data:"
    } else {
        "default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:"
    }
}

fn push_header(out: &mut String, style: &Style, meta: &PdfMeta<'_>) {
    let text = match style.header {
        Header::Off => return,
        Header::Title => escape(meta.title),
        Header::Filename => escape(meta.filename),
    };
    out.push_str("<header class=\"running-head\">");
    out.push_str(&text);
    out.push_str("</header>\n");
}

fn push_footer(out: &mut String, style: &Style, meta: &PdfMeta<'_>) {
    let author = style.footer_author && !style.author.is_empty();
    if !style.footer_page && !style.footer_created && !author {
        return;
    }
    out.push_str("<footer class=\"running-foot\">");
    if author {
        out.push_str("<span>");
        out.push_str(&escape(&style.author));
        out.push_str("</span>");
    }
    if style.footer_created {
        out.push_str("<span>");
        out.push_str(&escape(meta.created));
        out.push_str("</span>");
    }
    if style.footer_page {
        out.push_str("<span class=\"page-num\"></span>");
    }
    out.push_str("</footer>\n");
}

fn base_class(base: Base) -> &'static str {
    match base {
        Base::Modern => "base-modern",
        Base::Academic => "base-academic",
        Base::Book => "base-book",
        Base::Minimal => "base-minimal",
        Base::Technical => "base-technical",
    }
}

fn measure_class(measure: Measure) -> &'static str {
    match measure {
        Measure::Full => "measure-full",
        Measure::Standard => "measure-standard",
        Measure::Narrow => "measure-narrow",
    }
}

fn push_css(out: &mut String, style: &Style) {
    let content_w = style.page.width_px as i64 - style.margin_px * 2;
    let content_h = style.page.height_px as i64 - style.margin_px * 2;
    let orient = if style.page.landscape {
        "landscape"
    } else {
        "portrait"
    };
    out.push_str(":root{--text:");
    out.push_str(&style.text);
    out.push_str(";--heading:");
    out.push_str(&style.heading);
    out.push_str(";--link:");
    out.push_str(&style.link);
    out.push_str(";--code-bg:");
    out.push_str(&style.code_bg);
    out.push_str(";--paper:");
    out.push_str(&style.paper_color);
    out.push_str(";--muted:color-mix(in srgb,var(--text) 55%,var(--paper));--rule:color-mix(in srgb,var(--text) 18%,var(--paper));--gap:");
    out.push_str(style.gap);
    out.push_str(";}\n");
    out.push_str("*{box-sizing:border-box;}html,body{margin:0;background:transparent;}\n");
    out.push_str(
        ".sheet{position:relative;overflow:hidden;background:var(--paper);color:var(--text);font:",
    );
    out.push_str(&style.font_size.to_string());
    out.push_str("px/");
    out.push_str(&style.line_height);
    out.push(' ');
    out.push_str(&style.body_stack);
    out.push_str(";}\n");
    out.push_str("h1,h2,h3,h4,h5,h6{font-family:");
    out.push_str(&style.heading_stack);
    out.push_str(";color:var(--heading);font-weight:650;line-height:1.25;margin:1.1em 0 0.35em;}h1{margin-top:0;}h4,h5,h6{font-size:1em;}\n");
    out.push_str("p,ul,ol,pre,table,blockquote{margin:0 0 var(--gap);}ul,ol{padding-left:1.4em;}a{color:var(--link);}img{max-width:");
    out.push_str(&style.image_max.to_string());
    out.push_str("%;height:auto;}p,li,blockquote{widows:");
    out.push_str(&style.widows.to_string());
    out.push_str(";orphans:");
    out.push_str(&style.widows.to_string());
    out.push_str(";}\n");
    out.push_str("code{font-family:");
    out.push_str(&style.code_stack);
    out.push_str(";background:var(--code-bg);padding:0.1em 0.3em;}pre{background:var(--code-bg);padding:10px 12px;white-space:pre-wrap;overflow-wrap:anywhere;}pre code{background:transparent;padding:0;}\n");
    out.push_str("blockquote{padding-left:12px;border-left:3px solid var(--link);color:var(--muted);}hr{border:0;border-top:1px solid var(--rule);margin:1.2em 0;}table{border-collapse:collapse;width:100%;}td,th{border:1px solid var(--rule);padding:4px 8px;}\n");
    out.push_str(".measure-full{max-width:none;}.measure-standard{max-width:70ch;margin-inline:auto;}.measure-narrow{max-width:62ch;margin-inline:auto;}\n");
    out.push_str(".base-modern h1{font-size:1.7em;}.base-modern h2{font-size:1.28em;border-bottom:1px solid var(--rule);padding-bottom:0.15em;}.base-modern h3{font-size:1.12em;}\n");
    out.push_str(".base-academic{counter-reset:h2;}.base-academic h1{font-size:1.6em;text-align:center;}.base-academic h2{font-size:1.28em;counter-increment:h2;counter-reset:h3;}.base-academic h2::before{content:counter(h2) \". \";}.base-academic h3{counter-increment:h3;}.base-academic h3::before{content:counter(h2) \".\" counter(h3) \" \";}.base-academic p{text-indent:2em;}\n");
    out.push_str(".base-book h1{font-size:1.7em;margin-top:2.4em;letter-spacing:0.04em;}.base-book h2{font-size:1.25em;margin-top:1.6em;}.base-book h3{font-size:1.1em;}\n");
    out.push_str(".base-minimal h1,.base-minimal h2,.base-minimal h3{font-weight:600;}.base-minimal h1{font-size:1.35em;}.base-minimal h2{font-size:1.1em;}.base-minimal h3{font-size:1.05em;}\n");
    out.push_str(".base-technical h1{font-size:1.55em;}.base-technical h2{font-size:1.22em;border-left:3px solid var(--link);padding-left:0.5em;}.base-technical h3{font-size:1.08em;}.base-technical p:has(> small:only-child){margin:0 0 0.25em;text-indent:0;font-family:");
    out.push_str(&style.code_stack);
    out.push_str(";font-size:11px;letter-spacing:0.04em;color:var(--muted);}\n");
    out.push_str(if style.code_keep {
        "pre{break-inside:avoid;}"
    } else {
        "pre{break-inside:auto;}"
    });
    out.push_str(".base-academic img,.base-book img,.base-minimal img{break-inside:avoid;}\n");
    out.push_str(".page-break{display:block;height:1px;margin:0;padding:0;border:0;overflow:hidden;}.pdf-article nav{margin:0 0 var(--gap);}.pdf-article nav p{text-indent:0;font-weight:650;margin:0 0 0.35em;}.pdf-article nav ol{list-style:none;margin:0;padding-left:1.15em;}.pdf-article nav>ol{padding-left:0;}.pdf-article nav li{margin:0.12em 0;}.pdf-article nav a{color:var(--text);text-decoration:none;}\n");
    out.push_str(".pager{display:none;}@media screen{.sheet{width:");
    out.push_str(&style.page.width_px.to_string());
    out.push_str("px;height:");
    out.push_str(&style.page.height_px.to_string());
    out.push_str("px;}.spread{position:absolute;left:");
    out.push_str(&style.margin_px.to_string());
    out.push_str("px;top:");
    out.push_str(&style.margin_px.to_string());
    out.push_str("px;width:");
    out.push_str(&content_w.to_string());
    out.push_str("px;height:");
    out.push_str(&content_h.to_string());
    out.push_str("px;column-width:");
    out.push_str(&content_w.to_string());
    out.push_str("px;column-gap:0;column-fill:auto;overflow-x:auto;overflow-y:hidden;}.running-head,.running-foot{position:absolute;left:");
    out.push_str(&style.margin_px.to_string());
    out.push_str("px;right:");
    out.push_str(&style.margin_px.to_string());
    out.push_str("px;font-size:10px;line-height:1.2;color:var(--muted);}.running-head{top:");
    out.push_str(&style.inset_mm.to_string());
    out.push_str("mm;}.running-foot{bottom:");
    out.push_str(&style.inset_mm.to_string());
    out.push_str("mm;display:flex;gap:12px;}.page-num{margin-left:auto;}.page-num::after{content:counter(page);}.pager{display:flex;align-items:center;justify-content:center;gap:12px;width:");
    out.push_str(&style.page.width_px.to_string());
    out.push_str("px;height:28px;font:12px/1 \"Segoe UI\",\"PingFang SC\",\"Noto Sans CJK SC\",sans-serif;}.pager button{height:24px;padding:0 8px;border:0;background:transparent;color:inherit;font:inherit;}}\n");
    out.push_str("@media screen{.page-break{break-before:column;}}@media print{.page-break{break-before:page;}}\n");
    out.push_str("@page{size:");
    out.push_str(style.paper_name);
    out.push(' ');
    out.push_str(orient);
    out.push_str(";margin:");
    out.push_str(&style.margin_mm.to_string());
    out.push_str("mm;}@media print{.sheet{width:auto;height:auto;overflow:visible;}.spread{position:static;width:auto;height:auto;overflow:visible;column-width:auto;column-count:1;}.running-head,.running-foot{position:fixed;left:0;right:0;}.running-head{top:-");
    out.push_str(&style.inset_mm.to_string());
    out.push_str("mm;}.running-foot{bottom:-");
    out.push_str(&style.inset_mm.to_string());
    out.push_str("mm;}.pager{display:none !important;}}\n");
}

#[cfg(test)]
mod tests {
    use super::*;

    fn modern() -> PdfProfile {
        PdfProfile {
            base: "modern".to_string(),
            body_font: "sans".to_string(),
            heading_font: "match".to_string(),
            code_font: "cascadia".to_string(),
            font_size_px: 15,
            line_height: 1.6,
            paragraph: "standard".to_string(),
            measure: "full".to_string(),
            text: "#2C2822".to_string(),
            heading: "#1F1C17".to_string(),
            link: "#2F5D50".to_string(),
            code_bg: "#F3ECE2".to_string(),
            paper_color: "#FBF6EE".to_string(),
            paper: "a4".to_string(),
            orientation: "portrait".to_string(),
            margin_mm: 18,
            header: "title".to_string(),
            footer_page: true,
            footer_created: true,
            footer_author: true,
            author: "Ada".to_string(),
            lang: "zh-CN".to_string(),
            toc: false,
            code_break: "split".to_string(),
            image_max_percent: 100,
            widows: 2,
        }
    }

    fn render(markdown: &str, profile: &PdfProfile) -> PdfDocument {
        export_pdf_document(
            markdown,
            PdfMeta {
                title: "笔记<script>",
                filename: "终稿",
                created: "2026-09-29 10:00",
            },
            profile,
            false,
            |dest| {
                if dest == "assets/a.png" {
                    Some("data:image/png;base64,AAAA".to_string())
                } else {
                    None
                }
            },
        )
        .expect("profile")
    }

    #[test]
    fn print_html_keeps_structure_and_refuses_script() {
        let doc = render(
            "# 标题\n\n```\ncode\n```\n\n![图](assets/a.png)\n",
            &modern(),
        );
        assert!(doc.html.contains("<h1>标题</h1>"));
        assert!(doc.html.contains("<pre><code>"));
        assert!(doc.html.contains("data:image/png;base64,AAAA"));
        assert!(doc.html.contains("@page{size:A4 portrait;margin:18mm;}"));
        assert!(doc.html.contains("笔记&lt;script&gt;"));
        assert!(doc.html.contains("script-src 'none'"));
        assert!(!doc.html.to_ascii_lowercase().contains("<script"));
        assert!((doc.page.width_px - 794.0).abs() < f64::EPSILON);
        assert!((doc.page.height_px - 1123.0).abs() < f64::EPSILON);
        assert!(!doc.page.landscape);
        assert!(!doc.html.contains("32px 24px"));
    }

    #[test]
    fn academic_numbers_headings_and_technical_captions_code() {
        let mut academic = modern();
        academic.base = "academic".to_string();
        let doc = render("# 题\n\n## 节\n", &academic);
        assert!(doc.html.contains("counter(h2)"));
        assert!(doc.html.contains("base-academic"));

        let mut technical = modern();
        technical.base = "technical".to_string();
        let doc = render("```ts\nlet n = 1;\n```\n", &technical);
        assert!(doc.html.contains("<small>ts</small>"));
        assert!(doc.html.contains("border-left:3px solid"));
    }

    #[test]
    fn yahei_preset_uses_the_yahei_stack() {
        let mut profile = modern();
        profile.body_font = "微软雅黑".to_string();
        let doc = render("Hi\n", &profile);
        assert!(doc.html.contains("Microsoft YaHei"));
        assert!(doc.html.contains("微软雅黑"));
    }

    #[test]
    fn rejects_black_ink_and_css_breakout() {
        let mut profile = modern();
        profile.text = "#000000".to_string();
        assert!(export_pdf_document("", meta(), &profile, false, |_| None).is_err());
        profile = modern();
        profile.body_font = "Arial; color: red".to_string();
        assert!(export_pdf_document("", meta(), &profile, false, |_| None).is_err());
        profile = modern();
        profile.paper = "tabloid".to_string();
        assert!(export_pdf_document("", meta(), &profile, false, |_| None).is_err());
    }

    #[test]
    fn minimal_line_height_survives_the_step() {
        let mut profile = modern();
        profile.line_height = 1.85;
        let doc = render("正文\n", &profile);
        assert!(doc.html.contains("15px/1.85"));
        profile.line_height = 1.83;
        assert!(export_pdf_document("", meta(), &profile, false, |_| None).is_err());
    }

    #[test]
    fn toc_lists_the_first_three_levels_and_a_page_break_is_not_printed() {
        let mut profile = modern();
        profile.toc = true;
        profile.lang = "en-US".to_string();
        let doc = render(
            "# A&B\n\n## 节\n\n### 小节\n\n#### 略\n\n前文\n\n\\pagebreak\n\n后文\n\n句子里的 \\pagebreak 还在。\n",
            &profile,
        );
        assert!(doc.html.contains("<h1 id=\"h-1\">A&amp;B</h1>"));
        assert!(doc.html.contains("<h2 id=\"h-3\">"));
        assert!(doc.html.contains("<h3 id=\"h-5\">"));
        assert!(doc.html.contains("<h4>略</h4>"));
        assert!(doc.html.contains("href=\"#h-1\""));
        assert!(doc.html.contains("href=\"#h-3\""));
        assert!(doc.html.contains("href=\"#h-5\""));
        assert!(doc.html.contains(">Contents</p>"));
        assert!(doc.html.contains("class=\"page-break\""));
        assert!(doc.html.contains("break-before:column"));
        assert!(doc.html.contains("break-before:page"));
        let toc = doc.html.split("</nav>").next().expect("toc");
        assert!(!toc.contains("略"));
        assert!(!toc.contains("\\pagebreak"));
        assert_eq!(doc.html.matches("\\pagebreak").count(), 1);
        assert!(!doc.html.to_ascii_lowercase().contains("<script"));
    }

    #[test]
    fn code_break_image_width_and_widows_follow_the_profile() {
        let mut profile = modern();
        profile.base = "academic".to_string();
        profile.code_break = "keep".to_string();
        profile.image_max_percent = 72;
        profile.widows = 3;
        let doc = render("```\ncode\n```\n\n![图](assets/a.png)\n", &profile);
        assert!(doc.html.contains("pre{break-inside:avoid;}"));
        assert!(doc.html.contains("img{max-width:72%;"));
        assert!(doc.html.contains("widows:3;orphans:3;"));
        assert!(doc.html.contains(".base-academic img"));

        profile.code_break = "split".to_string();
        let doc = render("正文\n", &profile);
        assert!(doc.html.contains("pre{break-inside:auto;}"));

        profile.image_max_percent = 39;
        assert!(export_pdf_document("", meta(), &profile, false, |_| None).is_err());
        profile.image_max_percent = 101;
        assert!(export_pdf_document("", meta(), &profile, false, |_| None).is_err());
        profile.image_max_percent = 72;
        profile.widows = 1;
        assert!(export_pdf_document("", meta(), &profile, false, |_| None).is_err());
        profile.widows = 5;
        assert!(export_pdf_document("", meta(), &profile, false, |_| None).is_err());
        profile.widows = 3;
        profile.code_break = "avoid".to_string();
        assert!(export_pdf_document("", meta(), &profile, false, |_| None).is_err());
    }

    #[test]
    fn letter_landscape_swaps_the_page_box() {
        let mut profile = modern();
        profile.paper = "letter".to_string();
        profile.orientation = "landscape".to_string();
        let doc = render("正文\n", &profile);
        assert!((doc.page.width_in - 11.0).abs() < 0.0001);
        assert!((doc.page.height_in - 8.5).abs() < 0.0001);
        assert!(doc.page.landscape);
        assert!((doc.page.width_px - 1056.0).abs() < f64::EPSILON);
        assert!((doc.page.height_px - 816.0).abs() < f64::EPSILON);
    }

    fn meta() -> PdfMeta<'static> {
        PdfMeta {
            title: "笔记",
            filename: "笔记",
            created: "2026-09-29 10:00",
        }
    }
}
