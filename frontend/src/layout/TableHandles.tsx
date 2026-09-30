import { t, useT } from "../i18n";

type Props = {
  onRow: (where: "above" | "below") => void;
  onColumn: (where: "left" | "right") => void;
};

export function TableHandles({ onRow, onColumn }: Props) {
  useT();
  return (
    <div className="table-handles" role="toolbar" aria-label={t("format.title")}>
      <button type="button" onClick={() => onRow("above")}>{t("format.rowAbove")}</button>
      <button type="button" onClick={() => onRow("below")}>{t("format.rowBelow")}</button>
      <button type="button" onClick={() => onColumn("left")}>{t("format.colLeft")}</button>
      <button type="button" onClick={() => onColumn("right")}>{t("format.colRight")}</button>
    </div>
  );
}
