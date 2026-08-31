import { describe, expect, it } from "vitest";
import { emptyProject } from "../model/project";
import { createUserObject, fillProject } from "../fill/fill";
import { buildCutList, buildShoppingList } from "./cutlist";
import type { PostObject } from "../model/types";

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
        { x: 144, y: 144 },
        { x: 0, y: 144 },
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
    expect(list.wasteNote).toMatch(/net/i);
    expect(list.counts.every((c) => !/\b[A-Z]{2,}\d{3,}\b/.test(c.product))).toBe(true);
    expect(list.counts.some((c) => c.item.startsWith("Post hole") && /XY \(/.test(c.notes))).toBe(true);
    expect(list.lumber.some((r) => r.member === "Decking" && r.qty > 0)).toBe(true);
  });

  it("leaves decking area at net on the cut list; shopping packs boards not a typed waste %", () => {
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
      createUserObject("board", [
        { x: 0, y: 0 },
        { x: 72, y: 0 },
      ])!,
      createUserObject("board", [
        { x: 0, y: 6 },
        { x: 72, y: 6 },
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
    const shop = buildShoppingList(p);
    expect(shop.lines.some((l) => /Trex/.test(l.text))).toBe(false);
    expect(shop.lines.some((l) => /158\.4/.test(l.text))).toBe(false);
    expect(shop.note).not.toMatch(/10%/);
    expect(shop.wasteSummary).not.toMatch(/10%/);
    expect(shop.lines.filter((l) => /decking × 12'/.test(l.text))).toHaveLength(1);
    expect(shop.lines.find((l) => /decking × 12'/.test(l.text))!.text).toMatch(/^1 — decking × 12'$/);
    expect(shop.lines.some((l) => /decking × 16'/.test(l.text))).toBe(false);
    expect(shop.wasteSummary).toMatch(/decking waste/);
    const hangers = buildCutList(p).counts.find((c) => c.item.includes("hangers"))!;
    expect(hangers.qty).toBe(net.counts.find((c) => c.item.includes("hangers"))!.qty);
  });

  it("groups identical unset-height posts as 8' stock", () => {
    const p = emptyProject();
    p.scale = { a: { x: 0, y: 0 }, b: { x: 12, y: 0 }, knownLengthIn: 12 };
    const a = createUserObject("post", [{ x: 0, y: 0 }])! as PostObject;
    const b = createUserObject("post", [{ x: 10, y: 0 }])! as PostObject;
    a.nominalSize = "6x6";
    b.nominalSize = "6x6";
    p.objects = [a, b];
    const shop = buildShoppingList(p);
    const postLines = shop.lines.filter((l) => /6x6/.test(l.text));
    expect(postLines).toHaveLength(1);
    expect(postLines[0].text).toMatch(/^2 — 6x6 × 8'$/);
    expect(postLines[0].objectIds).toHaveLength(2);
  });

  it("ignores typed waste percent; unset posts stay 8'; two 6' posts pack onto one 12'", () => {
    const p = emptyProject();
    p.scale = { a: { x: 0, y: 0 }, b: { x: 12, y: 0 }, knownLengthIn: 12 };
    const a = createUserObject("post", [{ x: 0, y: 0 }])! as PostObject;
    const b = createUserObject("post", [{ x: 10, y: 0 }])! as PostObject;
    a.nominalSize = "6x6";
    b.nominalSize = "6x6";
    p.objects = [a, b];
    p.settings.wastePercent = 10;
    const shop = buildShoppingList(p);
    const postLines = shop.lines.filter((l) => /6x6/.test(l.text));
    expect(postLines).toHaveLength(1);
    expect(postLines[0].text).toMatch(/^2 — 6x6 × 8'$/);
    expect(shop.lines.some((l) => /× 10'/.test(l.text) || /× 20'/.test(l.text))).toBe(false);
    p.settings.heights.deckIn = 72;
    p.settings.heights.gradeIn = 0;
    p.settings.wastePercent = null;
    const withH = buildShoppingList(p).lines.filter((l) => /6x6/.test(l.text));
    expect(withH).toHaveLength(1);
    expect(withH[0].text).toMatch(/^1 — 6x6 × 12'$/);
  });

  it("buys a 12' 2x8 for a 9'-6\" joist, not a 16'", () => {
    const p = emptyProject();
    p.scale = { a: { x: 0, y: 0 }, b: { x: 12, y: 0 }, knownLengthIn: 12 };
    p.objects = [
      createUserObject("joist", [
        { x: 0, y: 0 },
        { x: 114, y: 0 },
      ])!,
    ];
    const shop = buildShoppingList(p);
    const lumber = shop.lines.filter((l) => l.kind === "lumber");
    expect(lumber.some((l) => /^1 — 2x8 × 12'$/.test(l.text))).toBe(true);
    expect(lumber.some((l) => /× 10'/.test(l.text) || /× 16'/.test(l.text) || /× 20'/.test(l.text))).toBe(
      false,
    );
    expect(shop.wasteSummary).toMatch(/2x8 waste/);
    expect(shop.waste[0]?.leftoverIn).toBeGreaterThan(0);
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
