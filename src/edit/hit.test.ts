import { describe, expect, it } from "vitest";
import { emptyProject } from "../model/project";
import { createUserObject } from "../fill/fill";
import { hitTest, hitTestAll, pointHitsObject } from "./hit";

function projectWith(objects: ReturnType<typeof createUserObject>[]) {
  const p = emptyProject();
  p.objects = objects.filter((o): o is NonNullable<typeof o> => o != null);
  return p;
}

describe("bounds hit-test", () => {
  it("selects an outline by clicking inside, not only on an edge", () => {
    const outline = createUserObject("outline", [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 80 },
      { x: 0, y: 80 },
    ])!;
    const p = projectWith([outline]);
    const hit = hitTest(p, { x: 40, y: 40 }, 1);
    expect(hit?.id).toBe(outline.id);
    expect(pointHitsObject(outline, { x: 200, y: 40 }, null, 8)).toBe(false);
  });

  it("selects stairs by clicking inside the stair rectangle", () => {
    const stairs = createUserObject("existingStairs", [{ x: 10, y: 20 }])!;
    const p = projectWith([stairs]);
    const hit = hitTest(p, { x: 30, y: 20 }, 1);
    expect(hit?.type).toBe("existingStairs");
  });

  it("selects a ledger by clicking near the line, not only on the stroke", () => {
    const ledger = createUserObject("ledger", [
      { x: 0, y: 40 },
      { x: 120, y: 40 },
    ])!;
    const p = projectWith([ledger]);
    const hit = hitTest(p, { x: 60, y: 46 }, 1);
    expect(hit?.type).toBe("ledger");
  });

  it("prefers the smaller object when bounds overlap", () => {
    const outline = createUserObject("outline", [
      { x: 0, y: 0 },
      { x: 200, y: 0 },
      { x: 200, y: 160 },
      { x: 0, y: 160 },
    ])!;
    const stairs = createUserObject("existingStairs", [{ x: 20, y: 40 }])!;
    const p = projectWith([outline, stairs]);
    const hits = hitTestAll(p, { x: 40, y: 40 }, 1);
    expect(hits.length).toBeGreaterThanOrEqual(2);
    expect(hits[0].object.type).toBe("existingStairs");
    expect(hits.map((h) => h.object.type)).toContain("outline");
  });

  it("lists overlapping hits smallest-first for the picker", () => {
    const outline = createUserObject("outline", [
      { x: 0, y: 0 },
      { x: 200, y: 0 },
      { x: 200, y: 160 },
      { x: 0, y: 160 },
    ])!;
    const ledger = createUserObject("ledger", [
      { x: 0, y: 0 },
      { x: 200, y: 0 },
    ])!;
    const post = createUserObject("post", [{ x: 10, y: 4 }])!;
    const p = projectWith([outline, ledger, post]);
    const hits = hitTestAll(p, { x: 10, y: 4 }, 1);
    expect(hits[0].object.type).toBe("post");
    expect(hits.map((h) => h.object.type)).toEqual(expect.arrayContaining(["post", "ledger", "outline"]));
    expect(hits[0].area).toBeLessThan(hits[hits.length - 1].area);
  });
});
