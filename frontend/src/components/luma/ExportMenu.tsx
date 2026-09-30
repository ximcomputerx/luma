import { useRef } from "react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../ui/dropdown-menu";
import { Icon } from "../ui/icon";
import { TooltipHint } from "../ui/tooltip";
import { t, useT } from "../../i18n";
import { glyphs } from "./glyphs";

type Props = {
  onHtml: () => void;
  onPdf: () => void;
};

export function ExportMenu({ onHtml, onPdf }: Props) {
  useT();
  const picked = useRef(false);
  function choose(run: () => void) {
    picked.current = true;
    run();
  }
  return (
    <DropdownMenu>
      <TooltipHint label={t("export.title")}>
        <DropdownMenuTrigger className="icon-btn tool-text">
          <Icon icon={glyphs.export} />
          <span className="tool-caption">{t("export.title")}</span>
        </DropdownMenuTrigger>
      </TooltipHint>
      <DropdownMenuContent
        onCloseAutoFocus={(event) => {
          if (picked.current) {
            event.preventDefault();
            picked.current = false;
          }
        }}
      >
        <DropdownMenuItem onSelect={() => choose(onHtml)}>
          <span>{t("export.html")}</span>
          <kbd className="luma-menu-kbd">{t("shortcut.exportHtml")}</kbd>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => choose(onPdf)}>
          <span>{t("export.pdf")}</span>
          <kbd className="luma-menu-kbd">{t("shortcut.exportPdf")}</kbd>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
