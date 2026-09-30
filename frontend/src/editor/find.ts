import { findNext, replaceAll, replaceNext, search, SearchQuery, setSearchQuery } from "@codemirror/search";
import type { EditorView } from "@codemirror/view";

export function runFind(
  view: EditorView,
  search: string,
  replace: string,
  caseSensitive: boolean,
  action: "next" | "replace" | "all",
) {
  if (!search) {
    return;
  }
  const query = new SearchQuery({ search, replace, caseSensitive, literal: true });
  view.dispatch({ effects: setSearchQuery.of(query) });
  if (action === "next") {
    findNext(view);
    return;
  }
  if (action === "replace") {
    replaceNext(view);
    return;
  }
  replaceAll(view);
}

export function searchExtension() {
  return search({ literal: true });
}
