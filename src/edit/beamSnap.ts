import type { BeamObject, PlannerObject, Point, PostObject, Project } from "../model/types";
import { findByType, inchesPerUnit } from "../model/project";
import { cross, dist, distToSeg, dot, norm, sub } from "../geom/vec";

/** Inches: center within this of the post origin, or the post half-width if larger. */
export const POST_LOCK_IN = 1.5;
/** |sin θ| between unit directions — same order as ortho “not 0.8° off”. */
export const COLLINEAR_DIR_EPS = 1e-3;

export function postLockRadiusIn(post: PostObject): number {
  const half = Math.max(post.actualWidthIn || 0, post.actualDepthIn || 0) / 2;
  return Math.max(POST_LOCK_IN, half);
}

export function snapPointToPost(
  p: Point,
  posts: PostObject[],
  iPerU: number,
  lockedId?: string | null,
): { point: Point; postId: string | null } {
  const units = iPerU > 0 ? iPerU : 1;
  if (lockedId) {
    const locked = posts.find((q) => q.id === lockedId);
    if (locked && dist(p, locked.origin) * units <= postLockRadiusIn(locked)) {
      return { point: { ...locked.origin }, postId: locked.id };
    }
  }
  let best: PostObject | null = null;
  let bestD = Infinity;
  for (const post of posts) {
    const dIn = dist(p, post.origin) * units;
    if (dIn <= postLockRadiusIn(post) && dIn < bestD) {
      best = post;
      bestD = dIn;
    }
  }
  return best ? { point: { ...best.origin }, postId: best.id } : { point: p, postId: null };
}

export function snapPointToPostInProject(
  p: Point,
  project: Project,
  lockedId?: string | null,
): { point: Point; postId: string | null } {
  return snapPointToPost(p, findByType(project, "post"), inchesPerUnit(project) ?? 1, lockedId);
}

export function snapBeamEnds(
  a: Point,
  b: Point,
  posts: PostObject[],
  iPerU: number,
  locked?: { a?: string | null; b?: string | null },
): { a: Point; b: Point; lockA: string | null; lockB: string | null } {
  const sa = snapPointToPost(a, posts, iPerU, locked?.a);
  const sb = snapPointToPost(b, posts, iPerU, locked?.b);
  return { a: sa.point, b: sb.point, lockA: sa.postId, lockB: sb.postId };
}

export function snapBeamEndsInProject(
  a: Point,
  b: Point,
  project: Project,
  locked?: { a?: string | null; b?: string | null },
): { a: Point; b: Point; lockA: string | null; lockB: string | null } {
  return snapBeamEnds(a, b, findByType(project, "post"), inchesPerUnit(project) ?? 1, locked);
}

function unitDir(a: Point, b: Point): Point | null {
  const d = norm(sub(b, a));
  if (Math.hypot(d.x, d.y) < 1e-9) return null;
  return d;
}

function sameDropPlane(x: BeamObject, y: BeamObject): boolean {
  return x.drop === y.drop;
}

/** Parallel within COLLINEAR_DIR_EPS and on the same line within POST_LOCK_IN. */
export function beamsCollinearCoplanar(x: BeamObject, y: BeamObject, iPerU: number): boolean {
  if (!sameDropPlane(x, y)) return false;
  const d1 = unitDir(x.a, x.b);
  const d2 = unitDir(y.a, y.b);
  if (!d1 || !d2) return false;
  if (Math.abs(Math.abs(dot(d1, d2)) - 1) > COLLINEAR_DIR_EPS) return false;
  const units = iPerU > 0 ? iPerU : 1;
  const off = Math.abs(cross(d1, sub(y.a, x.a))) * units;
  if (off > POST_LOCK_IN) return false;
  return segmentGapIn(x.a, x.b, y.a, y.b, d1, units) <= POST_LOCK_IN;
}

function project1d(p: Point, origin: Point, axis: Point): number {
  return (p.x - origin.x) * axis.x + (p.y - origin.y) * axis.y;
}

function segmentGapIn(a1: Point, b1: Point, a2: Point, b2: Point, axis: Point, iPerU: number): number {
  const t1 = [project1d(a1, a1, axis), project1d(b1, a1, axis)].sort((p, q) => p - q);
  const t2 = [project1d(a2, a1, axis), project1d(b2, a1, axis)].sort((p, q) => p - q);
  const gap = Math.max(t1[0], t2[0]) - Math.min(t1[1], t2[1]);
  return Math.max(0, gap) * iPerU;
}

function unionSegment(x: BeamObject, y: BeamObject): { a: Point; b: Point } {
  const axis = unitDir(x.a, x.b) ?? { x: 1, y: 0 };
  const pts = [x.a, x.b, y.a, y.b];
  let minP = pts[0];
  let maxP = pts[0];
  let minT = project1d(pts[0], x.a, axis);
  let maxT = minT;
  for (const p of pts) {
    const t = project1d(p, x.a, axis);
    if (t < minT) {
      minT = t;
      minP = p;
    }
    if (t > maxT) {
      maxT = t;
      maxP = p;
    }
  }
  return { a: minP, b: maxP };
}

function mergeTwo(keep: BeamObject, drop: BeamObject): BeamObject {
  const { a, b } = unionSegment(keep, drop);
  const source: BeamObject["source"] =
    keep.source === "user" || drop.source === "user" ? "user" : keep.source;
  return {
    ...keep,
    a,
    b,
    source,
    diagonal: keep.diagonal && drop.diagonal,
  };
}

function retargetPosts(objects: PlannerObject[], iPerU: number): PlannerObject[] {
  const beams = objects.filter((o): o is BeamObject => o.type === "beam");
  const units = iPerU > 0 ? iPerU : 1;
  return objects.map((o) => {
    if (o.type !== "post") return o;
    if (o.beamId && beams.some((b) => b.id === o.beamId)) return o;
    const near = beams.find((b) => distToSeg(o.origin, b.a, b.b) * units < 4);
    if (!near) return { ...o, beamId: null, tAlongBeam: null };
    const ab = sub(near.b, near.a);
    const l2 = ab.x * ab.x + ab.y * ab.y;
    const t = l2 < 1e-12 ? 0 : ((o.origin.x - near.a.x) * ab.x + (o.origin.y - near.a.y) * ab.y) / l2;
    return { ...o, beamId: near.id, tAlongBeam: t };
  });
}

/**
 * Collapse collinear coplanar drop beams into one object spanning the union.
 * Posts are kept; `beamId` on posts is retargeted to the survivor.
 * `preferId` (newly drawn beam) is kept when it participates.
 */
export function mergeCollinearBeams(project: Project, preferId?: string): Project {
  const iPerU = inchesPerUnit(project) ?? 1;
  const live = new Map(
    project.objects.filter((o): o is BeamObject => o.type === "beam").map((b) => [b.id, { ...b }]),
  );
  if (live.size < 2) return project;
  const removed = new Set<string>();
  let changed = true;
  while (changed) {
    changed = false;
    const list = [...live.values()].filter((b) => !removed.has(b.id));
    outer: for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const x = list[i];
        const y = list[j];
        if (!beamsCollinearCoplanar(x, y, iPerU)) continue;
        const keep = preferId === y.id ? y : x;
        const drop = keep.id === x.id ? y : x;
        live.set(keep.id, mergeTwo(keep, drop));
        live.delete(drop.id);
        removed.add(drop.id);
        changed = true;
        break outer;
      }
    }
  }
  if (!removed.size) return project;
  const objects = retargetPosts(
    project.objects.filter((o) => !removed.has(o.id)).map((o) => (o.type === "beam" && live.has(o.id) ? live.get(o.id)! : o)),
    iPerU,
  );
  return { ...project, objects };
}
