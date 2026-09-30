import { t, useT } from "../../i18n";
import type { NewlineStyle, ViewMode } from "../../ipc/types";

type Props = {
  title: string | null;
  words: number;
  mode: ViewMode;
  untitled: boolean;
  line: number;
  column: number;
  newline: NewlineStyle;
  outline: boolean;
  narrow: boolean;
  alert: string;
};

export function StatusBar({ title, words, mode, untitled, line, column, newline, outline, narrow, alert }: Props) {
  useT();
  return (
    <footer className="status">
      {title ? <span className="status-lead">{title}</span> : null}
      <span className="status-lead" title={t("status.countHint")}>{t("status.count", { n: words })}</span>
      <span className="status-lead">{modeLabel(mode)}</span>
      {untitled ? <span className="status-quiet">{t("file.untitledHint")}</span> : null}
      <span className="spacer" />
      <span className="status-tech">
        <span>{line}:{column}</span>
        <span>{t("status.utf8")}</span>
        <span>{newlineLabel(newline)}</span>
        {outline ? <span>{t("status.outline")}</span> : null}
        {narrow ? <span>{t("status.narrow")}</span> : null}
      </span>
      {alert ? <span className="status-alert">{alert}</span> : null}
    </footer>
  );
}

function newlineLabel(style: NewlineStyle) {
  if (style === "crlf") {
    return "CRLF";
  }
  if (style === "cr") {
    return "CR";
  }
  return "LF";
}

function modeLabel(mode: ViewMode) {
  if (mode === "source") {
    return t("view.sourceShort");
  }
  if (mode === "preview") {
    return t("view.previewShort");
  }
  return t("view.splitShort");
}
