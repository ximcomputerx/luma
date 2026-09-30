import { invoke } from "@tauri-apps/api/core";
import type { PdfWire } from "../export/pdfProfile";
import type { PreviewPayload } from "../preview/types";
import type {
  DocumentSnapshot,
  FolderPayload,
  ListPayload,
  SaveOutcome,
  SaveRequest,
  Settings,
  SettingsPatch,
} from "./types";

export function documentNew(): Promise<DocumentSnapshot> {
  return invoke("document_new");
}

export function documentOpen(path: string | null): Promise<DocumentSnapshot> {
  return invoke("document_open", { path });
}

export function documentSave(request: SaveRequest): Promise<SaveOutcome> {
  return invoke("document_save", { request });
}

export function documentAutosave(request: SaveRequest): Promise<SaveOutcome> {
  return invoke("document_autosave", { request });
}

export function folderOpen(): Promise<FolderPayload> {
  return invoke("folder_open");
}

export function folderList(dir: string): Promise<ListPayload> {
  return invoke("folder_list", { dir });
}

export function settingsGet(): Promise<Settings> {
  return invoke("settings_get");
}

export function settingsSet(patch: SettingsPatch): Promise<Settings> {
  return invoke("settings_set", { patch });
}

export function closeDecision(action: "save" | "discard" | "cancel"): Promise<void> {
  return invoke("close_decision", { action });
}

export function diagnosticsExport(): Promise<{ path: string }> {
  return invoke("diagnostics_export");
}

// Tauri matches top-level invoke keys as camelCase. Fields inside a request object stay snake_case.
export function previewRender(
  renderGen: number,
  markdownLf: string,
  forceFull: boolean,
  documentId: string | null,
): Promise<PreviewPayload> {
  return invoke("preview_render", {
    request: { render_gen: renderGen, markdown_lf: markdownLf, force_full: forceFull },
    documentId,
  });
}

export type EmptyWorkspace = { empty: true; tabs: []; root: string | null };

export function isEmptyWorkspace(value: DocumentSnapshot | EmptyWorkspace): value is EmptyWorkspace {
  return "empty" in value && value.empty === true;
}

export function documentClose(documentId: string): Promise<DocumentSnapshot | EmptyWorkspace> {
  return invoke("document_close", { documentId });
}

export function documentFocus(documentId: string): Promise<DocumentSnapshot> {
  return invoke("document_focus", { documentId });
}

export function imagePaste(documentId: string, bytes: number[]): Promise<{ relative_path: string }> {
  return invoke("image_paste", { request: { document_id: documentId, bytes } });
}

export function exportHtml(documentId: string, markdownLf: string): Promise<{ path: string }> {
  return invoke("export_html", { request: { document_id: documentId, markdown_lf: markdownLf } });
}

export function exportPdf(documentId: string, markdownLf: string, profile: PdfWire): Promise<{ path: string }> {
  return invoke("export_pdf", { request: { document_id: documentId, markdown_lf: markdownLf, profile } });
}

export function pdfPreview(documentId: string, markdownLf: string, profile: PdfWire): Promise<{ html: string }> {
  return invoke("pdf_preview", { request: { document_id: documentId, markdown_lf: markdownLf, profile } });
}
