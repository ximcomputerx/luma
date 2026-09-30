import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

if (typeof PointerEvent === "undefined") {
  globalThis.PointerEvent = class PointerEvent extends MouseEvent {} as unknown as typeof PointerEvent;
}
import { themes } from "../styles/themes";
import { ExportSettings } from "./ExportSettings";
import { applyTemplate, type PdfProfile } from "./pdfProfile";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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

function render(profile: PdfProfile, onChange: (next: PdfProfile) => void) {
  host ??= document.createElement("div");
  if (!host.isConnected) {
    document.body.appendChild(host);
  }
  root ??= createRoot(host);
  act(() => {
    root?.render(createElement(ExportSettings, {
      profile,
      theme: themes.ivory,
      onChange,
    }));
  });
}

describe("ExportSettings", () => {
  it("keeps the academic template checked and marks a later edit as custom", async () => {
    let current = applyTemplate("modern");
    render(current, (next) => {
      current = next;
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    act(() => {
      document.body.querySelector<HTMLButtonElement>("[data-template='academic']")?.click();
    });
    expect(current.template).toBe("academic");
    expect(current.base).toBe("academic");
    expect(current.header).toBe("title");
    expect(current.toc).toBe(true);
    expect(current.codeBreak).toBe("keep");
    render(current, (next) => {
      current = next;
    });
    expect(document.body.querySelector("[data-template='academic']")?.getAttribute("aria-checked")).toBe("true");
    expect(document.body.querySelector("[data-template='modern']")?.getAttribute("aria-checked")).toBe("false");

    const size = document.body.querySelector<HTMLInputElement>("[data-field='font-size']");
    expect(size).toBeTruthy();
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter?.call(size, "18");
      size?.dispatchEvent(new Event("input", { bubbles: true }));
      size?.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(current.fontSizePx).toBe(18);
    expect(current.template).toBe("custom");
    expect(current.base).toBe("academic");
    render(current, (next) => {
      current = next;
    });
    expect(document.body.querySelector("[data-template='academic']")?.getAttribute("aria-checked")).toBe("false");
    expect(document.body.querySelector(".pdf-adjusted")?.textContent).toBeTruthy();
  });

  it("opens the body font list in a menu that shares the settings scrollbar", async () => {
    render(applyTemplate("modern"), () => undefined);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    const trigger = document.body.querySelector<HTMLButtonElement>("button[aria-label='Body']");
    expect(trigger?.classList.contains("font-picker")).toBe(true);
    act(() => {
      trigger?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0, cancelable: true }));
    });
    const menu = document.body.querySelector(".font-picker-menu");
    expect(menu).toBeTruthy();
    expect(menu?.textContent).toContain("Presets");
    expect(menu?.textContent).toContain("Installed");
    expect(menu?.textContent).toContain("System");
    expect(menu?.textContent).toContain("Microsoft YaHei");
    expect(menu?.textContent).toContain("Sans");
    expect(menu?.querySelector("[data-selected='true']")?.textContent).toBe("Sans");
  });

  it("uses the body, heading, and code presets", async () => {
    render(applyTemplate("modern"), () => undefined);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    const heading = openMenu("Heading");
    expect(heading?.textContent).toContain("Match body");
    expect(heading?.textContent).toContain("System");
    expect(heading?.textContent).toContain("Microsoft YaHei");
    expect(heading?.querySelector("[data-selected='true']")?.textContent).toBe("Match body");
    const code = openMenu("Code");
    expect(code?.textContent).toContain("Consolas");
    expect(code?.textContent).toContain("Courier New");
    expect(code?.querySelector("[data-selected='true']")?.textContent).toBe("Cascadia Code");
  });

  it("opens paper, margins, and header in the same font list menu", async () => {
    let current = applyTemplate("modern");
    render(current, (next) => {
      current = next;
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const paper = openMenu("Paper");
    expect(paper?.classList.contains("luma-menu")).toBe(true);
    expect(paper?.querySelector("[data-selected='true']")?.textContent).toBe("A4");
    choose(paper, "Letter");
    expect(current.paper).toBe("letter");

    const margins = openMenu("Margins");
    expect(margins?.classList.contains("luma-menu")).toBe(true);
    expect(margins?.querySelector("[data-selected='true']")?.textContent).toBe("18mm");
    choose(margins, "30mm");
    expect(current.marginMm).toBe(30);

    const header = openMenu("Header");
    expect(header?.classList.contains("luma-menu")).toBe(true);
    expect(header?.querySelector("[data-selected='true']")?.textContent).toBe("Off");
    choose(header, "Filename");
    expect(current.header).toBe("filename");
  });
});

function openMenu(label: string): Element | null {
  const trigger = document.body.querySelector<HTMLButtonElement>(`button[aria-label='${label}']`);
  act(() => {
    trigger?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0, cancelable: true }));
  });
  const menus = document.body.querySelectorAll(".font-picker-menu");
  return menus.item(menus.length - 1);
}

function choose(menu: Element | null, text: string) {
  const item = [...(menu?.querySelectorAll<HTMLElement>("[role='menuitem']") ?? [])].find((node) => node.textContent === text);
  act(() => {
    item?.click();
  });
}
