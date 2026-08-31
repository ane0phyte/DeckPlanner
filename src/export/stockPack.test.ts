import { describe, expect, it } from "vitest";
import {
  DECK_STOCK_FT,
  DIM_STOCK_FT,
  POST_STOCK_FT,
  STOCK_FT,
  coverLength,
  formatWasteLine,
  packPieces,
  shopLineText,
  splitOversize,
} from "./stockPack";

function buyFeet(packed: ReturnType<typeof packPieces>): number[] {
  return packed.buys.flatMap((b) => Array.from({ length: b.qty }, () => b.stockFt));
}

describe("stock packing", () => {
  it("uses only 6', 8', 12', and 16' stock", () => {
    expect([...STOCK_FT]).toEqual([6, 8, 12, 16]);
    expect([...DIM_STOCK_FT]).toEqual([6, 8, 12, 16]);
    expect([...POST_STOCK_FT]).toEqual([6, 8, 12, 16]);
    expect([...DECK_STOCK_FT]).toEqual([6, 8, 12, 16]);
  });

  it("buys a 12' 2x8 for a 9'-6\" cut, not a 16'", () => {
    const packed = packPieces([{ lenIn: 114, objectId: "j1" }], DIM_STOCK_FT);
    expect(packed.buys).toEqual([expect.objectContaining({ stockFt: 12, qty: 1 })]);
    expect(buyFeet(packed).some((ft) => ft === 10 || ft === 16 || ft === 20)).toBe(false);
    expect(shopLineText(1, "2x8", 12, false)).toBe("1 — 2x8 × 12'");
  });

  it("packs two 6' decking cuts onto one 12' (fewest sticks, leftover equal to two 6')", () => {
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
    expect(buyFeet(packed).some((ft) => ft === 10 || ft === 20)).toBe(false);
  });

  it("computes leftover waste, not a typed percent", () => {
    const packed = packPieces([{ lenIn: 114, objectId: "j1" }], DIM_STOCK_FT);
    expect(packed.leftoverIn).toBeCloseTo(30);
    expect(packed.percent).toBeCloseTo(20.833, 2);
    expect(formatWasteLine("2x8", packed.leftoverIn, packed.percent)).toBe("2x8 waste 2'-6\" (21%)");
    expect(formatWasteLine("decking", 0, 0)).toBe("decking waste ~0");
  });

  it("splits a run longer than 16' onto fewest 16'/12'/8'/6' sticks and notes it", () => {
    expect(coverLength(22 * 12, STOCK_FT).sort((a, b) => b - a)).toEqual([16, 6]);
    const parts = splitOversize(22 * 12, STOCK_FT);
    expect(parts.map((p) => p.lenIn).sort((a, b) => b - a)).toEqual([192, 72]);
    expect(parts.every((p) => p.split)).toBe(true);
    const packed = packPieces([{ lenIn: 22 * 12, objectId: "long" }], DIM_STOCK_FT);
    expect(packed.buys.some((b) => b.stockFt === 16 && b.exceededMax && b.qty === 1)).toBe(true);
    expect(packed.buys.some((b) => b.stockFt === 6 && b.qty === 1)).toBe(true);
    expect(buyFeet(packed).some((ft) => ft === 10 || ft === 20)).toBe(false);
    const sixteen = packed.buys.find((b) => b.stockFt === 16)!;
    expect(shopLineText(sixteen.qty, "2x8", sixteen.stockFt, sixteen.exceededMax)).toMatch(
      /run exceeded max stick/,
    );
  });

  it("buys 8' posts when packing exclusive unset-height 8' pieces (not one 16')", () => {
    const packed = packPieces(
      [
        { lenIn: 96, objectId: "p1", exclusive: true },
        { lenIn: 96, objectId: "p2", exclusive: true },
      ],
      POST_STOCK_FT,
    );
    expect(packed.buys).toEqual([expect.objectContaining({ stockFt: 8, qty: 2 })]);
  });
});
