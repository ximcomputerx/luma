import { EditorSelection, type ChangeSpec, type EditorState, type Text } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";

export function wrapSelection(view: EditorView, marker: string) {
  const range = view.state.selection.main;
  const selected = view.state.sliceDoc(range.from, range.to);
  const insert = `${marker}${selected}${marker}`;
  const anchor = range.from + marker.length;
  const head = range.empty ? anchor : range.to + marker.length;
  view.dispatch({
    changes: { from: range.from, to: range.to, insert },
    selection: EditorSelection.range(anchor, head),
  });
}

export function applyHeading(view: EditorView, level: number) {
  const bounded = Math.min(6, Math.max(1, level));
  const marker = `${"#".repeat(bounded)} `;
  const { start, end } = selectedLines(view.state);
  let already = true;
  for (let number = start; number <= end; number += 1) {
    const match = /^(#{1,6})[ \t]+/.exec(view.state.doc.line(number).text);
    if (!match || match[1]?.length !== bounded) {
      already = false;
    }
  }
  const changes: ChangeSpec[] = [];
  for (let number = start; number <= end; number += 1) {
    const line = view.state.doc.line(number);
    const stripped = line.text.replace(/^(#{1,6})[ \t]+/, "");
    changes.push({ from: line.from, to: line.to, insert: already ? stripped : marker + stripped });
  }
  view.dispatch({ changes });
}

export function applyList(view: EditorView, kind: "bullet" | "ordered") {
  const { start, end } = selectedLines(view.state);
  const lines = [];
  for (let number = start; number <= end; number += 1) {
    lines.push(view.state.doc.line(number));
  }
  const pattern = kind === "bullet" ? /^(?:[-*+])[ \t]+/ : /^\d+\.[ \t]+/;
  const allOn = lines.every((line) => line.text.length === 0 || pattern.test(line.text));
  const changes = lines.map((line, index) => {
    const text = line.text.replace(/^(?:[-*+]|\d+\.)[ \t]+/, "");
    let insert = text;
    if (!allOn && text.length > 0) {
      insert = kind === "bullet" ? `- ${text}` : `${index + 1}. ${text}`;
    }
    return { from: line.from, to: line.to, insert };
  });
  view.dispatch({ changes });
}

export function applyQuote(view: EditorView) {
  const { start, end } = selectedLines(view.state);
  const lines = [];
  for (let number = start; number <= end; number += 1) {
    lines.push(view.state.doc.line(number));
  }
  const allOn = lines.every((line) => line.text.length === 0 || /^>[ \t]?/.test(line.text));
  view.dispatch({
    changes: lines.map((line) => {
      const text = line.text.replace(/^>[ \t]?/, "");
      return { from: line.from, to: line.to, insert: allOn || text.length === 0 ? text : `> ${text}` };
    }),
  });
}

export function applyCode(view: EditorView) {
  const range = view.state.selection.main;
  const selected = view.state.sliceDoc(range.from, range.to);
  if (!range.empty && !selected.includes("\n")) {
    if (selected.startsWith("`") && selected.endsWith("`") && selected.length >= 2) {
      view.dispatch({
        changes: { from: range.from, to: range.to, insert: selected.slice(1, -1) },
        selection: EditorSelection.cursor(range.from + selected.length - 2),
      });
      return;
    }
    wrapSelection(view, "`");
    return;
  }
  const { start, end } = selectedLines(view.state);
  const startLine = view.state.doc.line(start);
  const endLine = view.state.doc.line(end);
  const block = view.state.sliceDoc(startLine.from, endLine.to);
  const fenced = block.startsWith("```") && block.trimEnd().endsWith("```");
  const insert = fenced ? block.replace(/^```[^\n]*\n?/, "").replace(/\n?```$/, "") : `\`\`\`\n${block}\n\`\`\``;
  view.dispatch({
    changes: { from: startLine.from, to: endLine.to, insert },
    selection: EditorSelection.cursor(startLine.from + (fenced ? 0 : 4)),
  });
}

const delimiter = /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/;

export type TableHit = {
  startLine: number;
  endLine: number;
  rowLine: number;
  column: number;
  columns: number;
};

export function tableAt(doc: Text, lineNumber: number, column: number): TableHit | null {
  if (insideFence(doc, lineNumber) || !looksLikeRow(doc.line(lineNumber).text)) {
    return null;
  }
  let start = lineNumber;
  let end = lineNumber;
  while (start > 1 && looksLikeRow(doc.line(start - 1).text) && !insideFence(doc, start - 1)) {
    start -= 1;
  }
  while (end < doc.lines && looksLikeRow(doc.line(end + 1).text) && !insideFence(doc, end + 1)) {
    end += 1;
  }
  let delimiterLine = 0;
  for (let number = start; number <= end; number += 1) {
    if (delimiter.test(doc.line(number).text)) {
      delimiterLine = number;
      break;
    }
  }
  if (delimiterLine === 0) {
    return null;
  }
  const columns = splitCells(doc.line(delimiterLine).text).length;
  if (columns < 1) {
    return null;
  }
  const cells = splitCells(doc.line(lineNumber).text);
  const index = Math.min(columns - 1, Math.max(0, columnIndex(doc.line(lineNumber).text, column, cells.length)));
  return { startLine: start, endLine: end, rowLine: lineNumber, column: index, columns };
}

export function insertTableRow(view: EditorView, where: "above" | "below"): boolean {
  const cursor = cursorIn(view);
  const hit = tableAt(view.state.doc, cursor.line, cursor.column);
  if (!hit) {
    return false;
  }
  const blank = `| ${Array.from({ length: hit.columns }, () => " ").join(" | ")} |`;
  const rule = ruleLine(view.state.doc, hit);
  const onHeader = hit.rowLine <= rule;
  if (onHeader) {
    const line = view.state.doc.line(rule);
    view.dispatch({
      changes: { from: line.to, to: line.to, insert: `\n${blank}` },
      selection: EditorSelection.cursor(line.to + 3),
    });
    return true;
  }
  const line = view.state.doc.line(hit.rowLine);
  if (where === "above") {
    view.dispatch({
      changes: { from: line.from, to: line.from, insert: `${blank}\n` },
      selection: EditorSelection.cursor(line.from + 2),
    });
    return true;
  }
  view.dispatch({
    changes: { from: line.to, to: line.to, insert: `\n${blank}` },
    selection: EditorSelection.cursor(line.to + 3),
  });
  return true;
}

export function insertTableColumn(view: EditorView, where: "left" | "right"): boolean {
  const cursor = cursorIn(view);
  const hit = tableAt(view.state.doc, cursor.line, cursor.column);
  if (!hit) {
    return false;
  }
  const insertAt = where === "left" ? hit.column : hit.column + 1;
  const changes: ChangeSpec[] = [];
  for (let number = hit.startLine; number <= hit.endLine; number += 1) {
    const line = view.state.doc.line(number);
    changes.push({
      from: line.from,
      to: line.to,
      insert: insertCell(line.text, insertAt, delimiter.test(line.text)),
    });
  }
  view.dispatch({ changes });
  return true;
}

function cursorIn(view: EditorView) {
  const head = view.state.selection.main.head;
  const line = view.state.doc.lineAt(head);
  return { line: line.number, column: head - line.from + 1 };
}

function selectedLines(state: EditorState) {
  const range = state.selection.main;
  const start = state.doc.lineAt(range.from).number;
  let end = state.doc.lineAt(range.to).number;
  if (range.to > range.from && state.doc.line(end).from === range.to) {
    end -= 1;
  }
  return { start, end: Math.max(start, end) };
}

function insideFence(doc: Text, lineNumber: number) {
  let fences = 0;
  for (let number = 1; number < lineNumber; number += 1) {
    if (doc.line(number).text.trimStart().startsWith("```")) {
      fences += 1;
    }
  }
  return fences % 2 === 1;
}

function looksLikeRow(text: string) {
  const trimmed = text.trim();
  return trimmed.includes("|") && !trimmed.startsWith("```");
}

function splitCells(line: string) {
  let text = line.trim();
  if (text.startsWith("|")) {
    text = text.slice(1);
  }
  if (text.endsWith("|")) {
    text = text.slice(0, -1);
  }
  return text.split("|").map((cell) => cell.trim());
}

function columnIndex(line: string, column: number, count: number) {
  const offset = Math.max(0, column - 1);
  let pipes = 0;
  let seen = false;
  for (let index = 0; index < line.length && index < offset; index += 1) {
    if (line[index] === "|") {
      if (!seen && index === line.indexOf("|") && line.trimStart().startsWith("|")) {
        seen = true;
        continue;
      }
      pipes += 1;
    }
  }
  return Math.min(count - 1, pipes);
}

function ruleLine(doc: Text, hit: TableHit) {
  for (let number = hit.startLine; number <= hit.endLine; number += 1) {
    if (delimiter.test(doc.line(number).text)) {
      return number;
    }
  }
  return hit.startLine;
}

function insertCell(line: string, index: number, rule: boolean) {
  const cells = splitCells(line);
  const at = Math.max(0, Math.min(index, cells.length));
  cells.splice(at, 0, rule ? "---" : " ");
  return `| ${cells.join(" | ")} |`;
}
