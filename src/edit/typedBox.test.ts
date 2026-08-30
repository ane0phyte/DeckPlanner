import { describe, expect, it } from "vitest";
import { createBoxObject, defaultWidthIn, migratePlannerObject, relabelBox } from "./typedBox";
import type { StairsObject } from "../model/types";
import { DEFAULT_SPECIES_LABEL } from "../model/types";

describe("typed box objects", () => {
  it("defaults a drawn box to stairs and can relabel it as board", () => {
    const stairs = createBoxObject("stairs", { x: 0, y: 0 }, { x: 60, y: 30 })!;
    expect(stairs.type).toBe("stairs");
    const board = relabelBox(stairs, "board");
    expect(board.type).toBe("board");
    expect(board.id).toBe(stairs.id);
    expect(relabelBox(board, "stairs").type).toBe("stairs");
  });

  it("defaults stair width from the box when scale is set", () => {
    const stairs = createBoxObject("stairs", { x: 0, y: 0 }, { x: 60, y: 24 })!;
    if (stairs.type !== "stairs") throw new Error("expected stairs");
    expect(defaultWidthIn(stairs, null)).toBeNull();
    expect(defaultWidthIn(stairs, 2)).toBe(48);
    stairs.widthIn = 36;
    expect(defaultWidthIn(stairs, 2)).toBe(36);
  });

  it("migrates old click-to-place stairs (corner + inches) to a cover box", () => {
    const old = {
      id: "s1",
      type: "existingStairs",
      source: "user",
      label: "Existing stairs",
      speciesLabel: DEFAULT_SPECIES_LABEL,
      speciesTable: "southern-pine-no-2",
      material: "dimension lumber",
      treatment: "above-ground",
      notes: "",
      origin: { x: 10, y: 20 },
      angleDeg: 0,
      lengthIn: 48,
      widthIn: 36,
      riseIn: 7,
    } as unknown as StairsObject;
    const next = migratePlannerObject(old);
    expect(next.type).toBe("stairs");
    if (next.type === "stairs") {
      expect(next.label).toBe("Stairs");
      expect(next.length).toBe(48);
      expect(next.width).toBe(36);
      expect(next.origin.x).toBeCloseTo(34);
      expect(next.origin.y).toBeCloseTo(38);
    }
  });
});
