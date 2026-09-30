import { translate, type Locale } from "../i18n";
import { shellAppearance, type ShellAppearance } from "../styles/appearance";
import { presentTheme } from "../styles/themes";
import { defaultWriting } from "../styles/writing";

export type PreviewCopy = {
  mermaidSyntax: string;
  mermaidSyntaxLine: string;
  mermaidRender: string;
  mermaidMissing: string;
  diagramFiltered: string;
  imagePending: string;
  imageLocalPending: string;
  linkClosed: string;
  pageBreak: string;
};

export function previewMessages(locale: Locale): PreviewCopy {
  return {
    mermaidSyntax: translate(locale, "preview.mermaidSyntax"),
    mermaidSyntaxLine: translate(locale, "preview.mermaidSyntaxLine", undefined, { raw: true }),
    mermaidRender: translate(locale, "preview.mermaidRender"),
    mermaidMissing: translate(locale, "preview.mermaidMissing"),
    diagramFiltered: translate(locale, "preview.diagramFiltered"),
    imagePending: translate(locale, "preview.imagePending"),
    imageLocalPending: translate(locale, "preview.imageLocalPending"),
    linkClosed: translate(locale, "preview.linkClosed"),
    pageBreak: translate(locale, "preview.pageBreak"),
  };
}

function serializeCopy(copy: PreviewCopy): string {
  return escapeScriptClose(JSON.stringify(copy).replaceAll("\u2028", "\\u2028").replaceAll("\u2029", "\\u2029"));
}

function shellLang(locale: string | undefined): Locale {
  return locale === "zh-CN" ? "zh-CN" : "en-US";
}

const BASE_CSP =
  "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; font-src data:; connect-src 'none'";

function childCsp(remoteImages: boolean): string {
  const images = remoteImages ? "img-src data: https:" : "img-src data:";
  return `${BASE_CSP}; ${images}`;
}

export function escapeScriptClose(source: string): string {
  return source.replace(/<\/script/gi, "<\\/script");
}

export function assertClassicBundle(source: string, label: string): void {
  if (/import\s*\(\s*['"]\.\//.test(source)) {
    throw new Error(`${label} 仍包含相对 import()，不能放进不透明 iframe`);
  }
}

export function stripCssUrls(css: string): string {
  return css.replace(/url\((?:[^)(]+|\([^)(]*\))*\)/g, "none");
}

export function shellHtml(parts: {
  katexJs: string;
  katexCss: string;
  runtime: string;
  mermaidJs?: string;
  remoteImages?: boolean;
  appearance?: ShellAppearance;
  lang?: string;
  copy?: PreviewCopy;
}): string {
  assertClassicBundle(parts.katexJs, "katex.min.js");
  if (parts.mermaidJs) {
    assertClassicBundle(parts.mermaidJs, "mermaid.min.js");
  }
  const mermaid = parts.mermaidJs
    ? `<script>${escapeScriptClose(parts.mermaidJs)}</script>`
    : "";
  const look = sanitizeAppearance(parts.appearance);
  const lang = shellLang(parts.lang);
  const copy = serializeCopy(parts.copy ?? previewMessages(lang));
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${childCsp(parts.remoteImages === true)}">
<style>
  body { margin: 0; padding: 56px 48px 96px; font: ${look.fontSize}px/${look.lineHeight} ${look.proseFont}; color: ${look.fg}; background: ${look.bg}; }
  html { scrollbar-width: thin; scrollbar-color: transparent transparent; }
  html:hover { scrollbar-color: color-mix(in srgb, ${look.muted} 45%, transparent) transparent; }
  ::-webkit-scrollbar { width: 8px; height: 8px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background-color: transparent; border-radius: 4px; }
  html:hover::-webkit-scrollbar-thumb { background-color: color-mix(in srgb, ${look.muted} 45%, transparent); }
  ::-webkit-scrollbar-thumb:hover { background-color: color-mix(in srgb, ${look.muted} 70%, transparent); }
  #root { max-width: ${look.measure}; margin: 0 auto; }
  p { margin: 0 0 0.9em; }
  pre, code { font-family: ${look.codeFont}; }
  code { font-size: 0.92em; background: ${look.codeBg}; padding: 0.1em 0.35em; border-radius: 4px; }
  pre { background: ${look.codeBg}; padding: 14px 16px; overflow: auto; border: 1px solid ${look.border}; border-radius: 0; }
  pre code { background: transparent; padding: 0; font-size: 1em; }
  table { border-collapse: collapse; width: 100%; margin: 0 0 1.1em; }
  td, th { border: 1px solid ${look.border}; padding: 8px 10px; text-align: left; }
  th { background: ${look.codeBg}; font-weight: 650; }
  blockquote { margin: 0 0 1em; padding: 8px 14px; border-left: 3px solid ${look.accent}; border-radius: 0 8px 8px 0; background: color-mix(in srgb, ${look.accent} 8%, transparent); }
  .placeholder, .diagram-error-detail { color: ${look.muted}; }
  .diagram-error { margin: 0 0 0.35em; }
  .diagram-error-detail { white-space: pre-wrap; font-size: 0.85em; }
  .link { color: ${look.link}; text-decoration: underline; text-underline-offset: 0.18em; }
  img { display: block; max-width: 100%; height: auto; margin: 0.8em 0; border-radius: 8px; }
  .current-block { box-shadow: inset 3px 0 0 ${look.accent}; background: color-mix(in srgb, ${look.accent} 10%, transparent); }
  h1, h2, h3, h4, h5, h6 { color: ${look.heading}; line-height: 1.25; font-weight: 650; letter-spacing: -0.02em; }
  h1 { font-size: 2em; margin: 0 0 0.45em; }
  h2 { font-size: 1.45em; margin: 1.35em 0 0.45em; }
  h3 { font-size: 1.18em; margin: 1.2em 0 0.35em; }
  h4, h5, h6 { font-size: 1.05em; margin: 1.1em 0 0.3em; }
  ul, ol { margin: 0 0 0.9em; padding-left: 1.3em; }
  hr { border: 0; border-top: 1px solid ${look.border}; margin: 1.6em 0; }
  .page-break { margin: 1.6em 0 0.6em; border-top: 1px dashed ${look.border}; text-align: center; color: ${look.muted}; font-size: 11px; letter-spacing: 0.14em; }
  .page-break span { display: inline-block; padding: 0 0.75em; background: ${look.bg}; transform: translateY(-0.7em); }
  ${stripCssUrls(parts.katexCss)}
</style>
</head>
<body>
<div id="root"></div>
<script>var lumaRemoteImages = ${parts.remoteImages === true};</script>
<script>var lumaCopy = ${copy};</script>
<script>${escapeScriptClose(parts.katexJs)}</script>
${mermaid}
<script>${escapeScriptClose(parts.runtime)}</script>
</body>
</html>`;
}

const fallbackAppearance = shellAppearance(presentTheme("ivory", false), defaultWriting(), 16);

function sanitizeAppearance(appearance: ShellAppearance | undefined): ShellAppearance {
  const given = appearance ?? fallbackAppearance;
  return {
    fg: safeColor(given.fg, fallbackAppearance.fg),
    heading: safeColor(given.heading, fallbackAppearance.heading),
    bg: safeColor(given.bg, fallbackAppearance.bg),
    muted: safeColor(given.muted, fallbackAppearance.muted),
    border: safeColor(given.border, fallbackAppearance.border),
    accent: safeColor(given.accent, fallbackAppearance.accent),
    link: safeColor(given.link, fallbackAppearance.link),
    codeBg: safeColor(given.codeBg, fallbackAppearance.codeBg),
    fontSize: safeFontSize(given.fontSize),
    lineHeight: safeLine(given.lineHeight),
    measure: safeMeasure(given.measure),
    proseFont: safeFont(given.proseFont, fallbackAppearance.proseFont),
    codeFont: safeFont(given.codeFont, fallbackAppearance.codeFont),
  };
}

function safeColor(value: string, fallback: string): string {
  return /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : fallback;
}

function safeFontSize(value: number): number {
  if (!Number.isFinite(value)) {
    return 16;
  }
  const rounded = Math.round(value);
  return rounded >= 14 && rounded <= 22 ? rounded : 16;
}

function safeLine(value: number): number {
  return value === 1.6 || value === 1.75 || value === 2 ? value : 1.75;
}

function safeMeasure(value: string): string {
  if (value === "none") {
    return "none";
  }
  const match = /^(\d+)rem$/.exec(value);
  if (!match) {
    return "40rem";
  }
  const width = Number(match[1]);
  return width >= 36 && width <= 72 && width % 2 === 0 ? `${width}rem` : "40rem";
}

function safeFont(value: string, fallback: string): string {
  if (!value || value.length > 240 || !/^[\p{L}\p{N} ,"()\-.+&'_]+$/u.test(value)) {
    return fallback;
  }
  return value;
}
