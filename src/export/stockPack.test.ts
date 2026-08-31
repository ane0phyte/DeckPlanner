import { describe, expect, it } from "vitest";
import {
  DECK_STOCK_FT,
  DIM_STOCK_FT,
  POST_STOCK_FT,
  formatWasteLine,
  packPieces,
  shopLineText,
  splitOversize,
} from "./stockPack";

describe("stock packing", () => {
  it("buys a 10' 2x8 for a 9'-6\" cut, not a 16'", () => {
    const packed = packPieces([{ lenIn: 114, objectId: "j1" }], DIM_STOCK_FT);
    expect(packed.buys).toEqual([
      expect.objectContaining({ stockFt: 10, qty: 1 }),
    ]);
    expect(packed.buys.some((b) => b.stockFt === 16)).toBe(false);
    expect(shopLineText(1, "2x8", 10, false)).toBe("1 — 2x8 × 10'");
  });

  it("packs two 6' decking cuts onto one 12' stick, not two 12's", () => {
    const packed = packPieces(
      [
        { lenIn: 72, objectId: "a" },
        { lenIn: 72, objectId: "b" },
      ],
      DECK_STOCK_FT,
    );
    expect(packed.buys).toEqual([expect.objectContaining({ stockFt: 12, qty: 1 })]);
    expect(packed.sticks).toHaveLength(1);
    expect(packed.sticks[0].pieces).toHaveLength(2);
  });

  it("computes leftover waste, not a typed percent", () => {
    const packed = packPieces([{ lenIn: 114, objectId: "j1" }], DIM_STOCK_FT);
    expect(packed.leftoverIn).toBeCloseTo(6);
    expect(packed.percent).toBeCloseTo(5);
    expect(formatWasteLine("2x8", packed.leftoverIn, packed.percent)).toBe("2x8 waste 6\" (5%)");
    expect(formatWasteLine("decking", 0, 0)).toBe("decking waste ~0");
  });

  it("splits a run longer than max stock and notes it", () => {
    const parts = splitOversize(22 * 12, 20 * 12);
    expect(parts).toEqual([
      { lenIn: 240, split: true },
      { lenIn: 24, split: true },
    ]);
    const packed = packPieces([{ lenIn: 22 * 12, objectId: "long" }], DIM_STOCK_FT);
    expect(packed.buys.some((b) => b.stockFt === 20 && b.exceededMax && b.qty === 1)).toBe(true);
    expect(packed.buys.some((b) => b.stockFt === 8 && b.qty === 1)).toBe(true);
    const twenty = packed.buys.find((b) => b.stockFt === 20)!;
    expect(shopLineText(twenty.qty, "2x8", twenty.stockFt, twenty.exceededMax)).toMatch(
      /run exceeded max stick/,
    );
  });

  it("buys 8' posts when packing an unset-height 8' piece", () => {
    const packed = packPieces(
      [
        { lenIn: 96, objectId: "p1" },
        { lenIn: 96, objectId: "p2" },
      ],
      POST_STOCK_FT,
    );
    expect(packed.buys).toEqual([expect.objectContaining({ stockFt: 8, qty: 2 })]);
  });
});
