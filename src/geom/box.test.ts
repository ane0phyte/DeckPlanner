import { describe, expect, it } from "vitest";
import {
  boxFromCorners,
  pointInOrientedBox,
  resizeBoxCorner,
  rotateBoxToward,
  translateBox,
} from "./box";

describe("oriented box", () => {
  it("builds a centered axis-aligned box from two corners", () => {
    const box = boxFromCorners({ x: 10, y: 20 }, { x: 90, y: 60 });
    expect(box).toEqual({ origin: { x: 50, y: 40 }, angleDeg: 0, length: 80, width: 40 });
  });

  it("rejects a degenerate drag", () => {
    expect(boxFromCorners({ x: 0, y: 0 }, { x: 2, y: 10 })).toBeNull();
    expect(boxFromCorners({ x: 0, y: 0 }, { x: 80, y: 0 })).toBeNull();
  });

  it("hits the cover area, not only the origin", () => {
    const box = boxFromCorners({ x: 0, y: 0 }, { x: 80, y: 40 })!;
    expect(pointInOrientedBox({ x: 40, y: 20 }, box)).toBe(true);
    expect(pointInOrientedBox({ x: 4, y: 4 }, box)).toBe(true);
    expect(pointInOrientedBox({ x: 200, y: 20 }, box)).toBe(false);
  });

  it("resizes from a corner and rotates around the center", () => {
    const box = boxFromCorners({ x: 0, y: 0 }, { x: 80, y: 40 })!;
    const grown = resizeBoxCorner(box, 0, { x: 100, y: 60 });
    expect(grown.length).toBeGreaterThan(80);
    expect(grown.width).toBeGreaterThan(40);
    const moved = translateBox(box, { x: 5, y: -2 });
    expect(moved.origin).toEqual({ x: 45, y: 18 });
    const turned = rotateBoxToward(box, { x: 80, y: 20 });
    expect(turned.angleDeg).toBe(90);
  });
});
