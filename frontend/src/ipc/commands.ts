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

export type FlushOutcome = {
  snapshots: DocumentSnapshot[];
  errors: Array<{ code: string; message: string }>;
};

export function flushOpenQueue(boot: boolean): Promise<FlushOutcome> {
  return invoke("flush_open_queue", { boot });
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

export function folderOpenPath(path: string): Promise<FolderPayload> {
  return invoke("folder_open_path", { path });
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

export type AssociationState = "default" | "registered" | "unregistered" | "unsupported";

export function associationStatus(): Promise<{ state: AssociationState }> {
  return invoke("association_status");
}

export function associationDecide(makeDefault: boolean): Promise<{ state: AssociationState }> {
  return invoke("association_decide", { makeDefault });
}

export type UpdatePhase =
  | "idle"
  | "checking"
  | "update_available"
  | "downloading"
  | "downloaded"
  | "installing";

export type UpdateSnapshot = {
  phase: UpdatePhase;
  current_version: string;
  available_version: string;
  notes: string;
  downloaded_bytes: number;
  total_bytes: number;
  check_on_startup: boolean;
  download_in_background: boolean;
  prompt: boolean;
  install_when_ready: boolean;
  error: string;
  dev_build: boolean;
  revision: number;
};

export function updateState(): Promise<UpdateSnapshot> {
  return invoke("update_state");
}

export function updateArm(): Promise<UpdateSnapshot> {
  return invoke("update_arm");
}

export function updateCheck(): Promise<UpdateSnapshot> {
  return invoke("update_check");
}

export function updateDownload(): Promise<UpdateSnapshot> {
  return invoke("update_download");
}

export function updateInstall(): Promise<UpdateSnapshot> {
  return invoke("update_install");
}

export function updateLater(): Promise<UpdateSnapshot> {
  return invoke("update_later");
}

export function updatePolicy(checkOnStartup: boolean, downloadInBackground: boolean): Promise<UpdateSnapshot> {
  return invoke("update_policy", { checkOnStartup, downloadInBackground });
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
