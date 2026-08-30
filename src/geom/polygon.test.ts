import { describe, expect, it } from "vitest";
import { clipLineToPolygon, pointInPolygon, polygonArea } from "./polygon";

describe("polygon", () => {
  const rect = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 6 },
    { x: 0, y: 6 },
  ];

  it("includes boundary points", () => {
    expect(pointInPolygon({ x: 0, y: 0 }, rect)).toBe(true);
    expect(pointInPolygon({ x: 5, y: 0 }, rect)).toBe(true);
    expect(pointInPolygon({ x: 5, y: 3 }, rect)).toBe(true);
    expect(pointInPolygon({ x: 11, y: 3 }, rect)).toBe(false);
  });

  it("clips a line to the rectangle including the far edge", () => {
    const c = clipLineToPolygon({ x: -4, y: 6 }, { x: 14, y: 6 }, rect);
    expect(c).not.toBeNull();
    expect(c!.a.x).toBeLessThan(1);
    expect(c!.b.x).toBeGreaterThan(9);
  });

  it("area is signed", () => {
    expect(Math.abs(polygonArea(rect))).toBe(60);
  });
});
