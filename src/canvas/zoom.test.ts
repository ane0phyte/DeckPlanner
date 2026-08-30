import { describe, expect, it } from "vitest";
import { worldFromScreen, zoomView, type View } from "./render";

describe("canvas zoom", () => {
  it("keeps the world point under the cursor fixed", () => {
    const view: View = { panX: 40, panY: 40, scale: 0.6 };
    const sx = 200;
    const sy = 150;
    const before = worldFromScreen(sx, sy, view);
    const next = zoomView(view, sx, sy, 1.08);
    const after = worldFromScreen(sx, sy, next);
    expect(after.x).toBeCloseTo(before.x, 8);
    expect(after.y).toBeCloseTo(before.y, 8);
    expect(next.scale).toBeCloseTo(0.6 * 1.08, 8);
  });

  it("clamps scale", () => {
    expect(zoomView({ panX: 0, panY: 0, scale: 11.8 }, 0, 0, 1.08).scale).toBe(12);
    expect(zoomView({ panX: 0, panY: 0, scale: 0.051 }, 0, 0, 0.92).scale).toBe(0.05);
  });
});
