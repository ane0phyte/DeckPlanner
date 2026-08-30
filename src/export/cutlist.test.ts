import { describe, expect, it } from "vitest";
import { emptyProject } from "../model/project";
import { createUserObject, fillProject } from "../fill/fill";
import { buildCutList } from "./cutlist";

describe("cut list", () => {
  it("counts layout members and does not invent SKUs", () => {
    const p = emptyProject();
    p.scale = { a: { x: 0, y: 0 }, b: { x: 12, y: 0 }, knownLengthIn: 12 };
    p.settings.decking.productName = "typed decking";
    p.settings.decking.gapIn = 0.125;
    p.settings.decking.maxJoistSpacingIn = 16;
    p.settings.accessories.hangerProduct = "hanger-typed";
    p.objects = [
      createUserObject("outline", [
        { x: 0, y: 0 },
        { x: 144, y: 0 },
        { x: 144, y: 96 },
        { x: 0, y: 96 },
      ])!,
      createUserObject("ledger", [
        { x: 0, y: 0 },
        { x: 144, y: 0 },
      ])!,
    ];
    const filled = fillProject(p).project;
    const list = buildCutList(filled);
    expect(list.lumber.some((r) => r.member === "Joist" && r.qty > 0)).toBe(true);
    expect(list.counts.some((c) => c.item.includes("hangers") && c.product === "hanger-typed")).toBe(true);
    expect(list.lumber.some((r) => r.member.startsWith("Beam") && r.qty > 0)).toBe(true);
    expect(list.accessories.some((a) => a.item.includes("Decking surface") && /sf/.test(a.layoutAmount))).toBe(
      true,
    );
    expect(list.wasteNote).toMatch(/net only/i);
    expect(list.counts.every((c) => !/\b[A-Z]{2,}\d{3,}\b/.test(c.product))).toBe(true);
  });
});
