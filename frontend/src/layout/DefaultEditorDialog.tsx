import { Button } from "../components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "../components/ui/dialog";
import { t, useT } from "../i18n";

export function DefaultEditorDialog({
  open,
  busy,
  onAccept,
  onLater,
  onClosed,
}: {
  open: boolean;
  busy: boolean;
  onAccept: () => void;
  onLater: () => void;
  onClosed?: () => void;
}) {
  useT();
  return (
    <Dialog open={open} onOpenChange={() => undefined}>
      <DialogContent dismiss="explicit" plain onClosed={onClosed}>
        <DialogTitle>{t("assoc.title")}</DialogTitle>
        <DialogDescription>{t("assoc.body")}</DialogDescription>
        <div className="dialog-actions">
          <Button variant="secondary" disabled={busy} onClick={onLater}>{t("assoc.later")}</Button>
          <Button variant="primary" disabled={busy} onClick={onAccept}>{t("assoc.accept")}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
