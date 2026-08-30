import { describe, expect, it } from "vitest";
import { dressedSize, formatInches, ftIn, parseLengthToInches } from "./length";

describe("length", () => {
  it("parses feet-inches", () => {
    expect(parseLengthToInches("12-6")).toBe(150);
    expect(parseLengthToInches("10' 6\"")).toBe(126);
    expect(parseLengthToInches("8 ft")).toBe(96);
    expect(parseLengthToInches("7.75")).toBe(7.75);
    expect(parseLengthToInches("1/8")).toBe(0.125);
    expect(parseLengthToInches("0.125")).toBe(0.125);
    expect(parseLengthToInches("16")).toBe(16);
  });

  it("formats feet-inches", () => {
    expect(formatInches(150)).toBe("12'-6\"");
    expect(formatInches(7.75)).toBe("7.75\"");
  });

  it("uses US dressed sizes", () => {
    expect(dressedSize("2x8")).toEqual({ w: 1.5, d: 7.25 });
    expect(dressedSize("2x10")).toEqual({ w: 1.5, d: 9.25 });
    expect(dressedSize("2x12")).toEqual({ w: 1.5, d: 11.25 });
    expect(dressedSize("4x4")).toEqual({ w: 3.5, d: 3.5 });
  });

  it("ftIn helper", () => {
    expect(ftIn(9, 11)).toBe(119);
  });
});
