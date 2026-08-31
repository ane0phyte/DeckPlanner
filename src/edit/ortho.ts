import type { PlannerObject, Point, Project, Tool } from "../model/types";
import { findByType } from "../model/project";
import { add, dist, dot, mul, norm, perp, sub } from "../geom/vec";

const LINE_TOOLS = new Set<Tool>(["ledger", "breaker", "beam", "joist", "rim", "houseWall"]);

export function worldAxes(): Point[] {
  return [
    { x: 1, y: 0 },
    { x: 0, y: 1 },
  ];
}

/** Ledger-parallel and ledger-perpendicular, or world X/Y if no ledger. */
export function orthoAxes(project: Project): Point[] {
  const ledger = findByType(project, "ledger")[0];
  if (!ledger) return worldAxes();
  const parallel = norm(sub(ledger.b, ledger.a));
  if (dist({ x: 0, y: 0 }, parallel) < 1e-9) return worldAxes();
  return [parallel, perp(parallel)];
}

export function shouldOrthoDraw(tool: Tool): boolean {
  return LINE_TOOLS.has(tool);
}

export function lineSnapKind(
  toolOrType: Tool | PlannerObject["type"],
): "world-xy" | "ledger-ortho" | "perp-to-ledger" | "none" {
  if (toolOrType === "ledger") return "world-xy";
  if (toolOrType === "breaker") return "perp-to-ledger";
  if (toolOrType === "beam" || toolOrType === "joist" || toolOrType === "rim" || toolOrType === "houseWall") {
    return "ledger-ortho";
  }
  return "none";
}

export function axesForKind(kind: ReturnType<typeof lineSnapKind>, project: Project): Point[] {
  if (kind === "none") return [];
  if (kind === "world-xy") return worldAxes();
  const axes = orthoAxes(project);
  if (kind === "perp-to-ledger") return [axes[1] ?? axes[0]];
  return axes;
}

/** CAD-style: keep the dominant-axis component of `to - from`. */
export function constrainPointToAxes(from: Point, to: Point, axes: Point[]): Point {
  if (!axes.length) return to;
  const d = sub(to, from);
  let best = axes[0];
  let bestAbs = -1;
  let bestT = 0;
  for (const ax of axes) {
    const t = dot(d, ax);
    if (Math.abs(t) > bestAbs) {
      bestAbs = Math.abs(t);
      best = ax;
      bestT = t;
    }
  }
  return add(from, mul(best, bestT));
}

export function constrainDeltaToAxes(delta: Point, project: Project): Point {
  return constrainPointToAxes({ x: 0, y: 0 }, delta, orthoAxes(project));
}

export function snapSecondPoint(
  from: Point,
  to: Point,
  toolOrType: Tool | PlannerObject["type"],
  project: Project,
): Point {
  const kind = lineSnapKind(toolOrType);
  const axes = axesForKind(kind, project);
  if (!axes.length) return to;
  return constrainPointToAxes(from, to, axes);
}

/** Callers skip this when increment-only or ortho is off. */
export function maybeSnapSecondPoint(
  from: Point,
  to: Point,
  toolOrType: Tool | PlannerObject["type"],
  project: Project,
): Point {
  if (!project.settings.orthoSnap) return to;
  return snapSecondPoint(from, to, toolOrType, project);
}

export function maybeConstrainDelta(delta: Point, project: Project): Point {
  if (!project.settings.orthoSnap) return delta;
  return constrainDeltaToAxes(delta, project);
}

export function maybeAxisAlignLedger(o: PlannerObject, orthoOn: boolean): PlannerObject {
  if (!orthoOn || o.type !== "ledger") return o;
  const { a, b } = axisAlignSegment(o.a, o.b);
  return { ...o, a, b };
}

/** Make a segment exactly horizontal or vertical (dominant axis). */
export function axisAlignSegment(a: Point, b: Point): { a: Point; b: Point } {
  const d = sub(b, a);
  if (Math.abs(d.x) >= Math.abs(d.y)) {
    const y = (a.y + b.y) / 2;
    return { a: { x: a.x, y }, b: { x: b.x, y } };
  }
  const x = (a.x + b.x) / 2;
  return { a: { x, y: a.y }, b: { x, y: b.y } };
}

export function skipAngleSnap(o: PlannerObject | undefined): boolean {
  return o?.type === "beam" && o.source === "fill" && o.diagonal === true;
}

export function nudgeDeltaWorld(
  key: string,
  iPerU: number,
  snapIncrementIn: number,
  shift: boolean,
): Point | null {
  if (!iPerU || iPerU <= 0) return null;
  const inches = shift ? (snapIncrementIn > 0 ? snapIncrementIn : 6) : 1;
  const step = inches / iPerU;
  if (key === "ArrowLeft") return { x: -step, y: 0 };
  if (key === "ArrowRight") return { x: step, y: 0 };
  if (key === "ArrowUp") return { x: 0, y: -step };
  if (key === "ArrowDown") return { x: 0, y: step };
  return null;
}
