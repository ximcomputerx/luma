import { beforeEach, describe, expect, it } from "vitest";
import katex from "katex";
import paneSource from "./PreviewPane.tsx?raw";
import runtime from "./shell-runtime.js?raw";
import { shellAppearance } from "../styles/appearance";
import { presentTheme } from "../styles/themes";
import { defaultWriting } from "../styles/writing";
import { assertClassicBundle, escapeScriptClose, shellHtml } from "./shell";

describe("preview shell", () => {
  it("escapes a closing script tag before inlining", () => {
    expect(escapeScriptClose("ok</ScRiPt>")).toBe("ok<\\/script>");
  });

  it("rejects a bundle that still imports relative chunks", () => {
    expect(() => assertClassicBundle('import("./chunks/x.js")', "mermaid")).toThrow(/相对 import/);
  });

  it("puts the child CSP in the shell and does not allow same origin", () => {
    const html = shellHtml({ katexJs: "var katex = {};", katexCss: "", runtime: "var runtime = 1;" });
    expect(html).toContain("connect-src 'none'");
    expect(html).toContain("script-src 'unsafe-inline'");
    expect(html).toContain("max-width: 40rem");
    expect(html).toContain("scrollbar-width: thin");
    expect(html).toContain("var lumaRemoteImages = false");
    expect(html).toContain("var lumaCopy =");
    expect(html).toContain('lang="en-US"');
    expect(html).not.toContain("allow-same-origin");
    expect(html).not.toContain('securityLevel: "loose"');
  });

  it("applies the reading measure and refuses to inject css", () => {
    const appearance = shellAppearance(
      presentTheme("forest", false),
      { ...defaultWriting(), measureRem: 52, lineHeight: 2, proseFont: "song", codeFont: "consolas" },
      18,
    );
    const html = shellHtml({
      katexJs: "var katex = {};",
      katexCss: "",
      runtime: "var runtime = 1;",
      appearance,
    });
    expect(html).toContain("max-width: 52rem");
    expect(html).toContain("font: 18px/2");
    expect(html).toContain(appearance.bg);
    expect(html).toContain(appearance.proseFont);
    expect(html).toContain("connect-src 'none'");
    expect(html).not.toContain("allow-same-origin");
    const hostile = shellHtml({
      katexJs: "var katex = {};",
      katexCss: "",
      runtime: "var runtime = 1;",
      appearance: { ...appearance, fg: "#aabbcc; } body { background: url(https://evil.example) }", measure: "999rem" },
    });
    expect(hostile).not.toContain("evil.example");
    expect(hostile).toContain("max-width: 40rem");
    expect(hostile).toContain("connect-src 'none'");
    const family = shellAppearance(presentTheme("ivory", false), { ...defaultWriting(), proseFont: "微软雅黑", codeFont: "Cascadia Code" }, 16);
    const withFamily = shellHtml({
      katexJs: "var katex = {};",
      katexCss: "",
      runtime: "var runtime = 1;",
      appearance: family,
    });
    expect(withFamily).toContain('"微软雅黑"');
    expect(withFamily).toContain('"Cascadia Code"');
    const breakout = shellHtml({
      katexJs: "var katex = {};",
      katexCss: "",
      runtime: "var runtime = 1;",
      appearance: { ...family, proseFont: "Arial; } body { background: url(https://evil.example)" },
    });
    expect(breakout).not.toContain("evil.example");
    expect(breakout).toContain("Iowan Old Style");
  });

  it("tells the shell when remote images are enabled", () => {
    const html = shellHtml({
      katexJs: "var katex = {};",
      katexCss: "",
      runtime: "var runtime = 1;",
      remoteImages: true,
    });
    expect(html).toContain("var lumaRemoteImages = true");
    expect(html).toContain("img-src data: https:");
    expect(html).not.toContain("allow-same-origin");
  });
});

describe("shell DOM", () => {
  beforeEach(() => {
    const global = window as unknown as { lumaCopy?: unknown; lumaRemoteImages?: boolean };
    delete global.lumaCopy;
    delete global.lumaRemoteImages;
    document.body.innerHTML = '<div id="root"></div>';
    window.eval(runtime);
  });

  it("describes a mermaid parse error with the reported line and the original message", () => {
    const shell = (
      window as unknown as {
        RustmarkShell: {
          diagramFailure: (source: string, error: { message?: string }) => { title: string; detail: string };
        };
      }
    ).RustmarkShell;
    const source = "flowchart LR\n    A --> B\n    B -->\n";
    const failure = shell.diagramFailure(source, {
      message: "Parse error on line 3:\nExpecting 'NODE_STRING', got 'EOF'",
    });
    expect(failure.title).toBe("Mermaid syntax error, check line 3");
    expect(failure.detail).toContain("Parse error on line 3:");
    expect(failure.detail).not.toBe("Syntax error in text");
    const outOfRange = shell.diagramFailure(source, { message: "Parse error on line 9:\nExpecting 'NODE_STRING'" });
    expect(outOfRange.title).toBe("Mermaid syntax error");
    expect(outOfRange.detail).toContain("line 9");
  });

  it("keeps mermaid strict and does not render through innerHTML", () => {
    expect(runtime).toContain('securityLevel: "strict"');
    expect(runtime).toContain("htmlLabels: false");
    expect(runtime).toContain("suppressErrorRendering: true");
    expect(runtime).not.toContain('securityLevel: "loose"');
    expect(runtime).not.toContain('securityLevel: "antiscript"');
    expect(runtime).not.toContain("innerHTML");
    const html = shellHtml({ katexJs: "var katex = {};", katexCss: "", runtime });
    expect(html).toContain("connect-src 'none'");
    expect(html).toContain("script-src 'unsafe-inline'");
    expect(html).not.toContain("allow-same-origin");
    expect(html).not.toContain("unsafe-eval");
    expect(paneSource).toContain('sandbox="allow-scripts"');
    expect(paneSource).not.toContain("allow-same-origin");
  });

  it("drops script, foreignObject, and javascript hrefs from mermaid svg", () => {
    const shell = (
      window as unknown as {
        RustmarkShell: { filterSvg: (svg: string) => Element | null };
      }
    ).RustmarkShell;
    const node = shell.filterSvg(
      `<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><image href="javascript:alert(1)"></image><foreignObject><img onerror="alert(1)"></foreignObject></svg>`,
    );
    expect(node?.querySelector("script")).toBeNull();
    expect(node?.querySelector("foreignObject")).toBeNull();
    expect(node?.querySelector("image")?.getAttribute("href")).toBeNull();
    expect(node?.querySelector("img")).toBeNull();
    expect(node?.querySelector("[onerror]")).toBeNull();
  });

  it("keeps links inert and does not call a missing image remote", () => {
    const shell = (
      window as unknown as {
        RustmarkShell: { renderBlock: (node: object, depth: number) => Element };
      }
    ).RustmarkShell;
    const node = shell.renderBlock(
      {
        id: 1,
        source_line: 1,
        end_line: 1,
        body: {
          type: "paragraph",
          inlines: [
            { type: "link", children: [{ type: "text", text: "文档" }] },
            { type: "image", alt: "", src: null },
            { type: "image", alt: "封面", src: "javascript:alert(1)" },
          ],
        },
      },
      0,
    );
    expect(node.querySelector("a")).toBeNull();
    expect(node.querySelector(".link")?.getAttribute("title")).toBe("Links stay in the document");
    expect(node.querySelector(".link")?.textContent).toBe("文档");
    const holders = node.querySelectorAll(".placeholder");
    expect(holders[0]?.textContent).toBe("Image not shown");
    expect(holders[0]?.getAttribute("title")).toBe("Image not shown");
    expect(holders[1]?.textContent).toBe("封面");
    expect(node.querySelector("img")).toBeNull();
    const shown = shell.renderBlock(
      {
        id: 3,
        source_line: 1,
        end_line: 1,
        body: {
          type: "paragraph",
          inlines: [{ type: "image", alt: "图", src: "data:image/png;base64,AAAA" }],
        },
      },
      0,
    );
    expect(shown.querySelector("img")?.getAttribute("src")).toBe("data:image/png;base64,AAAA");
    const svg = shell.renderBlock(
      {
        id: 4,
        source_line: 1,
        end_line: 1,
        body: {
          type: "paragraph",
          inlines: [{ type: "image", alt: "矢", src: "data:image/svg+xml;base64,PHN2Zy8+" }],
        },
      },
      0,
    );
    expect(svg.querySelector("img")).toBeNull();
    expect(svg.textContent).toBe("矢");
  });

  it("draws a page break instead of printing the command", () => {
    const shell = (
      window as unknown as {
        RustmarkShell: { renderBlock: (node: object, depth: number) => HTMLElement };
      }
    ).RustmarkShell;
    const marker = shell.renderBlock(
      {
        id: 8,
        source_line: 4,
        end_line: 4,
        body: { type: "paragraph", inlines: [{ type: "text", text: "\\pagebreak" }] },
      },
      0,
    );
    expect(marker.className).toBe("page-break");
    expect(marker.getAttribute("role")).toBe("separator");
    expect(marker.textContent).toBe("Page break");
    expect(marker.textContent).not.toContain("\\");
    expect(marker.getAttribute("data-start")).toBe("4");
    const prose = shell.renderBlock(
      {
        id: 9,
        source_line: 5,
        end_line: 5,
        body: { type: "paragraph", inlines: [{ type: "text", text: "see \\pagebreak later" }] },
      },
      0,
    );
    expect(prose.tagName).toBe("P");
    expect(prose.textContent).toContain("\\pagebreak");
    const html = shellHtml({ katexJs: "var katex = {};", katexCss: "", runtime: "var runtime = 1;" });
    expect(html).toContain(".page-break");
    expect(html).toContain("Page break");
  });

  it("calls a missing image local only after remote images are enabled", () => {
    const global = window as unknown as { lumaRemoteImages?: boolean; lumaCopy?: Record<string, string> };
    global.lumaRemoteImages = true;
    const shell = (
      window as unknown as {
        RustmarkShell: { renderBlock: (node: object, depth: number) => Element };
      }
    ).RustmarkShell;
    const node = shell.renderBlock(
      {
        id: 2,
        source_line: 1,
        end_line: 1,
        body: { type: "paragraph", inlines: [{ type: "image", alt: "", src: null }] },
      },
      0,
    );
    expect(node.querySelector(".placeholder")?.textContent).toBe("Local image not shown");
    global.lumaCopy = {
      mermaidSyntax: "Mermaid 图语法错误",
      mermaidSyntaxLine: "Mermaid 图语法错误，请检查第 {line} 行",
    };
    const titled = (
      window as unknown as {
        RustmarkShell: {
          diagramFailure: (source: string, error: { message?: string }) => { title: string };
        };
      }
    ).RustmarkShell.diagramFailure("flowchart LR\n    A --> B\n    B -->\n", {
      message: "Parse error on line 3:\nExpecting 'NODE_STRING', got 'EOF'",
    });
    expect(titled.title).toBe("Mermaid 图语法错误，请检查第 3 行");
    delete global.lumaRemoteImages;
    delete global.lumaCopy;
  });
});

describe("katex trust boundary", () => {
  const options = {
    throwOnError: false,
    trust: false,
    strict: "ignore" as const,
    maxSize: 10,
    maxExpand: 1000,
  };

  function parse(tex: string) {
    const html = katex.renderToString(tex, options);
    return new DOMParser().parseFromString(html, "text/html");
  }

  it("does not emit images or scripts for untrusted commands", () => {
    for (const tex of ["\\includegraphics{https://evil.test/a.png}", "\\htmlData{x=1}"]) {
      const doc = parse(tex);
      expect(doc.querySelector("script")).toBeNull();
      expect(doc.querySelector("img")).toBeNull();
      expect(doc.querySelector("[onerror]")).toBeNull();
    }
  });

  it("rejects a size bomb without throwing", () => {
    expect(() => parse("\\rule{100000em}{100000em}")).not.toThrow();
  });
});
