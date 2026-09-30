import { getCurrentWindow } from "@tauri-apps/api/window";
import { presentTheme, type ResolvedTheme } from "./themes";
import { defaultWriting, effectiveWriting, loadWriting, proseStack, codeStack, rustThemeFor, type WritingPrefs } from "./writing";

export function prefersDark(): boolean {
  return window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ?? false;
}

export function bootWriting(): WritingPrefs {
  return effectiveWriting(loadWriting() ?? defaultWriting(), prefersDark());
}

export function applyTheme(root: HTMLElement, tokens: ResolvedTheme, writing: WritingPrefs): void {
  root.dataset.theme = tokens.id;
  root.dataset.family = tokens.family;
  root.dataset.warm = writing.warm ? "on" : "off";
  root.style.colorScheme = tokens.family;
  const measure = writing.measureWindow ? "none" : `${writing.measureRem}rem`;
  const prose = proseStack(writing.proseFont);
  const code = codeStack(writing.codeFont);
  const line = String(writing.lineHeight);
  const values: Array<[string, string, string]> = [
    ["--luma-background", "--bg-solid", tokens.app],
    ["--luma-sidebar", "--bg-sidebar-solid", tokens.sidebar],
    ["--luma-editor", "--bg-editor", tokens.editor],
    ["--luma-preview-paper", "--bg-preview", tokens.paper],
    ["--luma-elevated", "--bg-elevated", tokens.elevated],
    ["--luma-text-primary", "--fg", tokens.text],
    ["--luma-text-heading", "--fg-heading", tokens.heading],
    ["--luma-text-secondary", "--fg-muted", tokens.muted],
    ["--luma-link", "--link", tokens.link],
    ["--luma-code", "--code-bg", tokens.codeBg],
    ["--luma-border", "--border", tokens.border],
    ["--luma-accent", "--accent", tokens.accent],
    ["--luma-accent-foreground", "--accent-fg", tokens.accentFg],
    ["--luma-selection", "--selection", tokens.selection],
    ["--luma-danger", "--danger", tokens.danger],
    ["--luma-dirty", "--dirty", tokens.dirty],
    ["--luma-measure", "--measure", measure],
    ["--luma-line", "--line", line],
    ["--luma-font-prose", "--font-prose", prose],
    ["--luma-font-code", "--font-code", code],
  ];
  for (const [next, legacy, value] of values) {
    root.style.setProperty(next, value);
    root.style.setProperty(legacy, value);
  }
}

export function windowTheme(writing: WritingPrefs): "light" | "dark" | null {
  const theme = rustThemeFor(writing);
  return theme === "system" ? null : theme;
}

export function syncWindowTheme(writing: WritingPrefs): void {
  try {
    void getCurrentWindow()
      .setTheme(windowTheme(writing))
      .catch(() => {
        /* Browser preview has no window handle. */
      });
  } catch {
    /* getCurrentWindow throws before a promise exists outside the desktop shell. */
  }
}

export function paintBootTheme(): void {
  const writing = bootWriting();
  applyTheme(document.documentElement, presentTheme(writing.themeId, writing.warm), writing);
  syncWindowTheme(writing);
}
