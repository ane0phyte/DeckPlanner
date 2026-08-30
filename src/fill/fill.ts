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
  JOIST_BEARING_ON_WOOD_METAL_IN,
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
  angleDeg,
  dist,
  fromAngleDeg,
  lerp,
  mul,
  norm,
  perp,
  projectT,
  sub,
} from "../geom/vec";
import {
  bbox,
  clipLineToPolygon,
  extendSegment,
  pointInPolygon,
  polygonCentroid,
  polygonClosed,
  polygonEdges,
} from "../geom/polygon";
import { dressedSize } from "../units/length";

export interface FillResult {
  project: Project;
  error: string | null;
}

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
  if (!decking.productName.trim() || decking.gapIn == null || decking.maxJoistSpacingIn == null) {
    return {
      project,
      error: "Set decking product, gap, and max joist spacing before Fill. Also set joist and decking directions.",
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

  const deckingDiag = isDiagonal(next.settings.joistAngleDeg, next.settings.deckingAngleDeg);
  const spacingInfo = effectiveJoistSpacingIn({
    typedMaxIn: decking.maxJoistSpacingIn,
    category: decking.category,
    diagonal: deckingDiag,
    multipleSpan: decking.install === "multiple-span",
  });
  const spacingIn = spacingInfo.spacingIn;
  const spacingU = spacingIn * unitsPerIn;

  const max12 = smallestJoistForSpan(1e9, spacingIn);
  const max2x12 = max12.maxSpanIn;
  const clearanceU = next.settings.ledgerToDropBeamClearanceIn * unitsPerIn;

  const beamStations: number[] = [];
  let remaining = depthIn;
  let cursorFromLedger = Math.max(0, next.settings.ledgerToDropBeamClearanceIn);
  if (clearanceU > 0) {
    remaining = depthIn - next.settings.ledgerToDropBeamClearanceIn;
  }
  while (remaining > 1) {
    const trySize = smallestJoistForSpan(Math.min(remaining, max2x12), spacingIn);
    const size: JoistSize = trySize.size ?? "2x12";
    const maxSpan = trySize.size ? trySize.maxSpanIn : max2x12;
    const maxCant = maxJoistCantilever(size, Math.min(remaining, maxSpan)) ?? 0;
    let span = Math.min(remaining, maxSpan);
    let cant = 0;
    if (remaining > maxSpan && remaining <= maxSpan + maxCant) {
      span = maxSpan;
      cant = remaining - maxSpan;
    } else if (remaining > maxSpan + maxCant) {
      span = maxSpan;
      cant = 0;
    }
    cursorFromLedger += span;
    beamStations.push(cursorFromLedger);
    remaining -= span + cant;
    if (cant > 0) break;
    if (beamStations.length > 12) break;
  }
  if (beamStations.length === 0) {
    beamStations.push(Math.max(depthIn * 0.85, next.settings.ledgerToDropBeamClearanceIn || depthIn));
  }

  const created: PlannerObject[] = [];
  const species = next.settings.defaultSpeciesLabel || DEFAULT_SPECIES_LABEL;

  const beams: BeamObject[] = [];
  for (const stationIn of beamStations) {
    const stationU = stationIn * unitsPerIn;
    const origin = add(ledgerMid, mul(intoDeck, ledgerProj - (ledgerMid.x * intoDeck.x + ledgerMid.y * intoDeck.y) + stationU));
    // Line through origin along beamAxis, long enough to clip.
    const half = ((widthIn + 48) / 2) * unitsPerIn;
    const rawA = add(origin, mul(beamAxis, -half * 4));
    const rawB = add(origin, mul(beamAxis, half * 4));
    const clipped =
      clipLineToPolygon(rawA, rawB, poly) ?? {
        a: add(origin, mul(beamAxis, (acrossMin - (origin.x * across.x + origin.y * across.y)))),
        b: add(origin, mul(beamAxis, (acrossMax - (origin.x * across.x + origin.y * across.y)))),
      };
    if (dist(clipped.a, clipped.b) < 1e-3) continue;
    const spanIn = dist(clipped.a, clipped.b) * iPerU;
    const joistSpanIn = stationIn;
    const beamLookup = smallestBeamForSpan({
      joistSpanIn,
      joistCantileverIn: 0,
      beamSpanIn: spanIn,
    });
    const nominal = "2x10";
    const dressed = dressedSize(nominal)!;
    const beam: BeamObject = {
      id: newId(),
      type: "beam",
      source: "fill",
      label: beamLookup.verified ? `${beamLookup.plyCount}-${beamLookup.nominalSize}` : "BEAM (size per Table R507.5(1))",
      speciesLabel: species,
      speciesTable: "southern-pine-no-2",
      material: "dimension lumber",
      treatment: "above-ground",
      notes: beamLookup.reason,
      a: clipped.a,
      b: clipped.b,
      plyCount: 2,
      nominalSize: nominal,
      actualWidthIn: dressed.w * 2,
      actualDepthIn: dressed.d,
      drop: true,
      sizeVerified: false,
      diagonal: false,
    };
    beams.push(beam);
    created.push(beam);
  }

  const noDig = collectNoDig(next, iPerU);

  for (const beam of beams) {
    const spanIn = dist(beam.a, beam.b) * iPerU;
    const maxCantU = maxBeamCantileverIn(spanIn) * unitsPerIn;
    const endPosts = [
      { t: 0, p: beam.a },
      { t: 1, p: beam.b },
    ];
    for (const ep of endPosts) {
      const placed = placePostAlongBeam(ep.p, beam, noDig, maxCantU, iPerU, species);
      created.push(placed);
    }
  }

  const joistSizeGuess = smallestJoistForSpan(
    beamStations[0] ?? depthIn,
    spacingIn,
  );
  const joistNominal: JoistSize = joistSizeGuess.size ?? "2x12";
  const joistDressed = dressedSize(joistNominal)!;

  const startAcross = acrossMin + 0.75 * unitsPerIn;
  const endAcross = acrossMax - 0.75 * unitsPerIn;
  const joists: JoistObject[] = [];
  const breaker = findByType(next, "breaker");

  for (let s = startAcross; s <= endAcross + 1e-6; s += spacingU) {
    // Build a line through the strip in the joist direction, from behind ledger to past far edge.
    const along0 = add(mul(across, s), mul(intoDeck, nearProj - 20 * unitsPerIn));
    const along1 = add(mul(across, s), mul(intoDeck, farProj + 20 * unitsPerIn));
    const clipped = clipLineToPolygon(along0, along1, poly);
    if (!clipped) continue;
    // Ensure joists run from ledger side outward and include bearing on drop beam.
    const aProj = clipped.a.x * intoDeck.x + clipped.a.y * intoDeck.y;
    const bProj = clipped.b.x * intoDeck.x + clipped.b.y * intoDeck.y;
    let a = clipped.a;
    let b = clipped.b;
    if (aProj > bProj) {
      a = clipped.b;
      b = clipped.a;
    }
    const bear = JOIST_BEARING_ON_WOOD_METAL_IN * unitsPerIn;
    b = add(b, mul(intoDeck, Math.min(bear, 2 * unitsPerIn)));
    const doubled = breaker.some((br) => {
      if (br.support !== "doubled-joists") return false;
      const t = projectT(lerp(a, b, 0.5), br.a, br.b);
      const near = lerp(br.a, br.b, Math.max(0, Math.min(1, t)));
      return dist(near, lerp(a, b, 0.5)) * iPerU < spacingIn * 0.55;
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

  for (const br of breaker) {
    if (br.support !== "blocking") continue;
    const clipped = clipLineToPolygon(
      extendSegment(br.a, br.b, 40 * unitsPerIn).a,
      extendSegment(br.a, br.b, 40 * unitsPerIn).b,
      poly,
    );
    if (!clipped) continue;
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
    const clipped = clipLineToPolygon(a0, b0, poly);
    if (!clipped) continue;
    if (dist(clipped.a, clipped.b) * iPerU < 6) continue;
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
      a: clipped.a,
      b: clipped.b,
      actualWidthIn: decking.boardWidthIn,
      actualThicknessIn: decking.thicknessIn,
    };
    created.push(board);
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

function placePostAlongBeam(
  preferred: { x: number; y: number },
  beam: BeamObject,
  noDig: NoDig[],
  maxCantU: number,
  iPerU: number,
  species: string,
): PostObject {
  const dressed = dressedSize("4x4")!;
  let p = preferred;
  let flagged = false;
  if (hitsNoDig(p, noDig)) {
    const samples = 80;
    let found: { x: number; y: number } | null = null;
    for (let i = 0; i <= samples; i++) {
      const t = i / samples;
      const cand = lerp(beam.a, beam.b, t);
      const along = dist(cand, preferred);
      if (along > maxCantU + dist(beam.a, beam.b) && t !== 0 && t !== 1) continue;
      if (!hitsNoDig(cand, noDig)) {
        const endDist = Math.min(dist(cand, beam.a), dist(cand, beam.b));
        const beyondEnd = !onSegment(cand, beam.a, beam.b);
        if (beyondEnd && endDist > maxCantU) continue;
        found = cand;
        break;
      }
    }
    if (found) p = found;
    else flagged = true;
  }
  const t = projectT(p, beam.a, beam.b);
  void iPerU;
  return {
    id: newId(),
    type: "post",
    source: "fill",
    label: "4x4 post",
    speciesLabel: species,
    speciesTable: "southern-pine-no-2",
    material: "dimension lumber",
    treatment: "ground-contact",
    notes: flagged ? "Could not clear no-dig within legal beam cantilever" : "",
    origin: p,
    nominalSize: "4x4",
    actualWidthIn: dressed.w,
    actualDepthIn: dressed.d,
    beamId: beam.id,
    tAlongBeam: t,
    flaggedNoDig: flagged,
  };
}

function onSegment(p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }): boolean {
  const t = projectT(p, a, b);
  return t >= -1e-6 && t <= 1 + 1e-6;
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
      if (!points[0]) return null;
      return {
        ...common,
        type,
        origin: points[0],
        angleDeg: points[1] ? angleDeg(sub(points[1], points[0])) : 0,
        widthIn: 36,
        riseIn: null,
        lengthIn: points[1] ? dist(points[0], points[1]) : 48,
      };
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
