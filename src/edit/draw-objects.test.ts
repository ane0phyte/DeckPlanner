import { describe, expect, it } from "vitest";
import { createUserObject } from "../fill/fill";
import { deleteSelection, moveHandle, objectHandles } from "./handles";
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

  it("creates stairs from a single click", () => {
    const stairs = createUserObject("stairs", [{ x: 40, y: 50 }]);
    expect(stairs?.type).toBe("stairs");
    if (stairs?.type === "stairs") {
      expect(stairs.origin).toEqual({ x: 40, y: 50 });
      expect(stairs.widthIn).toBe(36);
    }
    const existing = createUserObject("existingStairs", [{ x: 1, y: 2 }]);
    expect(existing?.type).toBe("existingStairs");
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

  it("moves and deletes placed stairs", () => {
    const p = emptyProject();
    const stairs = createUserObject("stairs", [{ x: 10, y: 20 }])!;
    p.objects = [stairs];
    const h = objectHandles(stairs)[0];
    const moved = moveHandle(p, h, { x: 30, y: 40 });
    const o = moved.objects[0];
    expect(o.type).toBe("stairs");
    if (o.type === "stairs") expect(o.origin).toEqual({ x: 30, y: 40 });
    expect(deleteSelection(moved, h).project.objects).toHaveLength(0);
  });
});
