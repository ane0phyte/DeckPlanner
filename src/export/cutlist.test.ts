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

  it("leaves decking area at net on the cut list; shopping list adds typed waste", () => {
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
    const shop = buildShoppingList(p);
    expect(shop.lines.some((l) => /Trex/.test(l.text) && /158\.4/.test(l.text) && /10%/.test(l.text))).toBe(true);
    expect(shop.note).toMatch(/10%/);
    const hangers = buildCutList(p).counts.find((c) => c.item.includes("hangers"))!;
    expect(hangers.qty).toBe(net.counts.find((c) => c.item.includes("hangers"))!.qty);
  });

  it("groups identical posts on the shopping list as one line", () => {
    const p = emptyProject();
    p.scale = { a: { x: 0, y: 0 }, b: { x: 12, y: 0 }, knownLengthIn: 12 };
    const a = createUserObject("post", [{ x: 0, y: 0 }])! as PostObject;
    const b = createUserObject("post", [{ x: 10, y: 0 }])! as PostObject;
    a.nominalSize = "6x6";
    b.nominalSize = "6x6";
    p.objects = [a, b];
    const shop = buildShoppingList(p);
    const postLines = shop.lines.filter((l) => /6x6/.test(l.text) && /post/i.test(l.text));
    expect(postLines).toHaveLength(1);
    expect(postLines[0].text).toMatch(/^2 — 6x6 posts$/);
    expect(postLines[0].objectIds).toHaveLength(2);
  });

  it("rounds shopping lumber counts up with typed waste and does not invent post length", () => {
    const p = emptyProject();
    p.scale = { a: { x: 0, y: 0 }, b: { x: 12, y: 0 }, knownLengthIn: 12 };
    const a = createUserObject("post", [{ x: 0, y: 0 }])! as PostObject;
    const b = createUserObject("post", [{ x: 10, y: 0 }])! as PostObject;
    a.nominalSize = "6x6";
    b.nominalSize = "6x6";
    p.objects = [a, b];
    p.settings.wastePercent = 10;
    const shop = buildShoppingList(p);
    const postLines = shop.lines.filter((l) => /6x6/.test(l.text) && /post/i.test(l.text));
    expect(postLines).toHaveLength(1);
    expect(postLines[0].text).toMatch(/^3 — 6x6 posts$/);
    p.settings.heights.deckIn = 72;
    p.settings.heights.gradeIn = 0;
    p.settings.wastePercent = null;
    const withH = buildShoppingList(p).lines.filter((l) => /6x6/.test(l.text));
    expect(withH).toHaveLength(1);
    expect(withH[0].text).toMatch(/^2 — 6x6 × 6'$/);
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
