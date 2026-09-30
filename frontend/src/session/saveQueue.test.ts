import { describe, expect, it } from "vitest";
import type { SaveRequest } from "../ipc/types";
import { SaveQueue, type QueueResult } from "./saveQueue";

function deferred() {
  let resolve: (result: QueueResult) => void = () => undefined;
  const promise = new Promise<QueueResult>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("save queue", () => {
  it("keeps one in-flight save and writes the newer buffer with the new rev", async () => {
    const sent: SaveRequest[] = [];
    const gates = [deferred(), deferred()];
    let calls = 0;
    const queue = new SaveQueue((request) => {
      sent.push(request);
      const gate = gates[calls];
      calls += 1;
      return gate?.promise ?? Promise.resolve({ status: "conflict" });
    });
    queue.reset("doc", 1, "a");
    const first = queue.enqueue("manual", false);
    queue.setBody("ab");
    const second = queue.enqueue("auto", true);
    gates[0]?.resolve({ status: "saved", path: "C:\\notes\\a.md", rev: 2, bytes: 2, root: "C:\\notes" });
    await first;
    expect(sent[0]).toMatchObject({ markdown_lf: "a", rev: 1, save_as: false });
    await Promise.resolve();
    expect(sent[1]).toMatchObject({ markdown_lf: "ab", rev: 2, save_as: false });
    gates[1]?.resolve({ status: "saved", path: "C:\\notes\\a.md", rev: 3, bytes: 3, root: "C:\\notes" });
    await second;
    expect(queue.expectedRev).toBe(3);
  });

  it("does not advance rev when rust rejects the write", async () => {
    const queue = new SaveQueue(async () => ({ status: "conflict" }));
    queue.reset("doc", 4, "text");
    const result = await queue.enqueue("auto", false);
    expect(result.status).toBe("conflict");
    expect(queue.expectedRev).toBe(4);
  });
});
