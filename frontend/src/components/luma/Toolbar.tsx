import { Separator } from "../ui/separator";
import { ToggleGroup, ToggleGroupItem } from "../ui/toggle-group";
import { TooltipHint } from "../ui/tooltip";
import { Icon } from "../ui/icon";
import { t, useT, type MessageId } from "../../i18n";
import type { ViewMode } from "../../ipc/types";
import { ExportMenu } from "./ExportMenu";
import { FormatMenu } from "./FormatMenu";
import { glyphs } from "./glyphs";

type Props = {
  mode: ViewMode;
  onNew: () => void;
  onOpen: () => void;
  onOpenFolder: () => void;
  onSave: () => void;
  onExportHtml: () => void;
  onExportPdf: () => void;
  onMode: (mode: ViewMode) => void;
  onSettings: () => void;
  onHeading: (level: number) => void;
  onBullet: () => void;
  onOrdered: () => void;
  onQuote: () => void;
  onCode: () => void;
};

const modes: Array<{ id: ViewMode; short: MessageId; full: MessageId; icon: keyof typeof glyphs }> = [
  { id: "split", short: "view.splitShort", full: "view.split", icon: "split" },
  { id: "source", short: "view.sourceShort", full: "view.source", icon: "source" },
  { id: "preview", short: "view.previewShort", full: "view.preview", icon: "read" },
];

export function Toolbar({
  mode,
  onNew,
  onOpen,
  onOpenFolder,
  onSave,
  onExportHtml,
  onExportPdf,
  onMode,
  onSettings,
  onHeading,
  onBullet,
  onOrdered,
  onQuote,
  onCode,
}: Props) {
  useT();
  return (
    <header className="toolbar">
      <div className="tool-group">
        <ToolButton icon="new" label="file.new" shortcut="shortcut.new" onClick={onNew} />
        <ToolButton icon="file" label="file.open" shortcut="shortcut.open" onClick={onOpen} />
        <ToolButton icon="folder" label="file.openFolder" shortcut="shortcut.openFolder" onClick={onOpenFolder} />
        <ToolButton icon="save" label="file.save" shortcut="shortcut.save" onClick={onSave} />
      </div>
      <Separator />
      <div className="tool-group">
        <FormatMenu
          disabled={mode === "preview"}
          onHeading={onHeading}
          onBullet={onBullet}
          onOrdered={onOrdered}
          onQuote={onQuote}
          onCode={onCode}
        />
        <ExportMenu onHtml={onExportHtml} onPdf={onExportPdf} />
      </div>
      <span className="spacer" />
      <div className="tool-group tool-group-end">
        <ToggleGroup
          type="single"
          className="mode-switch"
          aria-label={t("view.split")}
          value={mode}
          onValueChange={(value) => {
            if (value === "split" || value === "source" || value === "preview") {
              onMode(value);
            }
          }}
        >
          {modes.map((item) => (
            <TooltipHint key={item.id} label={`${t(item.full)}（${t("view.cycleHint")}）`}>
              <ToggleGroupItem value={item.id}>
                <Icon icon={glyphs[item.icon]} />
                <span>{t(item.short)}</span>
              </ToggleGroupItem>
            </TooltipHint>
          ))}
        </ToggleGroup>
        <ToolButton icon="settings" label="settings.title" shortcut="shortcut.settings" onClick={onSettings} />
      </div>
    </header>
  );
}

function ToolButton({
  icon,
  label,
  shortcut,
  onClick,
}: {
  icon: "new" | "file" | "folder" | "save" | "settings";
  label: MessageId;
  shortcut: MessageId;
  onClick: () => void;
}) {
  return (
    <TooltipHint label={hint(label, shortcut)}>
      <button type="button" className="icon-btn tool-text" onClick={onClick}>
        <Icon icon={glyphs[icon]} />
        <span className="tool-caption">{t(label)}</span>
      </button>
    </TooltipHint>
  );
}

function hint(label: MessageId, shortcut: MessageId) {
  return `${t(label)}（${t(shortcut)}）`;
}
