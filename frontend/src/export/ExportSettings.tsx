import { useEffect, useMemo, useState, type ReactNode } from "react";
import { FontPicker } from "../components/luma/FontPicker";
import { t, useLocale, useT, type MessageId } from "../i18n";
import { loadSystemFonts } from "../styles/systemFonts";
import { fontChoices, sortFontNames } from "../styles/writing";
import type { ThemeTokens } from "../styles/themes";
import {
  applyTemplate,
  editProfile,
  pdfBases,
  pdfMargins,
  themePrintColors,
  type PdfBase,
  type PdfColors,
  type PdfProfile,
} from "./pdfProfile";

type Props = {
  profile: PdfProfile;
  theme: ThemeTokens;
  onChange: (next: PdfProfile) => void;
};

const templateCopy: Record<PdfBase, { name: MessageId; hint: MessageId }> = {
  modern: { name: "pdf.template.modern", hint: "pdf.template.modernHint" },
  academic: { name: "pdf.template.academic", hint: "pdf.template.academicHint" },
  book: { name: "pdf.template.book", hint: "pdf.template.bookHint" },
  minimal: { name: "pdf.template.minimal", hint: "pdf.template.minimalHint" },
  technical: { name: "pdf.template.technical", hint: "pdf.template.technicalHint" },
};

const bodyRoles = ["system", "微软雅黑"] as const;
const headingRoles = ["match", "system", "微软雅黑"] as const;
const codeRoles = ["consolas", "Courier New"] as const;

export function ExportSettings({ profile, theme, onChange }: Props) {
  useT();
  const locale = useLocale();
  const installed = useSystemFonts();
  const fonts = useMemo(() => sortFontNames(installed, locale.locale), [installed, locale.locale]);
  const bodyOptions = fontChoices(fonts, profile.bodyFont, bodyRoles);
  const headingOptions = fontChoices(fonts, profile.headingFont, headingRoles);
  const codeOptions = fontChoices(fonts, profile.codeFont, codeRoles);
  return (
    <div className="pdf-rail">
      <div className="pdf-templates" role="radiogroup" aria-label={t("pdf.template")}>
        {pdfBases.map((base) => (
          <button
            key={base}
            type="button"
            className="pdf-template"
            role="radio"
            data-template={base}
            aria-checked={profile.template === base}
            onClick={() => onChange(applyTemplate(base))}
          >
            <strong>{t(templateCopy[base].name)}</strong>
            <span>{t(templateCopy[base].hint)}</span>
          </button>
        ))}
      </div>
      {profile.template === "custom" ? <p className="pdf-adjusted">{t("pdf.adjusted")}</p> : null}
      <p className="pdf-caption">{t("pdf.section.font")}</p>
      <FontRow
        label={t("pdf.font.body")}
        value={profile.bodyFont}
        options={bodyOptions}
        roles={bodyRoles}
        roleLabel={roleLabel}
        onChange={(bodyFont) => onChange(editProfile(profile, { bodyFont }))}
      />
      <FontRow
        label={t("pdf.font.heading")}
        value={profile.headingFont}
        options={headingOptions}
        roles={headingRoles}
        roleLabel={roleLabel}
        onChange={(headingFont) => onChange(editProfile(profile, { headingFont }))}
      />
      <FontRow
        label={t("pdf.font.code")}
        value={profile.codeFont}
        options={codeOptions}
        roles={codeRoles}
        roleLabel={codeLabel}
        onChange={(codeFont) => onChange(editProfile(profile, { codeFont }))}
      />
      <p className="pdf-caption">{t("pdf.section.type")}</p>
      <Row label={`${t("pdf.size")} ${profile.fontSizePx}px`}>
        <input
          data-field="font-size"
          type="range"
          min={12}
          max={24}
          step={1}
          value={profile.fontSizePx}
          aria-label={t("pdf.size")}
          onChange={(event) => onChange(editProfile(profile, { fontSizePx: Number(event.target.value) }))}
        />
      </Row>
      <Row label={`${t("pdf.lineHeight")} ${formatLine(profile.lineHeight)}`}>
        <input
          type="range"
          min={1.2}
          max={2.5}
          step={0.05}
          value={profile.lineHeight}
          aria-label={t("pdf.lineHeight")}
          onChange={(event) => onChange(editProfile(profile, { lineHeight: Math.round(Number(event.target.value) * 20) / 20 }))}
        />
      </Row>
      <Segment
        label={t("pdf.paragraph")}
        value={profile.paragraph}
        options={[
          ["compact", "pdf.paragraph.compact"],
          ["standard", "pdf.paragraph.standard"],
          ["loose", "pdf.paragraph.loose"],
        ] as const}
        onChange={(paragraph) => onChange(editProfile(profile, { paragraph }))}
      />
      <Segment
        label={t("pdf.measure")}
        value={profile.measure}
        options={[
          ["full", "pdf.measure.full"],
          ["standard", "pdf.measure.standard"],
          ["narrow", "pdf.measure.narrow"],
        ] as const}
        onChange={(measure) => onChange(editProfile(profile, { measure }))}
      />
      <p className="pdf-caption">{t("pdf.section.color")}</p>
      <Segment
        label={t("pdf.color.mode")}
        value={profile.colorMode}
        options={[
          ["theme", "pdf.color.theme"],
          ["custom", "pdf.color.custom"],
        ] as const}
        onChange={(colorMode) => onChange(colorMode === "custom"
          ? editProfile(profile, { colorMode, colors: profile.colorMode === "custom" ? profile.colors : themePrintColors(theme) })
          : editProfile(profile, { colorMode }))}
      />
      {profile.colorMode === "custom" ? (
        <div className="pdf-colors">
          <ColorWell label={t("pdf.color.text")} value={profile.colors.text} onChange={(text) => onChange(paint(profile, { text }))} />
          <ColorWell label={t("pdf.color.heading")} value={profile.colors.heading} onChange={(heading) => onChange(paint(profile, { heading }))} />
          <ColorWell label={t("pdf.color.link")} value={profile.colors.link} onChange={(link) => onChange(paint(profile, { link }))} />
          <ColorWell label={t("pdf.color.code")} value={profile.colors.codeBg} onChange={(codeBg) => onChange(paint(profile, { codeBg }))} />
          <ColorWell label={t("pdf.color.paper")} value={profile.colors.paper} onChange={(paper) => onChange(paint(profile, { paper }))} />
        </div>
      ) : null}
      <p className="pdf-caption">{t("pdf.section.page")}</p>
      <PickRow
        label={t("pdf.paper")}
        value={profile.paper}
        options={[
          { value: "a4", label: "A4" },
          { value: "letter", label: "Letter" },
          { value: "a5", label: "A5" },
        ]}
        onChange={(paper) => onChange(editProfile(profile, { paper }))}
      />
      <Segment
        label={t("pdf.orientation")}
        value={profile.orientation}
        options={[
          ["portrait", "pdf.orientation.portrait"],
          ["landscape", "pdf.orientation.landscape"],
        ] as const}
        onChange={(orientation) => onChange(editProfile(profile, { orientation }))}
      />
      <PickRow
        label={t("pdf.margin")}
        value={String(profile.marginMm)}
        options={pdfMargins.map((margin) => ({ value: String(margin), label: `${margin}mm` }))}
        onChange={(next) => {
          const margin = pdfMargins.find((item) => String(item) === next);
          if (margin) {
            onChange(editProfile(profile, { marginMm: margin }));
          }
        }}
      />
      <p className="pdf-caption">{t("pdf.section.chrome")}</p>
      <PickRow
        label={t("pdf.header")}
        value={profile.header}
        options={[
          { value: "off", label: t("pdf.header.off") },
          { value: "title", label: t("pdf.header.title") },
          { value: "filename", label: t("pdf.header.filename") },
        ]}
        onChange={(header) => onChange(editProfile(profile, { header }))}
      />
      <Check label={t("pdf.footer.page")} checked={profile.footerPage} onChange={(footerPage) => onChange(editProfile(profile, { footerPage }))} />
      <Check label={t("pdf.footer.created")} checked={profile.footerCreated} onChange={(footerCreated) => onChange(editProfile(profile, { footerCreated }))} />
      <Check label={t("pdf.footer.author")} checked={profile.footerAuthor} onChange={(footerAuthor) => onChange(editProfile(profile, { footerAuthor }))} />
      {profile.footerAuthor ? (
        <Row label={t("pdf.author")}>
          <input
            className="pdf-text"
            aria-label={t("pdf.author")}
            maxLength={80}
            value={profile.author}
            onChange={(event) => onChange(editProfile(profile, { author: event.target.value.replace(/[\r\n]/g, "").slice(0, 80) }))}
          />
        </Row>
      ) : null}
      <p className="pdf-caption">{t("pdf.section.advanced")}</p>
      <Check label={t("pdf.toc")} checked={profile.toc} onChange={(toc) => onChange(editProfile(profile, { toc }))} />
      <Segment
        label={t("pdf.codeBreak")}
        value={profile.codeBreak}
        options={[
          ["split", "pdf.codeBreak.split"],
          ["keep", "pdf.codeBreak.keep"],
        ] as const}
        onChange={(codeBreak) => onChange(editProfile(profile, { codeBreak }))}
      />
      <Row label={`${t("pdf.imageMax")} ${profile.imageMaxPercent}%`}>
        <input
          data-field="image-max"
          type="range"
          min={40}
          max={100}
          step={1}
          value={profile.imageMaxPercent}
          aria-label={t("pdf.imageMax")}
          onChange={(event) => onChange(editProfile(profile, { imageMaxPercent: Number(event.target.value) }))}
        />
      </Row>
      <Segment
        label={t("pdf.widows")}
        value={String(profile.widows) as "2" | "3" | "4"}
        options={[
          ["2", "pdf.widows.2"],
          ["3", "pdf.widows.3"],
          ["4", "pdf.widows.4"],
        ] as const}
        onChange={(widows) => onChange(editProfile(profile, { widows: widows === "4" ? 4 : widows === "3" ? 3 : 2 }))}
      />
    </div>
  );
}

function paint(profile: PdfProfile, patch: Partial<PdfColors>): PdfProfile {
  const colors = { ...profile.colors, ...patch };
  if (patch.text === "#000000") colors.text = "#24292f";
  if (patch.heading === "#000000") colors.heading = "#1f2328";
  if (patch.paper === "#000000") colors.paper = "#f7f8fa";
  return editProfile(profile, { colorMode: "custom", colors });
}

function roleLabel(role: string): string {
  if (role === "system") return t("pdf.font.system");
  if (role === "serif") return t("pdf.font.serif");
  if (role === "sans") return t("pdf.font.sans");
  if (role === "match") return t("pdf.font.match");
  if (role === "微软雅黑") return t("pdf.font.yahei");
  return role;
}

function codeLabel(role: string): string {
  if (role === "cascadia") return t("pdf.font.cascadia");
  if (role === "jetbrains") return t("pdf.font.jetbrains");
  if (role === "fira") return t("pdf.font.fira");
  if (role === "system") return t("pdf.font.system");
  if (role === "consolas") return "Consolas";
  if (role === "Courier New") return "Courier New";
  return role;
}

function familyLabel(name: string): string {
  const prose = roleLabel(name);
  if (prose !== name) {
    return prose;
  }
  return codeLabel(name);
}

function formatLine(value: number): string {
  return value.toFixed(2).replace(/0$/, "").replace(/\.0$/, "");
}

function useSystemFonts(): string[] {
  const [installed, setInstalled] = useState<string[]>([]);
  useEffect(() => {
    let live = true;
    void loadSystemFonts().then((names) => {
      if (live) setInstalled(names);
    });
    return () => {
      live = false;
    };
  }, []);
  return installed;
}

function FontRow({
  label,
  value,
  options,
  roles,
  roleLabel,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly string[];
  roles: readonly string[];
  roleLabel: (role: string) => string;
  onChange: (value: string) => void;
}) {
  const hidden = hiddenRoleNames(roles);
  const families = options.filter((name) => !hidden.has(name.toLowerCase()));
  const groups = [
    {
      label: t("pdf.font.preset"),
      options: roles.map((role) => ({ value: role, label: roleLabel(role) })),
    },
    {
      label: t("pdf.font.installed"),
      options: families.map((name) => ({ value: name, label: familyLabel(name) })),
    },
  ];
  return (
    <div className="pdf-row">
      <span>{label}</span>
      <span className="pdf-control">
        <FontPicker
          className="pdf-select"
          label={label}
          value={value}
          groups={groups}
          onChange={(next) => {
            if (roles.some((role) => role === next) || options.some((name) => name === next)) {
              onChange(next);
            }
          }}
        />
      </span>
    </div>
  );
}

function hiddenRoleNames(roles: readonly string[]): Set<string> {
  const hidden = new Set(roles.map((role) => role.toLowerCase()));
  if (roles.includes("微软雅黑")) {
    hidden.add("microsoft yahei");
  }
  return hidden;
}

function PickRow<T extends string>({
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
    <div className="pdf-row">
      <span>{label}</span>
      <span className="pdf-control">
        <FontPicker
          className="pdf-select"
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
      </span>
    </div>
  );
}

function Segment<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: ReadonlyArray<readonly [T, MessageId]>;
  onChange: (value: T) => void;
}) {
  return (
    <div className="pdf-row">
      <span>{label}</span>
      <div className="mode-switch" role="group" aria-label={label}>
        {options.map(([id, message]) => (
          <button key={id} type="button" aria-pressed={value === id} onClick={() => onChange(id)}>
            {t(message)}
          </button>
        ))}
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="pdf-row">
      <span>{label}</span>
      <span className="pdf-control">{children}</span>
    </label>
  );
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="pdf-row">
      <span>{label}</span>
      <input type="checkbox" checked={checked} aria-label={label} onChange={(event) => onChange(event.target.checked)} />
    </label>
  );
}

function ColorWell({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="pdf-well">
      <input className="pdf-color" type="color" aria-label={label} value={value} onChange={(event) => onChange(event.target.value)} />
      <span>{label}</span>
    </label>
  );
}
