import { describe, expect, it } from "vitest";
import { hasUnsavedChanges } from "./documentState";

describe("hasUnsavedChanges", () => {
  it("treats an empty untitled document as clean", () => {
    expect(hasUnsavedChanges(null, "", "")).toBe(false);
  });

  it("marks untitled text as unsaved", () => {
    expect(hasUnsavedChanges(null, "你好", "")).toBe(true);
  });

  it("compares a saved file with the accepted body", () => {
    expect(hasUnsavedChanges("C:\\notes\\a.md", "你好", "你好")).toBe(false);
    expect(hasUnsavedChanges("C:\\notes\\a.md", "你好。", "你好")).toBe(true);
  });
});
