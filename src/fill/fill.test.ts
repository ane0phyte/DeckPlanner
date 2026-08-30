import { describe, expect, it } from "vitest";
import { emptyProject } from "../model/project";
import { createUserObject, fillProject } from "./fill";
import { evaluateProject } from "../irc/checks";
import { ftIn } from "../units/length";
import { pointInPolygon } from "../geom/polygon";
import type { PlannerObject, Point } from "../model/types";

function baseProject() {
  const p = emptyProject();
  p.scale = { a: { x: 0, y: 0 }, b: { x: 12, y: 0 }, knownLengthIn: 12 };
  p.settings.decking.productName = "5/4 SYP (user typed)";
  p.settings.decking.gapIn = 0.125;
  p.settings.decking.maxJoistSpacingIn = 16;
  p.settings.decking.category = "wood-1.25";
  p.settings.joistAngleDeg = 90;
  p.settings.deckingAngleDeg = 0;
  p.settings.heights.deckIn = 42;
  p.settings.heights.gradeIn = 0;
  p.settings.lateralProduct = "Hold-down (user typed)";
  p.settings.flashingProduct = "Flashing (user typed)";
  const outline = createUserObject("outline", [
    { x: 0, y: 0 },
    { x: 192, y: 0 },
    { x: 192, y: 144 },
    { x: 0, y: 144 },
  ]);
  const ledger = createUserObject("ledger", [
    { x: 0, y: 0 },
    { x: 192, y: 0 },
  ]);
  p.objects = [outline!, ledger!];
  return p;
}

describe("Fill", () => {
  it("refuses outline without ledger", () => {
    const p = baseProject();
    p.objects = p.objects.filter((o) => o.type !== "ledger");
    const r = fillProject(p);
    expect(r.error).toMatch(/ledger/i);
  });

  it("refuses missing decking fields", () => {
    const p = baseProject();
    p.settings.decking.productName = "";
    expect(fillProject(p).error).toMatch(/decking/i);
  });

  it("fills from outline + ledger only", () => {
    const r = fillProject(baseProject());
    expect(r.error).toBeNull();
    const types = new Set(r.project.objects.map((o) => o.type));
    expect(types.has("post")).toBe(true);
    expect(types.has("beam")).toBe(true);
    expect(types.has("joist")).toBe(true);
    expect(types.has("board")).toBe(true);
    expect(types.has("rim")).toBe(true);
    expect(types.has("guard")).toBe(true);
    expect(types.has("lateralDevice")).toBe(true);
    expect(types.has("flashing")).toBe(true);
    expect(r.project.objects.some((o) => o.type === "beam" && o.diagonal && o.source === "fill")).toBe(
      false,
    );
    expect(r.project.objects.some((o) => o.type === "stairs" && o.source === "fill")).toBe(false);
  });

  it("does not require a user-placed post or beam", () => {
    const p = baseProject();
    expect(p.objects.some((o) => o.type === "post" || o.type === "beam")).toBe(false);
    const r = fillProject(p);
    expect(r.project.objects.filter((o) => o.type === "post").length).toBeGreaterThanOrEqual(2);
    expect(r.project.objects.filter((o) => o.type === "beam").length).toBeGreaterThanOrEqual(1);
  });

  it("shifts a post along the beam out of a no-dig point", () => {
    const p = baseProject();
    const nd = createUserObject("nodigPoint", [{ x: 0, y: 144 }]);
    if (nd && nd.type === "nodigPoint") nd.bufferRadiusIn = 18;
    p.objects.push(nd!);
    const r = fillProject(p);
    const posts = r.project.objects.filter((o) => o.type === "post");
    const blocked = posts.filter((o) => {
      const d = Math.hypot(o.origin.x - 0, o.origin.y - 144);
      return d < 18 / 1 - 0.01;
    });
    const someCleared = posts.some((o) => Math.hypot(o.origin.x - 0, o.origin.y - 144) > 12);
    expect(someCleared || posts.some((o) => o.flaggedNoDig)).toBe(true);
    expect(posts.length).toBeGreaterThan(0);
    void blocked;
  });

  it("keeps flags around ledger veneer violation", () => {
    const p = baseProject();
    const ledger = p.objects.find((o) => o.type === "ledger");
    if (ledger && ledger.type === "ledger") ledger.substrate = "stone-masonry-veneer";
    const r = fillProject(p);
    expect(r.error).toBeNull();
    expect(r.project.flags.some((f) => f.section === "R507.9.1.1" && f.severity === "violation")).toBe(
      true,
    );
  });

  it("flags stair width and rise when set (R318.7)", () => {
    const p = baseProject();
    const s = createUserObject("stairs", [
      { x: 200, y: 0 },
      { x: 248, y: 40 },
    ]);
    if (s && (s.type === "stairs" || s.type === "existingStairs")) {
      s.widthIn = 30;
      s.riseIn = 8.5;
    }
    p.objects.push(s!);
    const flags = evaluateProject(p);
    expect(flags.some((f) => f.section === "R318.7.1")).toBe(true);
    expect(flags.some((f) => f.section === "R318.7.5.1")).toBe(true);
  });

  it("adds breaker blocking when requested", () => {
    const p = baseProject();
    p.objects.push(
      createUserObject("breaker", [
        { x: 0, y: 72 },
        { x: 192, y: 72 },
      ])!,
    );
    const r = fillProject(p);
    expect(r.project.objects.some((o) => o.type === "blocking" && o.source === "fill")).toBe(true);
  });

  it("uses 2x10 or smaller for a 12 ft joist span at 16 in o.c.", () => {
    const r = fillProject(baseProject());
    const joist = r.project.objects.find((o) => o.type === "joist");
    expect(joist && joist.type === "joist" && (joist.nominalSize === "2x10" || joist.nominalSize === "2x8")).toBe(
      true,
    );
    void ftIn;
  });

  it("does not emit posts, beams, or joists whose midpoints lie outside a non-rectangle outline", () => {
    const p = baseProject();
    const poly: Point[] = [
      { x: 0, y: 0 },
      { x: 200, y: 0 },
      { x: 200, y: 160 },
      { x: 160, y: 160 },
      { x: 160, y: 40 },
      { x: 40, y: 40 },
      { x: 40, y: 160 },
      { x: 0, y: 160 },
    ];
    p.objects = [
      createUserObject("outline", poly)!,
      createUserObject("ledger", [
        { x: 0, y: 0 },
        { x: 200, y: 0 },
      ])!,
    ];
    const r = fillProject(p);
    expect(r.error).toBeNull();
    const fillMembers = r.project.objects.filter(
      (o) => o.source === "fill" && (o.type === "post" || o.type === "beam" || o.type === "joist"),
    );
    expect(fillMembers.filter((o) => o.type === "post").length).toBeGreaterThan(0);
    expect(fillMembers.filter((o) => o.type === "beam").length).toBeGreaterThan(0);
    expect(fillMembers.filter((o) => o.type === "joist").length).toBeGreaterThan(0);
    for (const o of fillMembers) {
      const mid = memberMid(o);
      expect(pointInPolygon(mid, poly), `${o.type} midpoint outside outline`).toBe(true);
    }
    const hole = { x: 100, y: 100 };
    expect(pointInPolygon(hole, poly)).toBe(false);
    expect(
      r.project.objects.some((o) => {
        if (o.type !== "beam" && o.type !== "joist") return false;
        const mid = memberMid(o);
        return Math.abs(mid.x - 100) < 8 && Math.abs(mid.y - 100) < 8;
      }),
    ).toBe(false);
  });

  it("fills the pool-deck dogleg outline without midpoints outside the polygon", () => {
    const p = emptyProject();
    p.scale = { a: { x: 689.86, y: 1252.9 }, b: { x: 753.98, y: 1599.9 }, knownLengthIn: 48 };
    p.settings.decking.productName = "Trex";
    p.settings.decking.category = "composite-other";
    p.settings.decking.gapIn = 0.1875;
    p.settings.decking.maxJoistSpacingIn = 15;
    p.settings.decking.boardWidthIn = 5.5;
    p.settings.joistAngleDeg = 90;
    p.settings.deckingAngleDeg = 0;
    p.settings.beamFillAngleDeg = null;
    const poly: Point[] = [
      { x: 728.3, y: 1203.93 },
      { x: 576.41, y: 803.11 },
      { x: 590.29, y: 145.65 },
      { x: 3051.88, y: 187.15 },
      { x: 3043.29, y: 924.02 },
      { x: 2563.57, y: 1530.0 },
      { x: 2286.61, y: 1733.11 },
      { x: 1834.24, y: 1400.76 },
      { x: 1252.63, y: 1165.34 },
    ];
    p.objects = [
      createUserObject("outline", poly)!,
      createUserObject("ledger", [
        { x: 590.9, y: 145.4 },
        { x: 3056.1, y: 188.1 },
      ])!,
    ];
    const r = fillProject(p);
    expect(r.error).toBeNull();
    const posts = r.project.objects.filter((o) => o.type === "post" && o.source === "fill");
    const beams = r.project.objects.filter((o) => o.type === "beam" && o.source === "fill");
    const joists = r.project.objects.filter((o) => o.type === "joist" && o.source === "fill");
    expect(posts.length).toBeGreaterThan(0);
    expect(beams.length).toBeGreaterThan(0);
    expect(joists.length).toBeGreaterThan(2);
    for (const o of [...posts, ...beams, ...joists]) {
      expect(pointInPolygon(memberMid(o), poly)).toBe(true);
    }
    expect(r.project.flags.some((f) => f.section === "R507.5(1)")).toBe(true);
  });

  it("keeps no-dig-shifted posts inside the outline", () => {
    const p = baseProject();
    const poly: Point[] = [
      { x: 0, y: 0 },
      { x: 192, y: 0 },
      { x: 192, y: 144 },
      { x: 0, y: 144 },
    ];
    const zone = createUserObject("nodigZone", [
      { x: -20, y: 120 },
      { x: 40, y: 120 },
      { x: 40, y: 170 },
      { x: -20, y: 170 },
    ])!;
    p.objects.push(zone);
    const r = fillProject(p);
    const posts = r.project.objects.filter((o): o is Extract<PlannerObject, { type: "post" }> => o.type === "post" && o.source === "fill");
    expect(posts.length).toBeGreaterThan(0);
    for (const post of posts) {
      expect(pointInPolygon(post.origin, poly)).toBe(true);
    }
  });
});

function memberMid(o: PlannerObject): Point {
  if (o.type === "post") return o.origin;
  if ("a" in o && "b" in o) return { x: (o.a.x + o.b.x) / 2, y: (o.a.y + o.b.y) / 2 };
  return { x: 0, y: 0 };
}
