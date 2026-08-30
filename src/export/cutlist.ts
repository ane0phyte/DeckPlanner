import type { Project } from "../model/types";
import { findByType, inchesPerUnit, projectAreaSqIn } from "../model/project";
import { dist } from "../geom/vec";
import { formatInches } from "../units/length";

export interface LumberRow {
  member: string;
  nominal: string;
  actual: string;
  qty: number;
  eachLength: string;
  netLinearFt: number;
  notes: string;
}

export interface CountRow {
  item: string;
  product: string;
  qty: number;
  notes: string;
}

export interface AccessoryRow {
  item: string;
  product: string;
  layoutAmount: string;
  coverage: string;
  rollsOrBoxes: string;
}

export interface CutList {
  lumber: LumberRow[];
  counts: CountRow[];
  accessories: AccessoryRow[];
  wasteNote: string;
}

export function buildCutList(project: Project): CutList {
  const iPerU = inchesPerUnit(project);
  const lumber: LumberRow[] = [];
  if (!iPerU) {
    return {
      lumber,
      counts: [],
      accessories: [],
      wasteNote: "Set scale to produce a cut list. Waste = net only. No SKU catalog.",
    };
  }

  const addLumber = (
    member: string,
    nominal: string,
    actual: string,
    lengthsIn: number[],
    notes: string,
  ) => {
    const groups = new Map<string, { qty: number; len: number }>();
    for (const len of lengthsIn) {
      const key = len.toFixed(2);
      const g = groups.get(key) ?? { qty: 0, len };
      g.qty += 1;
      groups.set(key, g);
    }
    for (const g of groups.values()) {
      lumber.push({
        member,
        nominal,
        actual,
        qty: g.qty,
        eachLength: formatInches(g.len),
        netLinearFt: (g.qty * g.len) / 12,
        notes,
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
      return j.doubled ? [L, L] : [L];
    }),
    "Southern pine No. 2 table; label may say Prime",
  );

  const beams = findByType(project, "beam");
  for (const b of beams) {
    addLumber(
      `Beam ${b.plyCount}-ply drop`,
      b.nominalSize,
      `${b.actualWidthIn}×${b.actualDepthIn}`,
      Array.from({ length: b.plyCount }, () => dist(b.a, b.b) * iPerU),
      b.sizeVerified ? "" : "Size not table-verified — Table R507.5(1)",
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
    posts.map(() => postH ?? 0).filter((n) => n > 0),
    "XY only. Height = typed deck − grade. No frost / footing.",
  );

  const rims = findByType(project, "rim");
  addLumber(
    "Rim",
    rims[0]?.nominalSize ?? "—",
    rims[0] ? `${rims[0].actualWidthIn}×${rims[0].actualDepthIn}` : "—",
    rims.map((r) => dist(r.a, r.b) * iPerU),
    "",
  );

  const blocking = findByType(project, "blocking");
  addLumber(
    "Blocking",
    blocking[0]?.nominalSize ?? "—",
    blocking[0] ? `${blocking[0].actualWidthIn}×${blocking[0].actualDepthIn}` : "—",
    blocking.map((r) => dist(r.a, r.b) * iPerU),
    "",
  );

  const ledgers = findByType(project, "ledger");
  addLumber(
    "Ledger",
    ledgers[0]?.nominalSize ?? "—",
    ledgers[0] ? `${ledgers[0].actualWidthIn}×${ledgers[0].actualDepthIn}` : "—",
    ledgers.map((r) => dist(r.a, r.b) * iPerU),
    "",
  );

  const boards = findByType(project, "board");
  addLumber(
    "Decking",
    project.settings.decking.productName || "decking",
    `${project.settings.decking.boardWidthIn}×${project.settings.decking.thicknessIn}`,
    boards.map((b) => dist(b.a, b.b) * iPerU),
    `gap ${project.settings.decking.gapIn ?? "—"} in`,
  );

  const guards = findByType(project, "guard");
  const guardLinFt = guards.reduce((s, g) => s + (dist(g.a, g.b) * iPerU) / 12, 0);

  const counts: CountRow[] = [
    {
      item: "Joist hangers (1:1 at ledger)",
      product: project.settings.accessories.hangerProduct || "(type product name)",
      qty: joists.length,
      notes: "Layout count. No SKU catalog.",
    },
    {
      item: "Lateral-load devices (1:1)",
      product: project.settings.lateralProduct || "(type product name)",
      qty: findByType(project, "lateralDevice").length,
      notes: "R507.9.2. Ledger bolts do not satisfy this.",
    },
    {
      item: "Posts / post holes (XY)",
      product: "—",
      qty: posts.length,
      notes: "No frost. No footing sizing.",
    },
    ...posts.map((p) => ({
      item: `Post hole ${p.nominalSize}`,
      product: p.nominalSize,
      qty: 1,
      notes: `XY (${p.origin.x.toFixed(1)}, ${p.origin.y.toFixed(1)}) · ${p.label}`,
    })),
  ];

  const areaSqFt = projectAreaSqIn(project, iPerU) / 144;
  const boardW = project.settings.decking.boardWidthIn;
  const gapIn = project.settings.decking.gapIn ?? 0;
  const deckingSqFt = boardW > 0 ? areaSqFt * (boardW / (boardW + gapIn)) : areaSqFt;
  const flashLinFt = ledgers.reduce((s, l) => s + (dist(l.a, l.b) * iPerU) / 12, 0);
  const flashCov = project.settings.accessories.flashingCoverageSqFtPerRoll;
  const guardBox = project.settings.accessories.guardLinearFtPerBox;

  const accessories: AccessoryRow[] = [
    {
      item: "Decking surface (outlined polygon − gaps)",
      product: project.settings.decking.productName || "(type product name)",
      layoutAmount: `${deckingSqFt.toFixed(1)} sf`,
      coverage: `outline ${areaSqFt.toFixed(1)} sf · gap ${gapIn || "0"} in`,
      rollsOrBoxes: "—",
    },
    {
      item: "Ledger flashing (area / linear)",
      product: project.settings.flashingProduct || "(type product name)",
      layoutAmount: `${flashLinFt.toFixed(1)} lin ft  ·  deck ${areaSqFt.toFixed(1)} sf`,
      coverage: flashCov != null ? `${flashCov} sf / roll (user)` : "type coverage sf/roll",
      rollsOrBoxes:
        flashCov && flashCov > 0 ? `${Math.ceil(areaSqFt / flashCov)} roll(s) from user coverage` : "—",
    },
    {
      item: "Guards (linear)",
      product: "—",
      layoutAmount: `${guardLinFt.toFixed(1)} lin ft`,
      coverage: guardBox != null ? `${guardBox} lin ft / box (user)` : "type count per box",
      rollsOrBoxes: guardBox && guardBox > 0 ? `${Math.ceil(guardLinFt / guardBox)} box(es)` : "—",
    },
  ];

  return {
    lumber: lumber.filter((r) => r.qty > 0),
    counts,
    accessories,
    wasteNote: "Waste = net only. No SKU catalog. No invented coverage.",
  };
}
