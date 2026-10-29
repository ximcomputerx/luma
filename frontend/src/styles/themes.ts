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
    app: "#efe6d6",
    sidebar: "#e4d8c4",
    editor: "#f7f1e4",
    paper: "#fffaf1",
    text: "#2a241c",
    heading: "#1a1612",
    link: "#1d6a4f",
    codeBg: "#f0e4d2",
    border: "#b5a488",
    accent: "#1b463c",
  },
  sepia: {
    id: "sepia",
    family: "light",
    app: "#f3e0c4",
    sidebar: "#e7cda6",
    editor: "#fbf0d8",
    paper: "#fff6e4",
    text: "#3b291c",
    heading: "#26180f",
    link: "#8a4218",
    codeBg: "#f3ddb8",
    border: "#b08c58",
    accent: "#7a3e1c",
  },
  mist: {
    id: "mist",
    family: "light",
    app: "#ececec",
    sidebar: "#e0e0e0",
    editor: "#f4f4f4",
    paper: "#fbfbfb",
    text: "#242424",
    heading: "#141414",
    link: "#333333",
    codeBg: "#e8e8e8",
    border: "#b0b0b0",
    accent: "#1c1c1c",
  },
  sakura: {
    id: "sakura",
    family: "light",
    app: "#f8e4e8",
    sidebar: "#f0cfd6",
    editor: "#fdf1f3",
    paper: "#fff8f8",
    text: "#3c2830",
    heading: "#28161c",
    link: "#9a3048",
    codeBg: "#f8e4e8",
    border: "#c4929e",
    accent: "#7a2038",
  },
  forest: {
    id: "forest",
    family: "light",
    app: "#e4f0e6",
    sidebar: "#d0e4d4",
    editor: "#f2f8f3",
    paper: "#f7fbf8",
    text: "#1b2b22",
    heading: "#102018",
    link: "#1f6a38",
    codeBg: "#e4f0e7",
    border: "#98b8a0",
    accent: "#164828",
  },
  bluegray: {
    id: "bluegray",
    family: "light",
    app: "#e5eef6",
    sidebar: "#d2e2f0",
    editor: "#f3f7fb",
    paper: "#f8fbfe",
    text: "#1c2a36",
    heading: "#101c28",
    link: "#1f5f88",
    codeBg: "#e4eef6",
    border: "#9eb6c8",
    accent: "#163e5c",
  },
  midnight: {
    id: "midnight",
    family: "dark",
    app: "#141210",
    sidebar: "#0e0d0b",
    editor: "#1b1916",
    paper: "#262119",
    text: "#f4efe6",
    heading: "#fbf7f1",
    link: "#b7dcc8",
    codeBg: "#302b25",
    border: "#73685c",
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
    link: "#8fbcbb",
    codeBg: "#434c5e",
    border: "#8b98b0",
    accent: "#88c0d0",
  },
  coffee: {
    id: "coffee",
    family: "dark",
    app: "#120e0b",
    sidebar: "#0e0b09",
    editor: "#1a1410",
    paper: "#271e18",
    text: "#f6e7d4",
    heading: "#fbf3e8",
    link: "#f0c090",
    codeBg: "#31261e",
    border: "#735c48",
    accent: "#e8b56a",
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
    elevated: dark ? mixHex(tokens.editor, "#ffffff", 0.06) : mixHex(tokens.editor, "#ffffff", 0.55),
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
