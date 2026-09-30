export type NewlineStyle = "lf" | "crlf" | "cr";
export type ViewMode = "split" | "source" | "preview";
export type ThemeName = "system" | "light" | "dark";
export type GlassMode = "auto" | "off";
export type MotionMode = "system" | "on" | "off";

export type TabSummary = {
  document_id: string;
  title: string;
  path: string | null;
};

export type DocumentSnapshot = {
  document_id: string;
  path: string | null;
  title: string;
  markdown_lf: string;
  newline: NewlineStyle;
  rev: number;
  dirty: boolean;
  root: string | null;
  tabs: TabSummary[];
};

export type SaveRequest = {
  document_id: string;
  markdown_lf: string;
  rev: number;
  save_as: boolean;
};

export type SaveOutcome =
  | { path: string; rev: number; bytes: number; root: string }
  | { skipped: string };

export type RecentFile = {
  path: string;
  opened_at_ms: number;
  missing: boolean;
};

export type Settings = {
  schema_version: number;
  theme: ThemeName;
  view_mode: ViewMode;
  prose_font_size_px: number;
  autosave_enabled: boolean;
  autosave_interval_ms: number;
  glass: GlassMode;
  reduced_motion: MotionMode;
  recent_files: RecentFile[];
  preview: {
    math: boolean;
    mermaid: boolean;
    remote_images: boolean;
  };
  glass_active: boolean;
  settings_frozen: boolean;
};

export type SettingsPatch =
  | { field: "theme"; value: ThemeName }
  | { field: "view_mode"; value: ViewMode }
  | { field: "prose_font_size_px"; value: number }
  | { field: "autosave_enabled"; value: boolean }
  | { field: "autosave_interval_ms"; value: number }
  | { field: "glass"; value: GlassMode }
  | { field: "reduced_motion"; value: MotionMode }
  | { field: "preview_math"; value: boolean }
  | { field: "preview_mermaid"; value: boolean }
  | { field: "preview_remote_images"; value: boolean }
  | { field: "forget_recent"; path: string };

export type TreeEntry = {
  name: string;
  path: string;
  kind: "file" | "dir";
};

export type FolderPayload = {
  root: string;
  entries: TreeEntry[];
  truncated: boolean;
};

export type ListPayload = {
  entries: TreeEntry[];
  truncated: boolean;
};

export function readCommandError(error: unknown): { code: string; message: string } {
  if (typeof error === "string") {
    try {
      const parsed = JSON.parse(error) as { code?: string; message?: string };
      if (parsed.message) {
        return { code: parsed.code ?? "io", message: parsed.message };
      }
    } catch {
      return { code: "io", message: error };
    }
  }
  if (error && typeof error === "object") {
    const record = error as { code?: unknown; message?: unknown };
    if (typeof record.message === "string") {
      return { code: typeof record.code === "string" ? record.code : "io", message: record.message };
    }
  }
  return { code: "io", message: "无法完成文件操作。" };
}
