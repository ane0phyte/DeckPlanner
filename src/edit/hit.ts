import type { PlannerObject, Point, Project } from "../model/types";
import { inchesPerUnit } from "../model/project";
import { dist } from "../geom/vec";
import { pointInPolygon, polygonArea } from "../geom/polygon";

export interface HitCandidate {
  object: PlannerObject;
  area: number;
}

export function objectTypeLabel(type: PlannerObject["type"]): string {
  switch (type) {
    case "existingStairs":
      return "Existing stairs";
    case "stairs":
      return "Stairs (reused)";
    case "houseWall":
      return "House wall";
    case "nodigZone":
      return "No-dig zone";
    case "nodigPoint":
      return "No-dig point";
    case "lateralDevice":
      return "Lateral device";
    default:
      return type.charAt(0).toUpperCase() + type.slice(1);
  }
}

export function objectDisplayName(o: PlannerObject): string {
  const label = o.label?.trim();
  if (label && label !== o.type) return label;
  return objectTypeLabel(o.type);
}

export function hitPad(viewScale: number): number {
  return Math.max(24 / viewScale, 12);
}

export function pointInBox(p: Point, min: Point, max: Point): boolean {
  return p.x >= min.x && p.x <= max.x && p.y >= min.y && p.y <= max.y;
}

/** Axis-aligned bounds of a line, padded so thin segments stay clickable. */
export function lineBounds(a: Point, b: Point, pad: number): { min: Point; max: Point } {
  const minX = Math.min(a.x, b.x);
  const maxX = Math.max(a.x, b.x);
  const minY = Math.min(a.y, b.y);
  const maxY = Math.max(a.y, b.y);
  const extraX = Math.max(pad, (pad * 2 - (maxX - minX)) / 2);
  const extraY = Math.max(pad, (pad * 2 - (maxY - minY)) / 2);
  return {
    min: { x: minX - extraX, y: minY - extraY },
    max: { x: maxX + extraX, y: maxY + extraY },
  };
}

function stairsLocal(
  o: Extract<PlannerObject, { type: "stairs" | "existingStairs" }>,
  p: Point,
  iPerU: number | null,
): { lx: number; ly: number; w: number; len: number } {
  const u = iPerU ?? 1;
  const w = (o.widthIn ?? 36) / u;
  const len = o.lengthIn / u;
  const rad = (o.angleDeg * Math.PI) / 180;
  const dx = p.x - o.origin.x;
  const dy = p.y - o.origin.y;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return {
    lx: dx * cos + dy * sin,
    ly: -dx * sin + dy * cos,
    w,
    len,
  };
}

export function objectVisible(o: PlannerObject, layers: Project["settings"]["layers"]): boolean {
  if (o.type === "nodigZone" || o.type === "nodigPoint") return layers.nodig;
  if (o.type === "guard") return layers.railings;
  if (o.type === "outline" || o.type === "houseWall" || o.type === "existingStairs") {
    return layers.photo || layers.framing;
  }
  return layers.framing;
}

export function objectHitArea(o: PlannerObject, iPerU: number | null, pad: number): number {
  switch (o.type) {
    case "outline":
    case "nodigZone":
      return Math.max(Math.abs(polygonArea(o.points)), 1);
    case "stairs":
    case "existingStairs": {
      const u = iPerU ?? 1;
      return Math.max(((o.widthIn ?? 36) / u) * (o.lengthIn / u), 1);
    }
    case "post":
    case "nodigPoint":
    case "lateralDevice":
      return (pad * 2) ** 2;
    default:
      if ("a" in o && "b" in o) {
        return Math.max(dist(o.a, o.b) * pad * 2, 1);
      }
      return (pad * 2) ** 2;
  }
}

export function pointHitsObject(
  o: PlannerObject,
  p: Point,
  iPerU: number | null,
  pad: number,
): boolean {
  switch (o.type) {
    case "outline":
    case "nodigZone":
      return pointInPolygon(p, o.points);
    case "stairs":
    case "existingStairs": {
      const { lx, ly, w, len } = stairsLocal(o, p, iPerU);
      return lx >= -pad && lx <= len + pad && ly >= -w / 2 - pad && ly <= w / 2 + pad;
    }
    case "post":
    case "nodigPoint":
    case "lateralDevice":
      return dist(p, o.origin) <= pad;
    default:
      if ("a" in o && "b" in o) {
        const b = lineBounds(o.a, o.b, pad);
        return pointInBox(p, b.min, b.max);
      }
      return false;
  }
}

/** All objects whose bounds contain `p`, smallest area first. */
export function hitTestAll(project: Project, p: Point, viewScale: number): HitCandidate[] {
  const pad = hitPad(viewScale);
  const iPerU = inchesPerUnit(project);
  const hits: HitCandidate[] = [];
  for (const o of project.objects) {
    if (!objectVisible(o, project.settings.layers)) continue;
    if (pointHitsObject(o, p, iPerU, pad)) {
      hits.push({ object: o, area: objectHitArea(o, iPerU, pad) });
    }
  }
  hits.sort((a, b) => a.area - b.area || a.object.id.localeCompare(b.object.id));
  return hits;
}

export function hitTest(project: Project, p: Point, viewScale: number): PlannerObject | null {
  return hitTestAll(project, p, viewScale)[0]?.object ?? null;
}

export type SelectClick =
  | { kind: "handle" }
  | { kind: "object"; id: string }
  | { kind: "picker"; hits: HitCandidate[] }
  | { kind: "none" };

/**
 * Tight handle (on the knob) wins so vertices stay draggable.
 * Otherwise overlapping bounds open the picker instead of silently
 * taking a nearby vertex or the biggest polygon.
 */
export function resolveSelectClick(
  tightHandle: boolean,
  hits: HitCandidate[],
): SelectClick {
  if (tightHandle) return { kind: "handle" };
  if (hits.length > 1) return { kind: "picker", hits };
  if (hits.length === 1) return { kind: "object", id: hits[0].object.id };
  return { kind: "none" };
}
