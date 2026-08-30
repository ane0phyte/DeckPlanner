import { describe, expect, it } from "vitest";
import { createUserObject } from "../fill/fill";
import { createBoxObject } from "./typedBox";
import { deleteSelection, moveHandle, objectHandles, translateObject } from "./handles";
import { emptyProject } from "../model/project";

describe("draw ledger and stairs", () => {
  it("creates a ledger from two clicks", () => {
    const ledger = createUserObject("ledger", [
      { x: 0, y: 0 },
      { x: 120, y: 0 },
    ]);
    expect(ledger?.type).toBe("ledger");
    if (ledger?.type === "ledger") {
      expect(ledger.a).toEqual({ x: 0, y: 0 });
      expect(ledger.b).toEqual({ x: 120, y: 0 });
      expect(ledger.nominalSize).toBe("2x8");
      expect(ledger.bandRimType).toBe("2in-solid-sawn-spf-or-better");
    }
  });

  it("does not create a ledger from one point", () => {
    expect(createUserObject("ledger", [{ x: 0, y: 0 }])).toBeNull();
  });

  it("creates stairs from two box corners, not a single click", () => {
    expect(createUserObject("stairs", [{ x: 40, y: 50 }])).toBeNull();
    expect(createUserObject("existingStairs", [{ x: 1, y: 2 }])).toBeNull();
    const stairs = createUserObject("stairs", [
      { x: 0, y: 0 },
      { x: 80, y: 40 },
    ]);
    expect(stairs?.type).toBe("stairs");
    if (stairs?.type === "stairs") {
      expect(stairs.origin).toEqual({ x: 40, y: 20 });
      expect(stairs.length).toBe(80);
      expect(stairs.width).toBe(40);
      expect(stairs.widthIn).toBeNull();
      expect(stairs.label).toBe("Stairs");
    }
    const existing = createUserObject("existingStairs", [
      { x: 10, y: 10 },
      { x: 50, y: 50 },
    ]);
    expect(existing?.type).toBe("stairs");
  });

  it("moves and deletes a ledger endpoint", () => {
    const p = emptyProject();
    const ledger = createUserObject("ledger", [
      { x: 0, y: 0 },
      { x: 80, y: 0 },
    ])!;
    p.objects = [ledger];
    const end = objectHandles(ledger).find((h) => h.kind === "endpoint" && h.end === "b")!;
    const moved = moveHandle(p, end, { x: 90, y: 4 });
    const o = moved.objects[0];
    expect(o.type).toBe("ledger");
    if (o.type === "ledger") expect(o.b).toEqual({ x: 90, y: 4 });
    const gone = deleteSelection(moved, end);
    expect(gone.project.objects).toHaveLength(0);
  });

  it("resizes, rotates, moves, and deletes a stair box", () => {
    const p = emptyProject();
    const stairs = createBoxObject("stairs", { x: 0, y: 0 }, { x: 80, y: 40 })!;
    p.objects = [stairs];
    const handles = objectHandles(stairs);
    expect(handles.filter((h) => h.kind === "box-corner")).toHaveLength(4);
    expect(handles.some((h) => h.kind === "rotate")).toBe(true);
    const corner = handles.find((h) => h.kind === "box-corner" && h.index === 0)!;
    const resized = moveHandle(p, corner, { x: 100, y: 50 });
    const r = resized.objects[0];
    expect(r.type).toBe("stairs");
    if (r.type === "stairs") {
      expect(r.length).toBeGreaterThan(80);
      expect(r.width).toBeGreaterThan(40);
    }
    const rot = objectHandles(resized.objects[0]).find((h) => h.kind === "rotate")!;
    const turned = moveHandle(resized, rot, { x: 200, y: 20 });
    const t = turned.objects[0];
    expect(t.type).toBe("stairs");
    if (t.type === "stairs") expect(t.angleDeg).not.toBe(0);
    const shifted = translateObject(turned, stairs.id, { x: 10, y: 5 });
    const s = shifted.objects[0];
    if (s.type === "stairs") {
      expect(s.origin.x).toBeGreaterThan(t.type === "stairs" ? t.origin.x : 0);
    }
    expect(deleteSelection(shifted, { kind: "object", objectId: stairs.id }).project.objects).toHaveLength(0);
  });
});
