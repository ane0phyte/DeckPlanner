import type { Project } from "../model/types";
import { findByType, inchesPerUnit, projectAreaSqIn } from "../model/project";
import { dist } from "../geom/vec";
import { formatInches } from "../units/length";
import { areaWithWaste, qtyWithWaste } from "../edit/measure";

export interface LumberRow {
  member: string;
  nominal: string;
  actual: string;
  qty: number;
  qtyWithWaste: number;
  eachLength: string;
  netLinearFt: number;
  notes: string;
  objectIds: string[];
  applyWaste: boolean;
}

export interface CountRow {
  item: string;
  product: string;
  qty: number;
  notes: string;
  objectIds: string[];
}

export interface AccessoryRow {
  item: string;
  product: string;
  layoutAmount: string;
  coverage: string;
  rollsOrBoxes: string;
  objectIds: string[];
}

export interface CutList {
  lumber: LumberRow[];
  counts: CountRow[];
  accessories: AccessoryRow[];
  wasteNote: string;
  wastePercent: number | null;
}

export function buildCutList(project: Project): CutList {
  const iPerU = inchesPerUnit(project);
  const wastePercent = project.settings.wastePercent;
  const lumber: LumberRow[] = [];
  if (!iPerU) {
    return {
      lumber,
      counts: [],
      accessories: [],
      wasteNote: "Set scale to produce a cut list. Waste = net only until you type a percent. No SKU catalog.",
      wastePercent: wastePercent ?? null,
    };
  }

  const addLumber = (
    member: string,
    nominal: string,
    actual: string,
    pieces: { len: number; id: string }[],
    notes: string,
    applyWaste: boolean,
  ) => {
    const groups = new Map<string, { qty: number; len: number; ids: string[] }>();
    for (const piece of pieces) {
      const key = piece.len.toFixed(2);
      const g = groups.get(key) ?? { qty: 0, len: piece.len, ids: [] };
      g.qty += 1;
      g.ids.push(piece.id);
      groups.set(key, g);
    }
    for (const g of groups.values()) {
      const withWaste = applyWaste ? qtyWithWaste(g.qty, wastePercent) : g.qty;
      lumber.push({
        member,
        nominal,
        actual,
        qty: g.qty,
        qtyWithWaste: withWaste,
        eachLength: formatInches(g.len),
        netLinearFt: (g.qty * g.len) / 12,
        notes,
        objectIds: g.ids,
        applyWaste,
      });
    }
  };

  const joists = findByType(project, "joist");
  addLumber(
    "Joist",
    joists[0]?.nominalSize ?? "—",
    joists[0] ? `${joists[0].actualWidthIn}×${joists[0].actualDepthIn}` : "—",
    joists.flatMap((j) => {
      const L = dist(j.a, j.b) * iPerU;
      return j.doubled ? [{ len: L, id: j.id }, { len: L, id: j.id }] : [{ len: L, id: j.id }];
    }),
    "Southern pine No. 2 table; label may say Prime",
    true,
  );

  const beams = findByType(project, "beam");
  for (const b of beams) {
    addLumber(
      `Beam ${b.plyCount}-ply drop`,
      b.nominalSize,
      `${b.actualWidthIn}×${b.actualDepthIn}`,
      Array.from({ length: b.plyCount }, () => ({ len: dist(b.a, b.b) * iPerU, id: b.id })),
      b.sizeVerified ? "" : "Size not table-verified — Table R507.5(1)",
      true,
    );
  }

  const posts = findByType(project, "post");
  const postH =
    project.settings.heights.deckIn != null && project.settings.heights.gradeIn != null
      ? Math.max(0, project.settings.heights.deckIn - project.settings.heights.gradeIn)
      : null;
  addLumber(
    "Post",
    posts[0]?.nominalSize ?? "—",
    posts[0] ? `${posts[0].actualWidthIn}×${posts[0].actualDepthIn}` : "—",
    posts
      .map((p) => ({ len: postH ?? 0, id: p.id }))
      .filter((n) => n.len > 0),
    "XY only. Height = typed deck − grade. No frost / footing.",
    true,
  );

  const rims = findByType(project, "rim");
  addLumber(
    "Rim",
    rims[0]?.nominalSize ?? "—",
    rims[0] ? `${rims[0].actualWidthIn}×${rims[0].actualDepthIn}` : "—",
    rims.map((r) => ({ len: dist(r.a, r.b) * iPerU, id: r.id })),
    "",
    true,
  );

  const blocking = findByType(project, "blocking");
  addLumber(
    "Blocking",
    blocking[0]?.nominalSize ?? "—",
    blocking[0] ? `${blocking[0].actualWidthIn}×${blocking[0].actualDepthIn}` : "—",
    blocking.map((r) => ({ len: dist(r.a, r.b) * iPerU, id: r.id })),
    "",
    true,
  );

  const ledgers = findByType(project, "ledger");
  addLumber(
    "Ledger",
    ledgers[0]?.nominalSize ?? "—",
    ledgers[0] ? `${ledgers[0].actualWidthIn}×${ledgers[0].actualDepthIn}` : "—",
    ledgers.map((r) => ({ len: dist(r.a, r.b) * iPerU, id: r.id })),
    "",
    false,
  );

  const boards = findByType(project, "board");
  addLumber(
    "Decking",
    project.settings.decking.productName || "decking",
    `${project.settings.decking.boardWidthIn}×${project.settings.decking.thicknessIn}`,
    boards.map((b) => ({ len: dist(b.a, b.b) * iPerU, id: b.id })),
    `gap ${project.settings.decking.gapIn ?? "—"} in`,
    true,
  );

  const guards = findByType(project, "guard");
  const guardLinFt = guards.reduce((s, g) => s + (dist(g.a, g.b) * iPerU) / 12, 0);

  const counts: CountRow[] = [
    {
      item: "Joist hangers (1:1 at ledger)",
      product: project.settings.accessories.hangerProduct || "(type product name)",
      qty: joists.length,
      notes: "Layout count. No SKU catalog. No waste.",
      objectIds: joists.map((j) => j.id),
    },
    {
      item: "Lateral-load devices (1:1)",
      product: project.settings.lateralProduct || "(type product name)",
      qty: findByType(project, "lateralDevice").length,
      notes: "R507.9.2. Ledger bolts do not satisfy this. No waste.",
      objectIds: findByType(project, "lateralDevice").map((d) => d.id),
    },
    {
      item: "Posts / post holes (XY)",
      product: "—",
      qty: posts.length,
      notes: "No frost. No footing sizing. No waste.",
      objectIds: posts.map((p) => p.id),
    },
    ...posts.map((p) => ({
      item: `Post hole ${p.nominalSize}`,
      product: p.nominalSize,
      qty: 1,
      notes: `XY (${p.origin.x.toFixed(1)}, ${p.origin.y.toFixed(1)}) · ${p.label}`,
      objectIds: [p.id],
    })),
  ];

  const areaSqFt = projectAreaSqIn(project, iPerU) / 144;
  const boardW = project.settings.decking.boardWidthIn;
  const gapIn = project.settings.decking.gapIn ?? 0;
  const deckingSqFt = boardW > 0 ? areaSqFt * (boardW / (boardW + gapIn)) : areaSqFt;
  const deckingWasteSf = areaWithWaste(deckingSqFt, wastePercent);
  const flashLinFt = ledgers.reduce((s, l) => s + (dist(l.a, l.b) * iPerU) / 12, 0);
  const flashCov = project.settings.accessories.flashingCoverageSqFtPerRoll;
  const guardBox = project.settings.accessories.guardLinearFtPerBox;
  const outline = findByType(project, "outline")[0];

  const wasteBit =
    wastePercent != null && wastePercent > 0
      ? ` → ${deckingWasteSf.toFixed(1)} sf w/ ${wastePercent}% waste`
      : "";

  const accessories: AccessoryRow[] = [
    {
      item: "Decking surface (outlined polygon − gaps)",
      product: project.settings.decking.productName || "(type product name)",
      layoutAmount: `${deckingSqFt.toFixed(1)} sf net${wasteBit}`,
      coverage: `outline ${areaSqFt.toFixed(1)} sf · gap ${gapIn || "0"} in`,
      rollsOrBoxes: "—",
      objectIds: outline ? [outline.id] : boards.map((b) => b.id),
    },
    {
      item: "Ledger flashing (area / linear)",
      product: project.settings.flashingProduct || "(type product name)",
      layoutAmount: `${flashLinFt.toFixed(1)} lin ft  ·  deck ${areaSqFt.toFixed(1)} sf`,
      coverage: flashCov != null ? `${flashCov} sf / roll (user)` : "type coverage sf/roll",
      rollsOrBoxes:
        flashCov && flashCov > 0 ? `${Math.ceil(areaSqFt / flashCov)} roll(s) from user coverage` : "—",
      objectIds: ledgers.map((l) => l.id),
    },
    {
      item: "Guards (linear)",
      product: "—",
      layoutAmount: `${guardLinFt.toFixed(1)} lin ft`,
      coverage: guardBox != null ? `${guardBox} lin ft / box (user)` : "type count per box",
      rollsOrBoxes: guardBox && guardBox > 0 ? `${Math.ceil(guardLinFt / guardBox)} box(es)` : "—",
      objectIds: guards.map((g) => g.id),
    },
  ];

  const wasteNote =
    wastePercent != null && wastePercent > 0
      ? `Waste ${wastePercent}% (typed). Lumber/decking rounded up to whole pieces or area × (1+waste). Hangers and counted hardware stay 1:1. No SKU catalog.`
      : "Waste = net only. Type a waste % to add extra lumber/decking. Hangers stay 1:1. No SKU catalog.";

  return {
    lumber: lumber.filter((r) => r.qty > 0),
    counts,
    accessories,
    wasteNote,
    wastePercent: wastePercent ?? null,
  };
}
