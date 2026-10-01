import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { setLocaleChoice } from "../../i18n";
import type { Settings as SettingsModel, SettingsPatch } from "../../ipc/types";
import { defaultWriting } from "../../styles/writing";
import { Settings } from "./Settings";

if (typeof PointerEvent === "undefined") {
  globalThis.PointerEvent = class PointerEvent extends MouseEvent {} as unknown as typeof PointerEvent;
}

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const settings: SettingsModel = {
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
  association_prompted: false,
  glass_active: false,
  settings_frozen: false,
};

let root: Root | null = null;
let host: HTMLDivElement | null = null;

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  host?.remove();
  root = null;
  host = null;
  setLocaleChoice("system");
});

function render(onPatch: (patch: SettingsPatch) => void) {
  setLocaleChoice("en-US");
  host ??= document.createElement("div");
  if (!host.isConnected) {
    document.body.appendChild(host);
  }
  root ??= createRoot(host);
  act(() => {
    root?.render(createElement(Settings, {
      open: true,
      settings,
      writing: defaultWriting(),
      onPatch,
      association: "unregistered",
      associationBusy: false,
      onMakeDefault: () => undefined,
      onWriting: () => undefined,
      onClose: () => undefined,
      onDiagnostics: () => undefined,
      update: null,
      updateNotice: "",
      onUpdateCheck: () => undefined,
      onUpdatePolicy: () => undefined,
    }));
  });
}

describe("Settings menus", () => {
  it("groups prose and code fonts into presets and system fonts", async () => {
    render(() => undefined);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    const prose = openMenu("Prose font");
    expect(prose?.textContent).toContain("Presets");
    expect(prose?.textContent).toContain("System");
    expect(prose?.textContent).toContain("Microsoft YaHei");
    expect(prose?.querySelector("[data-selected='true']")?.textContent).toBe("Serif");
    const code = openMenu("Code font");
    expect(code?.textContent).toContain("Consolas");
    expect(code?.textContent).toContain("Courier New");
    expect(code?.querySelector("[data-selected='true']")?.textContent).toBe("Cascadia Code");
  });

  it("opens material, motion, view, and language in the font list menu", async () => {
    const patches: SettingsPatch[] = [];
    render((patch) => {
      patches.push(patch);
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const material = openMenu("Window material");
    expect(material?.classList.contains("luma-menu")).toBe(true);
    expect(material?.querySelector("[data-selected='true']")?.textContent).toBe("Auto");
    choose(material, "Off");
    expect(patches[patches.length - 1]).toEqual({ field: "glass", value: "off" });

    const motion = openMenu("Motion");
    expect(motion?.classList.contains("luma-menu")).toBe(true);
    expect(motion?.querySelector("[data-selected='true']")?.textContent).toBe("Follow system");
    choose(motion, "Reduce motion");
    expect(patches[patches.length - 1]).toEqual({ field: "reduced_motion", value: "on" });

    showSection("Edit");
    const view = openMenu("View");
    expect(view?.classList.contains("luma-menu")).toBe(true);
    expect(view?.querySelector("[data-selected='true']")?.textContent).toBe("Source and preview");
    choose(view, "Source only");
    expect(patches[patches.length - 1]).toEqual({ field: "view_mode", value: "source" });

    showSection("Language");
    const language = openMenu("Language");
    expect(language?.classList.contains("luma-menu")).toBe(true);
    expect(language?.textContent).toContain("简体中文");
    choose(language, "简体中文");
    expect(document.documentElement.lang).toBe("zh-CN");
    expect(document.body.querySelector("button[aria-label='语言']")?.textContent).toContain("简体中文");
  });
});

function showSection(name: string) {
  const button = [...document.body.querySelectorAll("button")].find((node) => node.textContent === name);
  act(() => {
    button?.click();
  });
}

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
