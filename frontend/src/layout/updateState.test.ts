import { describe, expect, it } from "vitest";
import { formatMegabytes, showUpdateCard } from "./updateState";

describe("update card", () => {
  it("shows the card only while an update needs a decision", () => {
    expect(showUpdateCard({ prompt: true, phase: "update_available" })).toBe(true);
    expect(showUpdateCard({ prompt: true, phase: "downloading" })).toBe(true);
    expect(showUpdateCard({ prompt: true, phase: "downloaded" })).toBe(true);
    expect(showUpdateCard({ prompt: true, phase: "installing" })).toBe(true);
    expect(showUpdateCard({ prompt: false, phase: "downloading" })).toBe(false);
    expect(showUpdateCard({ prompt: true, phase: "idle" })).toBe(false);
    expect(showUpdateCard({ prompt: true, phase: "checking" })).toBe(false);
    expect(showUpdateCard(null)).toBe(false);
  });

  it("formats a download size in megabytes", () => {
    expect(formatMegabytes(0)).toBeNull();
    expect(formatMegabytes(-1)).toBeNull();
    expect(formatMegabytes(1000)).toBe("0.1");
    expect(formatMegabytes(1024 * 1024)).toBe("1.0");
    expect(formatMegabytes(10 * 1024 * 1024)).toBe("10");
    expect(formatMegabytes(Math.round(15.4 * 1024 * 1024))).toBe("15");
  });
});
