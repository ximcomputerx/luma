import { describe, expect, it } from "vitest";
import { applyTheme, syncWindowTheme, windowTheme } from "./applyTheme";
import { presentTheme } from "./themes";
import { codeStack, defaultWriting, proseStack } from "./writing";

describe("applyTheme", () => {
  it("writes each luma token and the legacy name the editor already reads", () => {
    const root = document.createElement("html");
    const theme = presentTheme("nord", false);
    applyTheme(root, theme, defaultWriting());
    const paired: Array<[string, string, string]> = [
      ["--luma-background", "--bg-solid", theme.app],
      ["--luma-sidebar", "--bg-sidebar-solid", theme.sidebar],
      ["--luma-editor", "--bg-editor", theme.editor],
      ["--luma-preview-paper", "--bg-preview", theme.paper],
      ["--luma-elevated", "--bg-elevated", theme.elevated],
      ["--luma-text-primary", "--fg", theme.text],
      ["--luma-text-heading", "--fg-heading", theme.heading],
      ["--luma-text-secondary", "--fg-muted", theme.muted],
      ["--luma-link", "--link", theme.link],
      ["--luma-code", "--code-bg", theme.codeBg],
      ["--luma-border", "--border", theme.border],
      ["--luma-accent", "--accent", theme.accent],
      ["--luma-accent-foreground", "--accent-fg", theme.accentFg],
      ["--luma-selection", "--selection", theme.selection],
      ["--luma-danger", "--danger", theme.danger],
      ["--luma-dirty", "--dirty", theme.dirty],
      ["--luma-measure", "--measure", "40rem"],
      ["--luma-line", "--line", "1.75"],
      ["--luma-font-prose", "--font-prose", proseStack("serif")],
      ["--luma-font-code", "--font-code", codeStack("cascadia")],
    ];
    for (const [next, legacy, value] of paired) {
      expect(root.style.getPropertyValue(next)).toBe(value);
      expect(root.style.getPropertyValue(legacy)).toBe(value);
    }
    expect(root.dataset.theme).toBe("nord");
    expect(root.dataset.family).toBe("dark");
    expect(root.style.colorScheme).toBe("dark");
  });

  it("clears the measure when the writing width follows the window", () => {
    const root = document.createElement("html");
    applyTheme(root, presentTheme("ivory", false), { ...defaultWriting(), measureWindow: true, lineHeight: 2 });
    expect(root.style.getPropertyValue("--luma-measure")).toBe("none");
    expect(root.style.getPropertyValue("--measure")).toBe("none");
    expect(root.style.getPropertyValue("--luma-line")).toBe("2");
    expect(root.style.getPropertyValue("--line")).toBe("2");
  });

  it("paints the native caption from the theme family and leaves follow-system to the OS", () => {
    expect(windowTheme({ ...defaultWriting(), themeId: "nord", followSystem: false })).toBe("dark");
    expect(windowTheme({ ...defaultWriting(), themeId: "coffee", followSystem: false })).toBe("dark");
    expect(windowTheme({ ...defaultWriting(), themeId: "sakura", followSystem: false })).toBe("light");
    expect(windowTheme({ ...defaultWriting(), themeId: "sepia", followSystem: false })).toBe("light");
    expect(windowTheme(defaultWriting())).toBeNull();
    expect(windowTheme({ ...defaultWriting(), themeId: "midnight", followSystem: true })).toBeNull();
  });

  it("leaves the page running when no desktop window is available", () => {
    expect(() => syncWindowTheme(defaultWriting())).not.toThrow();
  });
});
