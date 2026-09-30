import { invoke } from "@tauri-apps/api/core";
import { cssFamily } from "./writing";

type LocalFontFace = { family?: string };

export async function loadSystemFonts(): Promise<string[]> {
  const native = await fontsFromCommand();
  const source = native.length > 0 ? native : await fontsFromBrowser();
  const unique = new Set<string>();
  for (const name of source) {
    const family = cssFamily(name);
    if (family) {
      unique.add(family);
    }
  }
  return [...unique];
}

async function fontsFromCommand(): Promise<string[]> {
  try {
    const names = await invoke<unknown>("fonts_list");
    return Array.isArray(names) ? names.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

async function fontsFromBrowser(): Promise<string[]> {
  const query = (window as Window & { queryLocalFonts?: () => Promise<LocalFontFace[]> }).queryLocalFonts;
  if (!query) {
    return [];
  }
  try {
    const faces = await query();
    return faces.map((face) => face.family ?? "");
  } catch {
    return [];
  }
}
