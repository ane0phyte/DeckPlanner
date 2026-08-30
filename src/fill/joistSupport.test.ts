import { describe, expect, it } from "vitest";
import { joistBaySpansIn, splitSegmentAtLines } from "./joistSupport";

describe("joistSupport", () => {
  it("treats ledger-only joists as one span, not a full-length cantilever", () => {
    const bays = joistBaySpansIn(
      { a: { x: 0, y: 0 }, b: { x: 0, y: 96 } },
      { a: { x: 0, y: 0 }, b: { x: 120, y: 0 } },
      [],
      1,
    );
    expect(bays.supportCount).toBe(1);
    expect(bays.maxBayIn).toBeCloseTo(96);
    expect(bays.cantileverIn).toBe(0);
  });

  it("measures bay and cantilever once a drop beam is present", () => {
    const bays = joistBaySpansIn(
      { a: { x: 0, y: 0 }, b: { x: 0, y: 144 } },
      { a: { x: -10, y: 0 }, b: { x: 10, y: 0 } },
      [{ a: { x: -10, y: 120 }, b: { x: 10, y: 120 } }],
      1,
    );
    expect(bays.supportCount).toBe(2);
    expect(bays.maxBayIn).toBeCloseTo(120);
    expect(bays.cantileverIn).toBeCloseTo(24);
    expect(bays.backSpanIn).toBeCloseTo(120);
  });

  it("splits a board at a breaker seam", () => {
    const pieces = splitSegmentAtLines(
      { x: 0, y: 10 },
      { x: 100, y: 10 },
      [{ a: { x: 40, y: 0 }, b: { x: 40, y: 20 } }],
    );
    expect(pieces).toHaveLength(2);
    expect(pieces[0].b.x).toBeCloseTo(40);
    expect(pieces[1].a.x).toBeCloseTo(40);
  });
});
