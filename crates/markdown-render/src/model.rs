use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PreviewRequest {
    pub render_gen: u64,
    pub markdown_lf: String,
    pub force_full: bool,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct PreviewPayload {
    pub render_gen: u64,
    pub mode: PreviewMode,
    pub blocks: Vec<PreviewNode>,
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum PreviewMode {
    Full,
    Outline,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct PreviewNode {
    pub id: u32,
    pub source_line: u32,
    pub end_line: u32,
    pub body: PreviewBody,
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum PreviewAlign {
    None,
    Left,
    Center,
    Right,
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum PreviewAlert {
    Note,
    Tip,
    Important,
    Warning,
    Caution,
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum PreviewDiagramEngine {
    Mermaid,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum PreviewBody {
    Paragraph {
        inlines: Vec<PreviewInline>,
    },
    Heading {
        level: u8,
        inlines: Vec<PreviewInline>,
    },
    BulletList {
        items: Vec<PreviewNode>,
    },
    OrderedList {
        start: u64,
        items: Vec<PreviewNode>,
    },
    ListItem {
        checked: Option<bool>,
        blocks: Vec<PreviewNode>,
    },
    BlockQuote {
        alert: Option<PreviewAlert>,
        blocks: Vec<PreviewNode>,
    },
    Code {
        lang: Option<String>,
        source: String,
    },
    Diagram {
        engine: PreviewDiagramEngine,
        source: String,
    },
    Table {
        alignments: Vec<PreviewAlign>,
        rows: Vec<PreviewRow>,
    },
    ThematicBreak,
    MathDisplay {
        tex: String,
    },
    OutlineHeading {
        level: u8,
        text: String,
    },
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct PreviewRow {
    pub header: bool,
    pub cells: Vec<PreviewCell>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct PreviewCell {
    pub align: PreviewAlign,
    pub inlines: Vec<PreviewInline>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum PreviewInline {
    Text { text: String },
    Emphasis { children: Vec<PreviewInline> },
    Strong { children: Vec<PreviewInline> },
    Strike { children: Vec<PreviewInline> },
    Code { text: String },
    Link { children: Vec<PreviewInline> },
    Image { alt: String, src: Option<String> },
    Math { tex: String },
    SoftBreak,
    HardBreak,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct PreviewError {
    pub code: &'static str,
    pub message: &'static str,
}

impl PreviewError {
    pub const TOO_LARGE: Self = Self {
        code: "too_large",
        message: "文档超过 8 MB，无法预览。",
    };
}
