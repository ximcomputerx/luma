import { useRef, type KeyboardEvent } from "react";
import { t, useT, type MessageId } from "../../i18n";
import { themeIds, themes, type ThemeId } from "../../styles/themes";

const labels: Record<ThemeId, MessageId> = {
  ivory: "settings.theme.ivory",
  sepia: "settings.theme.sepia",
  mist: "settings.theme.mist",
  sakura: "settings.theme.sakura",
  forest: "settings.theme.forest",
  bluegray: "settings.theme.bluegray",
  midnight: "settings.theme.midnight",
  nord: "settings.theme.nord",
  coffee: "settings.theme.coffee",
};

type Props = {
  value: ThemeId;
  onChange: (id: ThemeId) => void;
};

export function ThemeSwatches({ value, onChange }: Props) {
  useT();
  const buttons = useRef(new Map<ThemeId, HTMLButtonElement>());

  function move(event: KeyboardEvent<HTMLDivElement>) {
    const nodes = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]')];
    const firstTop = nodes[0]?.offsetTop ?? 0;
    const wrapped = nodes.findIndex((node) => node.offsetTop !== firstTop);
    const columns = wrapped === -1 ? Math.max(1, nodes.length) : wrapped;
    const index = themeIds.indexOf(value);
    let next = index;
    if (event.key === "ArrowRight") {
      next = (index + 1) % themeIds.length;
    } else if (event.key === "ArrowLeft") {
      next = (index - 1 + themeIds.length) % themeIds.length;
    } else if (event.key === "ArrowDown") {
      next = Math.min(themeIds.length - 1, index + columns);
    } else if (event.key === "ArrowUp") {
      next = Math.max(0, index - columns);
    } else {
      return;
    }
    event.preventDefault();
    const id = themeIds[next];
    if (!id || id === value) {
      return;
    }
    onChange(id);
    buttons.current.get(id)?.focus();
  }

  return (
    <div className="theme-row" role="radiogroup" aria-label={t("settings.theme")} onKeyDown={move}>
      {themeIds.map((id) => {
        const theme = themes[id];
        const selected = id === value;
        return (
          <button
            key={id}
            ref={(node) => {
              if (node) {
                buttons.current.set(id, node);
              } else {
                buttons.current.delete(id);
              }
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            className="theme-option"
            onClick={() => onChange(id)}
          >
            <span className="theme-chip" aria-hidden="true">
              <span style={{ background: theme.sidebar }} />
              <span style={{ background: theme.editor }} />
              <span style={{ background: theme.paper }} />
            </span>
            <span className="theme-name">{t(labels[id])}</span>
          </button>
        );
      })}
    </div>
  );
}
