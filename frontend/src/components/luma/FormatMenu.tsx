import { useRef } from "react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../ui/dropdown-menu";
import { Icon } from "../ui/icon";
import { TooltipHint } from "../ui/tooltip";
import { t, useT } from "../../i18n";
import { glyphs } from "./glyphs";

type Props = {
  disabled: boolean;
  onHeading: (level: number) => void;
  onBullet: () => void;
  onOrdered: () => void;
  onQuote: () => void;
  onCode: () => void;
};

export function FormatMenu({ disabled, onHeading, onBullet, onOrdered, onQuote, onCode }: Props) {
  useT();
  const picked = useRef(false);
  function choose(run: () => void) {
    picked.current = true;
    run();
  }
  return (
    <DropdownMenu>
      <TooltipHint label={t("format.title")}>
        <DropdownMenuTrigger className="icon-btn tool-text" disabled={disabled}>
          <Icon icon={glyphs.format} />
          <span className="tool-caption">{t("format.title")}</span>
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
        {[1, 2, 3, 4, 5, 6].map((level) => (
          <DropdownMenuItem key={level} onSelect={() => choose(() => onHeading(level))}>
            <span>{t("format.heading", { level })}</span>
            <kbd className="luma-menu-kbd">Ctrl+Alt+{level}</kbd>
          </DropdownMenuItem>
        ))}
        <DropdownMenuItem onSelect={() => choose(onBullet)}>
          <span>{t("format.bullet")}</span>
          <kbd className="luma-menu-kbd">{t("shortcut.bullet")}</kbd>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => choose(onOrdered)}>
          <span>{t("format.ordered")}</span>
          <kbd className="luma-menu-kbd">{t("shortcut.ordered")}</kbd>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => choose(onQuote)}>
          <span>{t("format.quote")}</span>
          <kbd className="luma-menu-kbd">{t("shortcut.quote")}</kbd>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => choose(onCode)}>
          <span>{t("format.code")}</span>
          <kbd className="luma-menu-kbd">{t("shortcut.code")}</kbd>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
