import { describe, expect, it } from "vitest";
import { buildCanvasSelectionRect, isCanvasSelectionGesture, resolveCanvasSelectionIds } from "./canvas-selection";

describe("canvas-selection", () => {
  it("normalizes marquee coordinates regardless of drag direction", () => {
    expect(buildCanvasSelectionRect(120, 96, 40, 12)).toEqual({
      left: 40,
      top: 12,
      width: 80,
      height: 84
    });
  });

  it("distinguishes click from marquee gesture", () => {
    expect(isCanvasSelectionGesture({ left: 10, top: 10, width: 3, height: 4 })).toBe(false);
    expect(isCanvasSelectionGesture({ left: 10, top: 10, width: 8, height: 4 })).toBe(true);
  });

  it("collects ids whose rects intersect the marquee", () => {
    const rect = buildCanvasSelectionRect(10, 10, 240, 180);
    expect(
      resolveCanvasSelectionIds(
        [
          { id: "a", left: 16, top: 16, width: 80, height: 60 },
          { id: "b", left: 110, top: 24, width: 100, height: 100 },
          { id: "c", left: 260, top: 20, width: 80, height: 80 }
        ],
        rect
      )
    ).toEqual(["a", "b"]);
  });
});
