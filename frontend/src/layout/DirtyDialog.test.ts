import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { t } from "../i18n";
import { DirtyDialog, type DirtyChoice } from "./DirtyDialog";

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

function render(node: ReturnType<typeof createElement>) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root?.render(node);
  });
}

function buttonNamed(label: string) {
  return Array.from(document.body.querySelectorAll("button")).find((item) => item.textContent === label);
}

describe("DirtyDialog", () => {
  it("reports save and does not treat escape as a choice", () => {
    const choices: DirtyChoice[] = [];
    render(createElement(DirtyDialog, { open: true, onChoose: (choice) => choices.push(choice) }));
    const save = buttonNamed(t("file.saveAction"));
    expect(save).toBeTruthy();
    act(() => {
      save?.click();
    });
    expect(choices).toEqual(["save"]);
    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(choices).toEqual(["save"]);
  });
});
