import { describe, expect, it } from "vitest";
import { lineForRatio, pickDeepest, ratioForLine, ScrollSync, type SyncBlock } from "./scrollSync";

const codeBlock: SyncBlock = {
  id: 1,
  startLine: 1,
  endLine: 200,
  depth: 0,
  order: 0,
};

describe("scroll sync ratio", () => {
  it("keeps the middle of a 200-line block away from line 1", () => {
    const ratio = ratioForLine(codeBlock, 100);
    const back = lineForRatio(codeBlock, ratio);
    expect(back).toBeGreaterThan(50);
    expect(Math.round(back)).not.toBe(1);
  });

  it("picks the deepest block that contains the line", () => {
    const list: SyncBlock = { id: 1, startLine: 3, endLine: 5, depth: 0, order: 0 };
    const item: SyncBlock = { id: 2, startLine: 3, endLine: 3, depth: 1, order: 1 };
    expect(pickDeepest([list, item], 3)?.id).toBe(2);
  });
});

describe("scroll lock", () => {
  it("refreshes on user scroll and ignores programmatic scroll", () => {
    const sync = new ScrollSync();
    sync.userScroll("source", 0);
    sync.programmaticScroll();
    expect(sync.accepts("preview")).toBe(false);
    sync.expire(79);
    expect(sync.lock).toBe("source");
    sync.expire(80);
    expect(sync.lock).toBeNull();
  });

  it("keeps the lock until scrollend when that is later", () => {
    const sync = new ScrollSync();
    sync.userScroll("preview", 0);
    sync.scrollEnd("preview", 200);
    sync.expire(80);
    expect(sync.lock).toBe("preview");
    sync.expire(200);
    expect(sync.lock).toBeNull();
  });
});
