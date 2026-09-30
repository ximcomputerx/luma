import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { Dialog, DialogContent } from "./dialog";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

if (typeof PointerEvent === "undefined") {
  globalThis.PointerEvent = class PointerEvent extends MouseEvent {} as unknown as typeof PointerEvent;
}

let root: Root | null = null;
let host: HTMLDivElement | null = null;

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  host?.remove();
  root = null;
  host = null;
  document.head.querySelectorAll("style").forEach((style) => {
    if (style.textContent?.includes("grabbing")) {
      style.remove();
    }
  });
});

function axisOffset(value: string, basis: string): number {
  const compact = value.replace(/\s+/g, "");
  const match = compact.match(/^calc\((.+)\)$/);
  if (!match || !match[1].includes(basis)) {
    throw new Error(value);
  }
  const pixels = match[1].replace(basis, "").match(/([+-]?\d+)px/);
  if (!pixels) {
    throw new Error(value);
  }
  return Number(pixels[1]);
}

function rect(left: number, top: number, width: number, height: number): DOMRect {
  return {
    x: left,
    y: top,
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height,
    toJSON() {
      return {};
    },
  };
}

describe("DialogContent drag", () => {
  it("moves from the title bar and leaves buttons alone", () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1024 });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 768 });
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => {
      root?.render(createElement(Dialog, {
        open: true,
        onOpenChange: () => undefined,
        children: createElement(DialogContent, {
          draggable: true,
          "aria-describedby": undefined,
          children: [
            createElement("div", {
              key: "grip",
              className: "grip",
              "data-dialog-drag": "",
              children: [
                createElement("span", { key: "title" }, "Title"),
                createElement("button", { key: "close", type: "button" }, "Close"),
              ],
            }),
            createElement("p", { key: "body" }, "Body"),
          ],
        }),
      }));
    });
    const dialog = document.body.querySelector(".luma-dialog") as HTMLElement;
    const grip = dialog.querySelector(".grip span") as HTMLElement;
    const button = dialog.querySelector("button") as HTMLButtonElement;
    dialog.getBoundingClientRect = () => rect(200, 100, 400, 300);

    act(() => {
      button.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0, clientX: 500, clientY: 120 }));
      window.dispatchEvent(new PointerEvent("pointermove", { clientX: 560, clientY: 180 }));
      window.dispatchEvent(new PointerEvent("pointerup", { clientX: 560, clientY: 180 }));
    });
    expect(dialog.style.left).toBe("");
    expect(dialog.style.top).toBe("");

    act(() => {
      grip.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0, clientX: 220, clientY: 120 }));
      window.dispatchEvent(new PointerEvent("pointermove", { clientX: 270, clientY: 150 }));
    });
    expect(axisOffset(dialog.style.left, "50%")).toBe(50);
    expect(axisOffset(dialog.style.top, "12vh")).toBe(30);
    expect(document.head.textContent).toContain("grabbing");

    act(() => {
      window.dispatchEvent(new PointerEvent("pointermove", { clientX: 220 - 500, clientY: 120 - 500 }));
      window.dispatchEvent(new PointerEvent("pointerup"));
    });
    expect(axisOffset(dialog.style.left, "50%")).toBe(-192);
    expect(axisOffset(dialog.style.top, "12vh")).toBe(-92);
    expect(document.head.textContent).not.toContain("grabbing");
  });
});
