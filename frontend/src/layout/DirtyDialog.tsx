import { Button } from "../components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "../components/ui/dialog";
import { t, useT } from "../i18n";

export type DirtyChoice = "save" | "discard" | "cancel";

export function DirtyDialog({
  open,
  many,
  onChoose,
  onClosed,
}: {
  open: boolean;
  many?: boolean;
  onChoose: (choice: DirtyChoice) => void;
  onClosed?: () => void;
}) {
  useT();
  return (
    <Dialog open={open} onOpenChange={() => undefined}>
      <DialogContent dismiss="explicit" plain onClosed={onClosed}>
        <DialogTitle>{t("file.dirtyTitle")}</DialogTitle>
        <DialogDescription>{many ? t("file.dirtyBodyMany") : t("file.dirtyBody")}</DialogDescription>
        <div className="dialog-actions">
          <Button variant="secondary" onClick={() => onChoose("cancel")}>{t("file.cancel")}</Button>
          <Button variant="danger" onClick={() => onChoose("discard")}>{t("file.discard")}</Button>
          <Button variant="primary" onClick={() => onChoose("save")}>{t("file.saveAction")}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
