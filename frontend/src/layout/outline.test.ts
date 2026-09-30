import { describe, expect, it } from "vitest";
import { headingAtLine, outlineEntries, visibleActiveId, visibleOutline, type OutlineEntry } from "./outline";
import type { PreviewNode } from "../preview/types";

const sample: OutlineEntry[] = [
  { id: 1, level: 1, text: "A", line: 1 },
  { id: 2, level: 2, text: "B", line: 3 },
  { id: 3, level: 2, text: "C", line: 5 },
  { id: 4, level: 3, text: "D", line: 6 },
  { id: 5, level: 1, text: "A", line: 10 },
  { id: 6, level: 2, text: "B", line: 12 },
];

describe("outline", () => {
  it("reads headings from a full tree and from the outline fallback", () => {
    const blocks: PreviewNode[] = [
      {
        id: 1,
        source_line: 1,
        end_line: 1,
        body: { type: "heading", level: 2, inlines: [{ type: "text", text: "第一节" }] },
      },
      {
        id: 4,
        source_line: 8,
        end_line: 8,
        body: { type: "outline_heading", level: 3, text: "降级" },
      },
    ];
    expect(outlineEntries(blocks)).toEqual([
      { id: 1, level: 2, text: "第一节", line: 1 },
      { id: 4, level: 3, text: "降级", line: 8 },
    ]);
  });

  it("follows the last heading at or above a line", () => {
    expect(headingAtLine(sample, 0)).toBeNull();
    expect(headingAtLine(sample, 1)?.id).toBe(1);
    expect(headingAtLine(sample, 4)?.id).toBe(2);
    expect(headingAtLine(sample, 9)?.id).toBe(4);
    expect(headingAtLine(sample, 12)?.id).toBe(6);
  });

  it("hides descendants when a heading is collapsed", () => {
    const open = visibleOutline(sample, new Set());
    expect(open.map((row) => row.entry.id)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(open.map((row) => row.hasChildren)).toEqual([true, false, true, false, true, false]);
    expect(new Set(open.map((row) => row.key)).size).toBe(open.length);

    const first = open[0].key;
    const folded = visibleOutline(sample, new Set([first]));
    expect(folded.map((row) => row.entry.id)).toEqual([1, 5, 6]);
    expect(folded[0].collapsed).toBe(true);

    const nested = visibleOutline(sample, new Set([open[2].key]));
    expect(nested.map((row) => row.entry.id)).toEqual([1, 2, 3, 5, 6]);
    expect(visibleActiveId(sample, new Set([first]), 4)).toBe(1);
  });
});
