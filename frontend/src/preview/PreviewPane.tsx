import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import katexCss from "katex/dist/katex.min.css?raw";
import katexJs from "katex/dist/katex.min.js?raw";
import { t, useLocale } from "../i18n";
import runtime from "./shell-runtime.js?raw";
import { assertClassicBundle, previewMessages, shellHtml } from "./shell";
import { containsDiagram, type PreviewPayload } from "./types";
import type { ShellAppearance } from "../styles/appearance";

export type PreviewHandle = {
  render: (payload: PreviewPayload) => void;
  scrollTo: (renderGen: number, id: number, ratio: number) => void;
  highlight: (id: number | null) => void;
};

type VisibleHandler = (renderGen: number, id: number, ratio: number) => void;

type Props = {
  onVisible: VisibleHandler;
  remoteImages: boolean;
  appearance: ShellAppearance;
  title: string;
};

export const PreviewPane = forwardRef<PreviewHandle, Props>(function PreviewPane(
  { onVisible, remoteImages, appearance, title },
  ref,
) {
  const frame = useRef<HTMLIFrameElement>(null);
  const pending = useRef<PreviewPayload | null>(null);
  const mermaidSource = useRef<string | null>(null);
  const onVisibleRef = useRef(onVisible);
  onVisibleRef.current = onVisible;
  const remoteRef = useRef(remoteImages);
  const appearanceRef = useRef(appearance);
  remoteRef.current = remoteImages;
  appearanceRef.current = appearance;
  const [notice, setNotice] = useState<string | null>(null);
  const [shellKey, setShellKey] = useState(0);
  const locale = useLocale().locale;
  const localeRef = useRef(locale);
  localeRef.current = locale;

  function post(message: object) {
    frame.current?.contentWindow?.postMessage(message, "*");
  }

  function mount(extraMermaid?: string) {
    const iframe = frame.current;
    if (!iframe) {
      return;
    }
    const html = shellHtml({
      katexJs,
      katexCss,
      runtime,
      mermaidJs: extraMermaid,
      remoteImages: remoteRef.current,
      appearance: appearanceRef.current,
      lang: localeRef.current,
      copy: previewMessages(localeRef.current),
    });
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    iframe.onload = () => {
      URL.revokeObjectURL(url);
      const payload = pending.current;
      if (!payload) {
        return;
      }
      post({
        type: "render",
        render_gen: payload.render_gen,
        mode: payload.mode,
        blocks: payload.blocks,
      });
    };
    iframe.src = url;
  }

  const appearanceKey = [
    appearance.fg,
    appearance.heading,
    appearance.bg,
    appearance.muted,
    appearance.border,
    appearance.accent,
    appearance.link,
    appearance.codeBg,
    appearance.fontSize,
    appearance.lineHeight,
    appearance.measure,
    appearance.proseFont,
    appearance.codeFont,
  ].join("\n");

  useEffect(() => {
    mount(mermaidSource.current ?? undefined);
  }, [shellKey, remoteImages, appearanceKey, locale]);

  useImperativeHandle(ref, () => ({
    render(payload) {
      pending.current = payload;
      if (containsDiagram(payload.blocks) && !mermaidSource.current) {
        void import("mermaid/dist/mermaid.min.js?raw")
          .then((mod) => {
            assertClassicBundle(mod.default, "mermaid.min.js");
            mermaidSource.current = mod.default;
            setNotice(null);
            setShellKey((value) => value + 1);
          })
          .catch((error: unknown) => {
            setNotice(error instanceof Error ? error.message : t("preview.mermaidBundle"));
            post({
              type: "render",
              render_gen: payload.render_gen,
              mode: payload.mode,
              blocks: payload.blocks,
            });
          });
        return;
      }
      post({
        type: "render",
        render_gen: payload.render_gen,
        mode: payload.mode,
        blocks: payload.blocks,
      });
    },
    scrollTo(renderGen, id, ratio) {
      post({ type: "scrollTo", render_gen: renderGen, id, ratio });
    },
    highlight(id) {
      post({ type: "highlight", id });
    },
  }));

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.source !== frame.current?.contentWindow || event.origin !== "null") {
        return;
      }
      const data = event.data as { type?: string; render_gen?: number; id?: number; ratio?: number };
      if (data?.type !== "visible" || data.render_gen === undefined || data.id === undefined) {
        return;
      }
      onVisibleRef.current(data.render_gen, data.id, data.ratio ?? 0);
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  return (
    <div className="preview-wrap">
      {notice ? <p className="notice">{notice}</p> : null}
      <iframe ref={frame} title={title} sandbox="allow-scripts" referrerPolicy="no-referrer" />
    </div>
  );
});
