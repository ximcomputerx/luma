import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import katexCss from "katex/dist/katex.min.css?raw";
import katexSrc from "katex/dist/katex.min.js?url";
import { useLocale } from "../i18n";
import runtimeSrc from "./shell-runtime.js?url";
import mermaidAsset from "mermaid/dist/mermaid.min.js?url";
import { previewMessages, shellHtml } from "./shell";
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

function assetUrl(url: string): string {
  return new URL(url, window.location.href).href;
}

function readNonce(selector: string): string {
  const el = document.querySelector(selector);
  if (!el) {
    return "";
  }
  const value = (el as HTMLElement & { nonce?: string }).nonce || el.getAttribute("nonce") || "";
  return /^[A-Za-z0-9+/=_-]{1,128}$/.test(value) ? value : "";
}

export const PreviewPane = forwardRef<PreviewHandle, Props>(function PreviewPane(
  { onVisible, remoteImages, appearance, title },
  ref,
) {
  const frame = useRef<HTMLIFrameElement>(null);
  const pending = useRef<PreviewPayload | null>(null);
  const pendingHighlight = useRef<number | null | undefined>(undefined);
  const pendingScroll = useRef<{ renderGen: number; id: number; ratio: number } | null>(null);
  const shellReady = useRef(false);
  const shellEpoch = useRef(0);
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

  function flushShell() {
    if (!shellReady.current) {
      return;
    }
    const payload = pending.current;
    if (payload) {
      post({
        type: "configure",
        remoteImages: remoteRef.current,
        copy: previewMessages(localeRef.current),
      });
      post({
        type: "render",
        render_gen: payload.render_gen,
        mode: payload.mode,
        blocks: payload.blocks,
      });
    }
    if (pendingHighlight.current !== undefined) {
      post({ type: "highlight", id: pendingHighlight.current });
    }
    const scroll = pendingScroll.current;
    if (scroll) {
      post({ type: "scrollTo", render_gen: scroll.renderGen, id: scroll.id, ratio: scroll.ratio });
    }
  }

  function mount(includeMermaid = false) {
    const iframe = frame.current;
    if (!iframe) {
      return;
    }
    shellReady.current = false;
    const token = shellEpoch.current + 1;
    shellEpoch.current = token;
    iframe.onload = () => {
      shellReady.current = true;
      flushShell();
    };
    iframe.srcdoc = shellHtml({
      katexJs: "var katex = {};",
      katexCss,
      runtime: "var runtime = 1;",
      mermaidSrc: includeMermaid ? assetUrl(mermaidAsset) : undefined,
      remoteImages: remoteRef.current,
      appearance: appearanceRef.current,
      lang: localeRef.current,
      copy: previewMessages(localeRef.current),
      token,
      scriptNonce: readNonce("script"),
      styleNonce: readNonce("style"),
      katexSrc: assetUrl(katexSrc),
      runtimeSrc: assetUrl(runtimeSrc),
      scriptOrigin: window.location.origin,
    });
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
    function onMessage(event: MessageEvent) {
      if (event.source !== frame.current?.contentWindow || event.origin !== "null") {
        return;
      }
      const data = event.data as { type?: string; token?: number; render_gen?: number; id?: number; ratio?: number };
      if (data?.type === "ready") {
        if (data.token === shellEpoch.current) {
          shellReady.current = true;
          flushShell();
        }
        return;
      }
      if (data?.type !== "visible" || data.render_gen === undefined || data.id === undefined) {
        return;
      }
      onVisibleRef.current(data.render_gen, data.id, data.ratio ?? 0);
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  useEffect(() => {
    mount(mermaidSource.current !== null);
    return () => {
      shellReady.current = false;
    };
  }, [shellKey, remoteImages, appearanceKey, locale]);

  useImperativeHandle(ref, () => ({
    render(payload) {
      pending.current = payload;
      if (containsDiagram(payload.blocks) && mermaidSource.current === null) {
        mermaidSource.current = mermaidAsset;
        setNotice(null);
        setShellKey((value) => value + 1);
        return;
      }
      flushShell();
    },
    scrollTo(renderGen, id, ratio) {
      pendingScroll.current = { renderGen, id, ratio };
      if (shellReady.current) {
        post({ type: "scrollTo", render_gen: renderGen, id, ratio });
      }
    },
    highlight(id) {
      pendingHighlight.current = id;
      if (shellReady.current) {
        post({ type: "highlight", id });
      }
    },
  }));

  return (
    <div className="preview-wrap">
      {notice ? <p className="notice">{notice}</p> : null}
      <iframe ref={frame} title={title} sandbox="allow-scripts" referrerPolicy="no-referrer" />
    </div>
  );
});
