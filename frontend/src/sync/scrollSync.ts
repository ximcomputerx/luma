import { childNodes, type PreviewNode } from "../preview/types";

export type Side = "source" | "preview";

export type SyncBlock = {
  id: number;
  startLine: number;
  endLine: number;
  depth: number;
  order: number;
};

export function flattenPreview(nodes: PreviewNode[], depth = 0, into: SyncBlock[] = []): SyncBlock[] {
  for (const node of nodes) {
    into.push({
      id: node.id,
      startLine: node.source_line,
      endLine: node.end_line,
      depth,
      order: into.length,
    });
    const children = childNodes(node);
    if (children) {
      flattenPreview(children, depth + 1, into);
    }
  }
  return into;
}

export function pickDeepest(blocks: SyncBlock[], line: number): SyncBlock | null {
  let chosen: SyncBlock | null = null;
  for (const block of blocks) {
    if (block.startLine <= line && line <= block.endLine) {
      if (
        !chosen ||
        block.depth > chosen.depth ||
        (block.depth === chosen.depth && block.order >= chosen.order)
      ) {
        chosen = block;
      }
    }
  }
  return chosen;
}

export function ratioForLine(block: SyncBlock, line: number): number {
  const span = Math.max(1, block.endLine - block.startLine);
  const raw = (line - block.startLine) / span;
  if (raw <= 0) {
    return 0;
  }
  if (raw >= 1) {
    return 0.999999;
  }
  return raw;
}

export function lineForRatio(block: SyncBlock, ratio: number): number {
  const span = block.endLine - block.startLine;
  return block.startLine + ratio * span;
}

export class ScrollSync {
  lock: Side | null = null;
  private clearAt: number | null = null;

  userScroll(side: Side, now: number) {
    this.lock = side;
    this.clearAt = now + 80;
  }

  deadline(): number | null {
    return this.clearAt;
  }

  programmaticScroll() {
    // Programmatic movement must not refresh the user lock.
  }

  scrollEnd(side: Side, now: number) {
    if (this.lock !== side) {
      return;
    }
    if (this.clearAt === null || now > this.clearAt) {
      this.clearAt = now;
    }
  }

  expire(now: number) {
    if (this.clearAt !== null && now >= this.clearAt) {
      this.lock = null;
      this.clearAt = null;
    }
  }

  accepts(from: Side): boolean {
    return this.lock === null || this.lock === from;
  }
}
