import { describe, expect, it } from "vitest";
import type { DocumentSnapshot } from "../ipc/types";
import { mergeWorkspace, type OpenTab } from "./workspace";

function snapshot(id: string, body: string): DocumentSnapshot {
  return {
    document_id: id,
    path: null,
    title: "未命名",
    markdown_lf: body,
    newline: "lf",
    rev: 1,
    dirty: false,
    root: null,
    tabs: [
      { document_id: "a", title: "甲", path: "a.md" },
      { document_id: id, title: "未命名", path: null },
    ],
  };
}

describe("workspace tabs", () => {
  it("keeps the other tab's buffer when a new document loads", () => {
    const current: OpenTab = {
      id: "a",
      path: "a.md",
      title: "甲",
      newline: "lf",
      buffer: "已写",
      accepted: "",
      rev: 2,
    };
    const next = mergeWorkspace([current], current, snapshot("b", ""), true, "未命名");
    expect(next.find((tab) => tab.id === "a")?.buffer).toBe("已写");
    expect(next.find((tab) => tab.id === "b")?.buffer).toBe("");
  });
});
