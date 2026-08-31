import { describe, expect, it } from "vitest";
import { emptyProject } from "../model/project";
import { createUserObject } from "../fill/fill";
import {
  axisAlignSegment,
  constrainDeltaToAxes,
  maybeSnapSecondPoint,
  nudgeDeltaWorld,
  snapSecondPoint,
} from "./ortho";
import { translateObject } from "./handles";
import { resolveSelectClick } from "./hit";
import { hitTestAll } from "./hit";

describe("overlap picker then move", () => {
  it("starts a drag of the already-selected object instead of reopening the picker", () => {
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
    const p = emptyProject();
    p.objects = [outline, ledger];
    const hits = hitTestAll(p, { x: 80, y: 4 }, 1);
    expect(hits.length).toBeGreaterThanOrEqual(2);
    const fresh = resolveSelectClick(false, hits, []);
    expect(fresh.kind).toBe("picker");
    const afterPick = resolveSelectClick(false, hits, [ledger.id]);
    expect(afterPick.kind).toBe("object");
    if (afterPick.kind === "object") expect(afterPick.id).toBe(ledger.id);
  });
});

describe("arrow-key nudge", () => {
  it("moves an object 1 inch per tap in world space", () => {
    const p = emptyProject();
    p.scale = { a: { x: 0, y: 0 }, b: { x: 12, y: 0 }, knownLengthIn: 12 };
    const post = createUserObject("post", [{ x: 10, y: 20 }])!;
    p.objects = [post];
    const delta = nudgeDeltaWorld("ArrowRight", 1, 6, false)!;
    expect(delta.x).toBe(1);
    expect(delta.y).toBe(0);
    const next = translateObject(p, post.id, delta);
    const moved = next.objects[0];
    expect(moved.type).toBe("post");
    if (moved.type === "post") expect(moved.origin.x).toBe(11);
  });
});

describe("orthogonal snap", () => {
  it("places a breaker perpendicular to the ledger", () => {
    const p = emptyProject();
    const ledger = createUserObject("ledger", [
      { x: 0, y: 10 },
      { x: 100, y: 10 },
    ])!;
    p.objects = [ledger];
    const a = { x: 40, y: 10 };
    const raw = { x: 70, y: 55 };
    const b = snapSecondPoint(a, raw, "breaker", p);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const ang = Math.abs(Math.atan2(dy, dx));
    expect(Math.abs(ang - Math.PI / 2) < 1e-6 || Math.abs(ang - (3 * Math.PI) / 2) < 1e-6 || Math.abs(dx) < 1e-6).toBe(
      true,
    );
    expect(Math.abs(dx)).toBeLessThan(1e-6);
    expect(Math.abs(dy)).toBeGreaterThan(10);
  });

  it("places or moves a ledger onto world X or Y", () => {
    const p = emptyProject();
    const a = { x: 10, y: 20 };
    const raw = { x: 80, y: 22 };
    const b = snapSecondPoint(a, raw, "ledger", p);
    expect(Math.abs(b.y - a.y)).toBeLessThan(1e-6);
    expect(Math.abs(b.x - a.x)).toBeGreaterThan(10);
    const aligned = axisAlignSegment({ x: 0, y: 0 }, { x: 50, y: 0.8 });
    expect(Math.abs(aligned.a.y - aligned.b.y)).toBeLessThan(1e-6);
  });

  it("allows a diagonal beam when ortho is off", () => {
    const p = emptyProject();
    p.settings.orthoSnap = false;
    const a = { x: 0, y: 0 };
    const raw = { x: 30, y: 20 };
    expect(maybeSnapSecondPoint(a, raw, "beam", p)).toEqual(raw);
    p.settings.orthoSnap = true;
    const constrained = maybeSnapSecondPoint(a, raw, "beam", p);
    expect(constrained.y === 0 || constrained.x === 0).toBe(true);
  });

  it("Shift+arrow uses snapIncrementIn (else 6 in)", () => {
    expect(nudgeDeltaWorld("ArrowUp", 1, 6, true)).toEqual({ x: 0, y: -6 });
    expect(nudgeDeltaWorld("ArrowLeft", 2, 0, true)).toEqual({ x: -3, y: 0 });
  });

  it("constrains object translation to the ledger axes", () => {
    const p = emptyProject();
    p.objects = [
      createUserObject("ledger", [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ])!,
    ];
    const d = constrainDeltaToAxes({ x: 12, y: 3 }, p);
    expect(Math.abs(d.y)).toBeLessThan(1e-6);
    expect(d.x).toBeCloseTo(12);
  });
});
