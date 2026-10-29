import { describe, expect, it } from "vitest";
import { contrast, presentTheme, themeIds, themes, withWarm } from "./themes";

function blue(hex: string): number {
  return Number.parseInt(hex.slice(5, 7), 16);
}

describe("theme tokens", () => {
  it("keeps one catalog entry for each writing theme", () => {
    expect(themeIds).toHaveLength(9);
    for (const id of themeIds) {
      const theme = themes[id];
      expect(theme.id).toBe(id);
      for (const color of [theme.app, theme.sidebar, theme.editor, theme.paper, theme.text, theme.heading, theme.link, theme.codeBg, theme.border, theme.accent]) {
        expect(color).toMatch(/^#[0-9a-f]{6}$/);
      }
    }
    expect(themes.ivory.paper).toBe("#fffaf1");
    expect(themes.midnight.paper).toBe("#262119");
    expect(themes.ivory.text).toBe("#2a241c");
    expect(themes.midnight.text).toBe("#f4efe6");
    expect(themes.ivory.accent).not.toBe(themes.forest.accent);
  });

  it("keeps a hairline visible on the sidebar and the raised surface", () => {
    for (const id of themeIds) {
      for (const warm of [false, true]) {
        const theme = presentTheme(id, warm);
        expect(contrast(theme.border, theme.sidebar)).toBeGreaterThanOrEqual(1.45);
        expect(contrast(theme.border, theme.elevated)).toBeGreaterThanOrEqual(1.45);
        expect(theme.link).not.toBe(theme.accent);
      }
    }
  });

  it("keeps body text and links readable on paper and in the editor", () => {
    for (const id of themeIds) {
      const theme = presentTheme(id, false);
      expect(contrast(theme.text, theme.paper)).toBeGreaterThanOrEqual(7);
      expect(contrast(theme.text, theme.editor)).toBeGreaterThanOrEqual(7);
      expect(contrast(theme.heading, theme.paper)).toBeGreaterThanOrEqual(7);
      expect(contrast(theme.link, theme.paper)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(theme.link, theme.editor)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(theme.muted, theme.paper)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(theme.muted, theme.editor)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(theme.muted, theme.sidebar)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(theme.accentFg, theme.accent)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("warms ivory paper by lowering blue and keeps the text readable", () => {
    const warmed = withWarm(themes.ivory);
    expect(warmed.id).toBe("ivory");
    expect(blue(warmed.paper)).toBeLessThan(blue(themes.ivory.paper));
    for (const id of themeIds) {
      const theme = presentTheme(id, true);
      expect(theme.id).toBe(id);
      expect(contrast(theme.text, theme.paper)).toBeGreaterThanOrEqual(7);
      expect(contrast(theme.link, theme.paper)).toBeGreaterThanOrEqual(4.5);
    }
  });

});
