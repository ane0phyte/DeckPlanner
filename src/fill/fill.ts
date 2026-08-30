import {
  DEFAULT_SPECIES_LABEL,
  newId,
  type BeamObject,
  type BoardObject,
  type BlockingObject,
  type FlashingObject,
  type GuardObject,
  type JoistObject,
  type LateralDeviceObject,
  type LedgerObject,
  type PlannerObject,
  type PostObject,
  type Project,
  type RimObject,
} from "../model/types";
import { findByType, inchesPerUnit } from "../model/project";
import { evaluateProject } from "../irc/checks";
import {
  GUARD_HEIGHT_IN,
  GUARD_TRIGGER_HEIGHT_IN,
  LATERAL_END_WINDOW_IN,
  effectiveJoistSpacingIn,
  maxBeamCantileverIn,
  maxJoistCantilever,
  smallestBeamForSpan,
  smallestJoistForSpan,
  type JoistSize,
} from "../irc/tables";
import {
  add,
  closestOnSeg,
  dist,
  fromAngleDeg,
  lerp,
  mul,
  norm,
  perp,
  projectT,
  sub,
} from "../geom/vec";
import { joistBaySpansIn, splitSegmentAtLines } from "./joistSupport";
import {
  bbox,
  clipLineToPolygonSegments,
  extendSegment,
  pointInPolygon,
  polygonCentroid,
  polygonClosed,
  polygonEdges,
} from "../geom/polygon";
import { dressedSize, formatInches } from "../units/length";
import { createBoxObject } from "../edit/typedBox";

export interface FillResult {
  project: Project;
  error: string | null;
}

/** First drop-beam line from the ledger (Anthony / sketch). */
const FIRST_BAY_TARGET_IN = 120;
/** Post-to-post along a beam. */
const MAX_POST_OC_IN = 96;
/** Shorter orthogonal chords are a dogleg — use diagonal beams instead. */
const MIN_ORTHO_CHORD_IN = 96;

const FILL_TYPES = new Set<PlannerObject["type"]>([
  "post",
  "beam",
  "joist",
  "board",
  "blocking",
  "rim",
  "guard",
  "lateralDevice",
  "flashing",
]);

export function fillProject(project: Project): FillResult {
  const outline = findByType(project, "outline")[0];
  const ledger = findByType(project, "ledger")[0];
  if (!outline || outline.points.length < 3) {
    return { project, error: "Fill requires a new-deck outline polygon and a ledger. Outline + joist direction alone is not enough." };
  }
  if (!ledger) {
    return { project, error: "Fill requires a ledger object (not only a house wall line) plus the outline." };
  }

  const decking = project.settings.decking;
  const missing: string[] = [];
  if (!decking.productName.trim()) missing.push("decking product name");
  if (decking.gapIn == null) missing.push("decking gap (e.g. 1/8 or 0.125)");
  if (decking.maxJoistSpacingIn == null) missing.push("max joist spacing (e.g. 16)");
  if (missing.length) {
    return {
      project,
      error: `Set before Fill: ${missing.join("; ")}. Joist and decking directions are already on the left panel.`,
    };
  }

  const iPerU = inchesPerUnit(project);
  if (!iPerU) {
    return { project, error: "Set scale from a marked length before Fill." };
  }

  const next: Project = structuredClone(project);
  next.objects = next.objects.filter((o) => !(o.source === "fill" && FILL_TYPES.has(o.type)));

  const unitsPerIn = 1 / iPerU;
  const joistDir = fromAngleDeg(next.settings.joistAngleDeg);
  const beamDir =
    next.settings.beamFillAngleDeg == null
      ? perp(joistDir)
      : fromAngleDeg(next.settings.beamFillAngleDeg);
  if (Math.abs(beamDir.x * joistDir.x + beamDir.y * joistDir.y) > 0.15) {
    // Keep Fill orthogonal: force beam dir perpendicular to joists if user angle is not.
  }
  const beamAxis = norm(perp(joistDir));
  const joistAxis = norm(joistDir);

  const poly = polygonClosed(outline.points);
  const center = polygonCentroid(poly);
  const ledgerMid = { x: (ledger.a.x + ledger.b.x) / 2, y: (ledger.a.y + ledger.b.y) / 2 };
  let inward = norm(sub(center, ledgerMid));
  if (inward.x * joistAxis.x + inward.y * joistAxis.y < 0) {
    // Flip joist axis so it points into the deck from the ledger.
  }
  const intoDeck =
    inward.x * joistAxis.x + inward.y * joistAxis.y >= 0 ? joistAxis : mul(joistAxis, -1);

  const projections = poly.map((p) => p.x * intoDeck.x + p.y * intoDeck.y);
  const ledgerProj = ledgerMid.x * intoDeck.x + ledgerMid.y * intoDeck.y;
  const farProj = Math.max(...projections);
  const nearProj = Math.min(...projections);
  const depthIn = Math.max(0, (farProj - ledgerProj) * iPerU);
  const across = perp(intoDeck);
  const acrossProjs = poly.map((p) => p.x * across.x + p.y * across.y);
  const acrossMin = Math.min(...acrossProjs);
  const acrossMax = Math.max(...acrossProjs);
  const widthIn = (acrossMax - acrossMin) * iPerU;

  const typedMax = decking.maxJoistSpacingIn as number;
  const deckingDiag = isDiagonal(next.settings.joistAngleDeg, next.settings.deckingAngleDeg);
  const spacingInfo = effectiveJoistSpacingIn({
    typedMaxIn: typedMax,
    category: decking.category,
    diagonal: deckingDiag,
    multipleSpan: decking.install === "multiple-span",
  });
  const spacingIn = spacingInfo.spacingIn;
  const spacingU = spacingIn * unitsPerIn;

  const created: PlannerObject[] = [];
  const species = next.settings.defaultSpeciesLabel || DEFAULT_SPECIES_LABEL;
  const noDig = collectNoDig(next, iPerU);
  const userBeams = findByType(next, "beam");

  const firstPick = smallestJoistForSpan(FIRST_BAY_TARGET_IN, spacingIn);
  const joistNominal: JoistSize = firstPick.size ?? "2x12";
  const firstBayIn = firstPick.size
    ? FIRST_BAY_TARGET_IN
    : firstPick.maxSpanIn || FIRST_BAY_TARGET_IN;
  const joistDressed = dressedSize(joistNominal)!;
  const maxCantIn = maxJoistCantilever(joistNominal, firstBayIn);

  const beamStations: number[] = [];
  if (depthIn > firstBayIn + 3) {
    beamStations.push(firstBayIn);
    let cursor = firstBayIn;
    while (beamStations.length < 8) {
      const remaining = depthIn - cursor;
      if (remaining <= (maxCantIn ?? 0) + 3) break;
      const nextSta = cursor + firstBayIn;
      const probe = chordsAtDepth(nextSta, ledgerMid, ledgerProj, intoDeck, beamAxis, widthIn, unitsPerIn, poly);
      const longestIn = probe.reduce((m, s) => Math.max(m, dist(s.a, s.b) * iPerU), 0);
      if (longestIn < MIN_ORTHO_CHORD_IN) break;
      beamStations.push(nextSta);
      cursor = nextSta;
    }
  } else if (depthIn > 36 && depthIn > (maxCantIn ?? 0) + 12) {
    const cant = maxCantIn ?? 12;
    const sta = Math.min(firstBayIn, Math.max(18, depthIn - cant));
    if (sta > 12 && sta < depthIn - 2) beamStations.push(sta);
  }

  const beams: BeamObject[] = [...userBeams];
  const posts: PostObject[] = findByType(next, "post").filter((p) => p.source === "user");
  for (const ub of userBeams) {
    postsAlongBeam(ub, posts, created, noDig, poly, iPerU, species, intoDeck, ledgerProj);
  }

  for (const stationIn of beamStations) {
    const chords = chordsAtDepth(stationIn, ledgerMid, ledgerProj, intoDeck, beamAxis, widthIn, unitsPerIn, poly);
    for (const clipped of chords) {
      if (dist(clipped.a, clipped.b) * iPerU < 12) continue;
      const beam = makeFillBeam(clipped.a, clipped.b, stationIn, species, iPerU, false);
      beams.push(beam);
      created.push(beam);
      postsAlongBeam(beam, posts, created, noDig, poly, iPerU, species, intoDeck, ledgerProj);
    }
  }

  addDiagonalSupports({
    poly,
    ledger,
    beams,
    posts,
    created,
    noDig,
    intoDeck,
    across,
    acrossMin,
    acrossMax,
    nearProj,
    farProj,
    spacingU,
    firstBayIn,
    maxCantIn,
    spacingIn,
    iPerU,
    unitsPerIn,
    species,
    ledgerProj,
  });

  const startAcross = acrossMin + 0.75 * unitsPerIn;
  const endAcross = acrossMax - 0.75 * unitsPerIn;
  const joists: JoistObject[] = [];
  const breaker = findByType(next, "breaker");

  for (let s = startAcross; s <= endAcross + 1e-6; s += spacingU) {
    // Build a line through the strip in the joist direction, from behind ledger to past far edge.
    const along0 = add(mul(across, s), mul(intoDeck, nearProj - 20 * unitsPerIn));
    const along1 = add(mul(across, s), mul(intoDeck, farProj + 20 * unitsPerIn));
    const chords = clipLineToPolygonSegments(along0, along1, poly);
    for (const clipped of chords) {
      if (dist(clipped.a, clipped.b) * iPerU < 6) continue;
      const aProj = clipped.a.x * intoDeck.x + clipped.a.y * intoDeck.y;
      const bProj = clipped.b.x * intoDeck.x + clipped.b.y * intoDeck.y;
      const a = aProj <= bProj ? clipped.a : clipped.b;
      const b = aProj <= bProj ? clipped.b : clipped.a;
      const mid = lerp(a, b, 0.5);
      if (!pointInPolygon(mid, poly)) continue;
      const doubled = breaker.some((br) => {
        if (br.support !== "doubled-joists") return false;
        const t = projectT(mid, br.a, br.b);
        const near = lerp(br.a, br.b, Math.max(0, Math.min(1, t)));
        return dist(near, mid) * iPerU < spacingIn * 0.55;
      });
      const joist: JoistObject = {
        id: newId(),
        type: "joist",
        source: "fill",
        label: doubled ? `${joistNominal} doubled` : joistNominal,
        speciesLabel: species,
        speciesTable: "southern-pine-no-2",
        material: "dimension lumber",
        treatment: "above-ground",
        notes: "",
        a,
        b,
        nominalSize: joistNominal,
        actualWidthIn: joistDressed.w,
        actualDepthIn: joistDressed.d,
        doubled,
      };
      joists.push(joist);
      created.push(joist);
    }
  }

  for (const br of breaker) {
    if (br.support !== "blocking") continue;
    const ext = extendSegment(br.a, br.b, 40 * unitsPerIn);
    for (const clipped of clipLineToPolygonSegments(ext.a, ext.b, poly)) {
      if (dist(clipped.a, clipped.b) * iPerU < 4) continue;
      const blk: BlockingObject = {
        id: newId(),
        type: "blocking",
        source: "fill",
        label: `${joistNominal} blocking`,
        speciesLabel: species,
        speciesTable: "southern-pine-no-2",
        material: "dimension lumber",
        treatment: "above-ground",
        notes: "Breaker-board seam support",
        a: clipped.a,
        b: clipped.b,
        nominalSize: joistNominal,
        actualWidthIn: joistDressed.w,
        actualDepthIn: joistDressed.d,
      };
      created.push(blk);
    }
  }

  for (const e of polygonEdges(poly)) {
    const mid = { x: (e.a.x + e.b.x) / 2, y: (e.a.y + e.b.y) / 2 };
    const onLedger = distToLine(mid, ledger.a, ledger.b) * iPerU < 4;
    if (onLedger) continue;
    const rim: RimObject = {
      id: newId(),
      type: "rim",
      source: "fill",
      label: `${joistNominal} rim`,
      speciesLabel: species,
      speciesTable: "southern-pine-no-2",
      material: "dimension lumber",
      treatment: "above-ground",
      notes: "",
      a: e.a,
      b: e.b,
      nominalSize: joistNominal,
      actualWidthIn: joistDressed.w,
      actualDepthIn: joistDressed.d,
    };
    created.push(rim);
  }

  const boardW = decking.boardWidthIn * unitsPerIn;
  const gapU = (decking.gapIn ?? 0) * unitsPerIn;
  const deckDir = fromAngleDeg(next.settings.deckingAngleDeg);
  const deckPerp = perp(deckDir);
  const box = bbox(poly);
  const pad = Math.max(box.max.x - box.min.x, box.max.y - box.min.y) + 40;
  const originDeck = { x: box.min.x - 10, y: box.min.y - 10 };
  for (let k = -40; k < 200; k++) {
    const shift = mul(deckPerp, k * (boardW + gapU));
    const a0 = add(add(originDeck, shift), mul(deckDir, -pad));
    const b0 = add(add(originDeck, shift), mul(deckDir, pad));
    for (const clipped of clipLineToPolygonSegments(a0, b0, poly)) {
      if (dist(clipped.a, clipped.b) * iPerU < 6) continue;
      if (!pointInPolygon(lerp(clipped.a, clipped.b, 0.5), poly)) continue;
      const pieces = splitSegmentAtLines(clipped.a, clipped.b, breaker);
      for (const piece of pieces) {
        if (dist(piece.a, piece.b) * iPerU < 4) continue;
        const board: BoardObject = {
          id: newId(),
          type: "board",
          source: "fill",
          label: decking.productName || "decking",
          speciesLabel: species,
          speciesTable: "southern-pine-no-2",
          material: decking.productName || "decking",
          treatment: "above-ground",
          notes: `gap ${decking.gapIn}"`,
          a: piece.a,
          b: piece.b,
          actualWidthIn: decking.boardWidthIn,
          actualThicknessIn: decking.thicknessIn,
        };
        created.push(board);
      }
    }
  }

  const { deckIn, gradeIn } = next.settings.heights;
  const above = deckIn != null && gradeIn != null ? deckIn - gradeIn : null;
  if (above != null && above > GUARD_TRIGGER_HEIGHT_IN) {
    for (const e of polygonEdges(poly)) {
      const mid = { x: (e.a.x + e.b.x) / 2, y: (e.a.y + e.b.y) / 2 };
      if (distToLine(mid, ledger.a, ledger.b) * iPerU < 6) continue;
      const g: GuardObject = {
        id: newId(),
        type: "guard",
        source: "fill",
        label: "Guard 36 in",
        speciesLabel: species,
        speciesTable: "southern-pine-no-2",
        material: "guard",
        treatment: "above-ground",
        notes: "R321 — required open edge >30 in above grade within 36 in horizontally",
        a: e.a,
        b: e.b,
        heightIn: GUARD_HEIGHT_IN,
      };
      created.push(g);
    }
  }

  const scheme = next.settings.lateralScheme;
  const ledgerLen = dist(ledger.a, ledger.b);
  const along = norm(sub(ledger.b, ledger.a));
  const inwardL = inwardToward(ledger, poly);
  if (scheme === "2x1500") {
    created.push(lateral(ledger, along, inwardL, 0.5 * LATERAL_END_WINDOW_IN * unitsPerIn, 1500, next));
    created.push(lateral(ledger, along, inwardL, ledgerLen - 0.5 * LATERAL_END_WINDOW_IN * unitsPerIn, 1500, next));
  } else {
    const offsets = [0.3, 0.7, ledgerLen / unitsPerIn - 0.7 * LATERAL_END_WINDOW_IN, ledgerLen / unitsPerIn - 0.3 * LATERAL_END_WINDOW_IN];
    for (const o of offsets) {
      created.push(lateral(ledger, along, inwardL, o * unitsPerIn, 750, next));
    }
  }

  const flash: FlashingObject = {
    id: newId(),
    type: "flashing",
    source: "fill",
    label: next.settings.flashingProduct || "Ledger flashing (type product)",
    speciesLabel: "",
    speciesTable: "southern-pine-no-2",
    material: next.settings.flashingProduct || "",
    treatment: "above-ground",
    notes: "R507.9.1.5 ≥2 in vertical above ledger; ≥4 in beyond face or to face + ≥1/4 in down. Do not invent a product.",
    a: ledger.a,
    b: ledger.b,
    productName: next.settings.flashingProduct,
    verticalAboveIn: 2,
    beyondFaceIn: 4,
    downFaceIn: 0,
  };
  created.push(flash);
  next.objects = [...next.objects, ...created];
  next.flags = evaluateProject(next);
  if (spacingInfo.usedWoodTable) {
    next.flags.unshift({
      id: newId(),
      severity: "info",
      section: "R507.7",
      message: `Joist spacing ${spacingIn} in o.c. is the more restrictive of typed max ${decking.maxJoistSpacingIn} in and Table R507.7 (${spacingInfo.woodTableIn} in).`,
      objectIds: [],
    });
  }
  return { project: next, error: null };
}

function isDiagonal(joistDeg: number, deckDeg: number): boolean {
  let d = Math.abs(((deckDeg - joistDeg) % 180) + 180) % 180;
  if (d > 90) d = 180 - d;
  return d > 20 && d < 70;
}

function distToLine(p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }): number {
  const ab = sub(b, a);
  const l2 = ab.x * ab.x + ab.y * ab.y;
  if (l2 < 1e-12) return dist(p, a);
  const t = Math.max(0, Math.min(1, (sub(p, a).x * ab.x + sub(p, a).y * ab.y) / l2));
  return dist(p, lerp(a, b, t));
}

function inwardToward(ledger: LedgerObject, poly: { x: number; y: number }[]): { x: number; y: number } {
  const mid = { x: (ledger.a.x + ledger.b.x) / 2, y: (ledger.a.y + ledger.b.y) / 2 };
  const n = perp(norm(sub(ledger.b, ledger.a)));
  return pointInPolygon(add(mid, mul(n, 8)), poly) ? n : mul(n, -1);
}

function lateral(
  ledger: LedgerObject,
  along: { x: number; y: number },
  inward: { x: number; y: number },
  distAlong: number,
  cap: number,
  project: Project,
): LateralDeviceObject {
  return {
    id: newId(),
    type: "lateralDevice",
    source: "fill",
    label: project.settings.lateralProduct || (cap === 1500 ? "Hold-down 1500 lb ASD" : "Hold-down 750 lb ASD"),
    speciesLabel: "",
    speciesTable: "southern-pine-no-2",
    material: project.settings.lateralProduct,
    treatment: "above-ground",
    notes: "R507.9.2 — ledger bolts do not satisfy lateral load",
    origin: add(ledger.a, add(mul(along, distAlong), mul(inward, 4))),
    productName: project.settings.lateralProduct,
    capacityLbAsd: cap,
  };
}

interface NoDig {
  kind: "zone" | "point";
  points?: { x: number; y: number }[];
  origin?: { x: number; y: number };
  radiusU: number;
}

function collectNoDig(project: Project, iPerU: number): NoDig[] {
  const out: NoDig[] = [];
  for (const z of findByType(project, "nodigZone")) {
    out.push({ kind: "zone", points: z.points, radiusU: 0 });
  }
  for (const p of findByType(project, "nodigPoint")) {
    out.push({ kind: "point", origin: p.origin, radiusU: p.bufferRadiusIn / iPerU });
  }
  return out;
}

function hitsNoDig(p: { x: number; y: number }, noDig: NoDig[]): boolean {
  for (const n of noDig) {
    if (n.kind === "zone" && n.points && pointInPolygon(p, n.points)) return true;
    if (n.kind === "point" && n.origin && dist(p, n.origin) <= n.radiusU) return true;
  }
  return false;
}

function chordsAtDepth(
  stationIn: number,
  ledgerMid: { x: number; y: number },
  ledgerProj: number,
  intoDeck: { x: number; y: number },
  beamAxis: { x: number; y: number },
  widthIn: number,
  unitsPerIn: number,
  poly: { x: number; y: number }[],
): { a: { x: number; y: number }; b: { x: number; y: number } }[] {
  const stationU = stationIn * unitsPerIn;
  const origin = add(ledgerMid, mul(intoDeck, ledgerProj - (ledgerMid.x * intoDeck.x + ledgerMid.y * intoDeck.y) + stationU));
  const half = ((widthIn + 48) / 2) * unitsPerIn;
  const rawA = add(origin, mul(beamAxis, -half * 4));
  const rawB = add(origin, mul(beamAxis, half * 4));
  return clipLineToPolygonSegments(rawA, rawB, poly).filter((s) => dist(s.a, s.b) > 1e-3);
}

function makeFillBeam(
  a: { x: number; y: number },
  b: { x: number; y: number },
  joistSpanIn: number,
  species: string,
  iPerU: number,
  diagonal: boolean,
): BeamObject {
  const spanIn = dist(a, b) * iPerU;
  const beamLookup = smallestBeamForSpan({
    joistSpanIn,
    joistCantileverIn: 0,
    beamSpanIn: spanIn,
  });
  const nominal = "2x8";
  const dressed = dressedSize(nominal)!;
  return {
    id: newId(),
    type: "beam",
    source: "fill",
    label: beamLookup.verified
      ? `${beamLookup.plyCount}-${beamLookup.nominalSize}`
      : diagonal
        ? "BEAM diagonal (size per Table R507.5(1))"
        : "BEAM (size per Table R507.5(1))",
    speciesLabel: species,
    speciesTable: "southern-pine-no-2",
    material: "dimension lumber",
    treatment: "above-ground",
    notes: beamLookup.reason,
    a,
    b,
    plyCount: 2,
    nominalSize: nominal,
    actualWidthIn: dressed.w * 2,
    actualDepthIn: dressed.d,
    drop: true,
    sizeVerified: false,
    diagonal,
  };
}

function postsAlongBeam(
  beam: BeamObject,
  posts: PostObject[],
  created: PlannerObject[],
  noDig: NoDig[],
  poly: { x: number; y: number }[],
  iPerU: number,
  species: string,
  intoDeck: { x: number; y: number },
  ledgerProj: number,
): void {
  const spanIn = dist(beam.a, beam.b) * iPerU;
  const maxCantU = maxBeamCantileverIn(spanIn) * (1 / iPerU);
  const n = Math.max(1, Math.ceil(spanIn / MAX_POST_OC_IN));
  for (let i = 0; i <= n; i++) {
    const isEnd = i === 0 || i === n;
    const preferred = lerp(beam.a, beam.b, i / n);
    const post = placePostAlongBeam(
      preferred,
      beam,
      noDig,
      maxCantU,
      iPerU,
      species,
      poly,
      intoDeck,
      ledgerProj,
      isEnd,
    );
    const mergeIn = isEnd ? 1 : 8;
    if (posts.some((q) => dist(q.origin, post.origin) * iPerU < mergeIn)) continue;
    posts.push(post);
    created.push(post);
  }
}

function joistFailsR5076(
  chord: { a: { x: number; y: number }; b: { x: number; y: number } },
  ledger: LedgerObject,
  beams: BeamObject[],
  maxCantIn: number | null,
  spacingIn: number,
  iPerU: number,
): boolean {
  const bays = joistBaySpansIn(chord, ledger, beams, iPerU);
  const sized = smallestJoistForSpan(bays.maxBayIn, spacingIn);
  const cantOk = maxCantIn == null ? bays.cantileverIn < 1 : bays.cantileverIn <= maxCantIn + 1e-6;
  const spanOk = sized.size != null && bays.maxBayIn <= sized.maxSpanIn + 1e-6;
  return !spanOk || !cantOk;
}

function sampleJoistChords(
  poly: { x: number; y: number }[],
  intoDeck: { x: number; y: number },
  across: { x: number; y: number },
  acrossMin: number,
  acrossMax: number,
  nearProj: number,
  farProj: number,
  spacingU: number,
  unitsPerIn: number,
  iPerU: number,
): { a: { x: number; y: number }; b: { x: number; y: number } }[] {
  const out: { a: { x: number; y: number }; b: { x: number; y: number } }[] = [];
  for (let s = acrossMin + 0.75 * unitsPerIn; s <= acrossMax + 1e-6; s += spacingU) {
    const along0 = add(mul(across, s), mul(intoDeck, nearProj - 20 * unitsPerIn));
    const along1 = add(mul(across, s), mul(intoDeck, farProj + 20 * unitsPerIn));
    for (const clipped of clipLineToPolygonSegments(along0, along1, poly)) {
      if (dist(clipped.a, clipped.b) * iPerU >= 12) out.push(clipped);
    }
  }
  return out;
}

function lastOrthoBeam(
  beams: BeamObject[],
  intoDeck: { x: number; y: number },
): BeamObject | null {
  const ortho = beams.filter((b) => !b.diagonal);
  if (!ortho.length) return null;
  return ortho.reduce((a, b) => {
    const ap = ((a.a.x + a.b.x) / 2) * intoDeck.x + ((a.a.y + a.b.y) / 2) * intoDeck.y;
    const bp = ((b.a.x + b.b.x) / 2) * intoDeck.x + ((b.a.y + b.b.y) / 2) * intoDeck.y;
    return bp > ap ? b : a;
  });
}

function addDiagonalSupports(args: {
  poly: { x: number; y: number }[];
  ledger: LedgerObject;
  beams: BeamObject[];
  posts: PostObject[];
  created: PlannerObject[];
  noDig: NoDig[];
  intoDeck: { x: number; y: number };
  across: { x: number; y: number };
  acrossMin: number;
  acrossMax: number;
  nearProj: number;
  farProj: number;
  spacingU: number;
  firstBayIn: number;
  maxCantIn: number | null;
  spacingIn: number;
  iPerU: number;
  unitsPerIn: number;
  species: string;
  ledgerProj: number;
}): void {
  const {
    poly,
    ledger,
    beams,
    posts,
    created,
    noDig,
    intoDeck,
    across,
    acrossMin,
    acrossMax,
    nearProj,
    farProj,
    spacingU,
    firstBayIn,
    maxCantIn,
    spacingIn,
    iPerU,
    unitsPerIn,
    species,
    ledgerProj,
  } = args;
  const samples = sampleJoistChords(
    poly,
    intoDeck,
    across,
    acrossMin,
    acrossMax,
    nearProj,
    farProj,
    spacingU,
    unitsPerIn,
    iPerU,
  );
  const failing = samples.filter((c) =>
    joistFailsR5076(c, ledger, beams, maxCantIn, spacingIn, iPerU),
  );
  if (!failing.length) return;

  const last = lastOrthoBeam(beams, intoDeck);
  const farOf = (seg: { a: { x: number; y: number }; b: { x: number; y: number } }) => {
    const ap = seg.a.x * intoDeck.x + seg.a.y * intoDeck.y;
    const bp = seg.b.x * intoDeck.x + seg.b.y * intoDeck.y;
    return ap >= bp ? seg.a : seg.b;
  };
  const acrossOf = (p: { x: number; y: number }) => p.x * across.x + p.y * across.y;
  const farPts = failing.map(farOf);
  const lastProj = last
    ? ((last.a.x + last.b.x) / 2) * intoDeck.x + ((last.a.y + last.b.y) / 2) * intoDeck.y
    : nearProj;
  const farVerts = poly.filter((p) => p.x * intoDeck.x + p.y * intoDeck.y > lastProj + 8);
  const tipCand = [...farPts, ...farVerts].reduce((a, b) =>
    a.x * intoDeck.x + a.y * intoDeck.y > b.x * intoDeck.x + b.y * intoDeck.y ? a : b,
  );
  const centroid = polygonCentroid(poly);
  const nudged = lerp(tipCand, centroid, 0.08);
  const tip = pointInPolygon(nudged, poly) ? nudged : tipCand;

  const minA = Math.min(...farPts.map(acrossOf));
  const maxA = Math.max(...farPts.map(acrossOf));
  const margin = 16 * unitsPerIn;
  const anchorAt = (acrossVal: number) => {
    if (!last) {
      const origin = add(mul(across, acrossVal), mul(intoDeck, lastProj + firstBayIn * unitsPerIn));
      return closestOnSeg(origin, failing[0].a, failing[0].b);
    }
    const t = projectT(add(mul(across, acrossVal), mul(intoDeck, lastProj)), last.a, last.b);
    return lerp(last.a, last.b, Math.max(0, Math.min(1, t)));
  };
  const anchors = [anchorAt(minA - margin), anchorAt(maxA + margin)].filter(
    (p, i, arr) => arr.findIndex((q) => dist(p, q) * iPerU < 12) === i,
  );

  const placeDiag = (a: { x: number; y: number }, b: { x: number; y: number }) => {
    for (const seg of clipLineToPolygonSegments(a, b, poly)) {
      if (dist(seg.a, seg.b) * iPerU < 18) continue;
      const beam = makeFillBeam(seg.a, seg.b, firstBayIn, species, iPerU, true);
      beams.push(beam);
      created.push(beam);
      postsAlongBeam(beam, posts, created, noDig, poly, iPerU, species, intoDeck, ledgerProj);
    }
  };

  for (const anchor of anchors) placeDiag(anchor, tip);

  for (const chord of failing) {
    if (!joistFailsR5076(chord, ledger, beams, maxCantIn, spacingIn, iPerU)) continue;
    const aProj = chord.a.x * intoDeck.x + chord.a.y * intoDeck.y;
    const bProj = chord.b.x * intoDeck.x + chord.b.y * intoDeck.y;
    const near = aProj <= bProj ? chord.a : chord.b;
    const far = aProj <= bProj ? chord.b : chord.a;
    const lenIn = dist(near, far) * iPerU;
    const bays = joistBaySpansIn(chord, ledger, beams, iPerU);
    const fromLast = Math.min(firstBayIn, (maxCantIn ?? firstBayIn) + 6);
    const already = lenIn - bays.cantileverIn;
    const tNeed = Math.min(0.92, Math.max(0.2, (already + fromLast) / Math.max(lenIn, 1)));
    const split = lerp(near, far, tNeed);
    if (!pointInPolygon(split, poly)) continue;
    const anchor = last ? closestOnSeg(split, last.a, last.b) : near;
    placeDiag(anchor, split);
  }
}

function clampToOutlineOnBeam(
  p: { x: number; y: number },
  beam: BeamObject,
  poly: { x: number; y: number }[],
): { x: number; y: number } {
  if (pointInPolygon(p, poly)) return p;
  let best = beam.a;
  let bestD = Infinity;
  for (let i = 0; i <= 40; i++) {
    const cand = lerp(beam.a, beam.b, i / 40);
    if (!pointInPolygon(cand, poly)) continue;
    const d = dist(cand, p);
    if (d < bestD) {
      bestD = d;
      best = cand;
    }
  }
  return best;
}

function placePostAlongBeam(
  preferred: { x: number; y: number },
  beam: BeamObject,
  noDig: NoDig[],
  maxCantU: number,
  iPerU: number,
  species: string,
  poly: { x: number; y: number }[],
  intoDeck: { x: number; y: number },
  ledgerProj: number,
  lockEnd: boolean,
): PostObject {
  const dressed = dressedSize("6x6")!;
  let p = pointInPolygon(preferred, poly) ? preferred : clampToOutlineOnBeam(preferred, beam, poly);
  let flagged = false;
  if (hitsNoDig(p, noDig) && !lockEnd) {
    let found: { x: number; y: number } | null = null;
    for (let i = 0; i <= 80; i++) {
      const cand = lerp(beam.a, beam.b, i / 80);
      if (!pointInPolygon(cand, poly)) continue;
      if (dist(cand, preferred) > maxCantU + 1e-6) continue;
      if (!hitsNoDig(cand, noDig)) {
        found = cand;
        break;
      }
    }
    if (found) p = found;
    else {
      flagged = true;
      p = pointInPolygon(preferred, poly) ? preferred : clampToOutlineOnBeam(preferred, beam, poly);
    }
  } else if (hitsNoDig(p, noDig)) {
    flagged = true;
  }
  const fromLedgerIn = (p.x * intoDeck.x + p.y * intoDeck.y - ledgerProj) * iPerU;
  const t = projectT(p, beam.a, beam.b);
  return {
    id: newId(),
    type: "post",
    source: "fill",
    label: `6x6 · ${formatInches(Math.max(0, fromLedgerIn))} from ledger`,
    speciesLabel: species,
    speciesTable: "southern-pine-no-2",
    material: "dimension lumber",
    treatment: "ground-contact",
    notes: flagged
      ? "Could not clear no-dig within legal beam cantilever. Type post height (deck − grade)."
      : "Type post height (deck − grade). 6x6 because height is unset; 4x4 is only for short posts in Table R507.4.",
    origin: p,
    nominalSize: "6x6",
    actualWidthIn: dressed.w,
    actualDepthIn: dressed.d,
    beamId: beam.id,
    tAlongBeam: t,
    flaggedNoDig: flagged,
  };
}

export function createUserObject(
  type: PlannerObject["type"],
  points: { x: number; y: number }[],
): PlannerObject | null {
  const dressed8 = dressedSize("2x8")!;
  const dressed4 = dressedSize("4x4")!;
  const species = DEFAULT_SPECIES_LABEL;
  const common = {
    id: newId(),
    source: "user" as const,
    label: type,
    speciesLabel: species,
    speciesTable: "southern-pine-no-2" as const,
    material: "dimension lumber",
    treatment: (type === "post" ? "ground-contact" : "above-ground") as
      | "ground-contact"
      | "above-ground",
    notes: "",
  };
  switch (type) {
    case "outline":
      if (points.length < 3) return null;
      return { ...common, type, points: polygonClosed(points) };
    case "ledger":
      if (points.length < 2) return null;
      return {
        ...common,
        type,
        a: points[0],
        b: points[1],
        nominalSize: "2x8",
        actualWidthIn: dressed8.w,
        actualDepthIn: dressed8.d,
        bandRimType: "2in-solid-sawn-spf-or-better",
        substrate: "wood-band",
        flashingProduct: "",
        fastenerKind: "bolt-1/2-sheathing-1/2",
        fastenerProduct: "",
      };
    case "houseWall":
      if (points.length < 2) return null;
      return { ...common, type, a: points[0], b: points[1] };
    case "stairs":
    case "existingStairs":
      if (points.length < 2) return null;
      return createBoxObject("stairs", points[0], points[1]);
    case "post":
      if (!points[0]) return null;
      return {
        ...common,
        type,
        origin: points[0],
        nominalSize: "4x4",
        actualWidthIn: dressed4.w,
        actualDepthIn: dressed4.d,
        beamId: null,
        tAlongBeam: null,
        flaggedNoDig: false,
      };
    case "beam":
      if (points.length < 2) return null;
      return {
        ...common,
        type,
        a: points[0],
        b: points[1],
        plyCount: 2,
        nominalSize: "2x10",
        actualWidthIn: dressedSize("2x10")!.w * 2,
        actualDepthIn: dressedSize("2x10")!.d,
        drop: true,
        sizeVerified: false,
        diagonal: true,
      };
    case "joist":
      if (points.length < 2) return null;
      return {
        ...common,
        type,
        a: points[0],
        b: points[1],
        nominalSize: "2x8",
        actualWidthIn: dressed8.w,
        actualDepthIn: dressed8.d,
        doubled: false,
      };
    case "board":
      if (points.length < 2) return null;
      return {
        ...common,
        type,
        a: points[0],
        b: points[1],
        actualWidthIn: 5.5,
        actualThicknessIn: 1.25,
      };
    case "breaker":
      if (points.length < 2) return null;
      return {
        ...common,
        type,
        a: points[0],
        b: points[1],
        support: "blocking",
        actualWidthIn: 5.5,
      };
    case "blocking":
      if (points.length < 2) return null;
      return {
        ...common,
        type,
        a: points[0],
        b: points[1],
        nominalSize: "2x8",
        actualWidthIn: dressed8.w,
        actualDepthIn: dressed8.d,
      };
    case "rim":
      if (points.length < 2) return null;
      return {
        ...common,
        type,
        a: points[0],
        b: points[1],
        nominalSize: "2x8",
        actualWidthIn: dressed8.w,
        actualDepthIn: dressed8.d,
      };
    case "guard":
      if (points.length < 2) return null;
      return {
        ...common,
        type,
        a: points[0],
        b: points[1],
        heightIn: 36,
      };
    case "nodigZone":
      if (points.length < 3) return null;
      return { ...common, type, points: polygonClosed(points) };
    case "nodigPoint":
      if (!points[0]) return null;
      return { ...common, type, origin: points[0], bufferRadiusIn: 24 };
    case "lateralDevice":
      if (!points[0]) return null;
      return {
        ...common,
        type,
        origin: points[0],
        productName: "",
        capacityLbAsd: 1500,
      };
    case "flashing":
      if (points.length < 2) return null;
      return {
        ...common,
        type,
        a: points[0],
        b: points[1],
        productName: "",
        verticalAboveIn: 2,
        beyondFaceIn: 4,
        downFaceIn: 0,
      };
    default:
      return null;
  }
}

export function convertHouseWallToLedger(wallId: string, project: Project): Project {
  const next = structuredClone(project);
  const wall = next.objects.find((o) => o.id === wallId && o.type === "houseWall");
  if (!wall || wall.type !== "houseWall") return project;
  const ledger = createUserObject("ledger", [wall.a, wall.b]);
  if (!ledger) return project;
  ledger.source = "convert";
  ledger.label = "Ledger (from house wall)";
  next.objects = next.objects.filter((o) => o.id !== wallId).concat(ledger);
  next.flags = evaluateProject(next);
  return next;
}
