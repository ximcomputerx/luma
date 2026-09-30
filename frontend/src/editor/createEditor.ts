import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { Compartment, EditorState, StateEffect, StateField } from "@codemirror/state";
import { Decoration, EditorView, keymap, lineNumbers, type DecorationSet } from "@codemirror/view";
import { tags } from "@lezer/highlight";
import { searchExtension } from "./find";
import { markdownAutocomplete } from "./markdownCompletions";

export type EditorHost = {
  view: EditorView;
  loadDocument: (text: string) => void;
  setEditable: (editable: boolean) => void;
  highlightLines: (from: number | null, to: number | null) => void;
};

const setBlockHighlight = StateEffect.define<{ from: number; to: number } | null>();

function blockHighlightField() {
  return StateField.define<DecorationSet>({
    create() {
      return Decoration.none;
    },
    update(marks, transaction) {
      let next = marks.map(transaction.changes);
      for (const effect of transaction.effects) {
        if (!effect.is(setBlockHighlight)) {
          continue;
        }
        if (!effect.value) {
          next = Decoration.none;
          continue;
        }
        const decorations = [];
        const from = Math.max(1, effect.value.from);
        const to = Math.min(transaction.state.doc.lines, Math.max(from, effect.value.to));
        const limit = Math.min(to, from + 499);
        for (let line = from; line <= limit; line += 1) {
          decorations.push(Decoration.line({ class: "cm-current-block" }).range(transaction.state.doc.line(line).from));
        }
        next = Decoration.set(decorations, true);
      }
      return next;
    },
    provide: (field) => EditorView.decorations.from(field),
  });
}

export function createEditor(
  parent: HTMLElement,
  doc: string,
  onChange: (text: string) => void,
  onActivity?: (cursor: { line: number; column: number }) => void,
  onPasteImage?: (bytes: Uint8Array) => void,
): EditorHost {
  const silent = { current: false };
  let editable = true;
  let editableSlot = new Compartment();

  function extensionsFor(nextEditable: boolean) {
    editableSlot = new Compartment();
    return [
      lineNumbers(),
      history(),
      markdown(),
      searchExtension(),
      markdownAutocomplete(),
      blockHighlightField(),
      highlightExtension(),
      EditorView.lineWrapping,
      EditorView.domEventHandlers({
        paste(event) {
          if (!onPasteImage) {
            return false;
          }
          const items = event.clipboardData?.items;
          if (!items) {
            return false;
          }
          const image = Array.from(items).find((item) => item.type.startsWith("image/"));
          const file = image?.getAsFile();
          if (!file) {
            return false;
          }
          event.preventDefault();
          void file.arrayBuffer().then((buffer) => onPasteImage(new Uint8Array(buffer)));
          return true;
        },
      }),
      editableSlot.of(EditorView.editable.of(nextEditable)),
      keymap.of([...defaultKeymap, ...historyKeymap]),
      EditorView.updateListener.of((update) => {
        if ((update.docChanged || update.selectionSet) && !silent.current) {
          onActivity?.(cursorPosition(update.view));
        }
        if (update.docChanged && !silent.current) {
          onChange(update.state.doc.toString());
        }
      }),
      EditorView.theme({
        "&": { height: "100%", fontSize: "var(--prose-size)", background: "var(--bg-editor)", color: "var(--text-primary)" },
        ".cm-scroller": {
          fontFamily: "var(--font-code)",
          lineHeight: "var(--line)",
          background: "var(--bg-editor)",
        },
        ".cm-content": {
          padding: "40px 36px 80px",
          maxWidth: "var(--measure)",
          marginLeft: "auto",
          marginRight: "auto",
          caretColor: "var(--text-primary)",
        },
        ".cm-gutters": {
          background: "transparent",
          color: "color-mix(in srgb, var(--text-secondary) 55%, transparent)",
          border: "none",
          fontSize: "12px",
        },
        ".cm-activeLine": { backgroundColor: "color-mix(in srgb, var(--accent) 6%, transparent)" },
        ".cm-activeLineGutter": { backgroundColor: "transparent", color: "var(--text-secondary)" },
        "&.cm-focused .cm-selectionBackground, .cm-selectionBackground": { background: "var(--selection)" },
        ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--text-primary)" },
        ".cm-current-block": { backgroundColor: "color-mix(in srgb, var(--accent) 8%, transparent)" },
      }),
    ];
  }

  const view = new EditorView({
    parent,
    state: EditorState.create({ doc, extensions: extensionsFor(editable) }),
  });
  return {
    view,
    loadDocument(text) {
      silent.current = true;
      view.setState(EditorState.create({ doc: text, extensions: extensionsFor(editable) }));
      silent.current = false;
    },
    setEditable(next) {
      editable = next;
      view.dispatch({ effects: editableSlot.reconfigure(EditorView.editable.of(next)) });
    },
    highlightLines(from, to) {
      view.dispatch({
        effects: setBlockHighlight.of(from == null || to == null ? null : { from, to }),
      });
    },
  };
}

function highlightExtension() {
  return syntaxHighlighting(
    HighlightStyle.define([
      { tag: tags.heading, color: "var(--fg-heading)", fontWeight: "600" },
      { tag: tags.strong, fontWeight: "700" },
      { tag: tags.emphasis, fontStyle: "italic" },
      { tag: tags.strikethrough, textDecoration: "line-through", color: "var(--text-secondary)" },
      { tag: tags.monospace, backgroundColor: "var(--code-bg)" },
      { tag: tags.link, color: "var(--link)" },
      { tag: tags.quote, color: "var(--text-secondary)", fontStyle: "italic" },
      { tag: tags.meta, color: "var(--text-secondary)" },
    ]),
  );
}

export function firstVisibleLine(view: EditorView): number {
  const block = view.lineBlockAtHeight(view.scrollDOM.scrollTop);
  return view.state.doc.lineAt(block.from).number;
}

export function outlineLine(view: EditorView): number {
  const cursor = cursorPosition(view).line;
  const docLine = view.state.doc.line(Math.min(view.state.doc.lines, Math.max(1, cursor)));
  const block = view.lineBlockAt(docLine.from);
  const top = view.scrollDOM.scrollTop;
  const bottom = top + view.scrollDOM.clientHeight;
  if (block.bottom > top && block.top < bottom) {
    return cursor;
  }
  return firstVisibleLine(view);
}

export function cursorPosition(view: EditorView): { line: number; column: number } {
  const cursor = view.state.selection.main.head;
  const line = view.state.doc.lineAt(cursor);
  return { line: line.number, column: cursor - line.from + 1 };
}
