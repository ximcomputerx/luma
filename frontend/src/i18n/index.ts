export { displayName } from "../brand";
export { enUS, type Leaf, type MessageId } from "./en-US";
export { zhCN } from "./zh-CN";
export {
  getLocaleState,
  matchLocale,
  paintBootLocale,
  parseLocalePrefs,
  resolveSystemLocale,
  setLocaleChoice,
  useLocale,
  type Locale,
  type LocaleState,
  type LocaleStorage,
} from "./locale";
export { presentError } from "./presentError";
export { t, translate, useT, type Vars } from "./translate";
