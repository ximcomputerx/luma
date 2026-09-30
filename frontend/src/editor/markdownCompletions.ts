import { autocompletion, type Completion, type CompletionContext, type CompletionSource } from "@codemirror/autocomplete";
import { t, type MessageId } from "../i18n";

export type MarkdownCompletion = {
  label: string;
  detail: string;
  apply: string;
  cursor: number;
};

type CompletionItem = {
  label: string;
  detail: MessageId;
  vars?: Record<string, number>;
  apply: string;
  cursor: number;
};

const ITEMS: CompletionItem[] = [
  { label: "# ", detail: "format.heading", vars: { level: 1 }, apply: "# ", cursor: 2 },
  { label: "## ", detail: "format.heading", vars: { level: 2 }, apply: "## ", cursor: 3 },
  { label: "### ", detail: "format.heading", vars: { level: 3 }, apply: "### ", cursor: 4 },
  { label: "#### ", detail: "format.heading", vars: { level: 4 }, apply: "#### ", cursor: 5 },
  { label: "##### ", detail: "format.heading", vars: { level: 5 }, apply: "##### ", cursor: 6 },
  { label: "###### ", detail: "format.heading", vars: { level: 6 }, apply: "###### ", cursor: 7 },
  { label: "```", detail: "completion.codeBlock", apply: "```\n\n```", cursor: 4 },
  { label: "[]()", detail: "completion.link", apply: "[]()", cursor: 1 },
  { label: "![]()", detail: "completion.image", apply: "![]()", cursor: 2 },
  { label: "> ", detail: "format.quote", apply: "> ", cursor: 2 },
];

export function completionOptions(prefix: string, explicit: boolean): MarkdownCompletion[] {
  if (prefix !== prefix.trimStart()) {
    return [];
  }
  if (!explicit && prefix.length === 0) {
    return [];
  }
  return ITEMS.filter((item) => explicit ? item.label.startsWith(prefix) : prefix.length > 0 && item.label.startsWith(prefix)).map((item) => ({
    label: item.label,
    detail: t(item.detail, item.vars),
    apply: item.apply,
    cursor: item.cursor,
  }));
}

export const markdownCompletionSource: CompletionSource = (context: CompletionContext) => {
  const line = context.state.doc.lineAt(context.pos);
  const prefix = line.text.slice(0, context.pos - line.from);
  if (context.pos !== line.from + prefix.length) {
    return null;
  }
  const options = completionOptions(prefix, context.explicit);
  if (options.length === 0) {
    return null;
  }
  const completions: Completion[] = options.map((item) => ({
    label: item.label,
    detail: item.detail,
    apply: (view, _completion, from, to) => {
      view.dispatch({
        changes: { from, to, insert: item.apply },
        selection: { anchor: from + item.cursor },
      });
    },
  }));
  return { from: line.from, options: completions, validFor: /^[!#[\]>`]*$/ };
};

export function markdownAutocomplete() {
  return autocompletion({
    override: [markdownCompletionSource],
    activateOnTyping: true,
  });
}
