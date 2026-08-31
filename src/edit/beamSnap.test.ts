import { describe, expect, it } from "vitest";
import { emptyProject } from "../model/project";
import { createUserObject } from "../fill/fill";
import {
  mergeCollinearBeams,
  snapPointToPost,
  POST_LOCK_IN,
} from "./beamSnap";
import type { BeamObject, PostObject } from "../model/types";

function projectWith(objects: ReturnType<typeof createUserObject>[]) {
  const p = emptyProject();
  p.scale = { a: { x: 0, y: 0 }, b: { x: 12, y: 0 }, knownLengthIn: 12 };
  p.objects = objects.filter((o): o is NonNullable<typeof o> => o != null);
  return p;
}

describe("beam-to-post lock", () => {
  it("snaps a beam endpoint to the post origin when drawn across the post", () => {
    const post = createUserObject("post", [{ x: 48, y: 0 }])! as PostObject;
    post.actualWidthIn = 3.5;
    post.actualDepthIn = 3.5;
    const near = { x: 48.4, y: 0.3 };
    const snapped = snapPointToPost(near, [post], 1);
    expect(snapped.postId).toBe(post.id);
    expect(snapped.point).toEqual({ x: 48, y: 0 });
    expect(POST_LOCK_IN).toBe(1.5);
  });
});

describe("collinear coplanar merge", () => {
  it("merges two collinear abutting beams into one object and keeps posts", () => {
    const a = createUserObject("beam", [
      { x: 0, y: 10 },
      { x: 40, y: 10 },
    ])! as BeamObject;
    a.diagonal = false;
    const b = createUserObject("beam", [
      { x: 40, y: 10 },
      { x: 90, y: 10 },
    ])! as BeamObject;
    b.diagonal = false;
    const post = createUserObject("post", [{ x: 40, y: 10 }])! as PostObject;
    post.beamId = a.id;
    const p = projectWith([a, b, post]);
    const next = mergeCollinearBeams(p, b.id);
    const beams = next.objects.filter((o): o is BeamObject => o.type === "beam");
    const posts = next.objects.filter((o) => o.type === "post");
    expect(beams).toHaveLength(1);
    expect(Math.min(beams[0].a.x, beams[0].b.x)).toBeCloseTo(0);
    expect(Math.max(beams[0].a.x, beams[0].b.x)).toBeCloseTo(90);
    expect(posts).toHaveLength(1);
    expect(posts[0].id).toBe(post.id);
    expect(posts[0].type === "post" && posts[0].beamId).toBe(beams[0].id);
  });

  it("does not merge a diagonal beam with an orthogonal beam", () => {
    const ortho = createUserObject("beam", [
      { x: 0, y: 0 },
      { x: 40, y: 0 },
    ])! as BeamObject;
    ortho.diagonal = false;
    const diag = createUserObject("beam", [
      { x: 40, y: 0 },
      { x: 70, y: 20 },
    ])! as BeamObject;
    diag.diagonal = true;
    const p = projectWith([ortho, diag]);
    const next = mergeCollinearBeams(p);
    expect(next.objects.filter((o) => o.type === "beam")).toHaveLength(2);
  });
});
