import { t, useT } from "../i18n";

type Props = {
  replaceMode: boolean;
  query: string;
  replacement: string;
  caseSensitive: boolean;
  allowReplace: boolean;
  onQuery: (value: string) => void;
  onReplacement: (value: string) => void;
  onCase: (value: boolean) => void;
  onNext: () => void;
  onReplace: () => void;
  onReplaceAll: () => void;
  onClose: () => void;
};

export function FindBar(props: Props) {
  useT();
  return (
    <form
      className="findbar"
      onSubmit={(event) => {
        event.preventDefault();
        props.onNext();
      }}
    >
      <label>
        {t("find.title")}
        <input type="search" value={props.query} onChange={(event) => props.onQuery(event.target.value)} />
      </label>
      {props.replaceMode ? (
        <label>
          {t("find.replace")}
          <input type="text" value={props.replacement} onChange={(event) => props.onReplacement(event.target.value)} />
        </label>
      ) : null}
      <label className="check">
        <input
          type="checkbox"
          checked={props.caseSensitive}
          onChange={(event) => props.onCase(event.target.checked)}
        />
        {t("find.case")}
      </label>
      <div className="find-actions">
        <button type="submit" className="btn btn-ghost">{t("find.next")}</button>
        {props.replaceMode && props.allowReplace ? (
          <button type="button" className="btn btn-ghost" onClick={props.onReplace}>{t("find.replace")}</button>
        ) : null}
        {props.replaceMode && props.allowReplace ? (
          <button type="button" className="btn btn-ghost" onClick={props.onReplaceAll}>{t("find.replaceAll")}</button>
        ) : null}
        <button type="button" className="btn btn-ghost" onClick={props.onClose}>{t("find.close")}</button>
      </div>
    </form>
  );
}
