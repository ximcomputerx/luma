import type { DocumentSnapshot, NewlineStyle } from "../ipc/types";

export type OpenTab = {
  id: string;
  path: string | null;
  title: string;
  newline: NewlineStyle;
  buffer: string;
  accepted: string;
  rev: number;
};

export function displayTitle(path: string | null, title: string, untitled: string): string {
  if (path === null) {
    return untitled;
  }
  return title || untitled;
}

export function tabFromSnapshot(snapshot: DocumentSnapshot, untitled: string): OpenTab {
  return {
    id: snapshot.document_id,
    path: snapshot.path,
    title: snapshot.title || untitled,
    newline: snapshot.newline,
    buffer: snapshot.markdown_lf,
    accepted: snapshot.markdown_lf,
    rev: snapshot.rev,
  };
}

export function mergeWorkspace(
  current: OpenTab[],
  active: OpenTab,
  snapshot: DocumentSnapshot,
  loadActive: boolean,
  untitled: string,
): OpenTab[] {
  const summaries = snapshot.tabs?.length
    ? snapshot.tabs
    : [{ document_id: snapshot.document_id, title: snapshot.title, path: snapshot.path }];
  const previous = new Map(current.map((tab) => [tab.id, tab]));
  if (active.id) {
    previous.set(active.id, active);
  }
  return summaries.map((summary) => {
    if (summary.document_id === snapshot.document_id && loadActive) {
      return tabFromSnapshot(snapshot, untitled);
    }
    const kept = previous.get(summary.document_id);
    if (kept) {
      return { ...kept, title: summary.title || kept.title, path: summary.path };
    }
    if (summary.document_id === snapshot.document_id) {
      return tabFromSnapshot(snapshot, untitled);
    }
    return {
      id: summary.document_id,
      path: summary.path,
      title: summary.title || untitled,
      newline: "lf",
      buffer: "",
      accepted: "",
      rev: 1,
    };
  });
}
