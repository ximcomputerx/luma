use markdown_engine::{
    parse, AlertKind, Alignment, Block, BlockKind, Document, Inline, NewlineStyle,
};
use rustmark_core::{classify_image_destination, ImageDestination, PreviewFlags};

use crate::model::{
    PreviewAlert, PreviewAlign, PreviewBody, PreviewCell, PreviewDiagramEngine, PreviewError,
    PreviewInline, PreviewMode, PreviewNode, PreviewPayload, PreviewRequest, PreviewRow,
};

const MIB: usize = 1024 * 1024;

pub fn render_preview(
    request: &PreviewRequest,
    settings: &PreviewFlags,
) -> Result<PreviewPayload, PreviewError> {
    render_preview_resolved(request, settings, &mut |_| None)
}

pub fn render_preview_resolved(
    request: &PreviewRequest,
    settings: &PreviewFlags,
    resolve_local: &mut dyn FnMut(&str) -> Option<String>,
) -> Result<PreviewPayload, PreviewError> {
    if request.markdown_lf.len() > 8 * MIB {
        return Err(PreviewError::TOO_LARGE);
    }
    let document = parse(&request.markdown_lf, NewlineStyle::Lf);
    let heavy = request.markdown_lf.len() > MIB || document.block_count() > 4000;
    if heavy && !request.force_full {
        return Ok(outline_payload(request.render_gen, &document));
    }
    let mut payload = PreviewPayload {
        render_gen: request.render_gen,
        mode: PreviewMode::Full,
        blocks: document
            .blocks
            .iter()
            .filter_map(|block| block_node(block, settings, resolve_local))
            .collect(),
    };
    if !request.force_full {
        if json_len(&payload.blocks) > 2 * MIB {
            clear_data_images(&mut payload.blocks);
        }
        if json_len(&payload.blocks) > 2 * MIB {
            payload = outline_payload(request.render_gen, &document);
        }
    }
    Ok(payload)
}

fn json_len(blocks: &[PreviewNode]) -> usize {
    serde_json::to_vec(blocks)
        .map(|bytes| bytes.len())
        .unwrap_or(usize::MAX)
}

fn clear_data_images(nodes: &mut [PreviewNode]) {
    for node in nodes {
        match &mut node.body {
            PreviewBody::Paragraph { inlines } | PreviewBody::Heading { inlines, .. } => {
                clear_inline_data(inlines);
            }
            PreviewBody::BulletList { items } | PreviewBody::OrderedList { items, .. } => {
                clear_data_images(items);
            }
            PreviewBody::ListItem { blocks, .. } | PreviewBody::BlockQuote { blocks, .. } => {
                clear_data_images(blocks);
            }
            PreviewBody::Table { rows, .. } => {
                for row in rows {
                    for cell in &mut row.cells {
                        clear_inline_data(&mut cell.inlines);
                    }
                }
            }
            _ => {}
        }
    }
}

fn clear_inline_data(inlines: &mut [PreviewInline]) {
    for inline in inlines {
        match inline {
            PreviewInline::Image { src, .. } => {
                if src
                    .as_deref()
                    .is_some_and(|value| value.starts_with("data:"))
                {
                    *src = None;
                }
            }
            PreviewInline::Emphasis { children }
            | PreviewInline::Strong { children }
            | PreviewInline::Strike { children }
            | PreviewInline::Link { children } => clear_inline_data(children),
            _ => {}
        }
    }
}

fn outline_payload(render_gen: u64, document: &Document) -> PreviewPayload {
    PreviewPayload {
        render_gen,
        mode: PreviewMode::Outline,
        blocks: outline_blocks(&document.blocks),
    }
}

fn outline_blocks(blocks: &[Block]) -> Vec<PreviewNode> {
    let mut out = Vec::new();
    for block in blocks {
        if let BlockKind::Heading { level } = block.kind {
            out.push(PreviewNode {
                id: block.id,
                source_line: block.source.start_line,
                end_line: block.source.end_line,
                body: PreviewBody::OutlineHeading {
                    level,
                    text: inline_text(&block.inlines),
                },
            });
        }
        out.extend(outline_blocks(&block.children));
    }
    out
}

fn block_node(
    block: &Block,
    settings: &PreviewFlags,
    resolve_local: &mut dyn FnMut(&str) -> Option<String>,
) -> Option<PreviewNode> {
    let body = match &block.kind {
        BlockKind::Paragraph => PreviewBody::Paragraph {
            inlines: map_inlines(&block.inlines, settings, resolve_local),
        },
        BlockKind::Heading { level } => PreviewBody::Heading {
            level: *level,
            inlines: map_inlines(&block.inlines, settings, resolve_local),
        },
        BlockKind::BulletList => PreviewBody::BulletList {
            items: child_nodes(block, settings, resolve_local),
        },
        BlockKind::OrderedList { start } => PreviewBody::OrderedList {
            start: *start,
            items: child_nodes(block, settings, resolve_local),
        },
        BlockKind::ListItem { checked } => PreviewBody::ListItem {
            checked: *checked,
            blocks: child_nodes(block, settings, resolve_local),
        },
        BlockKind::BlockQuote { alert } => PreviewBody::BlockQuote {
            alert: alert.map(map_alert),
            blocks: child_nodes(block, settings, resolve_local),
        },
        BlockKind::Code { lang, source } => PreviewBody::Code {
            lang: lang.clone(),
            source: source.clone(),
        },
        BlockKind::Diagram { source, .. } => {
            if settings.mermaid {
                PreviewBody::Diagram {
                    engine: PreviewDiagramEngine::Mermaid,
                    source: source.clone(),
                }
            } else {
                PreviewBody::Code {
                    lang: Some("mermaid".to_string()),
                    source: source.clone(),
                }
            }
        }
        BlockKind::Table { alignments } => PreviewBody::Table {
            alignments: alignments.iter().copied().map(map_align).collect(),
            rows: table_rows(block, settings, resolve_local),
        },
        BlockKind::TableRow { .. } | BlockKind::TableCell { .. } => return None,
        BlockKind::ThematicBreak => PreviewBody::ThematicBreak,
        BlockKind::MathDisplay { tex } => {
            if settings.math {
                PreviewBody::MathDisplay { tex: tex.clone() }
            } else {
                PreviewBody::Paragraph {
                    inlines: vec![PreviewInline::Text { text: tex.clone() }],
                }
            }
        }
    };
    Some(PreviewNode {
        id: block.id,
        source_line: block.source.start_line,
        end_line: block.source.end_line,
        body,
    })
}

fn child_nodes(
    block: &Block,
    settings: &PreviewFlags,
    resolve_local: &mut dyn FnMut(&str) -> Option<String>,
) -> Vec<PreviewNode> {
    block
        .children
        .iter()
        .filter_map(|child| block_node(child, settings, resolve_local))
        .collect()
}

fn table_rows(
    table: &Block,
    settings: &PreviewFlags,
    resolve_local: &mut dyn FnMut(&str) -> Option<String>,
) -> Vec<PreviewRow> {
    table
        .children
        .iter()
        .filter_map(|row| {
            let BlockKind::TableRow { header } = row.kind else {
                return None;
            };
            let cells = row
                .children
                .iter()
                .filter_map(|cell| {
                    let BlockKind::TableCell { align } = cell.kind else {
                        return None;
                    };
                    Some(PreviewCell {
                        align: map_align(align),
                        inlines: map_inlines(&cell.inlines, settings, resolve_local),
                    })
                })
                .collect();
            Some(PreviewRow { header, cells })
        })
        .collect()
}

fn map_inlines(
    inlines: &[Inline],
    settings: &PreviewFlags,
    resolve_local: &mut dyn FnMut(&str) -> Option<String>,
) -> Vec<PreviewInline> {
    inlines
        .iter()
        .map(|inline| map_inline(inline, settings, resolve_local))
        .collect()
}

fn map_inline(
    inline: &Inline,
    settings: &PreviewFlags,
    resolve_local: &mut dyn FnMut(&str) -> Option<String>,
) -> PreviewInline {
    match inline {
        Inline::Text(text) => PreviewInline::Text { text: text.clone() },
        Inline::SoftBreak => PreviewInline::SoftBreak,
        Inline::HardBreak => PreviewInline::HardBreak,
        Inline::Emphasis(children) => PreviewInline::Emphasis {
            children: map_inlines(children, settings, resolve_local),
        },
        Inline::Strong(children) => PreviewInline::Strong {
            children: map_inlines(children, settings, resolve_local),
        },
        Inline::Strike(children) => PreviewInline::Strike {
            children: map_inlines(children, settings, resolve_local),
        },
        Inline::Code(text) => PreviewInline::Code { text: text.clone() },
        Inline::Link { children, .. } => PreviewInline::Link {
            children: map_inlines(children, settings, resolve_local),
        },
        Inline::Image { dest, alt } => PreviewInline::Image {
            alt: alt.clone(),
            src: image_src(dest, settings, resolve_local),
        },
        Inline::Math(tex) => {
            if settings.math {
                PreviewInline::Math { tex: tex.clone() }
            } else {
                PreviewInline::Text { text: tex.clone() }
            }
        }
    }
}

fn image_src(
    dest: &str,
    settings: &PreviewFlags,
    resolve_local: &mut dyn FnMut(&str) -> Option<String>,
) -> Option<String> {
    match classify_image_destination(dest) {
        ImageDestination::AllowedHttps(url) if settings.remote_images => Some(url),
        ImageDestination::Placeholder => resolve_local(dest),
        ImageDestination::AllowedHttps(_) | ImageDestination::Rejected => None,
    }
}

fn map_align(align: Alignment) -> PreviewAlign {
    match align {
        Alignment::None => PreviewAlign::None,
        Alignment::Left => PreviewAlign::Left,
        Alignment::Center => PreviewAlign::Center,
        Alignment::Right => PreviewAlign::Right,
    }
}

fn map_alert(alert: AlertKind) -> PreviewAlert {
    match alert {
        AlertKind::Note => PreviewAlert::Note,
        AlertKind::Tip => PreviewAlert::Tip,
        AlertKind::Important => PreviewAlert::Important,
        AlertKind::Warning => PreviewAlert::Warning,
        AlertKind::Caution => PreviewAlert::Caution,
    }
}

fn inline_text(inlines: &[Inline]) -> String {
    let mut out = String::new();
    for inline in inlines {
        match inline {
            Inline::Text(text) | Inline::Code(text) | Inline::Math(text) => out.push_str(text),
            Inline::SoftBreak | Inline::HardBreak => out.push(' '),
            Inline::Emphasis(children)
            | Inline::Strong(children)
            | Inline::Strike(children)
            | Inline::Link { children, .. } => out.push_str(&inline_text(children)),
            Inline::Image { alt, .. } => out.push_str(alt),
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::PreviewBody;

    fn render(markdown: &str) -> PreviewPayload {
        render_preview(
            &PreviewRequest {
                render_gen: 1,
                markdown_lf: markdown.to_string(),
                force_full: false,
            },
            &PreviewFlags::default(),
        )
        .unwrap()
    }

    fn json(markdown: &str) -> String {
        serde_json::to_string(&render(markdown).blocks).unwrap()
    }

    #[test]
    fn nested_emphasis_has_no_html_field() {
        let payload = render("**_x_**\n");
        let PreviewBody::Paragraph { inlines } = &payload.blocks[0].body else {
            panic!("{:?}", payload.blocks[0].body);
        };
        let PreviewInline::Strong { children } = &inlines[0] else {
            panic!("{inlines:?}");
        };
        let PreviewInline::Emphasis { children } = &children[0] else {
            panic!("{children:?}");
        };
        assert!(matches!(&children[0], PreviewInline::Text { text } if text == "x"));
        assert!(!json("**_x_**\n").contains("\"html\""));
    }

    #[test]
    fn task_table_math_and_mermaid() {
        let task = render("- [ ] todo\n");
        let PreviewBody::BulletList { items } = &task.blocks[0].body else {
            panic!("{:?}", task.blocks[0]);
        };
        let PreviewBody::ListItem { checked, .. } = &items[0].body else {
            panic!("{:?}", items[0]);
        };
        assert_eq!(*checked, Some(false));

        let table = render("| a | b |\n| --- | --- |\n| 1 | 2 |\n");
        let PreviewBody::Table { alignments, rows } = &table.blocks[0].body else {
            panic!("{:?}", table.blocks[0]);
        };
        assert_eq!(alignments.len(), 2);
        assert_eq!(rows.len(), 2);
        assert!(rows[0].header);
        assert_eq!(rows[1].cells.len(), 2);

        let math = render("$$e=mc^2$$\n");
        assert!(math.blocks.iter().any(|node| matches!(
            &node.body,
            PreviewBody::MathDisplay { tex } if tex.contains("e=mc^2")
        )));

        let diagram = render("```mermaid\ngraph TD\n  A-->B\n```\n");
        let PreviewBody::Diagram { source, .. } = &diagram.blocks[0].body else {
            panic!("{:?}", diagram.blocks[0]);
        };
        assert!(source.contains("graph TD"));
    }

    #[test]
    fn script_text_stays_text_and_raw_html_is_not_a_node() {
        let code = render("`<script>alert(1)</script>`\n");
        let dumped = serde_json::to_string(&code).unwrap();
        assert!(dumped.contains("<script>"));
        assert!(!dumped.contains("\"html\""));
        let raw = render("<script>alert(1)</script>\n");
        let raw_json = serde_json::to_string(&raw).unwrap();
        assert!(!raw_json.contains("\"type\":\"code\""));
        assert!(!raw_json.contains("alert(1)"));
    }

    #[test]
    fn remote_image_flag_is_not_a_request_field() {
        let rejected = serde_json::from_str::<PreviewRequest>(
            r#"{"render_gen":1,"markdown_lf":"x","force_full":false,"remote_images":true}"#,
        );
        assert!(rejected.is_err());

        let mut flags = PreviewFlags::default();
        let request = PreviewRequest {
            render_gen: 7,
            markdown_lf: "![a](https://example.com/a.png)\n".to_string(),
            force_full: false,
        };
        let hidden = render_preview(&request, &flags).unwrap();
        assert!(image_srcs(&hidden).iter().all(|src| src.is_none()));
        flags.remote_images = true;
        let shown = render_preview(&request, &flags).unwrap();
        assert!(image_srcs(&shown).iter().any(|src| src.is_some()));

        flags.remote_images = true;
        let local = PreviewRequest {
            markdown_lf: "![a](https://127.0.0.1/a.png)\n![b](assets/a.png)\n".to_string(),
            ..request
        };
        let blocked = render_preview(&local, &flags).unwrap();
        assert!(image_srcs(&blocked).iter().all(|src| src.is_none()));
    }

    #[test]
    fn local_resolver_fills_only_placeholder_destinations() {
        let request = PreviewRequest {
            render_gen: 1,
            markdown_lf: "![a](assets/a.png)\n![b](javascript:alert(1))\n![c](../secret.png)\n"
                .to_string(),
            force_full: false,
        };
        let mut seen = Vec::new();
        let payload = render_preview_resolved(&request, &PreviewFlags::default(), &mut |dest| {
            seen.push(dest.to_string());
            if dest == "assets/a.png" {
                Some("data:image/png;base64,AAAA".to_string())
            } else {
                None
            }
        })
        .unwrap();
        let srcs = image_srcs(&payload);
        assert_eq!(srcs[0].as_deref(), Some("data:image/png;base64,AAAA"));
        assert!(srcs[1].is_none());
        assert!(seen.iter().any(|dest| dest == "assets/a.png"));
        assert!(!seen.iter().any(|dest| dest.contains("javascript")));
        let dumped = serde_json::to_string(&payload).unwrap();
        assert!(!dumped.contains("\"html\""));
    }

    #[test]
    fn links_have_no_href() {
        let dumped = json("[hello](https://example.com)\n");
        assert!(dumped.contains("\"type\":\"link\""));
        assert!(!dumped.contains("href"));
        assert!(!dumped.contains("example.com"));
    }

    #[test]
    fn eight_mib_is_rejected_without_a_huge_tree() {
        let request = PreviewRequest {
            render_gen: 1,
            markdown_lf: "x".repeat(8 * MIB + 1),
            force_full: true,
        };
        let error = render_preview(&request, &PreviewFlags::default()).unwrap_err();
        assert_eq!(error.code, "too_large");
    }

    #[test]
    fn preview_fixtures_match_disk() {
        let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../fixtures/preview");
        let cases = [
            ("nested-emphasis.json", "**_x_**\n"),
            ("task-item.json", "- [x] done\n"),
            (
                "two-column-table.json",
                "| a | b |\n| :--- | ---: |\n| 1 | 2 |\n",
            ),
            ("display-math.json", "$$e=mc^2$$\n"),
            ("mermaid.json", "```mermaid\ngraph TD\n  A-->B\n```\n"),
        ];
        for (name, markdown) in cases {
            let actual = serde_json::to_string_pretty(&render(markdown)).unwrap() + "\n";
            let path = dir.join(name);
            if std::env::var_os("UPDATE_FIXTURES").is_some() {
                std::fs::create_dir_all(&dir).unwrap();
                std::fs::write(&path, &actual).unwrap();
            }
            let expected = std::fs::read_to_string(&path)
                .unwrap_or_else(|_| panic!("missing fixture {}", path.display()));
            assert_eq!(actual, expected, "{}", path.display());
        }
    }

    fn image_srcs(payload: &PreviewPayload) -> Vec<Option<String>> {
        fn walk(nodes: &[PreviewNode], out: &mut Vec<Option<String>>) {
            for node in nodes {
                match &node.body {
                    PreviewBody::Paragraph { inlines } | PreviewBody::Heading { inlines, .. } => {
                        walk_inlines(inlines, out)
                    }
                    PreviewBody::BulletList { items } | PreviewBody::OrderedList { items, .. } => {
                        walk(items, out)
                    }
                    PreviewBody::ListItem { blocks, .. }
                    | PreviewBody::BlockQuote { blocks, .. } => walk(blocks, out),
                    PreviewBody::Table { rows, .. } => {
                        for row in rows {
                            for cell in &row.cells {
                                walk_inlines(&cell.inlines, out);
                            }
                        }
                    }
                    _ => {}
                }
            }
        }
        fn walk_inlines(inlines: &[PreviewInline], out: &mut Vec<Option<String>>) {
            for inline in inlines {
                match inline {
                    PreviewInline::Image { src, .. } => out.push(src.clone()),
                    PreviewInline::Emphasis { children }
                    | PreviewInline::Strong { children }
                    | PreviewInline::Strike { children }
                    | PreviewInline::Link { children } => walk_inlines(children, out),
                    _ => {}
                }
            }
        }
        let mut out = Vec::new();
        walk(&payload.blocks, &mut out);
        out
    }
}
