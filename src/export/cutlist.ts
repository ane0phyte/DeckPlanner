import type { Project } from "../model/types";
import { findByType, inchesPerUnit, projectAreaSqIn } from "../model/project";
import { dist } from "../geom/vec";
import { formatInches } from "../units/length";
import { qtyWithWaste } from "../edit/measure";
import {
  STOCK_FT,
  UNSET_POST_LEN_IN,
  formatWasteLine,
  packPieces,
  shopLineText,
  type PackPiece,
} from "./stockPack";

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
      wasteNote: "Set scale to produce a cut list. Cut list is net pieces. No SKU catalog.",
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
    false,
  );

  const beams = findByType(project, "beam");
  for (const b of beams) {
    addLumber(
      `Beam ${b.plyCount}-ply drop`,
      b.nominalSize,
      `${b.actualWidthIn}×${b.actualDepthIn}`,
      Array.from({ length: b.plyCount }, () => ({ len: dist(b.a, b.b) * iPerU, id: b.id })),
      b.sizeVerified ? "" : "Size not table-verified — Table R507.5(1)",
      false,
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
    false,
  );

  const rims = findByType(project, "rim");
  addLumber(
    "Rim",
    rims[0]?.nominalSize ?? "—",
    rims[0] ? `${rims[0].actualWidthIn}×${rims[0].actualDepthIn}` : "—",
    rims.map((r) => ({ len: dist(r.a, r.b) * iPerU, id: r.id })),
    "",
    false,
  );

  const blocking = findByType(project, "blocking");
  addLumber(
    "Blocking",
    blocking[0]?.nominalSize ?? "—",
    blocking[0] ? `${blocking[0].actualWidthIn}×${blocking[0].actualDepthIn}` : "—",
    blocking.map((r) => ({ len: dist(r.a, r.b) * iPerU, id: r.id })),
    "",
    false,
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
    false,
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
  const flashLinFt = ledgers.reduce((s, l) => s + (dist(l.a, l.b) * iPerU) / 12, 0);
  const flashCov = project.settings.accessories.flashingCoverageSqFtPerRoll;
  const guardBox = project.settings.accessories.guardLinearFtPerBox;
  const outline = findByType(project, "outline")[0];

  const accessories: AccessoryRow[] = [
    {
      item: "Decking surface (outlined polygon − gaps)",
      product: project.settings.decking.productName || "(type product name)",
      layoutAmount: `${deckingSqFt.toFixed(1)} sf net`,
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
    "Cut list is net pieces (no waste). Shopping list packs those cuts onto store stick lengths. Hangers stay 1:1. No SKU catalog.";

  return {
    lumber: lumber.filter((r) => r.qty > 0),
    counts,
    accessories,
    wasteNote,
    wastePercent: wastePercent ?? null,
  };
}

export interface ShopLine {
  text: string;
  objectIds: string[];
  kind: "lumber" | "hardware" | "decking";
}

export interface ShopWaste {
  size: string;
  leftoverIn: number;
  percent: number;
  text: string;
}

export interface ShoppingList {
  lines: ShopLine[];
  waste: ShopWaste[];
  wasteSummary: string;
  note: string;
}

type SizeKind = "dim" | "post" | "decking";

interface SizeBucket {
  size: string;
  kind: SizeKind;
  pieces: PackPiece[];
}

function addPiece(buckets: Map<string, SizeBucket>, size: string, kind: SizeKind, piece: PackPiece): void {
  const key = `${kind}|${size}`;
  const g = buckets.get(key) ?? { size, kind, pieces: [] };
  g.pieces.push(piece);
  buckets.set(key, g);
}

function bucketSortKey(b: SizeBucket): string {
  if (b.kind === "decking") return `2|${b.size}`;
  if (b.kind === "post") return `1|${b.size}`;
  return `0|${b.size}`;
}

const SHOP_NOTE =
  "Store sticks are 6', 8', 12', and 16'. Packed from net cuts. Waste is leftover after packing (1/8\" kerf), not a typed percent. Hangers 1:1. No SKU catalog.";

/** Buy list: pack net cuts onto HD/Lowe’s stock. Ignore settings.wastePercent. */
export function buildShoppingList(project: Project): ShoppingList {
  const iPerU = inchesPerUnit(project);
  const empty: ShoppingList = { lines: [], waste: [], wasteSummary: "", note: SHOP_NOTE };
  if (!iPerU) {
    return { ...empty, note: "Set scale to produce a shopping list. " + SHOP_NOTE };
  }

  const buckets = new Map<string, SizeBucket>();

  const postH =
    project.settings.heights.deckIn != null && project.settings.heights.gradeIn != null
      ? Math.max(0, project.settings.heights.deckIn - project.settings.heights.gradeIn)
      : null;
  const posts = findByType(project, "post");
  for (const p of posts) {
    const size = p.nominalSize || "6x6";
    if (postH != null && postH > 0) {
      addPiece(buckets, size, "post", { lenIn: postH, objectId: p.id });
    } else {
      addPiece(buckets, size, "post", { lenIn: UNSET_POST_LEN_IN, objectId: p.id, exclusive: true });
    }
  }

  const joists = findByType(project, "joist");
  for (const j of joists) {
    const L = dist(j.a, j.b) * iPerU;
    const size = j.nominalSize || "2x8";
    addPiece(buckets, size, "dim", { lenIn: L, objectId: j.id });
    if (j.doubled) addPiece(buckets, size, "dim", { lenIn: L, objectId: j.id });
  }

  for (const b of findByType(project, "beam")) {
    const L = dist(b.a, b.b) * iPerU;
    const size = b.nominalSize || "2x10";
    for (let i = 0; i < b.plyCount; i++) {
      addPiece(buckets, size, "dim", { lenIn: L, objectId: b.id });
    }
  }

  for (const r of findByType(project, "rim")) {
    addPiece(buckets, r.nominalSize || "2x8", "dim", { lenIn: dist(r.a, r.b) * iPerU, objectId: r.id });
  }
  for (const r of findByType(project, "blocking")) {
    addPiece(buckets, r.nominalSize || "2x8", "dim", { lenIn: dist(r.a, r.b) * iPerU, objectId: r.id });
  }
  for (const r of findByType(project, "ledger")) {
    addPiece(buckets, r.nominalSize || "2x8", "dim", { lenIn: dist(r.a, r.b) * iPerU, objectId: r.id });
  }

  const boards = findByType(project, "board");
  for (const b of boards) {
    addPiece(buckets, "decking", "decking", { lenIn: dist(b.a, b.b) * iPerU, objectId: b.id });
  }

  const lines: ShopLine[] = [];
  const waste: ShopWaste[] = [];
  const ordered = [...buckets.values()].sort((a, b) => bucketSortKey(a).localeCompare(bucketSortKey(b)));
  for (const bucket of ordered) {
    const packed = packPieces(bucket.pieces, STOCK_FT);
    const kind: ShopLine["kind"] = bucket.kind === "decking" ? "decking" : "lumber";
    for (const buy of packed.buys) {
      if (buy.qty <= 0) continue;
      lines.push({
        text: shopLineText(buy.qty, bucket.size, buy.stockFt, buy.exceededMax),
        objectIds: buy.objectIds,
        kind,
      });
    }
    if (packed.stockIn > 0) {
      const text = formatWasteLine(bucket.size, packed.leftoverIn, packed.percent);
      waste.push({
        size: bucket.size,
        leftoverIn: packed.leftoverIn,
        percent: packed.percent,
        text,
      });
    }
  }

  if (joists.length) {
    lines.push({
      text: `${joists.length} — joist hangers`,
      objectIds: joists.map((j) => j.id),
      kind: "hardware",
    });
  }
  const laterals = findByType(project, "lateralDevice");
  if (laterals.length) {
    lines.push({
      text: `${laterals.length} — lateral-load devices`,
      objectIds: laterals.map((d) => d.id),
      kind: "hardware",
    });
  }

  return {
    lines,
    waste,
    wasteSummary: waste.map((w) => w.text).join(" · "),
    note: SHOP_NOTE,
  };
}
