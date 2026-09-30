import { Icon } from "../ui/icon";
import { t, useT } from "../../i18n";
import { glyphs } from "./glyphs";

export type TabItem = {
  id: string;
  title: string;
  dirty: boolean;
};

type Props = {
  tabs: TabItem[];
  activeId: string;
  onFocus: (id: string) => void;
  onClose: (id: string) => void;
};

export function TabBar({ tabs, activeId, onFocus, onClose }: Props) {
  useT();
  return (
    <div className="tab-strip" role="tablist" aria-label={t("file.closeTab")}>
      {tabs.map((tab) => (
        <div
          key={tab.id}
          role="tab"
          aria-selected={tab.id === activeId}
          tabIndex={tab.id === activeId ? 0 : -1}
          className="tab"
          onClick={() => onFocus(tab.id)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onFocus(tab.id);
            }
          }}
        >
          {tab.dirty ? <span className="dirty-dot" title={t("file.dirtyTitle")} /> : null}
          <span className="tab-title">{tab.title}</span>
          <button
            type="button"
            className="tab-close"
            aria-label={t("file.closeTab")}
            onPointerDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
            onPointerUp={(event) => {
              if (event.button !== 0) {
                return;
              }
              event.preventDefault();
              event.stopPropagation();
              onClose(tab.id);
            }}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
          >
            <Icon icon={glyphs.close} />
          </button>
        </div>
      ))}
    </div>
  );
}
