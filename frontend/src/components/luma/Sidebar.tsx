import { t, useT } from "../../i18n";
import type { RecentFile, TreeEntry } from "../../ipc/types";
import { FileTree, type FilePane } from "../../layout/FileTree";
import { OutlinePanel } from "../../layout/OutlinePanel";
import type { OutlineEntry } from "../../layout/outline";

export type SidePane = FilePane | "outline";

type Props = {
  width: number;
  pane: SidePane;
  onPane: (pane: SidePane) => void;
  root: string | null;
  entries: Record<string, TreeEntry[]>;
  expanded: string[];
  truncated: Record<string, boolean>;
  activePath: string | null;
  recent: RecentFile[];
  documentId: string;
  headings: OutlineEntry[];
  activeHeading: number | null;
  onOpenFile: (path: string) => void;
  onToggleDir: (path: string) => void;
  onOpenRecent: (path: string) => void;
  onOpenFolder: () => void;
  onJump: (entry: OutlineEntry) => void;
};

const panes: Array<{ id: SidePane; label: "sidebar.recent" | "sidebar.files" | "outline.title" }> = [
  { id: "recent", label: "sidebar.recent" },
  { id: "files", label: "sidebar.files" },
  { id: "outline", label: "outline.title" },
];

export function Sidebar({
  width,
  pane,
  onPane,
  root,
  entries,
  expanded,
  truncated,
  activePath,
  recent,
  documentId,
  headings,
  activeHeading,
  onOpenFile,
  onToggleDir,
  onOpenRecent,
  onOpenFolder,
  onJump,
}: Props) {
  useT();
  return (
    <div className="sidebar-column" style={{ width }}>
      <div className="side-tabs" role="tablist" aria-label={t("sidebar.label")}>
        {panes.map((item) => (
          <button
            key={item.id}
            type="button"
            className="side-tab"
            role="tab"
            aria-selected={pane === item.id}
            onClick={() => onPane(item.id)}
          >
            {t(item.label)}
          </button>
        ))}
      </div>
      <div className="side-body">
        {pane === "outline" ? (
          <OutlinePanel documentId={documentId} entries={headings} activeId={activeHeading} onJump={onJump} />
        ) : (
          <FileTree
            pane={pane}
            root={root}
            entries={entries}
            expanded={expanded}
            truncated={truncated}
            activePath={activePath}
            recent={recent}
            onOpenFile={onOpenFile}
            onToggleDir={onToggleDir}
            onOpenRecent={onOpenRecent}
            onOpenFolder={onOpenFolder}
          />
        )}
      </div>
    </div>
  );
}
