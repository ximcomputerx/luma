import { describe, expect, it } from "vitest";
import { presentTheme, themes } from "../styles/themes";
import type { WritingStorage } from "../styles/writing";
import {
  applyTemplate,
  editProfile,
  loadPdfProfile,
  pagePixels,
  parsePdfProfile,
  savePdfProfile,
  themePrintColors,
  toWire,
} from "./pdfProfile";

function memory(): WritingStorage & { keys(): string[] } {
  const data = new Map<string, string>();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
    keys: () => [...data.keys()],
  };
}

describe("pdf profiles", () => {
  it("replaces the whole profile when a template is chosen", () => {
    expect(applyTemplate("modern")).toMatchObject({
      template: "modern",
      base: "modern",
      bodyFont: "sans",
      fontSizePx: 15,
      lineHeight: 1.6,
      paragraph: "standard",
      measure: "full",
      paper: "a4",
      marginMm: 18,
      header: "off",
      footerPage: true,
      toc: false,
    });
    expect(applyTemplate("academic")).toMatchObject({
      bodyFont: "serif",
      fontSizePx: 16,
      lineHeight: 1.7,
      colorMode: "custom",
      colors: { text: "#24292f", heading: "#1f2328", link: "#0969da", codeBg: "#f6f8fa", paper: "#f7f8fa" },
      marginMm: 20,
      header: "title",
      footerPage: true,
      toc: true,
      codeBreak: "keep",
    });
    expect(applyTemplate("book")).toMatchObject({
      paper: "a5",
      marginMm: 15,
      paragraph: "loose",
      measure: "narrow",
      lineHeight: 1.8,
    });
    expect(applyTemplate("minimal")).toMatchObject({
      lineHeight: 1.85,
      measure: "standard",
      footerPage: false,
      marginMm: 20,
    });
    expect(applyTemplate("technical")).toMatchObject({
      bodyFont: "sans",
      fontSizePx: 14,
      lineHeight: 1.5,
      paragraph: "compact",
      header: "filename",
      codeBreak: "split",
    });
  });

  it("keeps the base after an edit and labels the profile custom", () => {
    const edited = editProfile(applyTemplate("academic"), { fontSizePx: 18 });
    expect(edited.template).toBe("custom");
    expect(edited.base).toBe("academic");
    expect(edited.fontSizePx).toBe(18);
    expect(edited.header).toBe("title");
    expect(edited.toc).toBe(true);
    const stored = parsePdfProfile(JSON.parse(JSON.stringify(edited)) as unknown);
    expect(stored?.template).toBe("custom");
    expect(stored?.base).toBe("academic");
  });

  it("rejects black text, heading, and paper", () => {
    const parsed = parsePdfProfile({
      version: 1,
      template: "custom",
      base: "modern",
      colorMode: "custom",
      colors: {
        text: "#000000",
        heading: "#000000",
        link: "#0969DA",
        codeBg: "#f6f8fa",
        paper: "#000000",
      },
    });
    expect(parsed?.colors).toEqual({
      text: "#24292f",
      heading: "#1f2328",
      link: "#0969da",
      codeBg: "#f6f8fa",
      paper: "#f7f8fa",
    });
  });

  it("prints light themes on their paper and dark themes on ivory", () => {
    const warm = presentTheme("sepia", true);
    expect(themePrintColors(warm)).toEqual({
      text: warm.text,
      heading: warm.heading,
      link: warm.link,
      codeBg: warm.codeBg,
      paper: warm.paper,
    });
    expect(themePrintColors(themes.ivory)).toEqual({
      text: "#2c2822",
      heading: "#1f1c17",
      link: "#2f5d50",
      codeBg: "#f3ece2",
      paper: "#fbf6ee",
    });
    expect(themePrintColors(themes.midnight)).toEqual({
      text: "#2c2822",
      heading: "#1f1c17",
      link: "#2f5d50",
      codeBg: "#f3ece2",
      paper: "#fbf6ee",
    });
  });

  it("matches the print page sizes", () => {
    expect(pagePixels("a4", "portrait")).toEqual({ width: 794, height: 1123 });
    expect(pagePixels("letter", "portrait")).toEqual({ width: 816, height: 1056 });
    expect(pagePixels("letter", "landscape")).toEqual({ width: 1056, height: 816 });
    expect(pagePixels("a5", "portrait")).toEqual({ width: 559, height: 794 });
  });

  it("stores the profile only under luma.pdf.v1", () => {
    const storage = memory();
    savePdfProfile(applyTemplate("book"), storage);
    expect(storage.keys()).toEqual(["luma.pdf.v1"]);
    expect(loadPdfProfile(storage)).toMatchObject({ template: "book", paper: "a5", measure: "narrow" });
    expect(parsePdfProfile({ version: 2, base: "book" })).toBeNull();
  });

  it("sends resolved colors and omits stored-only fields", () => {
    const academic = toWire(applyTemplate("academic"), themes.midnight, "zh-CN");
    expect(academic).toMatchObject({
      base: "academic",
      text: "#24292f",
      paper_color: "#f7f8fa",
      lang: "zh-CN",
      line_height: 1.7,
    });
    expect(academic.toc).toBe(true);
    expect(academic.code_break).toBe("keep");
    expect(academic.image_max_percent).toBe(100);
    expect(academic.widows).toBe(2);
    expect(academic).not.toHaveProperty("template");
    expect(academic).not.toHaveProperty("version");
    expect(academic).not.toHaveProperty("colorMode");
    expect(academic).not.toHaveProperty("codeBreak");
    expect(academic).not.toHaveProperty("imageMaxPercent");

    const modern = toWire(applyTemplate("modern"), themes.midnight, "en-US");
    expect(modern.paper_color).toBe("#fbf6ee");
    expect(modern.text).toBe("#2c2822");
    expect(modern.lang).toBe("en-US");
    expect(toWire(applyTemplate("minimal"), themes.ivory, "zh-CN").line_height).toBe(1.85);
  });
});
