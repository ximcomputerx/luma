import { useEffect, useRef, useState } from "react";
import { glyphs } from "../components/luma/glyphs";
import { Icon } from "../components/ui/icon";
import { t, useT } from "../i18n";
import { visibleActiveId, visibleOutline, type OutlineEntry } from "./outline";

type Props = {
  documentId: string;
  entries: OutlineEntry[];
  activeId: number | null;
  onJump: (entry: OutlineEntry) => void;
};

export function OutlinePanel({ documentId, entries, activeId, onJump }: Props) {
  useT();
  const listRef = useRef<HTMLElement>(null);
  const [scope, setScope] = useState(documentId);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  if (scope !== documentId) {
    setScope(documentId);
    setCollapsed(new Set());
  }
  const rows = visibleOutline(entries, collapsed);
  const shownId = visibleActiveId(entries, collapsed, activeId);

  useEffect(() => {
    const root = listRef.current;
    const scroller = root?.parentElement;
    if (!root || !scroller?.classList.contains("side-body")) {
      return;
    }
    const node = root.querySelector<HTMLElement>('[data-active="true"]');
    if (!node) {
      return;
    }
    const item = node.getBoundingClientRect();
    const box = scroller.getBoundingClientRect();
    if (item.top >= box.top && item.bottom <= box.bottom) {
      return;
    }
    const delta = item.top < box.top ? item.top - box.top : item.bottom - box.bottom;
    scroller.scrollTop += delta;
  }, [shownId]);

  function toggle(key: string) {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  return (
    <section className="outline-panel" aria-label={t("outline.title")} ref={listRef}>
      {entries.length === 0 ? <p className="muted">{t("outline.empty")}</p> : null}
      {rows.map((row) => {
        const text = row.entry.text || t("outline.blank");
        return (
          <div
            key={row.key}
            className="outline-item"
            data-active={row.entry.id === shownId}
            style={{ paddingLeft: Math.max(0, row.entry.level - 1) * 12 }}
          >
            {row.hasChildren ? (
              <button
                type="button"
                className="outline-twist"
                aria-expanded={!row.collapsed}
                aria-label={`${t(row.collapsed ? "outline.expand" : "outline.collapse")} ${text}`}
                onClick={() => toggle(row.key)}
              >
                <Icon icon={row.collapsed ? glyphs.chevronRight : glyphs.chevronDown} size={16} />
              </button>
            ) : (
              <span className="outline-twist" aria-hidden="true" />
            )}
            <button type="button" className="outline-label" onClick={() => onJump(row.entry)}>
              {text}
            </button>
          </div>
        );
      })}
    </section>
  );
}
