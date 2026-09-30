import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import { EditorView } from "@codemirror/view";
import { useEffect, useRef, useState } from "react";
import { countWords } from "../editor/count";
import { FindBar } from "../editor/FindBar";
import { createEditor, cursorPosition, firstVisibleLine, outlineLine, type EditorHost } from "../editor/createEditor";
import { runFind } from "../editor/find";
import { applyCode, applyHeading, applyList, applyQuote, insertTableColumn, insertTableRow, tableAt, wrapSelection, type TableHit } from "../editor/format";
import { presentError, t, useLocale, useT } from "../i18n";
import {
  closeDecision,
  diagnosticsExport,
  documentAutosave,
  documentClose,
  documentFocus,
  isEmptyWorkspace,
  documentNew,
  documentOpen,
  documentSave,
  exportHtml,
  folderList,
  folderOpen,
  imagePaste,
  previewRender,
  settingsGet,
  settingsSet,
} from "../ipc/commands";
import { readCommandError, type DocumentSnapshot, type Settings as SettingsModel, type SettingsPatch, type TreeEntry, type ViewMode } from "../ipc/types";
import { CommandPalette, type PaletteCommand } from "../palette/CommandPalette";
import { PreviewPane, type PreviewHandle } from "../preview/PreviewPane";
import { SaveQueue } from "../session/saveQueue";
import { shellAppearance, type ShellAppearance } from "../styles/appearance";
import { applyTheme, bootWriting, prefersDark, syncWindowTheme } from "../styles/applyTheme";
import { presentTheme, type ThemeId } from "../styles/themes";
import { loadWriting, migrateWriting, rustThemeFor, saveWriting, type WritingPrefs } from "../styles/writing";
import { Settings } from "../components/luma/Settings";
import { PDFExportDialog } from "../export/PDFExportDialog";
import { Sidebar, type SidePane } from "../components/luma/Sidebar";
import { StatusBar } from "../components/luma/StatusBar";
import { TabBar } from "../components/luma/TabBar";
import { Toolbar } from "../components/luma/Toolbar";
import { TooltipProvider } from "../components/ui/tooltip";
import { DirtyDialog, type DirtyChoice } from "./DirtyDialog";
import { hasUnsavedChanges } from "./documentState";
import { headingAtLine, outlineEntries, type OutlineEntry } from "./outline";
import { TableHandles } from "./TableHandles";
import { displayTitle, mergeWorkspace, tabFromSnapshot, type OpenTab } from "./workspace";
import {
  flattenPreview,
  lineForRatio,
  pickDeepest,
  ratioForLine,
  ScrollSync,
  type SyncBlock,
} from "../sync/scrollSync";

const defaultSettings: SettingsModel = {
  schema_version: 1,
  theme: "system",
  view_mode: "split",
  prose_font_size_px: 16,
  autosave_enabled: true,
  autosave_interval_ms: 1500,
  glass: "auto",
  reduced_motion: "system",
  recent_files: [],
  preview: { math: true, mermaid: true, remote_images: false },
  glass_active: false,
  settings_frozen: false,
};

type DocState = OpenTab;

type TreeState = {
  root: string | null;
  entries: Record<string, TreeEntry[]>;
  expanded: string[];
  truncated: Record<string, boolean>;
};

const emptyDoc: DocState = {
  id: "",
  path: null,
  title: "",
  newline: "lf",
  buffer: "",
  accepted: "",
  rev: 1,
};

export function AppShell() {
  useT();
  const localeState = useLocale();
  const editorHost = useRef<HTMLDivElement>(null);
  const previewRef = useRef<PreviewHandle>(null);
  const editorRef = useRef<EditorHost | null>(null);
  const sync = useRef(new ScrollSync());
  const blocks = useRef<SyncBlock[]>([]);
  const generation = useRef(0);
  const forceFull = useRef(false);
  const applying = useRef(false);
  const previewTimer = useRef<number | undefined>(undefined);
  const lockTimer = useRef<number | undefined>(undefined);
  const autosaveTimer = useRef<number | undefined>(undefined);
  const bootToken = useRef(0);
  const closing = useRef(false);
  const closeGate = useRef(false);
  const prompting = useRef<Promise<DirtyChoice> | null>(null);
  const lastSide = useRef<"source" | "preview">("source");
  const [settings, setSettings] = useState(defaultSettings);
  const [doc, setDoc] = useState<DocState>(emptyDoc);
  const [tree, setTree] = useState<TreeState>({ root: null, entries: {}, expanded: [], truncated: {} });
  const [status, setStatus] = useState("");
  const [outline, setOutline] = useState(false);
  const [narrow, setNarrow] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(240);
  const [previewRatio, setPreviewRatio] = useState(0.6);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [pdfOpen, setPdfOpen] = useState(false);
  const [findOpen, setFindOpen] = useState(false);
  const [findReplace, setFindReplace] = useState(false);
  const [findQuery, setFindQuery] = useState("");
  const [replacement, setReplacement] = useState("");
  const [matchCase, setMatchCase] = useState(false);
  const [pendingChoice, setPendingChoice] = useState<{ resolve: (choice: DirtyChoice) => void } | null>(null);
  const [cursor, setCursor] = useState({ line: 1, column: 1 });
  const [words, setWords] = useState(0);
  const [sideTab, setSideTab] = useState<SidePane>("recent");
  const [tabs, setTabs] = useState<DocState[]>([]);
  const [headings, setHeadings] = useState<OutlineEntry[]>([]);
  const headingsRef = useRef<OutlineEntry[]>([]);
  const [activeHeading, setActiveHeading] = useState<number | null>(null);
  const [tableHit, setTableHit] = useState<TableHit | null>(null);
  const [dirtyMany, setDirtyMany] = useState(false);
  const [writing, setWriting] = useState<WritingPrefs>(bootWriting);
  const [booted, setBooted] = useState(false);
  const hadStored = useRef(loadWriting() !== null);
  const settingsRef = useRef(settings);
  const docRef = useRef(doc);
  const tabsRef = useRef<DocState[]>([]);
  const treeRef = useRef(tree);
  const onCursor = useRef<(pos: { line: number; column: number }) => void>(() => undefined);
  const modeRef = useRef<ViewMode>("split");
  settingsRef.current = settings;
  headingsRef.current = headings;
  docRef.current = doc;
  treeRef.current = tree;
  const mode: ViewMode = narrow && settings.view_mode === "split" ? lastSide.current : settings.view_mode;
  modeRef.current = mode;

  const queues = useRef(new Map<string, SaveQueue>());
  function queueFor(id: string) {
    let queue = queues.current.get(id);
    if (!queue) {
      queue = new SaveQueue(async (request, kind) => {
        try {
          const outcome = kind === "auto" ? await documentAutosave(request) : await documentSave(request);
          if ("skipped" in outcome) {
            return { status: "skipped" };
          }
          const title = fileTitle(outcome.path);
          tabsRef.current = tabsRef.current.map((tab) => {
            if (tab.id !== request.document_id) {
              return tab;
            }
            if (tab.buffer === request.markdown_lf) {
              return { ...tab, accepted: request.markdown_lf, path: outcome.path, rev: outcome.rev, title };
            }
            return { ...tab, path: outcome.path, rev: outcome.rev, title };
          });
          setTabs(tabsRef.current);
          if (docRef.current.id === request.document_id) {
            const next = tabsRef.current.find((tab) => tab.id === request.document_id);
            if (next) {
              docRef.current = next;
              setDoc(next);
              void retitle(displayTitle(next.path, next.title, t("file.untitled")));
            }
          }
          void refreshSettings();
          if (outcome.root && outcome.root !== treeRef.current.root) {
            void loadRoot(outcome.root);
          }
          return { status: "saved", path: outcome.path, rev: outcome.rev, bytes: outcome.bytes, root: outcome.root };
        } catch (error) {
          const parsed = readCommandError(error);
          if (parsed.code === "conflict") {
            setStatus(t("error.conflict"));
            return { status: "conflict" };
          }
          if (parsed.code === "dialog_canceled") {
            return { status: "canceled" };
          }
          setStatus(presentError(error));
          return { status: "error", message: parsed.message };
        }
      });
      queues.current.set(id, queue);
    }
    return queue;
  }

  function hasChanges(buffer = docRef.current.buffer) {
    return hasUnsavedChanges(docRef.current.path, buffer, docRef.current.accepted);
  }

  async function refreshSettings() {
    try {
      setSettings(await settingsGet());
    } catch (error) {
      setStatus(presentError(error));
    }
  }

  async function loadRoot(root: string) {
    const page = await folderList(root);
    setTree({
      root,
      entries: { [root]: page.entries },
      expanded: [],
      truncated: { [root]: page.truncated },
    });
  }

  async function retitle(title: string | null) {
    const next = title ? `${title} - ${t("app.name")}` : t("app.name");
    document.title = next;
    try {
      await getCurrentWindow().setTitle(next);
    } catch {
      /* Browser preview has no window handle. */
    }
  }

  useEffect(() => {
    const current = docRef.current;
    void retitle(current.id ? displayTitle(current.path, current.title, t("file.untitled")) : null);
  }, [localeState.locale]);

  function rememberActive() {
    if (!docRef.current.id) {
      return;
    }
    const next = tabsRef.current.map((tab) => (tab.id === docRef.current.id ? docRef.current : tab));
    if (!next.some((tab) => tab.id === docRef.current.id)) {
      next.push(docRef.current);
    }
    tabsRef.current = next;
  }

  function install(snapshot: DocumentSnapshot, loadActive: boolean) {
    rememberActive();
    const nextTabs = mergeWorkspace(tabsRef.current, docRef.current, snapshot, loadActive, t("file.untitled"));
    tabsRef.current = nextTabs;
    setTabs(nextTabs);
    const shown = nextTabs.find((tab) => tab.id === snapshot.document_id) ?? tabFromSnapshot(snapshot, t("file.untitled"));
    const switched = docRef.current.id !== shown.id || loadActive;
    docRef.current = shown;
    setDoc(shown);
    const queue = queueFor(shown.id);
    if (loadActive) {
      queue.reset(shown.id, shown.rev, shown.buffer);
    } else {
      queue.setBody(shown.buffer);
    }
    editorRef.current?.setEditable(modeRef.current !== "preview");
    if (switched) {
      editorRef.current?.loadDocument(shown.buffer);
      editorRef.current?.view.focus();
      forceFull.current = false;
      setOutline(false);
      setHeadings([]);
      setStatus("");
      void retitle(displayTitle(shown.path, shown.title, t("file.untitled")));
      schedulePreview(shown.buffer);
    }
    if (snapshot.root && snapshot.root !== treeRef.current.root) {
      void loadRoot(snapshot.root);
    }
  }

  function showStored(id: string) {
    if (docRef.current.id === id) {
      return;
    }
    rememberActive();
    setTabs(tabsRef.current);
    const leaving = docRef.current;
    if (settingsRef.current.autosave_enabled && leaving.path && hasUnsavedChanges(leaving.path, leaving.buffer, leaving.accepted)) {
      const leavingQueue = queueFor(leaving.id);
      leavingQueue.setBody(leaving.buffer);
      void leavingQueue.enqueue("auto", false);
    }
    const shown = tabsRef.current.find((tab) => tab.id === id);
    if (!shown) {
      return;
    }
    docRef.current = shown;
    setDoc(shown);
    queueFor(shown.id).setBody(shown.buffer);
    editorRef.current?.loadDocument(shown.buffer);
    editorRef.current?.view.focus();
    forceFull.current = false;
    setOutline(false);
    schedulePreview(shown.buffer);
    void retitle(displayTitle(shown.path, shown.title, t("file.untitled")));
    void documentFocus(id).catch((error) => setStatus(presentError(error)));
  }

  function noteEdit(text: string) {
    if (!docRef.current.id) {
      return;
    }
    docRef.current = { ...docRef.current, buffer: text };
    setDoc(docRef.current);
    rememberActive();
    queueFor(docRef.current.id).setBody(text);
    schedulePreview(text);
    scheduleAutosave();
  }

  function schedulePreview(text: string) {
    window.clearTimeout(previewTimer.current);
    if (modeRef.current === "source") {
      return;
    }
    const bytes = new TextEncoder().encode(text).length;
    const wait = bytes < 256 * 1024 ? 150 : 400;
    previewTimer.current = window.setTimeout(() => {
      void renderNow(text);
    }, wait);
  }

  function scheduleAutosave() {
    window.clearTimeout(autosaveTimer.current);
    const current = settingsRef.current;
    if (!current.autosave_enabled || !docRef.current.path || !hasChanges()) {
      return;
    }
    const id = docRef.current.id;
    autosaveTimer.current = window.setTimeout(() => {
      void queueFor(id).enqueue("auto", false);
    }, current.autosave_interval_ms);
  }

  async function renderNow(text: string) {
    if (modeRef.current === "source") {
      return;
    }
    const renderGen = ++generation.current;
    const bytes = new TextEncoder().encode(text).length;
    const full = forceFull.current && bytes <= 8 * 1024 * 1024;
    try {
      const payload = await previewRender(renderGen, text, full, docRef.current.id || null);
      if (payload.render_gen !== generation.current) {
        return;
      }
      blocks.current = flattenPreview(payload.blocks);
      const entries = outlineEntries(payload.blocks);
      setHeadings(entries);
      setOutline(payload.mode === "outline");
      setStatus(payload.mode === "outline" ? t("view.previewPaused") : "");
      previewRef.current?.render(payload);
      const line = editorRef.current ? cursorPosition(editorRef.current.view).line : 1;
      const block = pickDeepest(blocks.current, line);
      previewRef.current?.highlight(block?.id ?? null);
      editorRef.current?.highlightLines(block ? block.startLine : null, block ? block.endLine : null);
      setActiveHeading(headingAtLine(entries, line)?.id ?? null);
    } catch (error) {
      setStatus(presentError(error));
    }
  }

  function armLock() {
    window.clearTimeout(lockTimer.current);
    const deadline = sync.current.deadline();
    if (deadline === null) {
      return;
    }
    lockTimer.current = window.setTimeout(() => {
      sync.current.expire(performance.now());
      armLock();
    }, Math.max(0, deadline - performance.now()));
  }

  function alignFromEditor() {
    const view = editorRef.current?.view;
    if (!view || modeRef.current !== "split") {
      return;
    }
    const line = firstVisibleLine(view);
    const block = pickDeepest(blocks.current, line);
    const renderGen = generation.current;
    if (!block || renderGen === 0) {
      return;
    }
    previewRef.current?.scrollTo(renderGen, block.id, ratioForLine(block, line));
  }

  function onVisible(renderGen: number, id: number, ratio: number) {
    if (renderGen !== generation.current) {
      return;
    }
    const block = blocks.current.find((item) => item.id === id);
    if (!block) {
      return;
    }
    const followPreview = modeRef.current === "preview" || (modeRef.current === "split" && sync.current.lock !== "source");
    if (followPreview) {
      const line = Math.round(lineForRatio(block, ratio));
      setActiveHeading(headingAtLine(headingsRef.current, line)?.id ?? null);
    }
    if (modeRef.current !== "split" || sync.current.lock === "source") {
      return;
    }
    const view = editorRef.current?.view;
    if (!view) {
      return;
    }
    sync.current.userScroll("preview", performance.now());
    armLock();
    const line = Math.round(lineForRatio(block, ratio));
    const clamped = Math.min(view.state.doc.lines, Math.max(1, line));
    applying.current = true;
    view.dispatch({
      effects: EditorView.scrollIntoView(view.state.doc.line(clamped).from, { y: "start" }),
    });
    editorRef.current?.highlightLines(block.startLine, block.endLine);
    previewRef.current?.highlight(block.id);
    window.requestAnimationFrame(() => {
      applying.current = false;
    });
  }

  function ask(): Promise<DirtyChoice> {
    if (prompting.current) {
      return prompting.current;
    }
    const promise = new Promise<DirtyChoice>((resolve) => {
      setPendingChoice({ resolve });
    }).finally(() => {
      prompting.current = null;
    });
    prompting.current = promise;
    return promise;
  }

  async function save(saveAs: boolean) {
    if (!docRef.current.id) {
      return false;
    }
    const current = docRef.current;
    const queue = queueFor(current.id);
    queue.setBody(current.buffer);
    const result = await queue.enqueue("manual", saveAs);
    if (!result) {
      return false;
    }
    if (result.status === "conflict") {
      setStatus(t("error.conflict"));
    } else if (result.status === "error") {
      setStatus(presentError({ code: "io", message: result.message }));
    }
    return result.status === "saved";
  }

  async function openPath(path: string | null) {
    const blankId = docRef.current.id && !docRef.current.path && docRef.current.buffer.length === 0 ? docRef.current.id : null;
    try {
      const snapshot = await documentOpen(path);
      const known = tabsRef.current.some((tab) => tab.id === snapshot.document_id && tab.id !== blankId);
      install(snapshot, !known);
      if (blankId && blankId !== snapshot.document_id) {
        const closed = await documentClose(blankId);
        queues.current.delete(blankId);
        tabsRef.current = tabsRef.current.filter((tab) => tab.id !== blankId);
        setTabs(tabsRef.current);
        if (!isEmptyWorkspace(closed) && closed.document_id !== docRef.current.id) {
          const still = tabsRef.current.some((tab) => tab.id === closed.document_id);
          install(closed, !still);
        }
      }
      await refreshSettings();
    } catch (error) {
      const parsed = readCommandError(error);
      if (parsed.code !== "dialog_canceled") {
        setStatus(presentError(error));
      }
    }
  }

  async function createDocument() {
    if (docRef.current.id && !docRef.current.path && docRef.current.buffer.length === 0) {
      editorRef.current?.view.focus();
      return;
    }
    try {
      install(await documentNew(), true);
    } catch (error) {
      setStatus(presentError(error));
    }
  }

  async function closeTab(id: string) {
    const tab = tabsRef.current.find((item) => item.id === id) ?? (docRef.current.id === id ? docRef.current : null);
    if (!tab) {
      return;
    }
    if (hasUnsavedChanges(tab.path, tab.buffer, tab.accepted)) {
      if (docRef.current.id !== id) {
        showStored(id);
      }
      setDirtyMany(false);
      const choice = await ask();
      if (choice === "cancel") {
        return;
      }
      if (choice === "save") {
        const saved = await save(false);
        if (!saved) {
          return;
        }
      }
    }
    try {
      const snapshot = await documentClose(id);
      queues.current.delete(id);
      if (isEmptyWorkspace(snapshot)) {
        clearWorkspace();
        return;
      }
      tabsRef.current = tabsRef.current.filter((item) => item.id !== id);
      const known = tabsRef.current.some((item) => item.id === snapshot.document_id);
      install(snapshot, !known);
    } catch (error) {
      setStatus(presentError(error));
    }
  }

  function clearWorkspace() {
    const blank = { ...emptyDoc };
    tabsRef.current = [];
    setTabs([]);
    docRef.current = blank;
    setDoc(blank);
    setHeadings([]);
    setOutline(false);
    setStatus("");
    setFindOpen(false);
    setTableHit(null);
    editorRef.current?.loadDocument("");
    editorRef.current?.setEditable(false);
    schedulePreview("");
    void retitle(null);
  }

  async function pasteImage(bytes: Uint8Array) {
    if (!docRef.current.path) {
      setStatus(t("image.needSave"));
      return;
    }
    try {
      const saved = await imagePaste(docRef.current.id, Array.from(bytes));
      const view = editorRef.current?.view;
      if (!view) {
        return;
      }
      const insert = `![](${saved.relative_path})`;
      const range = view.state.selection.main;
      view.dispatch({
        changes: { from: range.from, to: range.to, insert },
        selection: { anchor: range.from + insert.length },
      });
    } catch (error) {
      setStatus(presentError(error));
    }
  }

  async function exportDocument() {
    if (!docRef.current.id) {
      return;
    }
    try {
      const result = await exportHtml(docRef.current.id, docRef.current.buffer);
      setStatus(result.path);
    } catch (error) {
      const parsed = readCommandError(error);
      if (parsed.code !== "dialog_canceled") {
        setStatus(presentError(error));
      }
    }
  }

  function openPdf() {
    if (!docRef.current.id) {
      return;
    }
    setPdfOpen(true);
  }

  function format(run: (view: NonNullable<EditorHost["view"]>) => void) {
    if (!docRef.current.id) {
      return;
    }
    const view = editorRef.current?.view;
    if (!view || modeRef.current === "preview") {
      return;
    }
    run(view);
    view.focus();
  }

  function jumpTo(entry: OutlineEntry) {
    const view = editorRef.current?.view;
    if (view && modeRef.current !== "preview") {
      applying.current = true;
      try {
        const line = view.state.doc.line(Math.min(view.state.doc.lines, Math.max(1, entry.line)));
        view.dispatch({ selection: { anchor: line.from }, scrollIntoView: true });
        view.focus();
      } finally {
        applying.current = false;
      }
    }
    previewRef.current?.scrollTo(generation.current, entry.id, 0);
    previewRef.current?.highlight(entry.id);
    setActiveHeading(entry.id);
  }

  async function openFolder() {
    try {
      const page = await folderOpen();
      setSideTab("files");
      setTree({
        root: page.root,
        entries: { [page.root]: page.entries },
        expanded: [],
        truncated: { [page.root]: page.truncated },
      });
    } catch (error) {
      const parsed = readCommandError(error);
      if (parsed.code !== "dialog_canceled") {
        setStatus(presentError(error));
      }
    }
  }

  async function toggleDir(path: string) {
    if (tree.expanded.includes(path)) {
      setTree((prev) => ({ ...prev, expanded: prev.expanded.filter((item) => item !== path) }));
      return;
    }
    if (!tree.entries[path]) {
      try {
        const page = await folderList(path);
        setTree((prev) => ({
          ...prev,
          entries: { ...prev.entries, [path]: page.entries },
          expanded: [...prev.expanded, path],
          truncated: { ...prev.truncated, [path]: page.truncated },
        }));
      } catch (error) {
        setStatus(presentError(error));
      }
      return;
    }
    setTree((prev) => ({ ...prev, expanded: [...prev.expanded, path] }));
  }

  function setWritingAndSave(next: WritingPrefs) {
    setWriting(next);
    saveWriting(next);
  }

  async function applyPatch(patch: SettingsPatch) {
    try {
      const next = await settingsSet(patch);
      setSettings(next);
      if (patch.field === "view_mode" && (patch.value === "source" || patch.value === "preview")) {
        lastSide.current = patch.value;
      }
    } catch (error) {
      setStatus(presentError(error));
    }
  }

  async function setMode(next: ViewMode) {
    if (next === "source" || next === "preview") {
      lastSide.current = next;
    }
    await applyPatch({ field: "view_mode", value: next });
  }

  function cycleMode() {
    const order: ViewMode[] = ["split", "source", "preview"];
    const index = order.indexOf(settingsRef.current.view_mode);
    void setMode(order[(index + 1) % order.length] ?? "split");
  }

  function dirtyTabs() {
    rememberActive();
    return tabsRef.current.filter((tab) => hasUnsavedChanges(tab.path, tab.buffer, tab.accepted));
  }

  async function requestClose() {
    if (closing.current || closeGate.current) {
      return;
    }
    closeGate.current = true;
    try {
      const dirty = dirtyTabs();
      if (dirty.length === 0) {
        closing.current = true;
        await closeDecision("discard");
        return;
      }
      setDirtyMany(dirty.length > 1);
      const choice = await ask();
      if (choice === "cancel") {
        await closeDecision("cancel");
        return;
      }
      if (choice === "save") {
        for (const tab of dirty) {
          showStored(tab.id);
          const saved = await save(false);
          if (!saved) {
            return;
          }
        }
      }
      closing.current = true;
      await closeDecision(choice === "save" ? "save" : "discard");
    } finally {
      if (!closing.current) {
        closeGate.current = false;
      }
    }
  }

  function applyFind(action: "next" | "replace" | "all") {
    const view = editorRef.current?.view;
    if (!view || (action !== "next" && modeRef.current === "preview")) {
      return;
    }
    runFind(view, findQuery, replacement, matchCase, action);
  }

  const actions = useRef({
    createDocument,
    openPath,
    openFolder,
    save,
    cycleMode,
    requestClose,
    closeTab,
    exportDocument,
    openPdf,
    pasteImage,
  });
  actions.current = {
    createDocument,
    openPath,
    openFolder,
    save,
    cycleMode,
    requestClose,
    closeTab,
    exportDocument,
    openPdf,
    pasteImage,
  };

  useEffect(() => {
    const host = editorHost.current;
    if (!host) {
      return;
    }
    const created = createEditor(
      host,
      "",
      (text) => noteEdit(text),
      (next) => onCursor.current(next),
      (bytes) => {
        void actions.current.pasteImage(bytes);
      },
    );
    editorRef.current = created;
    setCursor(cursorPosition(created.view));
    const onScroll = () => {
      if (applying.current) {
        sync.current.programmaticScroll();
        return;
      }
      const editorDrives = modeRef.current === "source" || (modeRef.current === "split" && sync.current.lock !== "preview");
      if (editorDrives) {
        const line = outlineLine(created.view);
        setActiveHeading(headingAtLine(headingsRef.current, line)?.id ?? null);
      }
      if (modeRef.current !== "split" || sync.current.lock === "preview") {
        return;
      }
      sync.current.userScroll("source", performance.now());
      armLock();
      const line = firstVisibleLine(created.view);
      const block = pickDeepest(blocks.current, line);
      const renderGen = generation.current;
      if (!block || renderGen === 0) {
        return;
      }
      previewRef.current?.scrollTo(renderGen, block.id, ratioForLine(block, line));
    };
    const onScrollEnd = () => {
      if (modeRef.current !== "split") {
        return;
      }
      sync.current.scrollEnd("source", performance.now());
      armLock();
    };
    created.view.scrollDOM.addEventListener("scroll", onScroll, { passive: true });
    created.view.scrollDOM.addEventListener("scrollend", onScrollEnd);
    return () => {
      window.clearTimeout(previewTimer.current);
      window.clearTimeout(lockTimer.current);
      window.clearTimeout(autosaveTimer.current);
      created.view.destroy();
    };
  }, []);

  useEffect(() => {
    const token = ++bootToken.current;
    void (async () => {
      try {
        const loaded = await settingsGet();
        if (token !== bootToken.current) {
          return;
        }
        setSettings(loaded);
        if (!hadStored.current) {
          hadStored.current = true;
          const migrated = migrateWriting(loaded.theme, prefersDark());
          setWriting(migrated);
          saveWriting(migrated);
        }
        setBooted(true);
        if (loaded.view_mode === "source" || loaded.view_mode === "preview") {
          lastSide.current = loaded.view_mode;
        }
        const snapshot = await documentNew();
        if (token !== bootToken.current) {
          return;
        }
        install(snapshot, true);
      } catch (error) {
        setStatus(presentError(error));
      }
    })();
  }, []);

  useEffect(() => {
    const unlisten: Array<() => void> = [];
    let cancel = false;
    void (async () => {
      const windowUnlisten = await getCurrentWindow().onCloseRequested((event) => {
        event.preventDefault();
        void actions.current.requestClose();
      });
      const eventUnlisten = await listen("app://close-requested", () => {
        void actions.current.requestClose();
      });
      if (cancel) {
        windowUnlisten();
        eventUnlisten();
        return;
      }
      unlisten.push(windowUnlisten, eventUnlisten);
    })();
    return () => {
      cancel = true;
      for (const stop of unlisten) {
        stop();
      }
    };
  }, []);

  useEffect(() => {
    function measure() {
      setNarrow(window.innerWidth < 960);
    }
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  useEffect(() => {
    if (!writing.followSystem) {
      return;
    }
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const themeId: ThemeId = media.matches ? "midnight" : "ivory";
      setWriting((prev) => {
        if (!prev.followSystem || prev.themeId === themeId) {
          return prev;
        }
        const next = { ...prev, themeId };
        saveWriting(next);
        return next;
      });
    };
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [writing.followSystem]);

  useEffect(() => {
    const root = document.documentElement;
    const painted = presentTheme(writing.themeId, writing.warm);
    applyTheme(root, painted, writing);
    syncWindowTheme(writing);
    root.dataset.glass = settings.glass_active ? "on" : "off";
    root.dataset.motion = settings.reduced_motion === "on" ? "reduce" : settings.reduced_motion === "off" ? "full" : "system";
    root.style.setProperty("--luma-prose-size", `${settings.prose_font_size_px}px`);
    root.style.setProperty("--prose-size", `${settings.prose_font_size_px}px`);
    editorRef.current?.view.requestMeasure();
  }, [writing, settings.glass_active, settings.reduced_motion, settings.prose_font_size_px]);

  useEffect(() => {
    if (!booted || settings.settings_frozen) {
      return;
    }
    const desired = rustThemeFor(writing);
    if (settings.theme === desired) {
      return;
    }
    void applyPatch({ field: "theme", value: desired });
  }, [booted, writing.themeId, writing.followSystem, settings.theme, settings.settings_frozen]);

  useEffect(() => {
    editorRef.current?.setEditable(Boolean(docRef.current.id) && mode !== "preview");
    if (mode !== "preview") {
      editorRef.current?.view.requestMeasure();
    }
    if (mode !== "source") {
      void renderNow(docRef.current.buffer);
    }
    if (mode === "split") {
      alignFromEditor();
    }
  }, [mode]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setWords(countWords(doc.buffer));
    }, 300);
    return () => window.clearTimeout(timer);
  }, [doc.buffer]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const key = event.key.toLowerCase();
      const mod = event.ctrlKey || event.metaKey;
      if (key === "escape") {
        setPaletteOpen(false);
        setSettingsOpen(false);
        setFindOpen(false);
        return;
      }
      if (!mod) {
        return;
      }
      const typing = event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement;
      if (event.shiftKey && key === "o") {
        event.preventDefault();
        void actions.current.openFolder();
        return;
      }
      if (event.shiftKey && key === "s") {
        event.preventDefault();
        void actions.current.save(true);
        return;
      }
      if (event.shiftKey && key === "e") {
        event.preventDefault();
        void actions.current.exportDocument();
        return;
      }
      if (event.shiftKey && key === "p") {
        event.preventDefault();
        actions.current.openPdf();
        return;
      }
      const global: Record<string, () => void> = {
        n: () => void actions.current.createDocument(),
        o: () => void actions.current.openPath(null),
        s: () => void actions.current.save(false),
        w: () => void actions.current.closeTab(docRef.current.id),
        ",": () => setSettingsOpen(true),
        k: () => setPaletteOpen((open) => !open),
        "\\": () => actions.current.cycleMode(),
      };
      if (global[key]) {
        event.preventDefault();
        global[key]?.();
        return;
      }
      if (typing || modeRef.current === "preview") {
        return;
      }
      const view = editorRef.current?.view;
      if (!view) {
        return;
      }
      if (event.altKey && /^[1-6]$/.test(event.key)) {
        event.preventDefault();
        applyHeading(view, Number(event.key));
        return;
      }
      if (event.altKey && key === "l") {
        event.preventDefault();
        applyList(view, "ordered");
        return;
      }
      if (event.shiftKey && key === "l") {
        event.preventDefault();
        applyList(view, "bullet");
        return;
      }
      if (event.altKey && key === "q") {
        event.preventDefault();
        applyQuote(view);
        return;
      }
      if (event.altKey && key === "c") {
        event.preventDefault();
        applyCode(view);
        return;
      }
      if (key === "b") {
        event.preventDefault();
        wrapSelection(view, "**");
      } else if (key === "i") {
        event.preventDefault();
        wrapSelection(view, "*");
      } else if (key === "f") {
        event.preventDefault();
        setFindReplace(false);
        setFindOpen(true);
      } else if (key === "h") {
        event.preventDefault();
        setFindReplace(true);
        setFindOpen(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const appearance: ShellAppearance = shellAppearance(
    presentTheme(writing.themeId, writing.warm),
    writing,
    settings.prose_font_size_px,
  );
  onCursor.current = (pos) => {
    setCursor(pos);
    const view = editorRef.current?.view;
    setTableHit(view && modeRef.current !== "preview" ? tableAt(view.state.doc, pos.line, pos.column) : null);
    if (view && modeRef.current !== "preview") {
      setActiveHeading(headingAtLine(headingsRef.current, outlineLine(view))?.id ?? null);
    }
    const block = pickDeepest(blocks.current, pos.line);
    window.queueMicrotask(() => {
      previewRef.current?.highlight(block?.id ?? null);
      editorRef.current?.highlightLines(block ? block.startLine : null, block ? block.endLine : null);
    });
  };
  const commands: PaletteCommand[] = [
    { id: "new", title: "file.new", shortcut: "shortcut.new", run: () => { setPaletteOpen(false); void createDocument(); } },
    { id: "open", title: "file.open", shortcut: "shortcut.open", run: () => { setPaletteOpen(false); void openPath(null); } },
    { id: "folder", title: "file.openFolder", shortcut: "shortcut.openFolder", run: () => { setPaletteOpen(false); void openFolder(); } },
    { id: "save", title: "file.save", shortcut: "shortcut.save", run: () => { setPaletteOpen(false); void save(false); } },
    { id: "save-as", title: "file.saveAs", shortcut: "shortcut.saveAs", run: () => { setPaletteOpen(false); void save(true); } },
    { id: "close", title: "file.closeTab", shortcut: "shortcut.close", run: () => { setPaletteOpen(false); void closeTab(doc.id); } },
    { id: "html", title: "export.html", shortcut: "shortcut.exportHtml", run: () => { setPaletteOpen(false); void exportDocument(); } },
    { id: "pdf", title: "export.pdf", shortcut: "shortcut.exportPdf", run: () => { setPaletteOpen(false); openPdf(); } },
    { id: "split", title: "view.split", shortcut: "shortcut.mode", run: () => { setPaletteOpen(false); void setMode("split"); } },
    { id: "source", title: "view.source", shortcut: "shortcut.mode", run: () => { setPaletteOpen(false); void setMode("source"); } },
    { id: "preview", title: "view.preview", shortcut: "shortcut.mode", run: () => { setPaletteOpen(false); void setMode("preview"); } },
    { id: "find", title: "find.title", shortcut: "shortcut.find", run: () => { setPaletteOpen(false); setFindReplace(false); setFindOpen(true); } },
    { id: "replace", title: "find.replace", shortcut: "shortcut.replace", run: () => { setPaletteOpen(false); setFindReplace(true); setFindOpen(true); } },
    { id: "settings", title: "settings.title", shortcut: "shortcut.settings", run: () => { setPaletteOpen(false); setSettingsOpen(true); } },
  ];
  const openTabs = (tabs.length ? tabs : [doc]).filter((tab) => tab.id).map((tab) => ({
    id: tab.id,
    title: displayTitle(tab.path, tab.title, t("file.untitled")),
    dirty: hasUnsavedChanges(
      tab.id === doc.id ? doc.path : tab.path,
      tab.id === doc.id ? doc.buffer : tab.buffer,
      tab.id === doc.id ? doc.accepted : tab.accepted,
    ),
  }));
  const previewEmpty =
    mode === "source" || doc.buffer.length > 0
      ? null
      : mode === "preview"
        ? t("preview.emptyReading")
        : t("preview.empty");

  return (
    <TooltipProvider>
    <div className={pendingChoice || settingsOpen || paletteOpen || pdfOpen ? "app modal-open" : "app"}>
      <Toolbar
        mode={mode}
        onNew={() => void createDocument()}
        onOpen={() => void openPath(null)}
        onOpenFolder={() => void openFolder()}
        onSave={() => void save(false)}
        onExportHtml={() => void exportDocument()}
        onExportPdf={() => openPdf()}
        onMode={(next) => void setMode(next)}
        onSettings={() => setSettingsOpen(true)}
        onHeading={(level) => format((view) => applyHeading(view, level))}
        onBullet={() => format((view) => applyList(view, "bullet"))}
        onOrdered={() => format((view) => applyList(view, "ordered"))}
        onQuote={() => format((view) => applyQuote(view))}
        onCode={() => format((view) => applyCode(view))}
      />
      {openTabs.length > 0 ? (
        <TabBar
          tabs={openTabs}
          activeId={doc.id}
          onFocus={(id) => showStored(id)}
          onClose={(id) => void closeTab(id)}
        />
      ) : null}
      {findOpen ? (
        <FindBar
          replaceMode={findReplace}
          query={findQuery}
          replacement={replacement}
          caseSensitive={matchCase}
          allowReplace={mode !== "preview"}
          onQuery={setFindQuery}
          onReplacement={setReplacement}
          onCase={setMatchCase}
          onNext={() => applyFind("next")}
          onReplace={() => applyFind("replace")}
          onReplaceAll={() => applyFind("all")}
          onClose={() => setFindOpen(false)}
        />
      ) : null}
      <div className="workspace">
        <Sidebar
          width={sidebarWidth}
          pane={sideTab}
          onPane={setSideTab}
          root={tree.root}
          entries={tree.entries}
          expanded={tree.expanded}
          truncated={tree.truncated}
          activePath={doc.path}
          recent={settings.recent_files}
          documentId={doc.id}
          headings={headings}
          activeHeading={activeHeading}
          onOpenFile={(path) => void openPath(path)}
          onToggleDir={(path) => void toggleDir(path)}
          onOpenRecent={(path) => void openPath(path)}
          onOpenFolder={() => void openFolder()}
          onJump={jumpTo}
        />
        <div className="splitter" onPointerDown={(event) => dragWidth(event, sidebarWidth, setSidebarWidth)} />
        <div className={mode === "preview" ? "editor-pane is-hidden" : "editor-pane"} style={{ flex: mode === "split" ? 1 - previewRatio : 1, minWidth: mode === "preview" ? 0 : 320 }}>
          {tableHit && mode !== "preview" ? (
            <TableHandles
              onRow={(where) => format((view) => insertTableRow(view, where))}
              onColumn={(where) => format((view) => insertTableColumn(view, where))}
            />
          ) : null}
          <div className="editor-host" ref={editorHost} />
        </div>
        {mode === "split" ? <div className="splitter" onPointerDown={(event) => dragRatio(event, setPreviewRatio)} /> : null}
        <div className={mode === "source" ? "preview-wrap is-hidden" : "preview-wrap"} style={{ flex: mode === "split" ? previewRatio : 1, minWidth: mode === "source" ? 0 : 280 }}>
          {outline ? (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                forceFull.current = true;
                void renderNow(docRef.current.buffer);
              }}
            >
              {t("view.forcePreview")}
            </button>
          ) : null}
          <div className="preview-stage">
            <PreviewPane
              ref={previewRef}
              onVisible={onVisible}
              remoteImages={settings.preview.remote_images}
              appearance={appearance}
              title={t("view.previewTitle")}
            />
            {previewEmpty ? (
              <div className="preview-empty">
                <p className="empty-note">{previewEmpty}</p>
              </div>
            ) : null}
          </div>
        </div>
      </div>
      <StatusBar
        title={doc.id ? displayTitle(doc.path, doc.title, t("file.untitled")) : null}
        words={words}
        mode={mode}
        untitled={Boolean(doc.id) && doc.path === null}
        line={cursor.line}
        column={cursor.column}
        newline={doc.newline}
        outline={outline}
        narrow={narrow && settings.view_mode === "split"}
        alert={status}
      />
      <DirtyDialog
        open={pendingChoice !== null}
        many={dirtyMany}
        onChoose={(choice) => {
          pendingChoice?.resolve(choice);
          setPendingChoice(null);
        }}
        onClosed={() => editorRef.current?.view.focus()}
      />
      <Settings
        open={settingsOpen}
        settings={settings}
        writing={writing}
        onPatch={(patch) => void applyPatch(patch)}
        onWriting={setWritingAndSave}
        onClose={() => setSettingsOpen(false)}
        onClosed={() => editorRef.current?.view.focus()}
        onDiagnostics={() => void diagnosticsExport().catch((error) => setStatus(presentError(error)))}
      />
      <PDFExportDialog
        key={doc.id || "none"}
        open={pdfOpen && Boolean(doc.id)}
        documentId={doc.id}
        markdown={doc.buffer}
        documentName={doc.id ? displayTitle(doc.path, doc.title, t("file.untitled")) : ""}
        themeId={writing.themeId}
        warm={writing.warm}
        onClose={() => setPdfOpen(false)}
        onExported={(path) => {
          setStatus(path);
          setPdfOpen(false);
        }}
        onClosed={() => editorRef.current?.view.focus()}
      />
      {paletteOpen ? <CommandPalette commands={commands} onClose={() => setPaletteOpen(false)} /> : null}
    </div>
    </TooltipProvider>
  );
}

function fileTitle(path: string) {
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] || path;
}

function dragWidth(event: { clientX: number }, startWidth: number, setWidth: (value: number) => void) {
  const origin = event.clientX;
  const releaseCursor = holdResizeCursor();
  function move(next: PointerEvent) {
    setWidth(Math.min(420, Math.max(180, startWidth + next.clientX - origin)));
  }
  function up() {
    releaseCursor();
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
  }
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
}

function dragRatio(event: { clientX: number; currentTarget: EventTarget }, setRatio: (value: number) => void) {
  const bounds = (event.currentTarget as HTMLElement).parentElement?.getBoundingClientRect();
  if (!bounds) {
    return;
  }
  const box = bounds;
  const releaseCursor = holdResizeCursor();
  function move(next: PointerEvent) {
    const ratio = (box.right - next.clientX) / box.width;
    setRatio(Math.min(0.7, Math.max(0.25, ratio)));
  }
  function up() {
    releaseCursor();
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
  }
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
}

function holdResizeCursor(): () => void {
  const style = document.createElement("style");
  style.textContent = "* { cursor: ew-resize !important; }";
  document.head.append(style);
  const frames = [...document.getElementsByTagName("iframe")];
  for (const frame of frames) {
    frame.classList.add("pointer-events-disabled");
  }
  return () => {
    style.remove();
    for (const frame of frames) {
      frame.classList.remove("pointer-events-disabled");
    }
  };
}

