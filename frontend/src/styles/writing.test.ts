import { describe, expect, it } from "vitest";
import {
  clampMeasure,
  codeStack,
  cssFamily,
  defaultWriting,
  effectiveWriting,
  fontChoices,
  loadWriting,
  migrateWriting,
  parseWriting,
  proseFontIds,
  proseStack,
  rustThemeFor,
  saveWriting,
  type WritingStorage,
} from "./writing";

function memory(): WritingStorage {
  const data = new Map<string, string>();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
  };
}

describe("writing preferences", () => {
  it("rejects an unknown theme and keeps a valid record inside its limits", () => {
    expect(parseWriting({ version: 1, themeId: "neon" })).toBeNull();
    expect(parseWriting({ version: 2, themeId: "ivory" })).toBeNull();
    expect(parseWriting("{")).toBeNull();
    const parsed = parseWriting({
      version: 1,
      themeId: "sepia",
      followSystem: true,
      warm: true,
      measureRem: 41,
      measureWindow: false,
      lineHeight: 1.9,
      proseFont: "comic; color: red",
      codeFont: "kai {",
    });
    expect(parsed).toMatchObject({
      themeId: "sepia",
      followSystem: true,
      warm: true,
      measureRem: 42,
      lineHeight: 1.75,
      proseFont: "serif",
      codeFont: "cascadia",
    });
  });

  it("clamps the reading measure onto the even steps", () => {
    expect(clampMeasure(40)).toBe(40);
    expect(clampMeasure(41)).toBe(42);
    expect(clampMeasure(10)).toBe(36);
    expect(clampMeasure(100)).toBe(72);
    expect(clampMeasure(Number.NaN)).toBe(40);
  });

  it("maps the old light and dark settings onto ivory and midnight", () => {
    expect(migrateWriting("dark", false)).toMatchObject({ themeId: "midnight", followSystem: false });
    expect(migrateWriting("light", true)).toMatchObject({ themeId: "ivory", followSystem: false });
    expect(migrateWriting("system", true)).toMatchObject({ themeId: "midnight", followSystem: true });
    expect(migrateWriting("system", false)).toMatchObject({ themeId: "ivory", followSystem: true });
    expect(effectiveWriting({ ...defaultWriting(), themeId: "forest", followSystem: true }, true).themeId).toBe("midnight");
    expect(rustThemeFor({ ...defaultWriting(), themeId: "coffee", followSystem: false })).toBe("dark");
    expect(rustThemeFor({ ...defaultWriting(), themeId: "sakura", followSystem: false })).toBe("light");
    expect(rustThemeFor(defaultWriting())).toBe("system");
  });

  it("round-trips through storage and ignores a broken payload", () => {
    const store = memory();
    const prefs = { ...defaultWriting(), themeId: "nord" as const, followSystem: false, warm: true, measureRem: 52, lineHeight: 2 as const, proseFont: "kai" as const, codeFont: "consolas" as const };
    saveWriting(prefs, store);
    expect(loadWriting(store)).toEqual(prefs);
    store.setItem("luma.writing.v1", "{");
    expect(loadWriting(store)).toBeNull();
  });

  it("keeps a system font family and the old preset ids", () => {
    expect(cssFamily("  微软雅黑  ")).toBe("微软雅黑");
    expect(cssFamily("@宋体")).toBeNull();
    expect(cssFamily("Arial; }")).toBeNull();
    expect(parseWriting({ version: 1, themeId: "ivory", proseFont: "微软雅黑", codeFont: "Cascadia Code" })).toMatchObject({
      proseFont: "微软雅黑",
      codeFont: "Cascadia Code",
    });
    expect(parseWriting({ version: 1, themeId: "ivory", proseFont: "kai", codeFont: "consolas" })).toMatchObject({
      proseFont: "kai",
      codeFont: "consolas",
    });
    expect(proseStack("serif")).toContain("Iowan Old Style");
    expect(proseStack("system")).toContain("Microsoft YaHei UI");
    expect(proseStack("微软雅黑")).toBe('"Microsoft YaHei", "微软雅黑", "Microsoft YaHei UI", "PingFang SC", "Noto Sans CJK SC", sans-serif');
    expect(codeStack("Courier New")).toBe('"Courier New", ui-monospace, monospace');
    expect(codeStack("consolas")).toContain("Consolas");
    expect(codeStack("Cascadia Code")).toBe('"Cascadia Code", ui-monospace, monospace');
    expect(fontChoices(["微软雅黑", "宋体"], "serif", proseFontIds)[0]).toBe("serif");
    expect(fontChoices([], "serif", proseFontIds)).toEqual([...proseFontIds]);
  });

  it("copies a legacy writing record into the luma key", () => {
    const store = memory();
    const prefs = { ...defaultWriting(), themeId: "nord" as const, followSystem: false };
    store.setItem("rustmark.writing.v1", JSON.stringify(prefs));
    expect(loadWriting(store)).toEqual(prefs);
    expect(store.getItem("luma.writing.v1")).toContain("\"nord\"");
  });
});
