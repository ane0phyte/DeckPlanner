import { describe, expect, it } from "vitest";
import { clipLineToPolygon, clipLineToPolygonSegments, pointInPolygon, polygonArea } from "./polygon";

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

  it("does not bridge a concave notch", () => {
    const u = [
      { x: 0, y: 0 },
      { x: 200, y: 0 },
      { x: 200, y: 160 },
      { x: 160, y: 160 },
      { x: 160, y: 40 },
      { x: 40, y: 40 },
      { x: 40, y: 160 },
      { x: 0, y: 160 },
    ];
    const segs = clipLineToPolygonSegments({ x: -10, y: 100 }, { x: 210, y: 100 }, u);
    expect(segs.length).toBe(2);
    expect(segs.every((s) => pointInPolygon({ x: (s.a.x + s.b.x) / 2, y: (s.a.y + s.b.y) / 2 }, u))).toBe(
      true,
    );
    expect(segs.some((s) => s.a.x < 50 && s.b.x < 50)).toBe(true);
    expect(segs.some((s) => s.a.x > 150 && s.b.x > 150)).toBe(true);
    const longest = clipLineToPolygon({ x: -10, y: 100 }, { x: 210, y: 100 }, u);
    expect(longest).not.toBeNull();
    expect(Math.abs(longest!.b.x - longest!.a.x)).toBeLessThan(50);
  });
});
