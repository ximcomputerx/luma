import { useSyncExternalStore } from "react";

export const locales = ["en-US", "zh-CN"] as const;
export type Locale = (typeof locales)[number];
export type LocaleSource = "system" | "fixed";

export type LocaleState = {
  locale: Locale;
  source: LocaleSource;
};

export type LocaleStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

const storageKey = "luma.locale.v1";

let state: LocaleState = { locale: "en-US", source: "system" };
const listeners = new Set<() => void>();

export function matchLocale(input: string): Locale | null {
  const lower = input.replace(/_/g, "-").toLowerCase();
  if (lower === "en-us") {
    return "en-US";
  }
  if (lower === "zh-cn" || lower === "zh-hans") {
    return "zh-CN";
  }
  const language = lower.split("-")[0];
  if (language === "en") {
    return "en-US";
  }
  if (language === "zh") {
    return "zh-CN";
  }
  return null;
}

export function resolveSystemLocale(languages: readonly string[]): Locale {
  for (const language of languages) {
    const match = matchLocale(language);
    if (match) {
      return match;
    }
  }
  return "en-US";
}

export function parseLocalePrefs(raw: unknown): Locale | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const record = raw as { version?: unknown; locale?: unknown };
  if (record.version !== 1 || typeof record.locale !== "string") {
    return null;
  }
  return record.locale === "en-US" || record.locale === "zh-CN" ? record.locale : null;
}

export function getLocaleState(): LocaleState {
  return state;
}

export function subscribeLocale(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function readRaw(storage: LocaleStorage): string | null {
  try {
    return storage.getItem(storageKey);
  } catch {
    return null;
  }
}

function applyDocument(locale: Locale) {
  if (typeof document === "undefined") {
    return;
  }
  document.documentElement.lang = locale;
  document.documentElement.dir = "ltr";
}

function publish(next: LocaleState) {
  state = next;
  applyDocument(next.locale);
  for (const listener of listeners) {
    listener();
  }
}

export function paintBootLocale(
  storage: LocaleStorage = localStorage,
  languages: readonly string[] = typeof navigator === "undefined" ? [] : navigator.languages,
) {
  let fixed: Locale | null = null;
  const raw = readRaw(storage);
  if (raw) {
    try {
      fixed = parseLocalePrefs(JSON.parse(raw) as unknown);
    } catch {
      fixed = null;
    }
  }
  publish({
    locale: fixed ?? resolveSystemLocale(languages),
    source: fixed ? "fixed" : "system",
  });
}

export function setLocaleChoice(
  choice: Locale | "system",
  storage: LocaleStorage = localStorage,
  languages?: readonly string[],
) {
  if (choice === "system") {
    try {
      storage.removeItem(storageKey);
    } catch {
      /* The session still follows the system list below. */
    }
    const list = languages ?? (typeof navigator === "undefined" ? [] : navigator.languages);
    publish({ locale: resolveSystemLocale(list), source: "system" });
    return;
  }
  try {
    storage.setItem(storageKey, JSON.stringify({ version: 1, locale: choice }));
  } catch {
    /* The choice still applies until the window closes. */
  }
  publish({ locale: choice, source: "fixed" });
}

export function useLocale(): LocaleState & { setLocale: (choice: Locale | "system") => void } {
  const current = useSyncExternalStore(subscribeLocale, getLocaleState, getLocaleState);
  return {
    locale: current.locale,
    source: current.source,
    setLocale: (choice) => setLocaleChoice(choice),
  };
}
