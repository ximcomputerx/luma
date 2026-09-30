import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { PDFExportDialog } from "./PDFExportDialog";

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

describe("PDFExportDialog", () => {
  it("shows the studio and a preview error when the desktop command is unavailable", async () => {
    localStorage.removeItem("luma.pdf.v1");
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => {
      root?.render(createElement(PDFExportDialog, {
        open: true,
        documentId: "doc",
        markdown: "",
        documentName: "Untitled",
        themeId: "ivory",
        warm: false,
        onClose: () => undefined,
        onExported: () => undefined,
      }));
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 300));
    });
    expect(document.body.querySelector(".pdf-head")?.hasAttribute("data-dialog-drag")).toBe(true);
    expect(document.body.textContent).toContain("Sample layout");
    expect(document.body.querySelector("[data-template='modern']")?.getAttribute("aria-checked")).toBe("true");
    expect(document.body.querySelector("[role='alert']")?.textContent).toContain("Preview failed");
    expect(document.body.querySelector("iframe")).toBeNull();
  });
});
