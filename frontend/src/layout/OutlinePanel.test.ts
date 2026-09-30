import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { OutlinePanel } from "./OutlinePanel";
import type { OutlineEntry } from "./outline";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const sample: OutlineEntry[] = [
  { id: 1, level: 1, text: "甲", line: 1 },
  { id: 2, level: 2, text: "乙", line: 3 },
  { id: 3, level: 2, text: "丙", line: 5 },
  { id: 4, level: 3, text: "丁", line: 6 },
  { id: 5, level: 1, text: "戊", line: 10 },
];

let root: Root | null = null;
let host: HTMLDivElement | null = null;

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  host?.remove();
  root = null;
  host = null;
});

function render(node: ReturnType<typeof createElement>) {
  host = document.createElement("div");
  host.className = "side-body";
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root?.render(node);
  });
}

function labels() {
  return Array.from(document.body.querySelectorAll(".outline-label")).map((node) => node.textContent);
}

describe("OutlinePanel", () => {
  it("collapses from the arrow and jumps from the title", () => {
    const jumped: OutlineEntry[] = [];
    render(createElement(OutlinePanel, {
      documentId: "one",
      entries: sample,
      activeId: 4,
      onJump: (entry: OutlineEntry) => jumped.push(entry),
    }));
    expect(labels()).toEqual(["甲", "乙", "丙", "丁", "戊"]);
    expect(document.querySelector(".outline-item")?.getAttribute("data-active")).toBe("false");
    const twist = document.body.querySelector<HTMLButtonElement>(".outline-twist[aria-expanded]");
    expect(twist?.getAttribute("aria-expanded")).toBe("true");
    act(() => {
      twist?.click();
    });
    expect(labels()).toEqual(["甲", "戊"]);
    expect(document.querySelector(".outline-item")?.getAttribute("data-active")).toBe("true");
    act(() => {
      document.body.querySelector<HTMLButtonElement>(".outline-label")?.click();
    });
    expect(jumped.map((entry) => entry.id)).toEqual([1]);
    expect(labels()).toEqual(["甲", "戊"]);
    act(() => {
      root?.render(createElement(OutlinePanel, {
        documentId: "two",
        entries: sample,
        activeId: null,
        onJump: (entry: OutlineEntry) => jumped.push(entry),
      }));
    });
    expect(labels()).toEqual(["甲", "乙", "丙", "丁", "戊"]);
  });
});
