import type { PlannerObject, Point, Project } from "../model/types";
import { dist } from "../geom/vec";
import { polygonClosed } from "../geom/polygon";

export type Handle =
  | { kind: "vertex"; objectId: string; index: number; point: Point }
  | { kind: "endpoint"; objectId: string; end: "a" | "b"; point: Point }
  | { kind: "origin"; objectId: string; point: Point }
  | { kind: "scale"; end: "a" | "b"; point: Point }
  | { kind: "draft"; index: number; point: Point };

export type Selection =
  | Handle
  | { kind: "object"; objectId: string };

export function handleKey(h: Selection): string {
  if (h.kind === "object") return `object:${h.objectId}`;
  if (h.kind === "vertex") return `vertex:${h.objectId}:${h.index}`;
  if (h.kind === "endpoint") return `endpoint:${h.objectId}:${h.end}`;
  if (h.kind === "origin") return `origin:${h.objectId}`;
  if (h.kind === "scale") return `scale:${h.end}`;
  return `draft:${h.index}`;
}

export function selectionEquals(a: Selection | null, b: Selection | null): boolean {
  if (!a || !b) return a === b;
  return handleKey(a) === handleKey(b);
}

export function collectHandles(
  project: Project,
  draftPoints: Point[] = [],
  selectedIds: string[] = [],
): Handle[] {
  const handles: Handle[] = [];
  for (const o of project.objects) {
    const always =
      o.type === "outline" ||
      o.type === "nodigZone" ||
      o.type === "nodigPoint" ||
      o.type === "post" ||
      o.type === "houseWall" ||
      o.type === "ledger" ||
      o.type === "stairs" ||
      o.type === "existingStairs" ||
      o.source === "user" ||
      o.source === "convert";
    if (always || selectedIds.includes(o.id)) handles.push(...objectHandles(o));
  }
  if (project.scale) {
    handles.push({ kind: "scale", end: "a", point: project.scale.a });
    handles.push({ kind: "scale", end: "b", point: project.scale.b });
  }
  draftPoints.forEach((point, index) => {
    handles.push({ kind: "draft", index, point });
  });
  return handles;
}

export function objectHandles(o: PlannerObject): Handle[] {
  switch (o.type) {
    case "outline":
    case "nodigZone":
      return polygonClosed(o.points).map((point, index) => ({
        kind: "vertex" as const,
        objectId: o.id,
        index,
        point,
      }));
    case "post":
    case "nodigPoint":
    case "lateralDevice":
    case "stairs":
    case "existingStairs":
      return [{ kind: "origin", objectId: o.id, point: o.origin }];
    default:
      if ("a" in o && "b" in o) {
        return [
          { kind: "endpoint", objectId: o.id, end: "a", point: o.a },
          { kind: "endpoint", objectId: o.id, end: "b", point: o.b },
        ];
      }
      return [];
  }
}

/** Prefer point handles over object bodies. Radius is in world units. */
export function hitHandle(handles: Handle[], p: Point, radius: number): Handle | null {
  let best: Handle | null = null;
  let bestD = radius;
  for (const h of handles) {
    const d = dist(p, h.point);
    if (d <= bestD) {
      bestD = d;
      best = h;
    }
  }
  return best;
}

export function moveHandle(project: Project, handle: Handle, to: Point): Project {
  if (handle.kind === "scale") {
    if (!project.scale) return project;
    return {
      ...project,
      scale: {
        ...project.scale,
        [handle.end]: to,
      },
    };
  }
  if (handle.kind === "draft") return project;
  return {
    ...project,
    objects: project.objects.map((o) => {
      if (handle.kind === "vertex" && o.id === handle.objectId && "points" in o) {
        const points = o.points.map((pt, i) => (i === handle.index ? to : pt));
        return { ...o, points };
      }
      if (handle.kind === "endpoint" && o.id === handle.objectId && "a" in o && "b" in o) {
        return { ...o, [handle.end]: to };
      }
      if (handle.kind === "origin" && o.id === handle.objectId && "origin" in o) {
        return { ...o, origin: to };
      }
      return o;
    }),
  };
}

export function moveDraftPoint(draft: Point[], index: number, to: Point): Point[] {
  return draft.map((p, i) => (i === index ? to : p));
}

export function translateObject(project: Project, objectId: string, delta: Point): Project {
  return {
    ...project,
    objects: project.objects.map((o) => {
      if (o.id !== objectId) return o;
      if ("origin" in o) return { ...o, origin: { x: o.origin.x + delta.x, y: o.origin.y + delta.y } };
      if ("a" in o && "b" in o) {
        return {
          ...o,
          a: { x: o.a.x + delta.x, y: o.a.y + delta.y },
          b: { x: o.b.x + delta.x, y: o.b.y + delta.y },
        };
      }
      if ("points" in o) {
        return {
          ...o,
          points: o.points.map((q) => ({ x: q.x + delta.x, y: q.y + delta.y })),
        };
      }
      return o;
    }),
  };
}

export interface DeleteResult {
  project: Project;
  draftPoints?: Point[];
  clearedSelection: boolean;
}

/**
 * Delete a selected point/vertex or whole object.
 * Polygon vertices: remove one; if fewer than 3 remain, delete the polygon.
 * Line endpoints: delete the whole line (a line is not valid with one point).
 * Scale: remove that end; if either end is gone, clear scale.
 */
export function deleteSelection(
  project: Project,
  selection: Selection,
  draftPoints: Point[] = [],
): DeleteResult {
  if (selection.kind === "draft") {
    return {
      project,
      draftPoints: draftPoints.filter((_, i) => i !== selection.index),
      clearedSelection: true,
    };
  }
  if (selection.kind === "scale") {
    return { project: { ...project, scale: null }, clearedSelection: true };
  }
  if (selection.kind === "object" || selection.kind === "origin" || selection.kind === "endpoint") {
    const id = selection.kind === "object" ? selection.objectId : selection.objectId;
    return {
      project: { ...project, objects: project.objects.filter((o) => o.id !== id) },
      clearedSelection: true,
    };
  }
  if (selection.kind === "vertex") {
    const obj = project.objects.find((o) => o.id === selection.objectId);
    if (!obj || !("points" in obj)) {
      return { project, clearedSelection: false };
    }
    const nextPts = obj.points.filter((_, i) => i !== selection.index);
    if (nextPts.length < 3) {
      return {
        project: { ...project, objects: project.objects.filter((o) => o.id !== obj.id) },
        clearedSelection: true,
      };
    }
    return {
      project: {
        ...project,
        objects: project.objects.map((o) => (o.id === obj.id ? { ...o, points: nextPts } : o)),
      },
      clearedSelection: true,
    };
  }
  return { project, clearedSelection: false };
}

export function selectionLabel(selection: Selection | null, project: Project): string | null {
  if (!selection) return null;
  if (selection.kind === "draft") return `Draft point ${selection.index + 1} — drag to move, Delete to remove`;
  if (selection.kind === "scale") return `Scale ${selection.end === "a" ? "start" : "end"} — drag to move, Delete to clear scale`;
  if (selection.kind === "vertex") {
    const o = project.objects.find((x) => x.id === selection.objectId);
    return `${o?.type ?? "polygon"} vertex ${selection.index + 1} — drag to move, Delete to remove`;
  }
  if (selection.kind === "endpoint") {
    const o = project.objects.find((x) => x.id === selection.objectId);
    return `${o?.type ?? "line"} ${selection.end} — drag to move, Delete to remove the line`;
  }
  if (selection.kind === "origin") {
    const o = project.objects.find((x) => x.id === selection.objectId);
    return `${o?.type ?? "point"} — drag to move, Delete to remove`;
  }
  const o = project.objects.find((x) => x.id === selection.objectId);
  return `${o?.type ?? "object"} — drag to move, Delete to remove`;
}

export function deleteButtonLabel(selection: Selection | null): string {
  if (!selection) return "Delete";
  if (selection.kind === "vertex") return "Delete vertex";
  if (selection.kind === "draft") return "Delete point";
  if (selection.kind === "scale") return "Delete scale point";
  if (selection.kind === "origin") return "Delete point";
  if (selection.kind === "endpoint") return "Delete line";
  if (selection.kind === "object") return "Delete object";
  return "Delete";
}
