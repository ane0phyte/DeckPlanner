import { describe, expect, it } from "vitest";
import {
  areaWithWaste,
  cutRowHighlighted,
  measureLengthIn,
  offsetFromOriginIn,
  qtyWithWaste,
} from "./measure";

describe("measure vs scale", () => {
  it("reports feet-inches from scale without changing the scale mark", () => {
    const scale = { a: { x: 0, y: 0 }, b: { x: 12, y: 0 }, knownLengthIn: 12 };
    const iPerU = scale.knownLengthIn / 12;
    const len = measureLengthIn({ x: 0, y: 0 }, { x: 126, y: 0 }, iPerU);
    expect(len).toBe(126);
    expect(scale.knownLengthIn).toBe(12);
    expect(scale.b).toEqual({ x: 12, y: 0 });
  });
});

describe("origin XY", () => {
  it("reports inches from a known origin", () => {
    const origin = { x: 100, y: 50 };
    const iPerU = 1;
    const off = offsetFromOriginIn({ x: 247, y: 146 }, origin, iPerU);
    expect(off.xIn).toBe(147);
    expect(off.yIn).toBe(96);
  });
});

describe("waste percent", () => {
  it("leaves quantities unchanged at empty or 0", () => {
    expect(qtyWithWaste(10, null)).toBe(10);
    expect(qtyWithWaste(10, 0)).toBe(10);
    expect(areaWithWaste(80, null)).toBe(80);
    expect(areaWithWaste(80, 0)).toBe(80);
  });

  it("adds 10% to decking area and rounds lumber up to whole pieces", () => {
    expect(areaWithWaste(80, 10)).toBeCloseTo(88);
    expect(qtyWithWaste(10, 10)).toBe(11);
    expect(qtyWithWaste(1, 10)).toBe(2);
  });
});

describe("cut-list row highlight", () => {
  it("matches when a selected id is on the row", () => {
    expect(cutRowHighlighted(["a", "b"], ["b"])).toBe(true);
    expect(cutRowHighlighted(["a", "b"], ["c"])).toBe(false);
    expect(cutRowHighlighted(["a"], [])).toBe(false);
  });
});
