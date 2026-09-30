import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "../components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "../components/ui/dialog";
import { presentError, t, useLocale, useT } from "../i18n";
import { exportPdf, pdfPreview } from "../ipc/commands";
import { readCommandError } from "../ipc/types";
import { presentTheme, type ThemeId } from "../styles/themes";
import { ExportPreview } from "./ExportPreview";
import { ExportSettings } from "./ExportSettings";
import {
  applyTemplate,
  loadPdfProfile,
  pagePixels,
  PDF_FIXTURE,
  savePdfProfile,
  toWire,
  type PdfProfile,
} from "./pdfProfile";
import { wrapPreview } from "./previewFrame";

function scrollRadius(): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue("--radius-sm").trim();
  return /^\d+(?:\.\d+)?px$/.test(value) ? value : "20px";
}

type Props = {
  open: boolean;
  documentId: string;
  markdown: string;
  documentName: string;
  themeId: ThemeId;
  warm: boolean;
  onClose: () => void;
  onExported: (path: string) => void;
  onClosed?: () => void;
};

export function PDFExportDialog({
  open,
  documentId,
  markdown,
  documentName,
  themeId,
  warm,
  onClose,
  onExported,
  onClosed,
}: Props) {
  useT();
  const locale = useLocale();
  const theme = useMemo(() => presentTheme(themeId, warm), [themeId, warm]);
  const [seenOpen, setSeenOpen] = useState(open);
  const [profile, setProfile] = useState<PdfProfile>(() => loadPdfProfile() ?? applyTemplate("modern"));
  const [html, setHtml] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState("");
  const [exportError, setExportError] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const request = useRef(0);

  if (open !== seenOpen) {
    setSeenOpen(open);
    if (open) {
      setProfile(loadPdfProfile() ?? applyTemplate("modern"));
      setHtml(null);
      setPreviewError("");
      setExportError("");
    }
  }

  useEffect(() => {
    if (!open || !documentId) {
      return;
    }
    const token = request.current + 1;
    request.current = token;
    setLoading(true);
    const source = markdown.trim() ? markdown : PDF_FIXTURE;
    const timer = window.setTimeout(() => {
      void pdfPreview(documentId, source, toWire(profile, theme, locale.locale))
        .then((result) => {
          if (request.current !== token) {
            return;
          }
          setHtml(wrapPreview(result.html, {
            prev: t("pdf.prev"),
            next: t("pdf.next"),
            ink: theme.text,
            thumb: theme.muted,
            radius: scrollRadius(),
          }));
          setPreviewError("");
        })
        .catch((error: unknown) => {
          if (request.current !== token) {
            return;
          }
          setHtml(null);
          setPreviewError(`${t("pdf.failed")} ${presentError(error)}`);
        })
        .finally(() => {
          if (request.current === token) {
            setLoading(false);
          }
        });
    }, 200);
    return () => window.clearTimeout(timer);
  }, [open, documentId, markdown, profile, theme, locale.locale]);

  async function commit() {
    if (busy || !documentId) {
      return;
    }
    setBusy(true);
    setExportError("");
    try {
      const result = await exportPdf(documentId, markdown, toWire(profile, theme, locale.locale));
      savePdfProfile(profile);
      onExported(result.path);
    } catch (error) {
      const parsed = readCommandError(error);
      if (parsed.code !== "dialog_canceled") {
        setExportError(presentError(error));
      }
    } finally {
      setBusy(false);
    }
  }

  const page = pagePixels(profile.paper, profile.orientation);
  const alert = exportError || previewError;
  const sample = markdown.trim() ? null : t("pdf.sample");

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next && !busy) onClose(); }}>
      <DialogContent
        className="pdf-studio"
        draggable
        dismiss={busy ? "explicit" : "escape"}
        aria-describedby={undefined}
        onClosed={onClosed}
      >
        <div className="pdf-head" data-dialog-drag="">
          <div className="pdf-title">
            <DialogTitle>{t("pdf.title")}</DialogTitle>
            <p className="pdf-doc">{documentName}</p>
          </div>
          <div className="pdf-actions">
            <Button variant="ghost" disabled={busy} onClick={onClose}>{t("pdf.cancel")}</Button>
            <Button variant="primary" disabled={busy || !documentId} onClick={() => void commit()}>{t("export.pdf")}</Button>
          </div>
        </div>
        <div className="pdf-body">
          <ExportSettings profile={profile} theme={theme} onChange={setProfile} />
          <ExportPreview
            html={html}
            width={page.width}
            height={page.height}
            sample={sample}
            loading={loading}
            error={alert}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
