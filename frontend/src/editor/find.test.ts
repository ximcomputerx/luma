import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { describe, expect, it } from "vitest";
import { runFind, searchExtension } from "./find";

describe("find and replace", () => {
  it("replaces every match in this document only", () => {
    const parent = document.createElement("div");
    const view = new EditorView({
      parent,
      state: EditorState.create({ doc: "cat cat", extensions: [searchExtension()] }),
    });
    runFind(view, "cat", "猫", false, "all");
    expect(view.state.doc.toString()).toBe("猫 猫");
  });
});
