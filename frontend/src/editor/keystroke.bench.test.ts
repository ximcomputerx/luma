import { markdown } from "@codemirror/lang-markdown";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { describe, expect, it } from "vitest";

function generate(target: number): string {
  let out = "";
  let index = 0;
  while (out.length < target) {
    index += 1;
    out += `# Heading ${index}\n\nParagraph ${index} with **bold** and \`code\`.\n\n`;
  }
  return out.slice(0, target);
}

function percentile(samples: number[], p: number): number {
  const sorted = [...samples].sort((left, right) => left - right);
  return sorted[Math.round((sorted.length - 1) * p)] ?? 0;
}

describe("editor dispatch budget", () => {
  it("inserts into a 1 MiB document", () => {
    const parent = document.createElement("div");
    document.body.appendChild(parent);
    const view = new EditorView({
      parent,
      state: EditorState.create({
        doc: generate(1024 * 1024),
        extensions: [markdown()],
      }),
    });
    const samples: number[] = [];
    for (let index = 0; index < 21; index += 1) {
      const started = performance.now();
      view.dispatch({ changes: { from: view.state.doc.length, insert: "x" } });
      const elapsed = performance.now() - started;
      if (index > 0) {
        samples.push(elapsed);
      }
    }
    const p99 = percentile(samples, 0.99);
    console.log(`jsdom 1 MiB dispatch p99 ${p99.toFixed(2)} ms`);
    view.destroy();
    parent.remove();
    expect(p99).toBeLessThan(50);
  }, 30_000);
});
