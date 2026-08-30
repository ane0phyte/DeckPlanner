import { describe, expect, it } from "vitest";
import {
  JOIST_SPAN_R507_6,
  LIVE_PSF,
  effectiveJoistSpacingIn,
  ledgerFastenerOcIn,
  maxBeamCantileverIn,
  maxJoistCantilever,
  maxPostHeightIn,
  smallestBeamForSpan,
  smallestJoistForSpan,
  woodDeckingMaxSpacingIn,
} from "./tables";
import { ftIn } from "../units/length";

describe("verified 2024 IRC tables", () => {
  it("uses 40 psf live", () => {
    expect(LIVE_PSF).toBe(40);
  });

  it("inverts Table R507.6 Southern pine", () => {
    expect(JOIST_SPAN_R507_6["2x8"][16]).toBe(ftIn(11, 10));
    expect(smallestJoistForSpan(ftIn(11, 10), 16).size).toBe("2x8");
    expect(smallestJoistForSpan(ftIn(11, 11), 16).size).toBe("2x10");
    expect(smallestJoistForSpan(ftIn(18, 1), 12).size).toBeNull();
  });

  it("looks up cantilever vs back span without inventing NP", () => {
    expect(maxJoistCantilever("2x6", ftIn(8, 0))).toBe(ftIn(1, 5));
    expect(maxJoistCantilever("2x6", ftIn(10, 0))).toBeNull();
    expect(maxJoistCantilever("2x12", ftIn(18, 0))).toBe(ftIn(4, 1));
    expect(maxJoistCantilever("2x8", ftIn(9, 0))).toBe(ftIn(2, 0));
  });

  it("applies Table R507.7 wood spacing", () => {
    expect(woodDeckingMaxSpacingIn("wood-1.25", false, false)).toBe(12);
    expect(woodDeckingMaxSpacingIn("wood-1.25", false, true)).toBe(16);
    expect(woodDeckingMaxSpacingIn("wood-1.25", true, false)).toBe(8);
    expect(woodDeckingMaxSpacingIn("wood-2", true, false)).toBe(18);
    expect(woodDeckingMaxSpacingIn("composite-other", false, false)).toBeNull();
    const e = effectiveJoistSpacingIn({
      typedMaxIn: 24,
      category: "wood-1.25",
      diagonal: false,
      multipleSpan: false,
    });
    expect(e.spacingIn).toBe(12);
    expect(e.usedWoodTable).toBe(true);
  });

  it("Table R507.4 4x4 and 6x6/8x8 only; 4x6 not invented", () => {
    expect(maxPostHeightIn("4x4", 40).heightIn).toBe(ftIn(13, 8));
    expect(maxPostHeightIn("4x4", 100).heightIn).toBe(ftIn(8, 4));
    expect(maxPostHeightIn("6x6", 160).heightIn).toBe(ftIn(14, 0));
    expect(maxPostHeightIn("4x6", 80).heightIn).toBeNull();
  });

  it("does not invent Table R507.5(1) beam cells", () => {
    const r = smallestBeamForSpan({ joistSpanIn: 120, joistCantileverIn: 0, beamSpanIn: 96 });
    expect(r.verified).toBe(false);
    expect(r.nominalSize).toBeNull();
    expect(r.reason).toMatch(/R507\.5\(1\)/);
  });

  it("beam cantilever is span/4 (R507.5.1)", () => {
    expect(maxBeamCantileverIn(120)).toBe(30);
  });

  it("interpolates ledger o.c. and refuses extrapolation", () => {
    expect(ledgerFastenerOcIn("lag-1/2-sheathing-1/2", ftIn(6, 0)).ocIn).toBe(30);
    expect(ledgerFastenerOcIn("bolt-1/2-sheathing-1/2", ftIn(10, 0)).ocIn).toBe(34);
    const mid = ledgerFastenerOcIn("lag-1/2-sheathing-1/2", ftIn(7, 0));
    expect(mid.ocIn).toBeCloseTo(26.5);
    expect(ledgerFastenerOcIn("lag-1/2-sheathing-1/2", ftIn(5, 0)).ocIn).toBeNull();
    expect(ledgerFastenerOcIn("lag-1/2-sheathing-1/2", ftIn(20, 0)).ocIn).toBeNull();
  });
});
