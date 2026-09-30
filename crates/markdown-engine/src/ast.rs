use rustmark_core::NewlineStyle;

/// One parse. Ids are stable only inside this tree.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Document {
    pub blocks: Vec<Block>,
    pub newline: NewlineStyle,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Block {
    pub id: u32,
    pub kind: BlockKind,
    pub source: SourceSpan,
    pub children: Vec<Block>,
    pub inlines: Vec<Inline>,
}

/// Byte offsets are UTF-8 indexes into the LF buffer. Lines are 1-based and inclusive.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct SourceSpan {
    pub start_byte: u32,
    pub end_byte: u32,
    pub start_line: u32,
    pub end_line: u32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Alignment {
    None,
    Left,
    Center,
    Right,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AlertKind {
    Note,
    Tip,
    Important,
    Warning,
    Caution,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DiagramEngine {
    Mermaid,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum BlockKind {
    Paragraph,
    Heading {
        level: u8,
    },
    BulletList,
    OrderedList {
        start: u64,
    },
    ListItem {
        checked: Option<bool>,
    },
    BlockQuote {
        alert: Option<AlertKind>,
    },
    Code {
        lang: Option<String>,
        source: String,
    },
    Diagram {
        engine: DiagramEngine,
        source: String,
    },
    Table {
        alignments: Vec<Alignment>,
    },
    TableRow {
        header: bool,
    },
    TableCell {
        align: Alignment,
    },
    ThematicBreak,
    MathDisplay {
        tex: String,
    },
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Inline {
    Text(String),
    SoftBreak,
    HardBreak,
    Emphasis(Vec<Inline>),
    Strong(Vec<Inline>),
    Strike(Vec<Inline>),
    Code(String),
    Link {
        dest: String,
        title: String,
        children: Vec<Inline>,
    },
    Image {
        dest: String,
        alt: String,
    },
    Math(String),
}

impl Document {
    pub fn block_count(&self) -> usize {
        self.blocks.iter().map(Block::count).sum()
    }
}

impl Block {
    fn count(&self) -> usize {
        1 + self.children.iter().map(Block::count).sum::<usize>()
    }
}
