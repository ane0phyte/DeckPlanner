import type { PlannerObject, StairsObject } from "../model/types";
import { DEFAULT_SPECIES_LABEL, newId } from "../model/types";
import {
  boxFromCorners,
  centerline,
  type OrientedBox,
} from "../geom/box";

export type BoxKind = "stairs" | "board";

export function getOrientedBox(o: PlannerObject): OrientedBox | null {
  if (o.type === "stairs" || o.type === "existingStairs") {
    if (o.length != null && o.width != null) {
      return { origin: o.origin, angleDeg: o.angleDeg, length: o.length, width: o.width };
    }
    return null;
  }
  if (o.type === "board" && o.origin && o.length != null && o.width != null) {
    return {
      origin: o.origin,
      angleDeg: o.angleDeg ?? 0,
      length: o.length,
      width: o.width,
    };
  }
  return null;
}

export function setOrientedBox(o: PlannerObject, box: OrientedBox): PlannerObject {
  if (o.type === "stairs" || o.type === "existingStairs") {
    return { ...o, type: "stairs", ...box };
  }
  if (o.type === "board") {
    const line = centerline(box);
    return { ...o, ...box, a: line.a, b: line.b };
  }
  return o;
}

export function createBoxObject(kind: BoxKind, a: { x: number; y: number }, b: { x: number; y: number }): PlannerObject | null {
  const box = boxFromCorners(a, b);
  if (!box) return null;
  return boxObjectFrom(kind, box);
}

export function boxObjectFrom(kind: BoxKind, box: OrientedBox): PlannerObject {
  const common = {
    id: newId(),
    source: "user" as const,
    speciesLabel: DEFAULT_SPECIES_LABEL,
    speciesTable: "southern-pine-no-2" as const,
    material: "dimension lumber",
    treatment: "above-ground" as const,
    notes: "",
    ...box,
  };
  if (kind === "board") {
    const line = centerline(box);
    return {
      ...common,
      type: "board",
      label: "Board",
      a: line.a,
      b: line.b,
      actualWidthIn: 5.5,
      actualThicknessIn: 1.25,
    };
  }
  return {
    ...common,
    type: "stairs",
    label: "Stairs",
    widthIn: null,
    riseIn: null,
  };
}

export function relabelBox(o: PlannerObject, kind: BoxKind): PlannerObject {
  const box = getOrientedBox(o);
  if (!box) return o;
  if (kind === "stairs" && (o.type === "stairs" || o.type === "existingStairs")) {
    return { ...o, type: "stairs", label: o.label === "Board" ? "Stairs" : o.label };
  }
  if (kind === "board" && o.type === "board") return o;
  const next = boxObjectFrom(kind, box);
  return { ...next, id: o.id, source: o.source, notes: o.notes, speciesLabel: o.speciesLabel };
}

export function defaultWidthIn(o: StairsObject, iPerU: number | null): number | null {
  if (o.widthIn != null) return o.widthIn;
  if (iPerU == null) return null;
  return o.width * iPerU;
}

export function migratePlannerObject(o: PlannerObject): PlannerObject {
  if (o.type !== "stairs" && o.type !== "existingStairs") return o;
  const raw = o as StairsObject & { lengthIn?: number };
  if (raw.length != null && raw.width != null && raw.type === "stairs") return raw;
  const length = raw.length ?? raw.lengthIn ?? 48;
  const width = raw.width ?? raw.widthIn ?? 36;
  const rad = (raw.angleDeg * Math.PI) / 180;
  const origin = {
    x: raw.origin.x + (length / 2) * Math.cos(rad) - (width / 2) * Math.sin(rad),
    y: raw.origin.y + (length / 2) * Math.sin(rad) + (width / 2) * Math.cos(rad),
  };
  return {
    ...raw,
    type: "stairs",
    label: raw.label === "Existing stairs" || raw.label === "existingStairs" ? "Stairs" : raw.label,
    origin,
    length,
    width,
  };
}

export function migrateProjectObjects(objects: PlannerObject[]): PlannerObject[] {
  return objects.map(migratePlannerObject);
}
