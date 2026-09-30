import { isThemeId, themeById, type ThemeId } from "./themes";

export const proseFontIds = ["serif", "song", "sans", "kai"] as const;
export const codeFontIds = ["cascadia", "sarasa", "consolas", "system"] as const;
export const lineHeights = [1.6, 1.75, 2] as const;

export type ProseFontId = (typeof proseFontIds)[number];
export type CodeFontId = (typeof codeFontIds)[number];
export type LineHeight = (typeof lineHeights)[number];
export type RustTheme = "system" | "light" | "dark";

export type WritingPrefs = {
  version: 1;
  themeId: ThemeId;
  followSystem: boolean;
  warm: boolean;
  measureRem: number;
  measureWindow: boolean;
  lineHeight: LineHeight;
  proseFont: string;
  codeFont: string;
};

export type WritingStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

const storageKey = "luma.writing.v1";
const legacyKey = "rustmark.writing.v1";

const proseStacks: Record<ProseFontId, string> = {
  serif: '"Iowan Old Style", "Palatino Linotype", "Songti SC", "Noto Serif CJK SC", serif',
  song: '"Songti SC", SimSun, "Noto Serif CJK SC", serif',
  sans: 'system-ui, "PingFang SC", "Noto Sans CJK SC", sans-serif',
  kai: "KaiTi, STKaiti, serif",
};

const codeStacks: Record<CodeFontId, string> = {
  cascadia: '"Cascadia Code", "Sarasa Gothic SC", ui-monospace, monospace',
  sarasa: '"Sarasa Gothic SC", "Cascadia Code", ui-monospace, monospace',
  consolas: 'Consolas, "Sarasa Gothic SC", ui-monospace, monospace',
  system: "ui-monospace, monospace",
};

export function defaultWriting(): WritingPrefs {
  return {
    version: 1,
    themeId: "ivory",
    followSystem: true,
    warm: false,
    measureRem: 40,
    measureWindow: false,
    lineHeight: 1.75,
    proseFont: "serif",
    codeFont: "cascadia",
  };
}

const familyPattern = /^[\p{L}\p{N} .()+,&'_-]+$/u;

export function cssFamily(value: string): string | null {
  const name = value.trim().replace(/\s+/g, " ");
  if (!name || name.startsWith("@") || name.length > 64 || !familyPattern.test(name)) {
    return null;
  }
  return name;
}

export function proseStack(name: string): string {
  if (name === "system") {
    return '"Microsoft YaHei UI", "Segoe UI", "PingFang SC", "Noto Sans CJK SC", sans-serif';
  }
  if (name === "微软雅黑" || name === "Microsoft YaHei") {
    return '"Microsoft YaHei", "微软雅黑", "Microsoft YaHei UI", "PingFang SC", "Noto Sans CJK SC", sans-serif';
  }
  if (isProseFontId(name)) {
    return proseStacks[name];
  }
  const family = cssFamily(name);
  return family ? `"${family}", "Songti SC", "Noto Serif CJK SC", serif` : proseStacks.serif;
}

export function codeStack(name: string): string {
  if (isCodeFontId(name)) {
    return codeStacks[name];
  }
  const family = cssFamily(name);
  return family ? `"${family}", ui-monospace, monospace` : codeStacks.cascadia;
}

export function fontChoices(installed: readonly string[], current: string, legacy: readonly string[]): string[] {
  const source = installed.length > 0 ? installed : legacy;
  return source.includes(current) ? [...source] : [current, ...source];
}

export function sortFontNames(names: readonly string[], locale: string): string[] {
  return [...names].sort((left, right) => left.localeCompare(right, locale, { sensitivity: "base" }));
}

function isProseFontId(value: string): value is ProseFontId {
  return proseFontIds.some((id) => id === value);
}

function isCodeFontId(value: string): value is CodeFontId {
  return codeFontIds.some((id) => id === value);
}

export function clampMeasure(value: number): number {
  if (!Number.isFinite(value)) {
    return 40;
  }
  const even = Math.round(value / 2) * 2;
  return Math.min(72, Math.max(36, even));
}

function parseLine(value: unknown): LineHeight {
  return lineHeights.some((height) => height === value) ? (value as LineHeight) : 1.75;
}

function parseFont(value: unknown, legacy: readonly string[], fallback: string): string {
  if (typeof value !== "string") {
    return fallback;
  }
  if (legacy.some((id) => id === value)) {
    return value;
  }
  return cssFamily(value) ?? fallback;
}

export function parseWriting(value: unknown): WritingPrefs | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const record = value as Record<string, unknown>;
  if (record.version !== 1 || !isThemeId(record.themeId)) {
    return null;
  }
  return {
    version: 1,
    themeId: record.themeId,
    followSystem: record.followSystem === true,
    warm: record.warm === true,
    measureRem: clampMeasure(typeof record.measureRem === "number" ? record.measureRem : 40),
    measureWindow: record.measureWindow === true,
    lineHeight: parseLine(record.lineHeight),
    proseFont: parseFont(record.proseFont, proseFontIds, "serif"),
    codeFont: parseFont(record.codeFont, codeFontIds, "cascadia"),
  };
}

export function loadWriting(storage: WritingStorage = localStorage): WritingPrefs | null {
  try {
    const raw = storage.getItem(storageKey);
    if (raw) {
      return parseWriting(JSON.parse(raw) as unknown);
    }
  } catch {
    return null;
  }
  try {
    const legacy = storage.getItem(legacyKey);
    if (!legacy) {
      return null;
    }
    const parsed = parseWriting(JSON.parse(legacy) as unknown);
    if (parsed) {
      storage.setItem(storageKey, JSON.stringify(parsed));
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveWriting(prefs: WritingPrefs, storage: WritingStorage = localStorage): void {
  try {
    storage.setItem(storageKey, JSON.stringify(prefs));
  } catch {
    /* The preference stays in memory for this session. */
  }
}

export function migrateWriting(theme: RustTheme, prefersDark: boolean): WritingPrefs {
  if (theme === "dark") {
    return { ...defaultWriting(), themeId: "midnight", followSystem: false };
  }
  if (theme === "light") {
    return { ...defaultWriting(), themeId: "ivory", followSystem: false };
  }
  return { ...defaultWriting(), themeId: prefersDark ? "midnight" : "ivory", followSystem: true };
}

export function effectiveWriting(prefs: WritingPrefs, prefersDark: boolean): WritingPrefs {
  if (!prefs.followSystem) {
    return prefs;
  }
  const themeId: ThemeId = prefersDark ? "midnight" : "ivory";
  return prefs.themeId === themeId ? prefs : { ...prefs, themeId };
}

export function rustThemeFor(prefs: WritingPrefs): RustTheme {
  if (prefs.followSystem) {
    return "system";
  }
  return themeById(prefs.themeId).family === "dark" ? "dark" : "light";
}
