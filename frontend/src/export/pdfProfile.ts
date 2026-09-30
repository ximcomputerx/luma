import { contrast, themes, type ThemeTokens } from "../styles/themes";
import { cssFamily, type WritingStorage } from "../styles/writing";

const storageKey = "luma.pdf.v1";
const ivoryPaper = "#fbf6ee";
const hexPattern = /^#[0-9a-fA-F]{6}$/;

export const pdfBases = ["modern", "academic", "book", "minimal", "technical"] as const;
export const pdfMargins = [10, 15, 18, 20, 30] as const;

export type PdfBase = (typeof pdfBases)[number];
export type PdfTemplate = PdfBase | "custom";
export type PdfMargin = (typeof pdfMargins)[number];
export type PdfParagraph = "compact" | "standard" | "loose";
export type PdfMeasure = "full" | "standard" | "narrow";
export type PdfPaper = "a4" | "letter" | "a5";
export type PdfOrientation = "portrait" | "landscape";
export type PdfHeader = "off" | "title" | "filename";
export type PdfCodeBreak = "split" | "keep";

export type PdfColors = {
  text: string;
  heading: string;
  link: string;
  codeBg: string;
  paper: string;
};

export type PdfProfile = {
  version: 1;
  template: PdfTemplate;
  base: PdfBase;
  bodyFont: string;
  headingFont: string;
  codeFont: string;
  fontSizePx: number;
  lineHeight: number;
  paragraph: PdfParagraph;
  measure: PdfMeasure;
  colorMode: "theme" | "custom";
  colors: PdfColors;
  paper: PdfPaper;
  orientation: PdfOrientation;
  marginMm: PdfMargin;
  header: PdfHeader;
  footerPage: boolean;
  footerCreated: boolean;
  footerAuthor: boolean;
  author: string;
  toc: boolean;
  codeBreak: PdfCodeBreak;
  imageMaxPercent: number;
  widows: 2 | 3 | 4;
};

export type PdfWire = {
  base: PdfBase;
  body_font: string;
  heading_font: string;
  code_font: string;
  font_size_px: number;
  line_height: number;
  paragraph: PdfParagraph;
  measure: PdfMeasure;
  text: string;
  heading: string;
  link: string;
  code_bg: string;
  paper_color: string;
  paper: PdfPaper;
  orientation: PdfOrientation;
  margin_mm: PdfMargin;
  header: PdfHeader;
  footer_page: boolean;
  footer_created: boolean;
  footer_author: boolean;
  author: string;
  lang: "zh-CN" | "en-US";
  toc: boolean;
  code_break: PdfCodeBreak;
  image_max_percent: number;
  widows: 2 | 3 | 4;
};

const ink: PdfColors = {
  text: "#24292f",
  heading: "#1f2328",
  link: "#0969da",
  codeBg: "#f6f8fa",
  paper: "#f7f8fa",
};

const templates: Record<PdfBase, PdfProfile> = {
  modern: profile("modern", {
    bodyFont: "sans",
    fontSizePx: 15,
    lineHeight: 1.6,
    paragraph: "standard",
    measure: "full",
    colorMode: "theme",
    paper: "a4",
    marginMm: 18,
    header: "off",
    footerPage: true,
    codeBreak: "split",
    toc: false,
  }),
  academic: profile("academic", {
    bodyFont: "serif",
    fontSizePx: 16,
    lineHeight: 1.7,
    paragraph: "standard",
    measure: "full",
    colorMode: "custom",
    colors: ink,
    paper: "a4",
    marginMm: 20,
    header: "title",
    footerPage: true,
    codeBreak: "keep",
    toc: true,
  }),
  book: profile("book", {
    bodyFont: "serif",
    fontSizePx: 15,
    lineHeight: 1.8,
    paragraph: "loose",
    measure: "narrow",
    colorMode: "theme",
    paper: "a5",
    marginMm: 15,
    header: "off",
    footerPage: true,
    codeBreak: "keep",
    toc: false,
  }),
  minimal: profile("minimal", {
    bodyFont: "serif",
    fontSizePx: 16,
    lineHeight: 1.85,
    paragraph: "loose",
    measure: "standard",
    colorMode: "theme",
    paper: "a4",
    marginMm: 20,
    header: "off",
    footerPage: false,
    codeBreak: "keep",
    toc: false,
  }),
  technical: profile("technical", {
    bodyFont: "sans",
    fontSizePx: 14,
    lineHeight: 1.5,
    paragraph: "compact",
    measure: "full",
    colorMode: "theme",
    paper: "a4",
    marginMm: 15,
    header: "filename",
    footerPage: true,
    codeBreak: "split",
    toc: false,
  }),
};

function profile(base: PdfBase, patch: Partial<PdfProfile>): PdfProfile {
  return {
    version: 1,
    template: base,
    base,
    bodyFont: "sans",
    headingFont: "match",
    codeFont: "cascadia",
    fontSizePx: 15,
    lineHeight: 1.6,
    paragraph: "standard",
    measure: "full",
    colorMode: "theme",
    colors: ink,
    paper: "a4",
    orientation: "portrait",
    marginMm: 18,
    header: "off",
    footerPage: true,
    footerCreated: false,
    footerAuthor: false,
    author: "",
    toc: false,
    codeBreak: "split",
    imageMaxPercent: 100,
    widows: 2,
    ...patch,
  };
}

export const PDF_FIXTURE = [
  "# 标题示例",
  "",
  "## 二级标题",
  "",
  "正文用来看行高、段距和阅读宽度。",
  "",
  "```",
  "fn main() {",
  "    println!(\"luma\");",
  "}",
  "```",
  "",
  "- 列表",
  "",
  "> 引用",
  "",
  "![插图](luma-fixture.svg)",
  "",
].join("\n");

export function applyTemplate(base: PdfBase): PdfProfile {
  return { ...templates[base], colors: { ...templates[base].colors } };
}

export function editProfile(profile: PdfProfile, patch: Partial<PdfProfile>): PdfProfile {
  return { ...profile, ...patch, template: "custom", colors: patch.colors ?? profile.colors };
}

export function themePrintColors(theme: ThemeTokens): PdfColors {
  if (theme.family === "light") {
    return {
      text: theme.text,
      heading: theme.heading,
      link: theme.link,
      codeBg: theme.codeBg,
      paper: theme.paper,
    };
  }
  const paper = ivoryPaper;
  const link = contrast(theme.link, paper) >= 4.5 ? theme.link : themes.ivory.link;
  return {
    text: themes.ivory.text,
    heading: themes.ivory.heading,
    link,
    codeBg: themes.ivory.codeBg,
    paper,
  };
}

export function pagePixels(paper: PdfPaper, orientation: PdfOrientation): { width: number; height: number } {
  const portrait = paper === "letter" ? [8.5, 11] : paper === "a5" ? [148 / 25.4, 210 / 25.4] : [210 / 25.4, 297 / 25.4];
  const [widthIn, heightIn] = orientation === "landscape" ? [portrait[1], portrait[0]] : portrait;
  return { width: Math.round(widthIn * 96), height: Math.round(heightIn * 96) };
}

export function toWire(profile: PdfProfile, theme: ThemeTokens, lang: "zh-CN" | "en-US"): PdfWire {
  const colors = profile.colorMode === "custom" ? sanitizeColors(profile.colors) : themePrintColors(theme);
  return {
    base: profile.base,
    body_font: profile.bodyFont,
    heading_font: profile.headingFont,
    code_font: profile.codeFont,
    font_size_px: profile.fontSizePx,
    line_height: profile.lineHeight,
    paragraph: profile.paragraph,
    measure: profile.measure,
    text: colors.text,
    heading: colors.heading,
    link: colors.link,
    code_bg: colors.codeBg,
    paper_color: colors.paper,
    paper: profile.paper,
    orientation: profile.orientation,
    margin_mm: profile.marginMm,
    header: profile.header,
    footer_page: profile.footerPage,
    footer_created: profile.footerCreated,
    footer_author: profile.footerAuthor,
    author: profile.author,
    lang,
    toc: profile.toc,
    code_break: profile.codeBreak === "keep" ? "keep" : "split",
    image_max_percent: Math.min(100, Math.max(40, Math.round(profile.imageMaxPercent))),
    widows: profile.widows === 3 || profile.widows === 4 ? profile.widows : 2,
  };
}

export function parsePdfProfile(value: unknown): PdfProfile | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const record = value as Record<string, unknown>;
  if (record.version !== 1) {
    return null;
  }
  const base = parseBase(record.base) ?? parseBase(record.template);
  if (!base) {
    return null;
  }
  const fallback = applyTemplate(base);
  const template: PdfTemplate = record.template === "custom" ? "custom" : base;
  return {
    ...fallback,
    template,
    base,
    bodyFont: parseBodyFont(record.bodyFont, fallback.bodyFont),
    headingFont: parseHeadingFont(record.headingFont, fallback.headingFont),
    codeFont: parseCodeFont(record.codeFont, fallback.codeFont),
    fontSizePx: parseSize(record.fontSizePx, fallback.fontSizePx),
    lineHeight: parseLine(record.lineHeight, fallback.lineHeight),
    paragraph: parseChoice(record.paragraph, ["compact", "standard", "loose"], fallback.paragraph),
    measure: parseChoice(record.measure, ["full", "standard", "narrow"], fallback.measure),
    colorMode: record.colorMode === "custom" ? "custom" : "theme",
    colors: parseColors(record.colors, fallback.colors),
    paper: parseChoice(record.paper, ["a4", "letter", "a5"], fallback.paper),
    orientation: record.orientation === "landscape" ? "landscape" : "portrait",
    marginMm: parseMargin(record.marginMm, fallback.marginMm),
    header: parseChoice(record.header, ["off", "title", "filename"], fallback.header),
    footerPage: record.footerPage !== false,
    footerCreated: record.footerCreated === true,
    footerAuthor: record.footerAuthor === true,
    author: parseAuthor(record.author),
    toc: record.toc === true,
    codeBreak: record.codeBreak === "keep" ? "keep" : "split",
    imageMaxPercent: parseImage(record.imageMaxPercent),
    widows: record.widows === 3 || record.widows === 4 ? record.widows : 2,
  };
}

export function loadPdfProfile(storage: WritingStorage = localStorage): PdfProfile | null {
  try {
    const raw = storage.getItem(storageKey);
    if (!raw) {
      return null;
    }
    return parsePdfProfile(JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

export function savePdfProfile(profile: PdfProfile, storage: WritingStorage = localStorage): void {
  try {
    storage.setItem(storageKey, JSON.stringify(profile));
  } catch {
    /* The profile stays in memory until the next successful export. */
  }
}

function sanitizeColors(colors: PdfColors): PdfColors {
  return {
    text: parseHex(colors.text, ink.text, true),
    heading: parseHex(colors.heading, ink.heading, true),
    link: parseHex(colors.link, ink.link, false),
    codeBg: parseHex(colors.codeBg, ink.codeBg, false),
    paper: parseHex(colors.paper, ink.paper, true),
  };
}

function parseColors(value: unknown, fallback: PdfColors): PdfColors {
  if (!value || typeof value !== "object") {
    return fallback;
  }
  const record = value as Record<string, unknown>;
  return sanitizeColors({
    text: typeof record.text === "string" ? record.text : fallback.text,
    heading: typeof record.heading === "string" ? record.heading : fallback.heading,
    link: typeof record.link === "string" ? record.link : fallback.link,
    codeBg: typeof record.codeBg === "string" ? record.codeBg : fallback.codeBg,
    paper: typeof record.paper === "string" ? record.paper : fallback.paper,
  });
}

function parseBase(value: unknown): PdfBase | null {
  return pdfBases.some((base) => base === value) ? (value as PdfBase) : null;
}

function parseChoice<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.some((item) => item === value) ? (value as T) : fallback;
}

function parseMargin(value: unknown, fallback: PdfMargin): PdfMargin {
  return pdfMargins.some((item) => item === value) ? (value as PdfMargin) : fallback;
}

function parseSize(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(24, Math.max(12, Math.round(value)));
}

function parseLine(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  const scaled = Math.round(value * 20) / 20;
  return scaled < 1.2 || scaled > 2.5 ? fallback : scaled;
}

function parseImage(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 100;
  }
  return Math.min(100, Math.max(40, Math.round(value)));
}

function parseAuthor(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }
  return value.replace(/[\r\n]/g, "").slice(0, 80);
}

function parseBodyFont(value: unknown, fallback: string): string {
  if (typeof value !== "string") {
    return fallback;
  }
  if (value === "system" || value === "serif" || value === "sans") {
    return value;
  }
  return cssFamily(value) ?? fallback;
}

function parseHeadingFont(value: unknown, fallback: string): string {
  if (value === "match") {
    return "match";
  }
  return parseBodyFont(value, fallback);
}

function parseCodeFont(value: unknown, fallback: string): string {
  if (typeof value !== "string") {
    return fallback;
  }
  if (value === "cascadia" || value === "jetbrains" || value === "fira" || value === "system") {
    return value;
  }
  return cssFamily(value) ?? fallback;
}

function parseHex(value: string, fallback: string, rejectBlack: boolean): string {
  if (!hexPattern.test(value)) {
    return fallback;
  }
  const color = value.toLowerCase();
  if (rejectBlack && color === "#000000") {
    return fallback;
  }
  return color;
}
