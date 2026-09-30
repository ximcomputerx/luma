import { useMemo, useState } from "react";
import { t, useLocale, type MessageId } from "../i18n";

export type PaletteCommand = {
  id: string;
  title: MessageId;
  shortcut?: MessageId;
  run: () => void;
};

export function CommandPalette({
  commands,
  onClose,
}: {
  commands: PaletteCommand[];
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const locale = useLocale().locale;
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return commands.filter((command) => {
      const shortcut = command.shortcut ? t(command.shortcut) : "";
      return `${t(command.title)} ${shortcut}`.toLowerCase().includes(needle);
    });
  }, [commands, query, locale]);
  const current = Math.min(active, Math.max(visible.length - 1, 0));

  return (
    <div className="palette-backdrop" onMouseDown={onClose}>
      <div
        className="palette"
        role="dialog"
        aria-modal="true"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <input
          autoFocus
          placeholder={t("palette.placeholder")}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              onClose();
            } else if (event.key === "ArrowDown") {
              event.preventDefault();
              setActive((value) => Math.min(value + 1, visible.length - 1));
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setActive((value) => Math.max(value - 1, 0));
            } else if (event.key === "Enter") {
              event.preventDefault();
              visible[current]?.run();
            }
          }}
        />
        <ul role="listbox">
          {visible.map((command, index) => (
            <li key={command.id} data-active={index === current}>
              <button type="button" onClick={command.run}>
                <span>{t(command.title)}</span>
                {command.shortcut ? <kbd>{t(command.shortcut)}</kbd> : null}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
