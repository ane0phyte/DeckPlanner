import { dressedSize, formatInches } from "../units/length";
import { dist } from "../geom/vec";
import type { IrcFlag, PlannerObject, Project } from "../model/types";
import { findByType, inchesPerUnit } from "../model/project";
import {
  GUARD_HEIGHT_IN,
  GUARD_TRIGGER_HEIGHT_IN,
  JOIST_BEARING_ON_WOOD_METAL_IN,
  LIVE_PSF,
  STAIR_CLEAR_WIDTH_IN,
  STAIR_MAX_RISER_IN,
  STAIR_RISER_VARIATION_IN,
  ledgerFastenerOcIn,
  maxBeamCantileverIn,
  maxJoistCantilever,
  maxPostHeightIn,
  smallestJoistForSpan,
  type JoistSize,
} from "./tables";

let flagSeq = 0;
function flag(
  severity: IrcFlag["severity"],
  section: string,
  message: string,
  objectIds: string[] = [],
): IrcFlag {
  flagSeq += 1;
  return { id: `flag-${flagSeq}`, severity, section, message, objectIds };
}

export function evaluateProject(project: Project): IrcFlag[] {
  flagSeq = 0;
  const flags: IrcFlag[] = [];
  const iPerU = inchesPerUnit(project);

  flags.push(
    flag(
      "info",
      "R301.5",
      `Deck live load ${LIVE_PSF} psf (Table R301.5). Dead load 10 psf is baked into the 2024 R507 tables. Snow is not concurrent with live. No site snow number in v1 — ${LIVE_PSF} psf live governs. L/Δ = 360 main, 180 cantilever.`,
    ),
  );

  if (!iPerU) {
    flags.push(flag("warn", "—", "Scale is not set. Mark a known length on the photo before Fill or IRC span checks."));
    return flags;
  }

  const outlines = findByType(project, "outline");
  const ledgers = findByType(project, "ledger");
  if (outlines.length === 0) flags.push(flag("warn", "—", "No new-deck outline. Draw a polygon (no holes)."));
  if (ledgers.length === 0) flags.push(flag("warn", "R507.9", "No ledger object. Fill requires outline + ledger."));

  for (const ledger of ledgers) {
    const dressed = dressedSize(ledger.nominalSize);
    if (ledger.nominalSize === "2x6" || ledger.nominalSize === "2x4") {
      flags.push(
        flag(
          "violation",
          "R507.9.1.1",
          `Ledger minimum is 2x8. This ledger is ${ledger.nominalSize}.`,
          [ledger.id],
        ),
      );
    }
    if (ledger.substrate === "stone-masonry-veneer") {
      flags.push(
        flag(
          "violation",
          "R507.9.1.1",
          "Ledger shall not be supported on stone or masonry veneer.",
          [ledger.id],
        ),
      );
    }
    flags.push(
      flag(
        "info",
        "R507.9.1.1",
        "Deck ledger shall not support concentrated loads from beams or girders.",
        [ledger.id],
      ),
    );
    if (ledger.bandRimType === "other-do-not-use-oc-table") {
      flags.push(
        flag(
          "warn",
          "R507.9.1.3",
          "Band/rim is not 2 in nominal solid-sawn SPF or better, and not 1 in engineered rim (PRR 410 / ASTM D7672). Do not use the o.c. table.",
          [ledger.id],
        ),
      );
    } else {
      const joists = findByType(project, "joist");
      const spanIn = joists[0] ? dist(joists[0].a, joists[0].b) * iPerU : null;
      if (spanIn) {
        const oc = ledgerFastenerOcIn(ledger.fastenerKind, spanIn);
        if (oc.ocIn == null) {
          flags.push(flag("warn", "R507.9.1.3(1)", oc.note, [ledger.id]));
        } else {
          flags.push(
            flag(
              "info",
              "R507.9.1.3(1)",
              `Ledger fastener spacing ${oc.ocIn.toFixed(1)} in o.c. (${oc.note}). No structural-screw column.`,
              [ledger.id],
            ),
          );
        }
      }
      flags.push(
        flag(
          "info",
          "R507.9.1.3(2)",
          "Placement: ledger top 2 in, bottom 3/4 in, ends 2 in, row 1-5/8 in; band top 3/4 in, bottom 2 in, ends 2 in, row 1-5/8 in.",
          [ledger.id],
        ),
      );
    }
    if (!ledger.flashingProduct.trim()) {
      flags.push(
        flag(
          "warn",
          "R507.9.1.5",
          "Ledger flashing product name is empty. Do not invent a product. Type the product you will use.",
          [ledger.id],
        ),
      );
    }
    flags.push(
      flag(
        "info",
        "R507.9.1.5",
        "Flashing ≥2 in vertical above ledger; ≥4 in beyond the face, or to the face plus ≥1/4 in down.",
        [ledger.id],
      ),
    );
    if (dressed && (Math.abs(dressed.d - ledger.actualDepthIn) > 0.05 || Math.abs(dressed.w - ledger.actualWidthIn) > 0.05)) {
      flags.push(
        flag(
          "info",
          "—",
          `${ledger.nominalSize} is laid out at dressed ${dressed.w} × ${dressed.d} in. Inspector actual size differs.`,
          [ledger.id],
        ),
      );
    }
  }

  const laterals = findByType(project, "lateralDevice");
  if (ledgers.length && laterals.length === 0) {
    flags.push(
      flag(
        "violation",
        "R507.9.2",
        "Lateral-load connection required. Need ≥2 hold-downs 1500 lb ASD within 24 in of each end, or ≥4 at 750 lb ASD. Ledger bolts do not satisfy this.",
      ),
    );
  } else if (laterals.length) {
    const scheme = project.settings.lateralScheme;
    if (scheme === "2x1500" && laterals.length < 2) {
      flags.push(flag("violation", "R507.9.2", "2×1500 lb ASD scheme needs at least two hold-downs.", laterals.map((l) => l.id)));
    }
    if (scheme === "4x750" && laterals.length < 4) {
      flags.push(flag("violation", "R507.9.2", "4×750 lb ASD scheme needs at least four hold-downs.", laterals.map((l) => l.id)));
    }
    if (!project.settings.lateralProduct.trim()) {
      flags.push(flag("warn", "R507.9.2", "Lateral-load product name is empty. Type the product. Ledger bolts do not satisfy R507.9.2."));
    }
  }

  const { deckIn, gradeIn } = project.settings.heights;
  const walkingAboveGrade =
    deckIn != null && gradeIn != null ? deckIn - gradeIn : null;
  if (walkingAboveGrade != null && walkingAboveGrade > GUARD_TRIGGER_HEIGHT_IN) {
    const guards = findByType(project, "guard");
    const openNeed = guards.length === 0;
    if (openNeed) {
      flags.push(
        flag(
          "violation",
          "R321",
          `Walking surface is ${formatInches(walkingAboveGrade)} above grade (>30 in). Guards 36 in high are required on open edges where the grade is more than 30 in below within 36 in horizontally. Site is treated as flat.`,
        ),
      );
    } else {
      for (const g of guards) {
        if (g.heightIn + 1e-6 < GUARD_HEIGHT_IN) {
          flags.push(
            flag("violation", "R321", `Guard height ${formatInches(g.heightIn)} is less than 36 in.`, [g.id]),
          );
        }
      }
    }
  }

  const joists = findByType(project, "joist");
  for (const j of joists) {
    const spanIn = dist(j.a, j.b) * iPerU;
    const spacing = project.settings.decking.maxJoistSpacingIn ?? 16;
    if (j.nominalSize === "2x6" || j.nominalSize === "2x8" || j.nominalSize === "2x10" || j.nominalSize === "2x12") {
      const sized = smallestJoistForSpan(spanIn, spacing);
      const tableMax =
        sized.size == null
          ? sized.maxSpanIn
          : sized.maxSpanIn;
      if (sized.size == null) {
        flags.push(flag("violation", "R507.6", sized.reason, [j.id]));
      } else if (spanIn > tableMax + 1e-6) {
        flags.push(
          flag(
            "violation",
            "R507.6",
            `${j.nominalSize} span ${formatInches(spanIn)} exceeds Table R507.6 at ${spacing} in o.c.`,
            [j.id],
          ),
        );
      }
    }
    flags.push(
      flag(
        "info",
        "R507.6.1",
        `Joist bearing 1.5 in on wood or metal. Joists bear on top of multi-ply drop beam / ledger (${JOIST_BEARING_ON_WOOD_METAL_IN} in).`,
        [j.id],
      ),
    );
  }

  const beams = findByType(project, "beam");
  for (const b of beams) {
    if (!b.sizeVerified) {
      flags.push(
        flag(
          "warn",
          "R507.5(1)",
          "Table R507.5(1) Southern pine 40 live: this joist-span / joist-cantilever cell is not in the v1 verified set. Enter beam size. Interpolation only for zero joist cantilever; no extrapolation. 2021 Table R507.5(5) does not exist in 2024.",
          [b.id],
        ),
      );
    }
    const spanIn = dist(b.a, b.b) * iPerU;
    const maxCant = maxBeamCantileverIn(spanIn);
    flags.push(
      flag(
        "info",
        "R507.5.1",
        `Beam cantilever shall not exceed actual beam span / 4 (${formatInches(maxCant)} for this ${formatInches(spanIn)} span).`,
        [b.id],
      ),
    );
    if (b.diagonal && b.source === "fill") {
      flags.push(flag("violation", "—", "Fill must not create diagonal beams.", [b.id]));
    }
  }

  const posts = findByType(project, "post");
  for (const p of posts) {
    if (p.flaggedNoDig) {
      flags.push(
        flag(
          "warn",
          "—",
          "Post could not clear a no-dig buffer within a legal beam cantilever (R507.5.1). Generated anyway.",
          [p.id],
        ),
      );
    }
    if (walkingAboveGrade != null) {
      const trib = estimateTributarySf(project, p, iPerU);
      const h = maxPostHeightIn(p.nominalSize, trib);
      const postHeight = walkingAboveGrade;
      if (h.heightIn == null) {
        flags.push(flag("warn", "R507.4", h.note, [p.id]));
      } else if (postHeight > h.heightIn + 1e-6) {
        flags.push(
          flag(
            "violation",
            "R507.4",
            `Post height (deck − grade, footing not modeled) ${formatInches(postHeight)} exceeds Table R507.4 ${p.nominalSize} at ~${trib.toFixed(0)} sf (${formatInches(h.heightIn)}). ${h.note}`,
            [p.id],
          ),
        );
      } else {
        flags.push(
          flag(
            "info",
            "R507.4",
            `Post height uses typed deck minus grade as a stand-in for underside-of-beam to top-of-footing. Footings are not sized in v1. ${h.note}`,
            [p.id],
          ),
        );
      }
    }
  }

  for (const s of findByType(project, "stairs")) {
    checkStairs(s, flags);
  }
  for (const s of findByType(project, "existingStairs")) {
    checkStairs(s, flags);
  }

  if (project.settings.decking.productName.trim() === "" || project.settings.decking.gapIn == null || project.settings.decking.maxJoistSpacingIn == null) {
    flags.push(
      flag(
        "warn",
        "R507.7",
        "Decking product, gap, and max joist spacing must be set before Fill. Wood decking also uses Table R507.7; Fill takes the more restrictive of the wood table and the typed max. Composite is not in Table R507.7 — typed max only.",
      ),
    );
  }

  const speciesNote = project.objects.some((o) => "speciesLabel" in o && o.speciesLabel.includes("Prime"));
  if (speciesNote) {
    flags.push(
      flag(
        "info",
        "R507",
        "Member label default is Southern Yellow Pine No. 2 Prime (Home Depot). TABLE LOOKUP is Southern pine No. 2. There is no Prime table.",
      ),
    );
  }

  return uniqueFlags(flags);
}

function checkStairs(s: PlannerObject, flags: IrcFlag[]): void {
  if (s.type !== "stairs" && s.type !== "existingStairs") return;
  if (s.widthIn != null) {
    if (s.widthIn + 1e-6 < STAIR_CLEAR_WIDTH_IN) {
      flags.push(
        flag("violation", "R318.7.1", `Stair width ${formatInches(s.widthIn)} is less than 36 in clear.`, [s.id]),
      );
    }
  }
  if (s.riseIn != null) {
    if (s.riseIn > STAIR_MAX_RISER_IN + 1e-6) {
      flags.push(
        flag("violation", "R318.7.5.1", `Riser ${formatInches(s.riseIn)} exceeds 7-3/4 in.`, [s.id]),
      );
    }
    flags.push(
      flag(
        "info",
        "R318.7.5.1",
        `Max riser 7-3/4 in; ${STAIR_RISER_VARIATION_IN} in variation. v1 does not require run, stringer count, or handrail.`,
        [s.id],
      ),
    );
  }
}

function estimateTributarySf(project: Project, post: Extract<PlannerObject, { type: "post" }>, iPerU: number): number {
  const beams = findByType(project, "beam");
  const beam = beams.find((b) => b.id === post.beamId) ?? beams[0];
  if (!beam) return 40;
  const beamLenFt = (dist(beam.a, beam.b) * iPerU) / 12;
  const joists = findByType(project, "joist");
  const joistFt = joists[0] ? (dist(joists[0].a, joists[0].b) * iPerU) / 12 : 8;
  const postCount = project.objects.filter((o) => o.type === "post" && o.beamId === beam.id).length || 2;
  const trib = (beamLenFt / Math.max(1, postCount - 1)) * (joistFt / 2);
  return Math.max(20, trib);
}

function uniqueFlags(flags: IrcFlag[]): IrcFlag[] {
  const seen = new Set<string>();
  const out: IrcFlag[] = [];
  for (const f of flags) {
    const key = `${f.section}|${f.message}|${f.objectIds.join(",")}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(f);
  }
  return out;
}

export function joistCantileverOk(size: JoistSize, backSpanIn: number, cantIn: number): boolean {
  const max = maxJoistCantilever(size, backSpanIn);
  if (max == null) return false;
  return cantIn <= max + 1e-6;
}
