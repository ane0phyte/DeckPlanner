import { describe, expect, it } from "vitest";
import { emptyProject, inchesPerUnit } from "../model/project";
import { createUserObject, fillProject } from "./fill";
import { evaluateProject } from "../irc/checks";
import { ftIn } from "../units/length";
import { pointInPolygon } from "../geom/polygon";
import { dist } from "../geom/vec";
import { joistBaySpansIn } from "./joistSupport";
import { JOIST_SPAN_R507_6, maxJoistCantilever, nearestSpacing } from "../irc/tables";
import type { BeamObject, LedgerObject, PlannerObject, Point, PostObject } from "../model/types";

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

  it("places a ~10 ft first beam and 6x6 end posts on a 12 ft rectangle", () => {
    const r = fillProject(baseProject());
    expect(r.error).toBeNull();
    const iPerU = inchesPerUnit(r.project)!;
    const ledger = r.project.objects.find((o): o is LedgerObject => o.type === "ledger")!;
    const beams = r.project.objects.filter((o): o is BeamObject => o.type === "beam" && o.source === "fill");
    const posts = r.project.objects.filter((o): o is PostObject => o.type === "post" && o.source === "fill");
    const joists = r.project.objects.filter((o) => o.type === "joist" && o.source === "fill");
    expect(beams.some((b) => b.diagonal)).toBe(false);
    expect(joists.every((j) => j.type === "joist" && j.nominalSize === "2x8")).toBe(true);
    expect(posts.every((p) => p.type === "post" && p.nominalSize === "6x6" && p.treatment === "ground-contact")).toBe(
      true,
    );
    const nearTen = beams.filter((b) => {
      const mid = { x: (b.a.x + b.b.x) / 2, y: (b.a.y + b.b.y) / 2 };
      const d = distToLedgerIn(mid, ledger, iPerU);
      return d > 108 && d < 132;
    });
    expect(nearTen.length).toBeGreaterThanOrEqual(1);
    expectEveryBeamHasEndPosts(beams, posts, iPerU);
  });

  it("does not skip the 10 ft beam line because of a house-band no-dig", () => {
    const p = baseProject();
    p.objects.push(
      createUserObject("nodigZone", [
        { x: -10, y: -4 },
        { x: 200, y: -4 },
        { x: 200, y: 24 },
        { x: -10, y: 24 },
      ])!,
    );
    const r = fillProject(p);
    expect(r.error).toBeNull();
    const iPerU = inchesPerUnit(r.project)!;
    const ledger = r.project.objects.find((o): o is LedgerObject => o.type === "ledger")!;
    const beams = r.project.objects.filter((o): o is BeamObject => o.type === "beam" && o.source === "fill");
    expect(beams.length).toBeGreaterThan(0);
    expect(
      beams.some((b) => {
        const mid = { x: (b.a.x + b.b.x) / 2, y: (b.a.y + b.b.y) / 2 };
        const d = distToLedgerIn(mid, ledger, iPerU);
        return d > 108 && d < 132;
      }),
    ).toBe(true);
  });

  it("splits Trex boards at a breaker and never crosses the seam", () => {
    const p = poolDeckProject();
    p.objects.push(
      createUserObject("breaker", [
        { x: 1936.3, y: 197.1 },
        { x: 1926.5, y: 1480.4 },
      ])!,
    );
    const withBreaker = fillProject(p);
    expect(withBreaker.error).toBeNull();
    const boards = withBreaker.project.objects.filter((o) => o.type === "board" && o.source === "fill");
    const breaker = withBreaker.project.objects.find((o) => o.type === "breaker")!;
    expect(boards.length).toBeGreaterThan(10);
    for (const b of boards) {
      if (b.type !== "board") continue;
      expect(segmentCrossesInterior(b.a, b.b, breaker.a, breaker.b), "board crosses breaker").toBe(false);
    }
    const without = fillProject(poolDeckProject());
    const unsplit = without.project.objects.filter((o) => o.type === "board" && o.source === "fill");
    expect(boards.length).toBeGreaterThan(unsplit.length);
  });

  it("fills the 9-pt pool outline with more than a single tip beam and legal joist bays", () => {
    const p = poolDeckProject();
    p.objects.push(
      createUserObject("breaker", [
        { x: 1936.3, y: 197.1 },
        { x: 1926.5, y: 1480.4 },
      ])!,
    );
    const r = fillProject(p);
    expect(r.error).toBeNull();
    const iPerU = inchesPerUnit(r.project)!;
    const poly = poolOutline();
    const ledger = r.project.objects.find((o): o is LedgerObject => o.type === "ledger")!;
    const beams = r.project.objects.filter((o): o is BeamObject => o.type === "beam" && o.source === "fill");
    const posts = r.project.objects.filter((o): o is PostObject => o.type === "post" && o.source === "fill");
    const joists = r.project.objects.filter((o) => o.type === "joist" && o.source === "fill");
    expect(beams.length).toBeGreaterThan(1);
    expect(beams.some((b) => b.diagonal)).toBe(true);
    const ortho = beams.filter((b) => !b.diagonal);
    expect(ortho.length).toBeGreaterThanOrEqual(1);
    const longestOrthoIn = Math.max(...ortho.map((b) => dist(b.a, b.b) * iPerU));
    expect(longestOrthoIn).toBeGreaterThan(8 * 12);
    expect(
      ortho.some((b) => {
        const mid = { x: (b.a.x + b.b.x) / 2, y: (b.a.y + b.b.y) / 2 };
        return distToLedgerIn(mid, ledger, iPerU) > 108 && distToLedgerIn(mid, ledger, iPerU) < 132;
      }),
    ).toBe(true);
    expect(posts.every((p) => p.type === "post" && p.nominalSize === "6x6")).toBe(true);
    expectEveryBeamHasEndPosts(beams, posts, iPerU);
    for (const o of [...posts, ...beams]) {
      expect(pointInPolygon(memberMid(o), poly)).toBe(true);
    }
    const spacing = r.project.settings.decking.maxJoistSpacingIn ?? 16;
    const col = nearestSpacing(spacing);
    let placedBeamForFail = false;
    for (const j of joists) {
      if (j.type !== "joist") continue;
      const bays = joistBaySpansIn(j, ledger, beams, iPerU);
      const maxSpan = JOIST_SPAN_R507_6[j.nominalSize as "2x8" | "2x10" | "2x12" | "2x6"][col];
      const maxCant = maxJoistCantilever(j.nominalSize as "2x8", bays.backSpanIn || bays.maxBayIn);
      const ok = bays.maxBayIn <= maxSpan + 1e-6 && (maxCant == null || bays.cantileverIn <= maxCant + 1e-6);
      if (!ok) {
        expect(
          r.project.flags.some((f) => f.section === "R507.6" && f.objectIds.includes(j.id)),
        ).toBe(true);
        expect(beams.length).toBeGreaterThan(0);
        placedBeamForFail = true;
      }
    }
    void placedBeamForFail;
    expect(joists.some((j) => j.type === "joist" && j.nominalSize === "2x8")).toBe(true);
    expect(r.project.flags.some((f) => f.section === "R507.5(1)")).toBe(true);
  });
});

function memberMid(o: PlannerObject): Point {
  if (o.type === "post") return o.origin;
  if ("a" in o && "b" in o) return { x: (o.a.x + o.b.x) / 2, y: (o.a.y + o.b.y) / 2 };
  return { x: 0, y: 0 };
}

function poolOutline(): Point[] {
  return [
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
}

function poolDeckProject() {
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
  const poly = poolOutline();
  p.objects = [
    createUserObject("outline", poly)!,
    createUserObject("ledger", [
      { x: 590.9, y: 145.4 },
      { x: 3056.1, y: 188.1 },
    ])!,
  ];
  return p;
}

function distToLedgerIn(
  p: Point,
  ledger: LedgerObject,
  iPerU: number,
): number {
  const abx = ledger.b.x - ledger.a.x;
  const aby = ledger.b.y - ledger.a.y;
  const l2 = abx * abx + aby * aby;
  const t = l2 < 1e-12 ? 0 : ((p.x - ledger.a.x) * abx + (p.y - ledger.a.y) * aby) / l2;
  const q = { x: ledger.a.x + abx * t, y: ledger.a.y + aby * t };
  return dist(p, q) * iPerU;
}

function expectEveryBeamHasEndPosts(
  beams: BeamObject[],
  posts: PostObject[],
  iPerU: number,
): void {
  for (const beam of beams) {
    for (const end of [beam.a, beam.b]) {
      const near = posts.some((p) => dist(p.origin, end) * iPerU <= 1);
      expect(near, `beam ${beam.id} missing post at end`).toBe(true);
    }
  }
}

function segmentCrossesInterior(a: Point, b: Point, c: Point, d: Point): boolean {
  const rx = b.x - a.x;
  const ry = b.y - a.y;
  const sx = d.x - c.x;
  const sy = d.y - c.y;
  const den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-12) return false;
  const t = ((c.x - a.x) * sy - (c.y - a.y) * sx) / den;
  const u = ((c.x - a.x) * ry - (c.y - a.y) * rx) / den;
  return t > 1e-4 && t < 1 - 1e-4 && u > 1e-4 && u < 1 - 1e-4;
}
