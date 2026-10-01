import { cloneElement, isValidElement, useEffect, useId, useMemo, useState, type ReactElement, type ReactNode } from "react";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogTitle } from "../ui/dialog";
import { presentError, t, useLocale, useT, type MessageId } from "../../i18n";
import type { AssociationState, UpdateSnapshot } from "../../ipc/commands";
import type { RecentFile, Settings as SettingsModel, SettingsPatch } from "../../ipc/types";
import { autosaveMs } from "../../settings/interval";
import { loadSystemFonts } from "../../styles/systemFonts";
import { clampMeasure, sortFontNames, type WritingPrefs } from "../../styles/writing";
import { FontPicker } from "./FontPicker";
import { ThemeSwatches } from "./ThemeSwatches";

type Section = "files" | "appearance" | "save" | "edit" | "preview" | "language" | "about";

type Props = {
  open: boolean;
  settings: SettingsModel;
  writing: WritingPrefs;
  association: AssociationState;
  associationBusy: boolean;
  onMakeDefault: () => void;
  onPatch: (patch: SettingsPatch) => void;
  onWriting: (next: WritingPrefs) => void;
  onClose: () => void;
  onClosed?: () => void;
  onDiagnostics: () => void;
  update: UpdateSnapshot | null;
  updateNotice: string;
  onUpdateCheck: () => void;
  onUpdatePolicy: (checkOnStartup: boolean, downloadInBackground: boolean) => void;
};

const sections: Array<{ id: Section; label: MessageId }> = [
  { id: "files", label: "settings.group.files" },
  { id: "appearance", label: "settings.group.appearance" },
  { id: "save", label: "settings.group.save" },
  { id: "edit", label: "settings.group.edit" },
  { id: "preview", label: "settings.group.preview" },
  { id: "language", label: "settings.language" },
  { id: "about", label: "settings.group.about" },
];

export function Settings({ open, settings, writing, association, associationBusy, onMakeDefault, onPatch, onWriting, onClose, onClosed, onDiagnostics, update, updateNotice, onUpdateCheck, onUpdatePolicy }: Props) {
  useT();
  const [section, setSection] = useState<Section>("appearance");
  const visible = sections.filter((item) => item.id !== "files" || association !== "unsupported");
  useEffect(() => {
    if (open) {
      setSection("appearance");
    }
  }, [open]);
  const current = visible.find((item) => item.id === section) ?? visible[0];
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent className="settings" draggable aria-describedby={undefined} onClosed={onClosed}>
        <div className="settings-head" data-dialog-drag="">
          <DialogTitle id="settings-title">{t("settings.title")}</DialogTitle>
          <Button variant="ghost" onClick={onClose}>{t("find.close")}</Button>
        </div>
        <div className="settings-body">
          <nav className="settings-nav" aria-label={t("settings.title")}>
            {visible.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-pressed={section === item.id}
                onClick={() => setSection(item.id)}
              >
                {t(item.label)}
              </button>
            ))}
          </nav>
          <div className="settings-pane">
            {settings.settings_frozen ? <p className="settings-note">{t("settings.newer")}</p> : null}
            <h3 className="settings-pane-title">{t(current.label)}</h3>
            {section === "files" ? <Files association={association} busy={associationBusy} onMakeDefault={onMakeDefault} /> : null}
            {section === "appearance" ? <Appearance settings={settings} writing={writing} onPatch={onPatch} onWriting={onWriting} /> : null}
            {section === "save" ? <Save settings={settings} onPatch={onPatch} /> : null}
            {section === "edit" ? <Edit settings={settings} onPatch={onPatch} /> : null}
            {section === "preview" ? <Preview settings={settings} onPatch={onPatch} /> : null}
            {section === "language" ? <Language /> : null}
            {section === "about" ? (
              <About
                update={update}
                notice={updateNotice}
                onCheck={onUpdateCheck}
                onPolicy={onUpdatePolicy}
                onDiagnostics={onDiagnostics}
              />
            ) : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Files({
  association,
  busy,
  onMakeDefault,
}: {
  association: AssociationState;
  busy: boolean;
  onMakeDefault: () => void;
}) {
  useT();
  const status: MessageId = association === "default"
    ? "assoc.status.default"
    : association === "registered"
      ? "assoc.status.registered"
      : "assoc.status.unregistered";
  return (
    <div className="settings-row">
      <div className="settings-row-copy">
        <span>{t("assoc.status.label")}</span>
        <p className="hint">{t(status)}</p>
        <p className="hint">{t("assoc.hint")}</p>
      </div>
      <div className="settings-row-control">
        <Button variant="secondary" disabled={busy} onClick={onMakeDefault}>{t("assoc.accept")}</Button>
      </div>
    </div>
  );
}

const lineChoices = [
  [1.6, "settings.lineHeight.compact"],
  [1.75, "settings.lineHeight.standard"],
  [2, "settings.lineHeight.relaxed"],
] as const;

const proseLabels: Record<string, MessageId> = {
  serif: "settings.proseFont.serif",
  song: "settings.proseFont.song",
  sans: "settings.proseFont.sans",
  kai: "settings.proseFont.kai",
};

const codeLabels: Record<string, MessageId> = {
  cascadia: "settings.codeFont.cascadia",
  sarasa: "settings.codeFont.sarasa",
  consolas: "settings.codeFont.consolas",
  system: "settings.codeFont.system",
};

function Appearance({
  settings,
  writing,
  onPatch,
  onWriting,
}: {
  settings: SettingsModel;
  writing: WritingPrefs;
  onPatch: (patch: SettingsPatch) => void;
  onWriting: (next: WritingPrefs) => void;
}) {
  useT();
  const locale = useLocale();
  const installed = useSystemFonts();
  const fonts = useMemo(() => sortFontNames(installed, locale.locale), [installed, locale.locale]);
  return (
    <div>
      <div className="settings-row settings-row-stack">
        <div className="settings-row-copy">
          <span>{t("settings.theme")}</span>
        </div>
        <ThemeSwatches
          value={writing.themeId}
          onChange={(themeId) => onWriting({ ...writing, themeId, followSystem: false })}
        />
      </div>
      <CheckRow
        label={t("settings.theme.system")}
        checked={writing.followSystem}
        onChange={(checked) => {
          if (!checked) {
            onWriting({ ...writing, followSystem: false });
            return;
          }
          const themeId = window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ? "midnight" : "ivory";
          onWriting({ ...writing, followSystem: true, themeId });
        }}
      />
      <CheckRow
        label={t("settings.warm")}
        hint={t("settings.warmHint")}
        checked={writing.warm}
        onChange={(checked) => onWriting({ ...writing, warm: checked })}
      />
      <Row label={t("settings.measure")}>
        <span className="inline-field">
          <input
            type="range"
            min={36}
            max={72}
            step={2}
            disabled={writing.measureWindow}
            value={writing.measureRem}
            aria-label={t("settings.measure")}
            onChange={(event) => onWriting({ ...writing, measureRem: clampMeasure(Number(event.target.value)) })}
          />
          <span>{writing.measureWindow ? t("settings.measure.window") : `${writing.measureRem} rem`}</span>
        </span>
      </Row>
      <CheckRow
        label={t("settings.measure.window")}
        checked={writing.measureWindow}
        onChange={(checked) => onWriting({ ...writing, measureWindow: checked })}
      />
      <Row label={t("settings.lineHeight")}>
        <div className="mode-switch" role="group" aria-label={t("settings.lineHeight")}>
          {lineChoices.map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={writing.lineHeight === value}
              onClick={() => onWriting({ ...writing, lineHeight: value })}
            >
              {t(label)}
            </button>
          ))}
        </div>
      </Row>
      <FontSelect
        label={t("settings.proseFont")}
        value={writing.proseFont}
        installed={fonts}
        presets={[
          { value: "system", label: t("settings.font.system") },
          { value: "微软雅黑", label: t("settings.font.yahei") },
        ]}
        labels={proseLabels}
        onChange={(proseFont) => onWriting({ ...writing, proseFont })}
      />
      <FontSelect
        label={t("settings.codeFont")}
        value={writing.codeFont}
        installed={fonts}
        presets={[
          { value: "consolas", label: "Consolas" },
          { value: "Courier New", label: "Courier New" },
        ]}
        labels={codeLabels}
        onChange={(codeFont) => onWriting({ ...writing, codeFont })}
      />
      <ChoiceRow
        label={t("settings.glass")}
        value={settings.glass}
        options={[
          { value: "auto", label: t("settings.glass.auto") },
          { value: "off", label: t("settings.glass.off") },
        ]}
        onChange={(value) => onPatch({ field: "glass", value })}
      />
      <ChoiceRow
        label={t("settings.motion")}
        value={settings.reduced_motion}
        options={[
          { value: "system", label: t("settings.motion.system") },
          { value: "on", label: t("settings.motion.on") },
          { value: "off", label: t("settings.motion.off") },
        ]}
        onChange={(value) => onPatch({ field: "reduced_motion", value })}
      />
    </div>
  );
}

function FontSelect({
  label,
  value,
  installed,
  presets,
  labels,
  onChange,
}: {
  label: string;
  value: string;
  installed: readonly string[];
  presets: readonly { value: string; label: string }[];
  labels: Record<string, MessageId>;
  onChange: (value: string) => void;
}) {
  const hidden = hiddenPresetNames(presets);
  const system = installed.filter((name) => !hidden.has(name.toLowerCase()));
  const names = hidden.has(value.toLowerCase()) || system.includes(value) ? system : [value, ...system];
  const allowed = new Set([...presets.map((item) => item.value), ...names]);
  return (
    <Row label={label}>
      <FontPicker
        label={label}
        value={value}
        groups={[
          { label: t("settings.font.preset"), options: presets },
          {
            label: t("settings.font.system"),
            options: names.map((name) => ({
              value: name,
              label: labels[name] ? t(labels[name]) : name,
            })),
          },
        ]}
        onChange={(next) => {
          if (allowed.has(next)) {
            onChange(next);
          }
        }}
      />
    </Row>
  );
}

function hiddenPresetNames(presets: readonly { value: string }[]): Set<string> {
  const hidden = new Set(presets.map((item) => item.value.toLowerCase()));
  if (presets.some((item) => item.value === "微软雅黑")) {
    hidden.add("microsoft yahei");
  }
  return hidden;
}

function useSystemFonts(): string[] {
  const [fonts, setFonts] = useState<string[]>([]);
  useEffect(() => {
    let cancel = false;
    void loadSystemFonts().then((names) => {
      if (!cancel) {
        setFonts(names);
      }
    });
    return () => {
      cancel = true;
    };
  }, []);
  return fonts;
}

function Language() {
  useT();
  const locale = useLocale();
  const options = [
    { value: "system", label: t("settings.language.system") },
    { value: "en-US", label: "English" },
    { value: "zh-CN", label: "简体中文" },
  ] as const;
  return (
    <div className="settings-row settings-row-end">
      <div className="settings-row-control">
        <FontPicker
          label={t("settings.language")}
          value={locale.source === "system" ? "system" : locale.locale}
          groups={[{ options }]}
          onChange={(next) => {
            const match = options.find((option) => option.value === next);
            if (match) {
              locale.setLocale(match.value);
            }
          }}
        />
      </div>
    </div>
  );
}

function Save({ settings, onPatch }: { settings: SettingsModel; onPatch: (patch: SettingsPatch) => void }) {
  useT();
  return (
    <div>
      <CheckRow
        label={t("settings.autosave")}
        checked={settings.autosave_enabled}
        onChange={(checked) => onPatch({ field: "autosave_enabled", value: checked })}
      />
      <Row label={t("settings.autosaveInterval")} hint={t("file.untitledHint")}>
        <span className="inline-field">
          <input
            type="number"
            min={0.5}
            max={10}
            step={0.1}
            value={settings.autosave_interval_ms / 1000}
            aria-label={t("settings.autosaveInterval")}
            onChange={(event) => {
              const ms = autosaveMs(Number(event.target.value));
              if (ms !== null) {
                onPatch({ field: "autosave_interval_ms", value: ms });
              }
            }}
          />
          <span>{t("settings.seconds")}</span>
        </span>
      </Row>
      <RecentList files={settings.recent_files} onForget={(path) => onPatch({ field: "forget_recent", path })} />
    </div>
  );
}

function Edit({ settings, onPatch }: { settings: SettingsModel; onPatch: (patch: SettingsPatch) => void }) {
  useT();
  return (
    <div>
      <ChoiceRow
        label={t("settings.viewMode")}
        value={settings.view_mode}
        options={[
          { value: "split", label: t("view.split") },
          { value: "source", label: t("view.source") },
          { value: "preview", label: t("view.preview") },
        ]}
        onChange={(value) => onPatch({ field: "view_mode", value })}
      />
      <Row label={t("settings.fontSize")} hint={t("settings.editHint")}>
        <input
          type="number"
          min={14}
          max={22}
          step={1}
          value={settings.prose_font_size_px}
          aria-label={t("settings.fontSize")}
          onChange={(event) => onPatch({ field: "prose_font_size_px", value: Number(event.target.value) })}
        />
      </Row>
    </div>
  );
}

function Preview({ settings, onPatch }: { settings: SettingsModel; onPatch: (patch: SettingsPatch) => void }) {
  useT();
  return (
    <div>
      <CheckRow
        label={t("settings.math")}
        checked={settings.preview.math}
        onChange={(checked) => onPatch({ field: "preview_math", value: checked })}
      />
      <CheckRow
        label={t("settings.mermaid")}
        checked={settings.preview.mermaid}
        onChange={(checked) => onPatch({ field: "preview_mermaid", value: checked })}
      />
      <CheckRow
        label={t("settings.remoteImages")}
        hint={t("settings.remoteImagesHint")}
        checked={settings.preview.remote_images}
        onChange={(checked) => onPatch({ field: "preview_remote_images", value: checked })}
      />
    </div>
  );
}

function About({
  update,
  notice,
  onCheck,
  onPolicy,
  onDiagnostics,
}: {
  update: UpdateSnapshot | null;
  notice: string;
  onCheck: () => void;
  onPolicy: (checkOnStartup: boolean, downloadInBackground: boolean) => void;
  onDiagnostics: () => void;
}) {
  useT();
  const checking = update?.phase === "checking";
  const checkError = update?.phase === "idle" && update.error
    ? presentError({ code: "io", message: update.error })
    : "";
  return (
    <div>
      <div className="settings-row">
        <div className="settings-row-copy">
          <span>{update?.current_version ? t("update.current", { version: update.current_version }) : t("app.name")}</span>
          <p className="hint">{t("settings.aboutBody")}</p>
          {update?.dev_build ? <p className="hint">{t("update.dev")}</p> : null}
          {checkError ? <p className="hint">{checkError}</p> : null}
          {notice && !checkError ? <p className="hint">{notice}</p> : null}
        </div>
        <div className="settings-row-control">
          <Button variant="secondary" disabled={!update || update.dev_build || checking} onClick={onCheck}>
            {checking ? t("update.checking") : t("update.check")}
          </Button>
        </div>
      </div>
      <CheckRow
        label={t("update.checkOnStartup")}
        hint={t("update.checkOnStartupHint")}
        checked={update?.check_on_startup ?? false}
        disabled={!update}
        onChange={(checked) => update && onPolicy(checked, update.download_in_background)}
      />
      <CheckRow
        label={t("update.downloadInBackground")}
        hint={t("update.downloadInBackgroundHint")}
        checked={update?.download_in_background ?? false}
        disabled={!update}
        onChange={(checked) => update && onPolicy(update.check_on_startup, checked)}
      />
      <div className="settings-row">
        <div className="settings-row-copy">
          <span>{t("settings.diagnostics")}</span>
          <p className="hint">{t("settings.diagnosticsHint")}</p>
        </div>
        <div className="settings-row-control">
          <Button variant="ghost" onClick={onDiagnostics}>{t("settings.diagnostics")}</Button>
        </div>
      </div>
    </div>
  );
}

function fileName(path: string): string {
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] || path;
}

function RecentList({ files, onForget }: { files: RecentFile[]; onForget: (path: string) => void }) {
  if (files.length === 0) {
    return null;
  }
  return (
    <div>
      <p className="settings-pane-title">{t("file.recent")}</p>
      {files.map((file) => (
        <div key={file.path} className="settings-row">
          <div className="settings-row-copy">
            <span title={file.path}>{fileName(file.path)}</span>
            {file.missing ? <span className="recent-state">{t("file.missing")}</span> : null}
          </div>
          <div className="settings-row-control">
            <Button variant="ghost" onClick={() => onForget(file.path)}>
              {t("settings.recentRemove")}
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}

function ChoiceRow<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <Row label={label}>
      <FontPicker
        label={label}
        value={value}
        groups={[{ options }]}
        onChange={(next) => {
          const match = options.find((option) => option.value === next);
          if (match) {
            onChange(match.value);
          }
        }}
      />
    </Row>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  const id = useId();
  if (isValidElement<{ id?: string; "aria-describedby"?: string }>(children) && isField(children)) {
    return (
      <div className="settings-row">
        <div className="settings-row-copy">
          <label htmlFor={id}>{label}</label>
          {hint ? <p className="hint" id={`${id}-hint`}>{hint}</p> : null}
        </div>
        <div className="settings-row-control">
          {cloneElement(children, {
            id: children.props.id ?? id,
            "aria-describedby": hint ? `${id}-hint` : undefined,
          })}
        </div>
      </div>
    );
  }
  return (
    <div className="settings-row">
      <div className="settings-row-copy">
        <span>{label}</span>
        {hint ? <p className="hint">{hint}</p> : null}
      </div>
      <div className="settings-row-control">{children}</div>
    </div>
  );
}

function isField(element: ReactElement): boolean {
  return element.type === "select" || element.type === "input";
}

function CheckRow({
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  const id = useId();
  return (
    <div className="settings-row">
      <div className="settings-row-copy">
        <label htmlFor={id}>{label}</label>
        {hint ? <p className="hint" id={`${id}-hint`}>{hint}</p> : null}
      </div>
      <div className="settings-row-control">
        <input
          id={id}
          type="checkbox"
          checked={checked}
          disabled={disabled}
          aria-describedby={hint ? `${id}-hint` : undefined}
          onChange={(event) => onChange(event.target.checked)}
        />
      </div>
    </div>
  );
}
