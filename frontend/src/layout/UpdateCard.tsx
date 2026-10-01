import { useState } from "react";
import { Button } from "../components/ui/button";
import { presentError, t, useT } from "../i18n";
import type { UpdateSnapshot } from "../ipc/commands";
import { formatMegabytes, showUpdateCard } from "./updateState";

type Props = {
  snapshot: UpdateSnapshot | null;
  onLater: () => void;
  onDownload: () => void;
  onInstall: () => void;
};

export function UpdateCard({ snapshot, onLater, onDownload, onInstall }: Props) {
  useT();
  const [details, setDetails] = useState(false);
  if (!snapshot || !showUpdateCard(snapshot)) {
    return null;
  }
  const title = snapshot.phase === "downloading"
    ? t("update.downloading")
    : snapshot.phase === "downloaded"
      ? t("update.ready")
      : snapshot.phase === "installing"
        ? t("update.installing")
        : t("update.found");
  const size = formatMegabytes(snapshot.total_bytes);
  const busy = snapshot.phase === "downloading" || snapshot.phase === "installing";
  return (
    <aside className="update-card" role="status">
      <p className="update-kicker">{title}</p>
      <h2>{t("update.version", { version: snapshot.available_version })}</h2>
      {size ? <p className="update-size">{t("update.size", { size })}</p> : null}
      {snapshot.error ? <p className="notice">{presentError({ code: "io", message: snapshot.error })}</p> : null}
      {snapshot.phase === "downloading" ? (
        snapshot.total_bytes > 0 ? (
          <progress max={snapshot.total_bytes} value={snapshot.downloaded_bytes} />
        ) : (
          <progress />
        )
      ) : null}
      {details && snapshot.notes ? <p className="update-notes">{snapshot.notes}</p> : null}
      <div className="update-actions">
        <Button variant="ghost" disabled={snapshot.phase === "installing"} onClick={onLater}>
          {t("update.later")}
        </Button>
        {snapshot.notes ? (
          <Button variant="ghost" onClick={() => setDetails((open) => !open)}>
            {t("update.details")}
          </Button>
        ) : null}
        <Button
          variant="primary"
          disabled={busy}
          onClick={snapshot.phase === "downloaded" ? onInstall : onDownload}
        >
          {t("update.now")}
        </Button>
      </div>
    </aside>
  );
}
