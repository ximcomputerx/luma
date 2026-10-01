import { describe, expect, it } from "vitest";
import { isMarkdownPath } from "./markdownPath";

describe("markdown paths", () => {
  it("accepts the four markdown extensions", () => {
    expect(isMarkdownPath("D:\\my notes\\测试.md")).toBe(true);
    expect(isMarkdownPath("/notes/a.markdown")).toBe(true);
    expect(isMarkdownPath("b.MDOWN")).toBe(true);
    expect(isMarkdownPath("c.mkdn")).toBe(true);
  });

  it("rejects other files and directories", () => {
    expect(isMarkdownPath("notes.txt")).toBe(false);
    expect(isMarkdownPath("D:\\notes")).toBe(false);
    expect(isMarkdownPath("readme.md.txt")).toBe(false);
  });
});
