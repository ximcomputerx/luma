import type { SaveRequest } from "../ipc/types";

export type QueueResult =
  | { status: "saved"; path: string; rev: number; bytes: number; root: string }
  | { status: "skipped" }
  | { status: "conflict" }
  | { status: "canceled" }
  | { status: "error"; message: string };

type Job = {
  kind: "manual" | "auto";
  saveAs: boolean;
  resolve: (result: QueueResult) => void;
};

export class SaveQueue {
  documentId = "";
  expectedRev = 1;
  currentBody = "";
  private sending = false;
  private queued: Job | null = null;

  constructor(private send: (request: SaveRequest, kind: "manual" | "auto") => Promise<QueueResult>) {}

  reset(documentId: string, rev: number, body: string) {
    this.documentId = documentId;
    this.expectedRev = rev;
    this.currentBody = body;
    this.sending = false;
    this.queued = null;
  }

  setBody(body: string) {
    this.currentBody = body;
  }

  enqueue(kind: "manual" | "auto", saveAs: boolean): Promise<QueueResult> {
    return new Promise((resolve) => {
      const job: Job = { kind, saveAs, resolve };
      if (this.sending) {
        if (this.queued) {
          this.queued.resolve({ status: "canceled" });
        }
        this.queued = job;
        return;
      }
      this.sending = true;
      void this.run(job);
    });
  }

  private async run(job: Job) {
    const body = this.currentBody;
    const request: SaveRequest = {
      document_id: this.documentId,
      markdown_lf: body,
      rev: this.expectedRev,
      save_as: job.kind === "manual" && job.saveAs,
    };
    let result: QueueResult;
    try {
      result = await this.send(request, job.kind);
    } catch (error) {
      result = { status: "error", message: error instanceof Error ? error.message : "无法完成文件操作。" };
    }
    if (result.status === "saved") {
      this.expectedRev = result.rev;
      if (this.currentBody !== body && this.queued === null) {
        this.queued = { kind: "auto", saveAs: false, resolve: () => undefined };
      }
    }
    job.resolve(result);
    const next = this.queued;
    this.queued = null;
    if (next) {
      await this.run(next);
    } else {
      this.sending = false;
    }
  }
}
