import { EditorSelection, EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { describe, expect, it } from "vitest";
import { applyCode, applyHeading, applyList, applyQuote, insertTableColumn, insertTableRow, tableAt, wrapSelection } from "./format";

function viewWith(doc: string, from: number, to = from) {
  const parent = document.createElement("div");
  return new EditorView({
    parent,
    state: EditorState.create({
      doc,
      selection: EditorSelection.range(from, to),
    }),
  });
}

const table = "| a | b |\n| --- | --- |\n| 1 | 2 |\n";

describe("wrap selection", () => {
  it("wraps the selection and leaves an empty marker pair with the cursor inside", () => {
    const view = viewWith("ab", 1, 2);
    wrapSelection(view, "**");
    expect(view.state.doc.toString()).toBe("a**b**");
    const empty = viewWith("ab", 2);
    wrapSelection(empty, "*");
    expect(empty.state.doc.toString()).toBe("ab**");
    expect(empty.state.selection.main.head).toBe(3);
  });
});

describe("format commands", () => {
  it("toggles a heading, list, quote, and inline code on the source", () => {
    const heading = viewWith("标题", 0, 2);
    applyHeading(heading, 2);
    expect(heading.state.doc.toString()).toBe("## 标题");
    applyHeading(heading, 2);
    expect(heading.state.doc.toString()).toBe("标题");

    const list = viewWith("一\n二", 0, 3);
    applyList(list, "bullet");
    expect(list.state.doc.toString()).toBe("- 一\n- 二");
    applyList(list, "ordered");
    expect(list.state.doc.toString()).toBe("1. 一\n2. 二");

    const quote = viewWith("引用", 0);
    applyQuote(quote);
    expect(quote.state.doc.toString()).toBe("> 引用");

    const code = viewWith("词", 0, 1);
    applyCode(code);
    expect(code.state.doc.toString()).toBe("`词`");
  });

  it("inserts a table row and column as text", () => {
    const view = viewWith(table, table.indexOf("1"));
    const cursor = view.state.doc.lineAt(view.state.selection.main.head);
    expect(tableAt(view.state.doc, cursor.number, 1)?.columns).toBe(2);
    expect(insertTableRow(view, "below")).toBe(true);
    expect(view.state.doc.toString()).toContain("| 1 | 2 |\n|   |   |");
    const again = viewWith("| a | b |\n| --- | --- |\n| 1 | 2 |\n", 2);
    expect(insertTableColumn(again, "right")).toBe(true);
    expect(again.state.doc.toString()).toContain("| a |   | b |");
    expect(again.state.doc.toString()).toContain("| --- | --- | --- |");
  });
});
