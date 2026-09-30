export type PreviewInline =
  | { type: "text"; text: string }
  | { type: "emphasis"; children: PreviewInline[] }
  | { type: "strong"; children: PreviewInline[] }
  | { type: "strike"; children: PreviewInline[] }
  | { type: "code"; text: string }
  | { type: "link"; children: PreviewInline[] }
  | { type: "image"; alt: string; src: string | null }
  | { type: "math"; tex: string }
  | { type: "soft_break" }
  | { type: "hard_break" };

export type PreviewBody =
  | { type: "paragraph"; inlines: PreviewInline[] }
  | { type: "heading"; level: number; inlines: PreviewInline[] }
  | { type: "bullet_list"; items: PreviewNode[] }
  | { type: "ordered_list"; start: number; items: PreviewNode[] }
  | { type: "list_item"; checked: boolean | null; blocks: PreviewNode[] }
  | { type: "block_quote"; alert: string | null; blocks: PreviewNode[] }
  | { type: "code"; lang: string | null; source: string }
  | { type: "diagram"; engine: "mermaid"; source: string }
  | {
      type: "table";
      alignments: Array<"none" | "left" | "center" | "right">;
      rows: Array<{
        header: boolean;
        cells: Array<{ align: "none" | "left" | "center" | "right"; inlines: PreviewInline[] }>;
      }>;
    }
  | { type: "thematic_break" }
  | { type: "math_display"; tex: string }
  | { type: "outline_heading"; level: number; text: string };

export type PreviewNode = {
  id: number;
  source_line: number;
  end_line: number;
  body: PreviewBody;
};

export type PreviewPayload = {
  render_gen: number;
  mode: "full" | "outline";
  blocks: PreviewNode[];
};

export type PreviewMessage =
  | { type: "render"; render_gen: number; mode: "full" | "outline"; blocks: PreviewNode[] }
  | { type: "scrollTo"; render_gen: number; id: number; ratio: number }
  | { type: "visible"; render_gen: number; id: number; ratio: number };

export function childNodes(node: PreviewNode): PreviewNode[] | null {
  switch (node.body.type) {
    case "bullet_list":
    case "ordered_list":
      return node.body.items;
    case "list_item":
    case "block_quote":
      return node.body.blocks;
    default:
      return null;
  }
}

export function containsDiagram(nodes: PreviewNode[]): boolean {
  for (const node of nodes) {
    if (node.body.type === "diagram") {
      return true;
    }
    const children = childNodes(node);
    if (children && containsDiagram(children)) {
      return true;
    }
  }
  return false;
}
