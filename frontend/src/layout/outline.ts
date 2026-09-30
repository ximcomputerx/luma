import { childNodes, type PreviewInline, type PreviewNode } from "../preview/types";

export type OutlineEntry = {
  id: number;
  level: number;
  text: string;
  line: number;
};

export type OutlineRow = {
  entry: OutlineEntry;
  key: string;
  hasChildren: boolean;
  collapsed: boolean;
};

export function outlineEntries(blocks: PreviewNode[]): OutlineEntry[] {
  const entries: OutlineEntry[] = [];
  walk(blocks, entries);
  return entries;
}

export function headingAtLine(entries: readonly OutlineEntry[], line: number): OutlineEntry | null {
  let chosen: OutlineEntry | null = null;
  for (const entry of entries) {
    if (entry.line > line) {
      break;
    }
    chosen = entry;
  }
  return chosen;
}

export function visibleOutline(entries: readonly OutlineEntry[], collapsed: ReadonlySet<string>): OutlineRow[] {
  const keys = outlineKeys(entries);
  const rows: OutlineRow[] = [];
  const hiddenAt: number[] = [];
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    while (hiddenAt.length > 0 && entry.level <= hiddenAt[hiddenAt.length - 1]) {
      hiddenAt.pop();
    }
    if (hiddenAt.length > 0) {
      continue;
    }
    const hasChildren = index + 1 < entries.length && entries[index + 1].level > entry.level;
    const folded = hasChildren && collapsed.has(keys[index]);
    rows.push({ entry, key: keys[index], hasChildren, collapsed: folded });
    if (folded) {
      hiddenAt.push(entry.level);
    }
  }
  return rows;
}

export function visibleActiveId(
  entries: readonly OutlineEntry[],
  collapsed: ReadonlySet<string>,
  activeId: number | null,
): number | null {
  if (activeId === null) {
    return null;
  }
  const rows = visibleOutline(entries, collapsed);
  if (rows.some((row) => row.entry.id === activeId)) {
    return activeId;
  }
  const index = entries.findIndex((entry) => entry.id === activeId);
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    const id = entries[cursor].id;
    if (rows.some((row) => row.entry.id === id)) {
      return id;
    }
  }
  return null;
}

function outlineKeys(entries: readonly OutlineEntry[]): string[] {
  const seen = new Map<string, number>();
  const keys: string[] = [];
  const ancestor: number[] = [];
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    while (ancestor.length > 0 && entries[ancestor[ancestor.length - 1]].level >= entry.level) {
      ancestor.pop();
    }
    const parent = ancestor.length > 0 ? keys[ancestor[ancestor.length - 1]] : "";
    const bucket = `${parent}\n${entry.level}:${entry.text}`;
    const nth = seen.get(bucket) ?? 0;
    seen.set(bucket, nth + 1);
    keys.push(`${bucket}#${nth}`);
    ancestor.push(index);
  }
  return keys;
}

function walk(blocks: PreviewNode[], entries: OutlineEntry[]) {
  for (const node of blocks) {
    if (node.body.type === "heading") {
      entries.push({
        id: node.id,
        level: node.body.level,
        text: inlinePlain(node.body.inlines),
        line: node.source_line,
      });
    } else if (node.body.type === "outline_heading") {
      entries.push({
        id: node.id,
        level: node.body.level,
        text: node.body.text,
        line: node.source_line,
      });
    }
    const children = childNodes(node);
    if (children) {
      walk(children, entries);
    }
  }
}

export function inlinePlain(inlines: PreviewInline[]): string {
  let text = "";
  for (const inline of inlines) {
    if (inline.type === "text" || inline.type === "code") {
      text += inline.text;
    } else if (inline.type === "soft_break" || inline.type === "hard_break") {
      text += " ";
    } else if (
      inline.type === "emphasis" ||
      inline.type === "strong" ||
      inline.type === "strike" ||
      inline.type === "link"
    ) {
      text += inlinePlain(inline.children);
    }
  }
  return text.trim();
}
