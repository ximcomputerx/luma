import { Icon } from "../components/ui/icon";
import { glyphs } from "../components/luma/glyphs";
import { t, useT } from "../i18n";
import type { RecentFile, TreeEntry } from "../ipc/types";

export type FilePane = "recent" | "files";

type Props = {
  pane: FilePane;
  root: string | null;
  entries: Record<string, TreeEntry[]>;
  expanded: string[];
  truncated: Record<string, boolean>;
  activePath: string | null;
  recent: RecentFile[];
  onOpenFile: (path: string) => void;
  onToggleDir: (path: string) => void;
  onOpenRecent: (path: string) => void;
  onOpenFolder: () => void;
};

export function FileTree({
  pane,
  root,
  entries,
  expanded,
  truncated,
  activePath,
  recent,
  onOpenFile,
  onToggleDir,
  onOpenRecent,
  onOpenFolder,
}: Props) {
  useT();
  if (pane === "recent") {
    return (
      <aside className="sidebar">
        {recent.length === 0 ? <p className="muted">{t("tree.recentEmpty")}</p> : null}
        {recent.map((item) => (
          <button
            key={item.path}
            type="button"
            className={item.missing ? "recent-button missing" : "recent-button"}
            title={item.path}
            onClick={() => onOpenRecent(item.path)}
          >
            <span className="recent-name">{fileName(item.path)}</span>
            {item.missing ? <span className="recent-state">{t("file.missing")}</span> : null}
          </button>
        ))}
      </aside>
    );
  }

  return (
    <aside className="sidebar">
      {root ? (
        <div className="sidebar-head">
          <h2 title={root}>{fileName(root)}</h2>
          <button type="button" className="btn btn-ghost" onClick={onOpenFolder}>
            {t("file.changeFolder")}
          </button>
        </div>
      ) : (
        <div className="sidebar-empty">
          <p className="muted">{t("tree.folderEmpty")}</p>
          <button type="button" className="btn btn-ghost" onClick={onOpenFolder}>
            {t("file.openFolder")}
          </button>
        </div>
      )}
      {root ? renderLevel(root, 0) : null}
    </aside>
  );

  function renderLevel(dir: string, depth: number) {
    const items = (entries[dir] ?? []).filter((item) => item.kind === "dir" || isMarkdownName(item.name));
    return (
      <div>
        {depth === 0 && items.length === 0 && !truncated[dir] ? <p className="muted">{t("tree.folderClear")}</p> : null}
        {items.map((item) => {
          if (item.kind === "dir") {
            const open = expanded.includes(item.path);
            return (
              <div key={item.path}>
                <button
                  type="button"
                  className="tree-button"
                  data-kind="dir"
                  style={{ paddingLeft: 12 + depth * 12 }}
                  title={item.path}
                  onClick={() => onToggleDir(item.path)}
                >
                  {open ? "▾ " : "▸ "}
                  {item.name}
                </button>
                {open ? renderLevel(item.path, depth + 1) : null}
                {open && truncated[item.path] ? <p className="muted">{t("tree.tooMany")}</p> : null}
              </div>
            );
          }
          return (
            <button
              key={item.path}
              type="button"
              className="tree-button"
              data-kind="file"
              data-active={item.path === activePath}
              style={{ paddingLeft: 12 + depth * 12 }}
              title={item.path}
              onClick={() => onOpenFile(item.path)}
            >
              <span className="tree-label">
                <Icon icon={glyphs.markdown} />
                <span>{item.name}</span>
              </span>
            </button>
          );
        })}
        {depth === 0 && truncated[dir] ? <p className="muted">{t("tree.tooMany")}</p> : null}
      </div>
    );
  }
}

function isMarkdownName(name: string): boolean {
  return /\.(md|markdown)$/i.test(name);
}

function fileName(path: string): string {
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] || path;
}
