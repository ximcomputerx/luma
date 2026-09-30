import { beforeAll, describe, expect, it } from "vitest";
import { JSDOM } from "jsdom";
import mermaidBundle from "mermaid/dist/mermaid.min.js?raw";
import runtime from "./shell-runtime.js?raw";
import { assertClassicBundle } from "./shell";

const SOURCES = {
  basic: "flowchart LR\n    A --> B\n",
  label: "flowchart LR\n    A[开始] --> B[结束]\n",
  sequence: "sequenceDiagram\n    Alice->>Bob: Hello\n",
  invalid: "flowchart LR\n    A -->\n",
};

function installLayoutStubs(target: typeof globalThis) {
  const box = {
    x: 0,
    y: 0,
    width: 48,
    height: 16,
    top: 0,
    left: 0,
    right: 48,
    bottom: 16,
    toJSON() {
      return this;
    },
  };
  const svgProto = target.SVGElement.prototype as SVGElement & {
    getBBox(): DOMRect;
    getComputedTextLength(): number;
  };
  svgProto.getBBox = () => box as unknown as DOMRect;
  svgProto.getComputedTextLength = () => 48;
  target.HTMLElement.prototype.getBoundingClientRect = () => box as unknown as DOMRect;
}

let page!: typeof globalThis;

function shell() {
  return (
    page as unknown as {
      RustmarkShell: { renderBlock: (node: object, depth: number) => HTMLElement };
    }
  ).RustmarkShell;
}

async function renderSource(source: string) {
  const host = shell().renderBlock(
    {
      id: 1,
      source_line: 1,
      end_line: 4,
      body: { type: "diagram", engine: "mermaid", source },
    },
    0,
  );
  page.document.body.appendChild(host);
  const started = Date.now();
  while (Date.now() - started < 20000) {
    if (host.querySelector("svg") || host.querySelector(".diagram-error")) {
      return host;
    }
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  throw new Error(`diagram did not settle: ${host.textContent?.slice(0, 200)}`);
}

function textOf(host: HTMLElement) {
  return [...host.querySelectorAll("text")].map((node) => node.textContent ?? "").filter(Boolean);
}

describe("mermaid bundle", () => {
  it("loads the classic mermaid 12.0.0 IIFE", () => {
    expect(mermaidBundle).toContain("12.0.0");
    expect(mermaidBundle).toContain('globalThis["mermaid"]');
    expect(mermaidBundle).not.toMatch(/import\s*\(\s*['"]\.\//);
    expect(() => assertClassicBundle(mermaidBundle, "mermaid.min.js")).not.toThrow();
  });
});

describe("mermaid diagrams", () => {
  beforeAll(() => {
    const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
      runScripts: "dangerously",
      pretendToBeVisual: true,
      url: "https://luma.local/preview",
    });
    page = dom.window;
    installLayoutStubs(page);
    for (const source of [mermaidBundle, runtime]) {
      const script = page.document.createElement("script");
      script.textContent = source;
      page.document.body.appendChild(script);
    }
  });

  it("renders flowchart, labeled flowchart, and sequence text", async () => {
    const basic = await renderSource(SOURCES.basic);
    expect(textOf(basic)).toEqual(expect.arrayContaining(["A", "B"]));
    expect(basic.querySelector("foreignObject")).toBeNull();
    expect(basic.querySelector("script")).toBeNull();
    expect(basic.textContent).not.toContain("Syntax error in text");

    const label = await renderSource(SOURCES.label);
    expect(textOf(label)).toEqual(expect.arrayContaining(["开始", "结束"]));
    expect(label.querySelector("foreignObject")).toBeNull();

    const sequence = await renderSource(SOURCES.sequence);
    const sequenceText = textOf(sequence);
    expect(sequenceText).toEqual(expect.arrayContaining(["Alice", "Bob", "Hello"]));
    expect(sequence.querySelector("script")).toBeNull();
  }, 30000);

  it("shows a syntax message for an invalid flowchart and does not keep the error graphic", async () => {
    const host = await renderSource(SOURCES.invalid);
    const title = host.querySelector(".diagram-error")?.textContent ?? "";
    expect(title.startsWith("Mermaid syntax error")).toBe(true);
    expect(host.querySelector(".diagram-error-detail")?.textContent).toContain("Parse error");
    expect(host.textContent).not.toContain("Syntax error in text");
    const leftovers = [...page.document.querySelectorAll("svg")].filter((svg) =>
      (svg.textContent ?? "").includes("Syntax error in text"),
    );
    expect(leftovers).toHaveLength(0);
    expect(host.querySelector("script")).toBeNull();
  }, 20000);
});
