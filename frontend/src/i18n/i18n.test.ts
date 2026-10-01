import { afterEach, describe, expect, it } from "vitest";
import { enUS } from "./en-US";
import { matchLocale, parseLocalePrefs, resolveSystemLocale, setLocaleChoice, type LocaleStorage } from "./locale";
import { presentError } from "./presentError";
import { translate } from "./translate";
import { zhCN } from "./zh-CN";

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

function placeholders(value: string | { one?: string; other: string }): string[] {
  const texts = typeof value === "string" ? [value] : Object.values(value).filter((item): item is string => typeof item === "string");
  const found = new Set<string>();
  for (const text of texts) {
    for (const match of text.matchAll(/\{([a-zA-Z0-9]+)\}/g)) {
      found.add(match[1]);
    }
  }
  return [...found].sort();
}

describe("catalogs", () => {
  afterEach(() => {
    setLocaleChoice("en-US", memory());
  });

  it("keeps the same keys and placeholders in English and Chinese", () => {
    expect(Object.keys(zhCN).sort()).toEqual(Object.keys(enUS).sort());
    for (const id of Object.keys(enUS) as Array<keyof typeof enUS>) {
      expect(placeholders(zhCN[id])).toEqual(placeholders(enUS[id]));
    }
  });

  it("matches language tags and falls back to English", () => {
    expect(matchLocale("en_US")).toBe("en-US");
    expect(matchLocale("EN")).toBe("en-US");
    expect(matchLocale("zh-Hans")).toBe("zh-CN");
    expect(matchLocale("zh-TW")).toBe("zh-CN");
    expect(matchLocale("fr-FR")).toBeNull();
    expect(resolveSystemLocale(["fr-FR", "zh-HK"])).toBe("zh-CN");
    expect(resolveSystemLocale(["de-DE"])).toBe("en-US");
  });

  it("rejects a stored locale that is not version 1", () => {
    expect(parseLocalePrefs({ version: 1, locale: "zh-CN" })).toBe("zh-CN");
    expect(parseLocalePrefs({ version: 2, locale: "zh-CN" })).toBeNull();
    expect(parseLocalePrefs({ version: 1, locale: "ja-JP" })).toBeNull();
    expect(parseLocalePrefs("{")).toBeNull();
  });

  it("selects English plurals and formats the count", () => {
    expect(translate("en-US", "status.count", { n: 1 })).toBe("1 character");
    expect(translate("en-US", "status.count", { n: 2 })).toBe("2 characters");
    expect(translate("zh-CN", "status.count", { n: 2 })).toBe("2 字");
  });

  it("throws in development when a provided value does not fill the sentence", () => {
    expect(() => translate("en-US", "format.heading", {})).toThrow(/format\.heading/);
    expect(translate("en-US", "preview.mermaidSyntaxLine", undefined, { raw: true })).toContain("{line}");
  });

  it("translates known Rust messages and keeps an unknown io message", () => {
    setLocaleChoice("en-US", memory());
    expect(presentError({ code: "conflict", message: "保存冲突，没有写入磁盘。" })).toBe("Save conflict. Nothing was written.");
    expect(presentError({ code: "too_large", message: "图片超过 8 MB。" })).toBe("Images larger than 8 MB cannot be pasted.");
    expect(presentError({ code: "too_large", message: "文件超过 8 MB，无法打开。" })).toBe("Files larger than 8 MB cannot be opened.");
    expect(presentError({ code: "not_utf8", message: "changed" })).toBe("Only UTF-8 text can be opened.");
    expect(presentError({ code: "rejected", message: "无法打开此文件" })).toBe("This file can't be opened.");
    expect(presentError({ code: "io", message: "磁盘忙" })).toBe("磁盘忙");
    expect(presentError({ code: "invalid_settings", message: "导出设置无效。" })).toBe("Those export settings are invalid.");
    expect(presentError({ code: "invalid_settings", message: "设置项无效。" })).toBe("That setting is invalid.");
    setLocaleChoice("zh-CN", memory());
    expect(presentError({ code: "io", message: "只能粘贴 PNG、JPEG、GIF 或 WebP。" })).toBe("只能粘贴 PNG、JPEG、GIF 或 WebP。");
  });
});
