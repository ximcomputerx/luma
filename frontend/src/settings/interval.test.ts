import { describe, expect, it } from "vitest";
import { autosaveMs } from "./interval";

describe("autosaveMs", () => {
  it("stores one and a half seconds as 1500", () => {
    expect(autosaveMs(1.5)).toBe(1500);
  });

  it("rejects values outside 0.5 to 10 seconds", () => {
    expect(autosaveMs(0.4)).toBeNull();
    expect(autosaveMs(10.1)).toBeNull();
    expect(autosaveMs(Number.NaN)).toBeNull();
  });
});
