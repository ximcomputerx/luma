import { describe, expect, it } from "vitest";
import { setLocaleChoice, type LocaleStorage } from "../i18n";
import { completionOptions } from "./markdownCompletions";

function memory(): LocaleStorage {
  const data = new Map<string, string>();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
    removeItem: (key) => {
      data.delete(key);
    },
  };
}

describe("markdown completions", () => {
  it("offers structural prefixes and skips wikilinks", () => {
    const labels = completionOptions("#", false).map((item) => item.label);
    expect(labels).toContain("# ");
    expect(labels).toContain("###### ");
    expect(labels.join(" ")).not.toContain("[[");
    expect(completionOptions("", false)).toEqual([]);
    expect(completionOptions("  #", false)).toEqual([]);
    expect(completionOptions("!", false).map((item) => item.label)).toEqual(["![]()"]);
    expect(completionOptions("#", false)[0]?.detail).toBe("Heading 1");
    setLocaleChoice("zh-CN", memory());
    expect(completionOptions("#", false)[0]?.detail).toBe("标题 1");
    setLocaleChoice("en-US", memory());
  });
});
