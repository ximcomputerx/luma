use pulldown_cmark::{
    Alignment as PdAlign, BlockQuoteKind, CodeBlockKind, Event, HeadingLevel, Options, Parser, Tag,
};
use rustmark_core::NewlineStyle;

use crate::ast::{
    AlertKind, Alignment, Block, BlockKind, DiagramEngine, Document, Inline, SourceSpan,
};

/// GFM tables, strikethrough, task lists, math, and alert labels.
/// Wikilinks, footnotes, smart punctuation, and metadata stay off.
pub fn mvp_options() -> Options {
    Options::ENABLE_TABLES
        | Options::ENABLE_STRIKETHROUGH
        | Options::ENABLE_TASKLISTS
        | Options::ENABLE_MATH
        | Options::ENABLE_GFM
}

pub fn parse(markdown_lf: &str, newline: NewlineStyle) -> Document {
    let line_starts = line_starts(markdown_lf);
    let parser = Parser::new_ext(markdown_lf, mvp_options());
    let mut builder = Builder {
        line_starts,
        next_id: 1,
        stack: Vec::new(),
        roots: Vec::new(),
        skip: 0,
    };
    for (event, range) in parser.into_offset_iter() {
        builder.push_event(event, range.start, range.end);
    }
    while let Some(open) = builder.stack.pop() {
        builder.finish(open, markdown_lf.len(), markdown_lf.len());
    }
    Document {
        blocks: builder.roots,
        newline,
    }
}

struct Builder {
    line_starts: Vec<usize>,
    next_id: u32,
    stack: Vec<Open>,
    roots: Vec<Block>,
    skip: u32,
}

enum Open {
    Block {
        block: Block,
        code: Option<String>,
    },
    Inline {
        kind: InlineKind,
        children: Vec<Inline>,
    },
}

enum InlineKind {
    Emphasis,
    Strong,
    Strike,
    Link { dest: String, title: String },
    Image { dest: String },
}

impl Builder {
    fn push_event(&mut self, event: Event<'_>, start: usize, end: usize) {
        if self.skip > 0 {
            match event {
                Event::Start(_) => self.skip += 1,
                Event::End(_) => self.skip -= 1,
                _ => {}
            }
            return;
        }
        match event {
            Event::Start(tag) => self.start_tag(tag, start, end),
            Event::End(_) => self.end_tag(end),
            Event::Text(text) => self.push_text(&text),
            Event::Code(text) => self.push_inline(Inline::Code(text.into_string())),
            Event::InlineMath(text) => self.push_inline(Inline::Math(text.into_string())),
            Event::DisplayMath(text) => self.push_display_math(text.into_string(), start, end),
            Event::Html(_) | Event::InlineHtml(_) | Event::FootnoteReference(_) => {}
            Event::SoftBreak => self.push_break(false),
            Event::HardBreak => self.push_break(true),
            Event::Rule => {
                self.push_finished(BlockKind::ThematicBreak, start, end, Vec::new(), Vec::new())
            }
            Event::TaskListMarker(checked) => self.mark_task(checked),
        }
    }

    fn start_tag(&mut self, tag: Tag<'_>, start: usize, end: usize) {
        match tag {
            Tag::HtmlBlock
            | Tag::FootnoteDefinition(_)
            | Tag::DefinitionList
            | Tag::DefinitionListTitle
            | Tag::DefinitionListDefinition
            | Tag::MetadataBlock(_) => {
                self.skip = 1;
            }
            Tag::Paragraph => self.open_block(BlockKind::Paragraph, start, end, None),
            Tag::Heading { level, .. } => self.open_block(
                BlockKind::Heading {
                    level: heading_u8(level),
                },
                start,
                end,
                None,
            ),
            Tag::BlockQuote(kind) => self.open_block(
                BlockKind::BlockQuote {
                    alert: kind.and_then(alert_kind),
                },
                start,
                end,
                None,
            ),
            Tag::CodeBlock(kind) => {
                let (block_kind, buf) = code_kind(kind);
                self.open_block(block_kind, start, end, Some(buf));
            }
            Tag::List(Some(start_num)) => self.open_block(
                BlockKind::OrderedList { start: start_num },
                start,
                end,
                None,
            ),
            Tag::List(None) => self.open_block(BlockKind::BulletList, start, end, None),
            Tag::Item => self.open_block(BlockKind::ListItem { checked: None }, start, end, None),
            Tag::Table(alignments) => self.open_block(
                BlockKind::Table {
                    alignments: alignments.into_iter().map(map_align).collect(),
                },
                start,
                end,
                None,
            ),
            Tag::TableHead => {
                self.open_block(BlockKind::TableRow { header: true }, start, end, None)
            }
            Tag::TableRow => {
                self.open_block(BlockKind::TableRow { header: false }, start, end, None)
            }
            Tag::TableCell => {
                let align = self.cell_align();
                self.open_block(BlockKind::TableCell { align }, start, end, None);
            }
            Tag::Emphasis => self.open_inline(InlineKind::Emphasis),
            Tag::Strong => self.open_inline(InlineKind::Strong),
            Tag::Strikethrough => self.open_inline(InlineKind::Strike),
            Tag::Superscript | Tag::Subscript => self.open_inline(InlineKind::Emphasis),
            Tag::Link {
                dest_url, title, ..
            } => self.open_inline(InlineKind::Link {
                dest: dest_url.into_string(),
                title: title.into_string(),
            }),
            Tag::Image { dest_url, .. } => self.open_inline(InlineKind::Image {
                dest: dest_url.into_string(),
            }),
        }
    }

    fn end_tag(&mut self, end: usize) {
        let Some(open) = self.stack.pop() else {
            return;
        };
        self.finish(open, end, end);
    }

    fn finish(&mut self, open: Open, end: usize, end_for_line: usize) {
        match open {
            Open::Inline { kind, children } => {
                self.push_inline(finish_inline(kind, children));
            }
            Open::Block { mut block, code } => {
                if let Some(source) = code {
                    fill_code(&mut block.kind, source);
                }
                if matches!(block.kind, BlockKind::TableCell { .. }) && block.inlines.is_empty() {
                    let mut lifted = Vec::new();
                    for child in block.children.drain(..) {
                        if matches!(child.kind, BlockKind::Paragraph) {
                            if !lifted.is_empty() {
                                lifted.push(Inline::SoftBreak);
                            }
                            lifted.extend(child.inlines);
                        }
                    }
                    block.inlines = lifted;
                }
                if !block.inlines.is_empty()
                    && matches!(
                        block.kind,
                        BlockKind::ListItem { .. } | BlockKind::BlockQuote { .. }
                    )
                {
                    let inlines = std::mem::take(&mut block.inlines);
                    let child = self.make_block(
                        BlockKind::Paragraph,
                        block.source.start_byte as usize,
                        end,
                        Vec::new(),
                        inlines,
                    );
                    block.children.insert(0, child);
                }
                block.source.end_byte = end.min(u32::MAX as usize) as u32;
                block.source.end_line = end_line(&self.line_starts, end_for_line);
                if matches!(block.kind, BlockKind::Paragraph) && !block.children.is_empty() {
                    // pulldown emits DisplayMath inside the surrounding paragraph.
                    let extras = std::mem::take(&mut block.children);
                    if !block.inlines.is_empty() {
                        self.attach_block(block);
                    }
                    for extra in extras {
                        self.attach_block(extra);
                    }
                    return;
                }
                self.attach_block(block);
            }
        }
    }

    fn open_block(&mut self, kind: BlockKind, start: usize, end: usize, code: Option<String>) {
        let block = self.make_block(kind, start, end, Vec::new(), Vec::new());
        self.stack.push(Open::Block { block, code });
    }

    fn open_inline(&mut self, kind: InlineKind) {
        self.stack.push(Open::Inline {
            kind,
            children: Vec::new(),
        });
    }

    fn make_block(
        &mut self,
        kind: BlockKind,
        start: usize,
        end: usize,
        children: Vec<Block>,
        inlines: Vec<Inline>,
    ) -> Block {
        let id = self.next_id;
        self.next_id = self.next_id.saturating_add(1);
        Block {
            id,
            kind,
            source: SourceSpan {
                start_byte: start.min(u32::MAX as usize) as u32,
                end_byte: end.min(u32::MAX as usize) as u32,
                start_line: line_of(&self.line_starts, start),
                end_line: end_line(&self.line_starts, end),
            },
            children,
            inlines,
        }
    }

    fn attach_block(&mut self, block: Block) {
        for open in self.stack.iter_mut().rev() {
            if let Open::Block { block: parent, .. } = open {
                parent.children.push(block);
                return;
            }
        }
        self.roots.push(block);
    }

    fn push_inline(&mut self, inline: Inline) {
        if self.in_code() {
            if let Inline::Text(text) | Inline::Code(text) = inline {
                self.push_code_text(&text);
            }
            return;
        }
        for open in self.stack.iter_mut().rev() {
            match open {
                Open::Inline { children, .. } => {
                    children.push(inline);
                    return;
                }
                Open::Block { block, .. } => {
                    block.inlines.push(inline);
                    return;
                }
            }
        }
    }

    fn push_text(&mut self, text: &str) {
        if self.in_code() {
            self.push_code_text(text);
            return;
        }
        if text.is_empty() {
            return;
        }
        self.push_inline(Inline::Text(text.to_string()));
    }

    fn push_break(&mut self, hard: bool) {
        if self.in_code() {
            self.push_code_text("\n");
            return;
        }
        self.push_inline(if hard {
            Inline::HardBreak
        } else {
            Inline::SoftBreak
        });
    }

    fn push_code_text(&mut self, text: &str) {
        for open in self.stack.iter_mut().rev() {
            if let Open::Block {
                code: Some(buf), ..
            } = open
            {
                buf.push_str(text);
                return;
            }
        }
    }

    fn in_code(&self) -> bool {
        self.stack
            .iter()
            .rev()
            .any(|open| matches!(open, Open::Block { code: Some(_), .. }))
    }

    fn push_display_math(&mut self, tex: String, start: usize, end: usize) {
        let block = self.make_block(
            BlockKind::MathDisplay { tex },
            start,
            end,
            Vec::new(),
            Vec::new(),
        );
        self.attach_block(block);
    }

    fn push_finished(
        &mut self,
        kind: BlockKind,
        start: usize,
        end: usize,
        children: Vec<Block>,
        inlines: Vec<Inline>,
    ) {
        let block = self.make_block(kind, start, end, children, inlines);
        self.attach_block(block);
    }

    fn mark_task(&mut self, checked: bool) {
        for open in self.stack.iter_mut().rev() {
            if let Open::Block {
                block:
                    Block {
                        kind: BlockKind::ListItem { checked: slot },
                        ..
                    },
                ..
            } = open
            {
                *slot = Some(checked);
                return;
            }
        }
    }

    fn cell_align(&self) -> Alignment {
        let mut row_cells = 0usize;
        let mut seen_row = false;
        for open in self.stack.iter().rev() {
            if let Open::Block { block, .. } = open {
                match &block.kind {
                    BlockKind::TableRow { .. } if !seen_row => {
                        row_cells = block.children.len();
                        seen_row = true;
                    }
                    BlockKind::Table { alignments } => {
                        return alignments
                            .get(row_cells)
                            .copied()
                            .unwrap_or(Alignment::None);
                    }
                    _ => {}
                }
            }
        }
        Alignment::None
    }
}

fn finish_inline(kind: InlineKind, children: Vec<Inline>) -> Inline {
    match kind {
        InlineKind::Emphasis => Inline::Emphasis(children),
        InlineKind::Strong => Inline::Strong(children),
        InlineKind::Strike => Inline::Strike(children),
        InlineKind::Link { dest, title } => Inline::Link {
            dest,
            title,
            children,
        },
        InlineKind::Image { dest } => Inline::Image {
            alt: inline_text(&children),
            dest,
        },
    }
}

fn fill_code(kind: &mut BlockKind, source: String) {
    match kind {
        BlockKind::Code { source: slot, .. } | BlockKind::Diagram { source: slot, .. } => {
            *slot = source;
        }
        _ => {}
    }
}

fn code_kind(kind: CodeBlockKind<'_>) -> (BlockKind, String) {
    match kind {
        CodeBlockKind::Fenced(info) => {
            let lang = info
                .split_whitespace()
                .next()
                .filter(|token| !token.is_empty());
            if lang.is_some_and(|token| token.eq_ignore_ascii_case("mermaid")) {
                (
                    BlockKind::Diagram {
                        engine: DiagramEngine::Mermaid,
                        source: String::new(),
                    },
                    String::new(),
                )
            } else {
                (
                    BlockKind::Code {
                        lang: lang.map(str::to_string),
                        source: String::new(),
                    },
                    String::new(),
                )
            }
        }
        CodeBlockKind::Indented => (
            BlockKind::Code {
                lang: None,
                source: String::new(),
            },
            String::new(),
        ),
    }
}

fn heading_u8(level: HeadingLevel) -> u8 {
    match level {
        HeadingLevel::H1 => 1,
        HeadingLevel::H2 => 2,
        HeadingLevel::H3 => 3,
        HeadingLevel::H4 => 4,
        HeadingLevel::H5 => 5,
        HeadingLevel::H6 => 6,
    }
}

fn alert_kind(kind: BlockQuoteKind) -> Option<AlertKind> {
    Some(match kind {
        BlockQuoteKind::Note => AlertKind::Note,
        BlockQuoteKind::Tip => AlertKind::Tip,
        BlockQuoteKind::Important => AlertKind::Important,
        BlockQuoteKind::Warning => AlertKind::Warning,
        BlockQuoteKind::Caution => AlertKind::Caution,
    })
}

fn map_align(align: PdAlign) -> Alignment {
    match align {
        PdAlign::None => Alignment::None,
        PdAlign::Left => Alignment::Left,
        PdAlign::Center => Alignment::Center,
        PdAlign::Right => Alignment::Right,
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

fn line_starts(text: &str) -> Vec<usize> {
    let mut starts = vec![0];
    for (index, byte) in text.bytes().enumerate() {
        if byte == b'\n' {
            starts.push(index + 1);
        }
    }
    starts
}

fn line_of(starts: &[usize], byte: usize) -> u32 {
    match starts.binary_search(&byte.min(starts.last().copied().unwrap_or(0))) {
        Ok(index) => index as u32 + 1,
        Err(index) => index.max(1) as u32,
    }
}

fn end_line(starts: &[usize], end_exclusive: usize) -> u32 {
    if end_exclusive == 0 {
        1
    } else {
        line_of(starts, end_exclusive - 1)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ast::{BlockKind, Inline};

    fn doc(markdown: &str) -> Document {
        parse(markdown, NewlineStyle::Lf)
    }

    #[test]
    fn nested_emphasis() {
        let parsed = doc("**_x_**\n");
        let paragraph = &parsed.blocks[0];
        match &paragraph.inlines[0] {
            Inline::Strong(children) => match &children[0] {
                Inline::Emphasis(inner) => match &inner[0] {
                    Inline::Text(text) => assert_eq!(text, "x"),
                    other => panic!("{other:?}"),
                },
                other => panic!("{other:?}"),
            },
            other => panic!("{other:?}"),
        }
    }

    #[test]
    fn task_item_checked() {
        let parsed = doc("- [x] done\n");
        let item = &parsed.blocks[0].children[0];
        assert!(matches!(
            item.kind,
            BlockKind::ListItem {
                checked: Some(true)
            }
        ));
    }

    #[test]
    fn two_column_table() {
        let parsed = doc("| a | b |\n| :--- | ---: |\n| 1 | 2 |\n");
        let table = &parsed.blocks[0];
        match &table.kind {
            BlockKind::Table { alignments } => {
                assert_eq!(alignments, &vec![Alignment::Left, Alignment::Right]);
            }
            other => panic!("{other:?}"),
        }
        assert!(table.children.len() >= 2);
        assert!(matches!(
            table.children[0].kind,
            BlockKind::TableRow { header: true }
        ));
    }

    #[test]
    fn display_math_keeps_tex() {
        let parsed = doc("$$e=mc^2$$\n");
        assert!(parsed.blocks.iter().any(|block| matches!(
            &block.kind,
            BlockKind::MathDisplay { tex } if tex.contains("e=mc^2")
        )));
    }

    #[test]
    fn mermaid_fence_keeps_source() {
        let parsed = doc("```mermaid\ngraph TD\n  A-->B\n```\n");
        match &parsed.blocks[0].kind {
            BlockKind::Diagram { engine, source } => {
                assert_eq!(*engine, DiagramEngine::Mermaid);
                assert_eq!(source, "graph TD\n  A-->B\n");
                assert!(!source.contains("```"));
                assert!(!source.contains("&gt;"));
            }
            other => panic!("{other:?}"),
        }
    }

    #[test]
    fn mermaid_fixtures_keep_the_fence_body() {
        let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../fixtures/mermaid");
        let cases = [
            ("flowchart-basic.md", "flowchart LR\n    A --> B\n"),
            (
                "flowchart-label.md",
                "flowchart LR\n    A[开始] --> B[结束]\n",
            ),
            ("sequence.md", "sequenceDiagram\n    Alice->>Bob: Hello\n"),
            ("invalid.md", "flowchart LR\n    A -->\n"),
        ];
        for (name, source) in cases {
            let markdown = std::fs::read_to_string(dir.join(name)).unwrap();
            let parsed = parse(&markdown, NewlineStyle::Lf);
            match &parsed.blocks[0].kind {
                BlockKind::Diagram {
                    engine,
                    source: actual,
                } => {
                    assert_eq!(*engine, DiagramEngine::Mermaid, "{name}");
                    assert_eq!(actual, source, "{name}");
                    assert!(!actual.contains("```"), "{name}");
                    assert!(!actual.contains("&gt;"), "{name}");
                }
                other => panic!("{name}: {other:?}"),
            }
        }
    }

    #[test]
    fn raw_html_is_dropped() {
        let parsed = doc("<script>alert(1)</script>\n");
        let dumped = format!("{parsed:?}");
        assert!(!dumped.contains("Html("));
        assert!(!parsed.blocks.iter().any(|block| matches!(
            block.kind,
            BlockKind::Code { .. } | BlockKind::Diagram { .. }
        )));
    }

    #[test]
    fn two_hundred_line_fence_has_a_real_span() {
        let mut markdown = String::from("```\n");
        for line in 1..=200 {
            markdown.push_str(&format!("line{line}\n"));
        }
        markdown.push_str("```\n");
        let parsed = doc(&markdown);
        let block = &parsed.blocks[0];
        assert!(block.source.end_line >= block.source.start_line + 199);
        match &block.kind {
            BlockKind::Code { source, .. } => {
                assert!(source.contains("line100"));
                assert!(source.contains("line200"));
            }
            other => panic!("{other:?}"),
        }
    }
}
