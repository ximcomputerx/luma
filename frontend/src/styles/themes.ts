export const themeIds = [
  "ivory",
  "sepia",
  "mist",
  "sakura",
  "forest",
  "bluegray",
  "midnight",
  "nord",
  "coffee",
] as const;

export type ThemeId = (typeof themeIds)[number];
export type ThemeFamily = "light" | "dark";

export type ThemeTokens = {
  id: ThemeId;
  family: ThemeFamily;
  app: string;
  sidebar: string;
  editor: string;
  paper: string;
  text: string;
  heading: string;
  link: string;
  codeBg: string;
  border: string;
  accent: string;
};

export type ResolvedTheme = ThemeTokens & {
  muted: string;
  elevated: string;
  accentFg: string;
  selection: string;
  danger: string;
  dirty: string;
};

export const themes = {
  ivory: {
    id: "ivory",
    family: "light",
    app: "#f3f0e8",
    sidebar: "#ebe6dc",
    editor: "#f7f3eb",
    paper: "#fbf6ee",
    text: "#2c2822",
    heading: "#1f1c17",
    link: "#2f5d50",
    codeBg: "#f3ece2",
    border: "#e4d9c8",
    accent: "#2f5d50",
  },
  sepia: {
    id: "sepia",
    family: "light",
    app: "#f3e6d0",
    sidebar: "#ead9be",
    editor: "#f7ead4",
    paper: "#f8edd9",
    text: "#3e2f22",
    heading: "#2a1e14",
    link: "#8a4b2f",
    codeBg: "#efe0c8",
    border: "#e0cbaa",
    accent: "#8a4b2f",
  },
  mist: {
    id: "mist",
    family: "light",
    app: "#eef0f2",
    sidebar: "#e4e7eb",
    editor: "#f4f6f8",
    paper: "#f7f8fa",
    text: "#2a2e33",
    heading: "#1c2024",
    link: "#3d5a73",
    codeBg: "#e8ebef",
    border: "#d5dae0",
    accent: "#3d5a73",
  },
  sakura: {
    id: "sakura",
    family: "light",
    app: "#f6efef",
    sidebar: "#efe4e6",
    editor: "#fbf6f6",
    paper: "#fff8f8",
    text: "#3a2e32",
    heading: "#2a1f24",
    link: "#7d3a4e",
    codeBg: "#f3e8ea",
    border: "#e6d5d8",
    accent: "#7d3a4e",
  },
  forest: {
    id: "forest",
    family: "light",
    app: "#e7eee8",
    sidebar: "#dce6de",
    editor: "#f2f7f3",
    paper: "#f6faf7",
    text: "#24302a",
    heading: "#17241d",
    link: "#2f5d50",
    codeBg: "#e5eee7",
    border: "#cfdcd3",
    accent: "#2f5d50",
  },
  bluegray: {
    id: "bluegray",
    family: "light",
    app: "#e8eef2",
    sidebar: "#dde5eb",
    editor: "#f3f7fa",
    paper: "#f7fafc",
    text: "#243038",
    heading: "#172028",
    link: "#3a5f78",
    codeBg: "#e6eef3",
    border: "#d0dbe3",
    accent: "#3a5f78",
  },
  midnight: {
    id: "midnight",
    family: "dark",
    app: "#1a1916",
    sidebar: "#141311",
    editor: "#1e1c19",
    paper: "#242019",
    text: "#f4efe6",
    heading: "#fbf6ee",
    link: "#8fbfa8",
    codeBg: "#2e2924",
    border: "#3d362e",
    accent: "#8fbfa8",
  },
  nord: {
    id: "nord",
    family: "dark",
    app: "#2e3440",
    sidebar: "#272c36",
    editor: "#323846",
    paper: "#3b4252",
    text: "#eceff4",
    heading: "#e5e9f0",
    link: "#88c0d0",
    codeBg: "#434c5e",
    border: "#4c566a",
    accent: "#88c0d0",
  },
  coffee: {
    id: "coffee",
    family: "dark",
    app: "#1c1612",
    sidebar: "#16110e",
    editor: "#221b16",
    paper: "#2a211b",
    text: "#f3e6d4",
    heading: "#f8efe2",
    link: "#e0a36a",
    codeBg: "#342820",
    border: "#4a3b30",
    accent: "#e0a36a",
  },
} satisfies Record<ThemeId, ThemeTokens>;

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === "string" && themeIds.some((id) => id === value);
}

export function themeById(id: ThemeId): ThemeTokens {
  return themes[id];
}

function parseHex(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function toHex(red: number, green: number, blue: number): string {
  const channel = (value: number) => Math.round(Math.min(255, Math.max(0, value))).toString(16).padStart(2, "0");
  return `#${channel(red)}${channel(green)}${channel(blue)}`;
}

export function mixHex(from: string, to: string, amount: number): string {
  const [ar, ag, ab] = parseHex(from);
  const [br, bg, bb] = parseHex(to);
  return toHex(ar + (br - ar) * amount, ag + (bg - ag) * amount, ab + (bb - ab) * amount);
}

function linear(channel: number): number {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const [red, green, blue] = parseHex(hex);
  return 0.2126 * linear(red) + 0.7152 * linear(green) + 0.0722 * linear(blue);
}

export function contrast(foreground: string, background: string): number {
  const lighter = Math.max(luminance(foreground), luminance(background));
  const darker = Math.min(luminance(foreground), luminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

function scaleChannels(hex: string, red: number, green: number, blue: number): string {
  const [r, g, b] = parseHex(hex);
  return toHex(r * red, g * green, b * blue);
}

function warmSurface(hex: string, family: ThemeFamily): string {
  if (family === "dark") {
    return mixHex(hex, "#3a2a1c", 0.14);
  }
  return mixHex(scaleChannels(hex, 1, 0.985, 0.9), "#f6ead4", 0.1);
}

export function withWarm(tokens: ThemeTokens): ThemeTokens {
  const text = tokens.family === "dark" ? mixHex(tokens.text, "#f6ead4", 0.08) : mixHex(tokens.text, "#3a2a1c", 0.06);
  const heading = tokens.family === "dark" ? mixHex(tokens.heading, "#f6ead4", 0.08) : mixHex(tokens.heading, "#3a2a1c", 0.06);
  const accent = tokens.family === "dark" ? mixHex(tokens.accent, "#3a2a1c", 0.05) : mixHex(tokens.accent, "#f6ead4", 0.05);
  const link = tokens.family === "dark" ? mixHex(tokens.link, "#3a2a1c", 0.05) : mixHex(tokens.link, "#f6ead4", 0.05);
  return {
    ...tokens,
    app: warmSurface(tokens.app, tokens.family),
    sidebar: warmSurface(tokens.sidebar, tokens.family),
    editor: warmSurface(tokens.editor, tokens.family),
    paper: warmSurface(tokens.paper, tokens.family),
    codeBg: warmSurface(tokens.codeBg, tokens.family),
    border: warmSurface(tokens.border, tokens.family),
    text,
    heading,
    link,
    accent,
  };
}

function deriveMuted(text: string, paper: string, editor: string, sidebar: string): string {
  const surfaces = [paper, editor, sidebar];
  let best = text;
  let bestScore = Number.POSITIVE_INFINITY;
  for (let step = 0; step <= 92; step += 1) {
    const color = mixHex(text, paper, step / 100);
    const readable = surfaces.every((surface) => contrast(color, surface) >= 4.5);
    if (!readable) {
      continue;
    }
    const score = Math.abs(contrast(color, paper) - 5.2);
    if (score < bestScore) {
      best = color;
      bestScore = score;
    }
  }
  return best;
}

function accentInk(accent: string, text: string): string {
  if (luminance(accent) <= 0.4) {
    return "#ffffff";
  }
  return luminance(text) < 0.4 ? text : "#14231c";
}

export function resolveTheme(tokens: ThemeTokens): ResolvedTheme {
  const dark = tokens.family === "dark";
  return {
    ...tokens,
    muted: deriveMuted(tokens.text, tokens.paper, tokens.editor, tokens.sidebar),
    elevated: dark ? mixHex(tokens.editor, "#ffffff", 0.14) : mixHex(tokens.editor, "#ffffff", 0.55),
    accentFg: accentInk(tokens.accent, tokens.text),
    selection: mixHex(tokens.editor, tokens.accent, 0.22),
    danger: dark ? "#f0a8a2" : "#9c3b32",
    dirty: dark ? "#e2c27a" : "#a8843d",
  };
}

export function presentTheme(id: ThemeId, warm: boolean): ResolvedTheme {
  const tokens = themes[id];
  return resolveTheme(warm ? withWarm(tokens) : tokens);
}
