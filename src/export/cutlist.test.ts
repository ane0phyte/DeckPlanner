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
    expect(list.counts.some((c) => c.item.startsWith("Post hole") && /XY \(/.test(c.notes))).toBe(true);
    expect(list.lumber.some((r) => r.member === "Decking" && r.qty > 0)).toBe(true);
  });

  it("leaves decking area at net when waste is empty or 0, and adds 10% when typed", () => {
    const p = emptyProject();
    p.scale = { a: { x: 0, y: 0 }, b: { x: 12, y: 0 }, knownLengthIn: 12 };
    p.settings.decking.productName = "Trex";
    p.settings.decking.gapIn = 0;
    p.settings.decking.maxJoistSpacingIn = 16;
    p.settings.decking.boardWidthIn = 5.5;
    p.objects = [
      createUserObject("outline", [
        { x: 0, y: 0 },
        { x: 144, y: 0 },
        { x: 144, y: 144 },
        { x: 0, y: 144 },
      ])!,
    ];
    const net = buildCutList(p);
    const deckNet = net.accessories.find((a) => a.item.includes("Decking surface"))!;
    expect(deckNet.layoutAmount).toMatch(/144\.0 sf net/);
    expect(deckNet.layoutAmount).not.toMatch(/w\//);
    p.settings.wastePercent = 0;
    expect(buildCutList(p).accessories.find((a) => a.item.includes("Decking surface"))!.layoutAmount).toMatch(
      /144\.0 sf net$/,
    );
    p.settings.wastePercent = 10;
    const wasted = buildCutList(p);
    const deckW = wasted.accessories.find((a) => a.item.includes("Decking surface"))!;
    expect(deckW.layoutAmount).toMatch(/144\.0 sf net → 158\.4 sf w\/ 10%/);
    expect(wasted.wasteNote).toMatch(/10%/);
    const hangers = wasted.counts.find((c) => c.item.includes("hangers"))!;
    expect(hangers.qty).toBe(net.counts.find((c) => c.item.includes("hangers"))!.qty);
  });

  it("puts object ids on lumber rows so a click can select them", () => {
    const p = emptyProject();
    p.scale = { a: { x: 0, y: 0 }, b: { x: 12, y: 0 }, knownLengthIn: 12 };
    p.settings.decking.productName = "typed";
    p.settings.decking.gapIn = 0.125;
    p.settings.decking.maxJoistSpacingIn = 16;
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
    const joistRow = list.lumber.find((r) => r.member === "Joist");
    expect(joistRow?.objectIds.length).toBeGreaterThan(0);
    expect(filled.objects.some((o) => o.id === joistRow!.objectIds[0])).toBe(true);
  });
});
