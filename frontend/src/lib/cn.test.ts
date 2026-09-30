import { describe, expect, it } from "vitest";
import { cn } from "./cn";

describe("cn", () => {
  it("lets a later spacing class replace an earlier one", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
  });
});
