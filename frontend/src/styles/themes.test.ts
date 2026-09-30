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
    expect(themes.ivory.paper).toBe("#fbf6ee");
    expect(themes.midnight.paper).toBe("#242019");
    expect(themes.ivory.text).toBe("#2c2822");
    expect(themes.midnight.text).toBe("#f4efe6");
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
