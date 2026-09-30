import { describe, expect, it } from "vitest";
import { wrapPreview } from "./previewFrame";

const printHtml = `<!DOCTYPE html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src data:"></head><body><div class="sheet"></div></body></html>`;

describe("preview frame", () => {
  it("swaps the print CSP and escapes pager labels", () => {
    const wrapped = wrapPreview(printHtml, { prev: "上一页", next: "<script>", ink: "#2C2822" });
    expect(wrapped).toContain("script-src 'unsafe-inline'");
    expect(wrapped).not.toContain("script-src 'none'");
    expect(wrapped).toContain("上一页");
    expect(wrapped).toContain("&lt;script&gt;");
    expect(wrapped).not.toContain("data-page-next><script>");
    expect(wrapped.match(/<script/gi)?.length).toBe(1);
    expect(wrapped).toContain("scrollHeight");
    expect(wrapped).toContain(".pager{color:#2C2822}");
    expect(wrapped).toContain(".spread{scrollbar-width:thin;scrollbar-color:transparent transparent;}");
    expect(wrapped).toContain("border-radius:20px");
    expect(wrapped).toContain("color-mix(in srgb,#2C2822 45%,transparent)");
    expect(wrapped).toContain("color-mix(in srgb,#2C2822 70%,transparent)");
  });

  it("leaves a document alone when it is not a print file", () => {
    const bare = "<html><body><p>x</p></body></html>";
    expect(wrapPreview(bare, { prev: "Prev", next: "Next", ink: "red" })).toBe(bare);
    expect(wrapPreview(bare, { prev: "Prev", next: "Next", ink: "#112233" })).not.toContain("<script");
  });

  it("falls back when the pager ink is not a hex color", () => {
    const wrapped = wrapPreview(printHtml, { prev: "A", next: "B", ink: "red" });
    expect(wrapped).toContain(".pager{color:#2c2822}");
    expect(wrapped).toContain("color-mix(in srgb,#2c2822 45%,transparent)");
  });

  it("uses the theme thumb and control radius for the page scroller", () => {
    const wrapped = wrapPreview(printHtml, {
      prev: "A",
      next: "B",
      ink: "#2C2822",
      thumb: "#5C656D",
      radius: "20px",
    });
    expect(wrapped).toContain("color-mix(in srgb,#5C656D 45%,transparent)");
    expect(wrapped).toContain("border-radius:20px");
  });

  it("drops a thumb or radius that is not a plain color or length", () => {
    const wrapped = wrapPreview(printHtml, {
      prev: "A",
      next: "B",
      ink: "#2C2822",
      thumb: "#112233;}",
      radius: "20px;}",
    });
    expect(wrapped).toContain("color-mix(in srgb,#2C2822 45%,transparent)");
    expect(wrapped).toContain("border-radius:20px;}.spread:hover");
    expect(wrapped).not.toContain("#112233");
    expect(wrapped).not.toContain("20px;};");
  });
});
