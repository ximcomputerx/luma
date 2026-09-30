import { useSyncExternalStore } from "react";
import { enUS, type Leaf, type MessageId } from "./en-US";
import { getLocaleState, subscribeLocale, type Locale } from "./locale";
import { zhCN } from "./zh-CN";

export type { Leaf };
export type Vars = Record<string, string | number>;

type Options = {
  raw?: boolean;
};

const catalogs: Record<Locale, Record<MessageId, Leaf>> = {
  "en-US": enUS,
  "zh-CN": zhCN,
};

function pluralText(leaf: Exclude<Leaf, string>, locale: Locale, count: number | null): string {
  if (count === null) {
    return leaf.other;
  }
  const category = new Intl.PluralRules(locale).select(count);
  const forms = leaf as Record<string, string | undefined>;
  return forms[category] || leaf.other;
}

export function translate(locale: Locale, id: MessageId, vars?: Vars, options?: Options): string {
  const leaf = catalogs[locale][id] ?? catalogs["en-US"][id];
  let count: number | null = null;
  if (vars && Object.prototype.hasOwnProperty.call(vars, "n")) {
    const numeric = typeof vars.n === "number" ? vars.n : Number(vars.n);
    count = Number.isFinite(numeric) ? numeric : 0;
  }
  let text = typeof leaf === "string" ? leaf : pluralText(leaf, locale, count);
  if (vars) {
    const formatted: Record<string, string | number> = { ...vars };
    if (count !== null) {
      formatted.n = new Intl.NumberFormat(locale).format(count);
    }
    for (const [key, value] of Object.entries(formatted)) {
      text = text.replaceAll(`{${key}}`, String(value));
    }
  }
  if (!options?.raw && import.meta.env.DEV && /\{[a-zA-Z0-9]+\}/.test(text)) {
    throw new Error(`Missing i18n value for ${id}`);
  }
  return text;
}

export function t(id: MessageId, vars?: Vars, options?: Options): string {
  return translate(getLocaleState().locale, id, vars, options);
}

export function useT(): typeof t {
  useSyncExternalStore(subscribeLocale, getLocaleState, getLocaleState);
  return t;
}
