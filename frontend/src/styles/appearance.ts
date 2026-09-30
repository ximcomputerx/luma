import { type ResolvedTheme } from "./themes";
import { codeStack, proseStack, type WritingPrefs } from "./writing";

export type ShellAppearance = {
  fg: string;
  heading: string;
  bg: string;
  muted: string;
  border: string;
  accent: string;
  link: string;
  codeBg: string;
  fontSize: number;
  lineHeight: number;
  measure: string;
  proseFont: string;
  codeFont: string;
};

export function shellAppearance(theme: ResolvedTheme, writing: WritingPrefs, fontSize: number): ShellAppearance {
  return {
    fg: theme.text,
    heading: theme.heading,
    bg: theme.paper,
    muted: theme.muted,
    border: theme.border,
    accent: theme.accent,
    link: theme.link,
    codeBg: theme.codeBg,
    fontSize,
    lineHeight: writing.lineHeight,
    measure: writing.measureWindow ? "none" : `${writing.measureRem}rem`,
    proseFont: proseStack(writing.proseFont),
    codeFont: codeStack(writing.codeFont),
  };
}
