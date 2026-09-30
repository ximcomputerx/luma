import { describe, expect, it } from "vitest";
import { countWords } from "./count";

describe("word count", () => {
  it("counts extended graphemes and skips whitespace", () => {
    expect(countWords("")).toBe(0);
    expect(countWords(" \n\t")).toBe(0);
    expect(countWords("你好")).toBe(2);
    expect(countWords("a b")).toBe(2);
    expect(countWords("字 数")).toBe(2);
    expect(countWords("e\u{0301}")).toBe(1);
    expect(countWords("\u{1F468}\u{200D}\u{1F469}\u{200D}\u{1F467}\u{200D}\u{1F466}")).toBe(1);
  });
});
