import { describe, expect, it } from "vitest";
import { computeVirtualWindow } from "./report-virtual";

describe("computeVirtualWindow", () => {
  it("returns only visible subset with overscan", () => {
    const items = Array.from({ length: 300 }, () => ({ height: 50 }));
    const result = computeVirtualWindow(items, 0, 500, 100);

    expect(result.totalHeight).toBe(15000);
    expect(result.visible.length).toBeLessThan(300);
    expect(result.visible[0]?.top).toBe(0);
    expect(result.visible[result.visible.length - 1]?.top).toBeLessThanOrEqual(600);
  });

  it("scrolls to middle region and keeps top offsets consistent", () => {
    const items = Array.from({ length: 300 }, () => ({ height: 50 }));
    const result = computeVirtualWindow(items, 5000, 500, 100);

    expect(result.visible.length).toBeGreaterThan(0);
    const first = result.visible[0]!;
    const last = result.visible[result.visible.length - 1]!;
    expect(first.top).toBeGreaterThanOrEqual(4800);
    expect(first.top).toBeLessThanOrEqual(4900);
    expect(last.top).toBeLessThanOrEqual(5600);
  });
});
