import { describe, expect, it } from "vitest";
import { emptyProject } from "../model/project";
import { createUserObject } from "../fill/fill";
import {
  collectHandles,
  deleteSelection,
  hitHandle,
  moveHandle,
  translateObject,
} from "./handles";

function outlineProject() {
  const p = emptyProject();
  const outline = createUserObject("outline", [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 80 },
    { x: 0, y: 80 },
  ]);
  p.objects = [outline!];
  return p;
}

describe("handles", () => {
  it("collects a handle per outline vertex", () => {
    const p = outlineProject();
    const hs = collectHandles(p);
    expect(hs.filter((h) => h.kind === "vertex")).toHaveLength(4);
  });

  it("hits a vertex in preference to nearby empty space", () => {
    const p = outlineProject();
    const hs = collectHandles(p);
    const hit = hitHandle(hs, { x: 2, y: 2 }, 8);
    expect(hit?.kind).toBe("vertex");
    expect(hit && hit.kind === "vertex" && hit.index).toBe(0);
  });

  it("moves a vertex without moving the others", () => {
    const p = outlineProject();
    const handle = collectHandles(p).find((h) => h.kind === "vertex" && h.index === 1)!;
    const next = moveHandle(p, handle, { x: 120, y: 10 });
    const o = next.objects[0];
    expect(o.type).toBe("outline");
    if (o.type === "outline") {
      expect(o.points[1]).toEqual({ x: 120, y: 10 });
      expect(o.points[0]).toEqual({ x: 0, y: 0 });
    }
  });

  it("deletes a vertex and keeps a valid polygon", () => {
    const p = outlineProject();
    const handle = collectHandles(p).find((h) => h.kind === "vertex" && h.index === 1)!;
    const r = deleteSelection(p, handle);
    const o = r.project.objects[0];
    expect(o.type).toBe("outline");
    if (o.type === "outline") expect(o.points).toHaveLength(3);
  });

  it("deletes the outline when vertices drop below 3", () => {
    let p = outlineProject();
    for (let i = 0; i < 2; i++) {
      const v = collectHandles(p).find((h) => h.kind === "vertex")!;
      p = deleteSelection(p, v).project;
    }
    expect(p.objects.filter((o) => o.type === "outline")).toHaveLength(0);
  });

  it("deletes the whole outline object", () => {
    const p = outlineProject();
    const r = deleteSelection(p, { kind: "object", objectId: p.objects[0].id });
    expect(r.project.objects).toHaveLength(0);
  });

  it("moves and deletes a no-dig point", () => {
    const p = emptyProject();
    const pt = createUserObject("nodigPoint", [{ x: 10, y: 10 }])!;
    p.objects = [pt];
    const h = collectHandles(p).find((x) => x.kind === "origin")!;
    const moved = moveHandle(p, h, { x: 40, y: 50 });
    const o = moved.objects[0];
    expect(o.type).toBe("nodigPoint");
    if (o.type === "nodigPoint") expect(o.origin).toEqual({ x: 40, y: 50 });
    const gone = deleteSelection(moved, h);
    expect(gone.project.objects).toHaveLength(0);
  });

  it("moves scale-bar ends and deletes scale", () => {
    const p = emptyProject();
    p.scale = { a: { x: 0, y: 0 }, b: { x: 12, y: 0 }, knownLengthIn: 12 };
    const h = collectHandles(p).find((x) => x.kind === "scale" && x.end === "b")!;
    const moved = moveHandle(p, h, { x: 24, y: 0 });
    expect(moved.scale?.b).toEqual({ x: 24, y: 0 });
    expect(moved.scale?.knownLengthIn).toBe(12);
    const gone = deleteSelection(moved, h);
    expect(gone.project.scale).toBeNull();
  });

  it("moves and clears the plan origin datum", () => {
    const p = emptyProject();
    p.origin = { x: 10, y: 20 };
    const h = collectHandles(p).find((x) => x.kind === "datum")!;
    const moved = moveHandle(p, h, { x: 30, y: 40 });
    expect(moved.origin).toEqual({ x: 30, y: 40 });
    expect(moved.scale).toBeNull();
    const gone = deleteSelection(moved, h);
    expect(gone.project.origin).toBeNull();
  });

  it("translates the whole outline", () => {
    const p = outlineProject();
    const next = translateObject(p, p.objects[0].id, { x: 5, y: -3 });
    const o = next.objects[0];
    if (o.type === "outline") {
      expect(o.points[0]).toEqual({ x: 5, y: -3 });
      expect(o.points[2]).toEqual({ x: 105, y: 77 });
    }
  });
});
