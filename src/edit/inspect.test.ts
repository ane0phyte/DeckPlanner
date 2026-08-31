import { describe, expect, it } from "vitest";
import { emptyProject } from "../model/project";
import { createUserObject } from "../fill/fill";
import { connectedObjects, inspectCoords, inspectSizeLine } from "./inspect";
import type { PostObject } from "../model/types";

describe("inspect selection", () => {
  it("shows XY and 6x6 for a selected post", () => {
    const p = emptyProject();
    p.scale = { a: { x: 0, y: 0 }, b: { x: 12, y: 0 }, knownLengthIn: 12 };
    p.origin = { x: 0, y: 0 };
    const post = createUserObject("post", [{ x: 24, y: 12 }])! as PostObject;
    post.nominalSize = "6x6";
    post.actualWidthIn = 5.5;
    post.actualDepthIn = 5.5;
    p.objects = [post];
    const xy = inspectCoords(post, p);
    expect(xy[0]?.label).toBe("XY");
    expect(xy[0]?.value).toMatch(/X 2'-0"/);
    expect(inspectSizeLine(post)).toMatch(/6x6/);
  });

  it("lists posts under a beam as connecting objects", () => {
    const p = emptyProject();
    const beam = createUserObject("beam", [
      { x: 0, y: 10 },
      { x: 80, y: 10 },
    ])!;
    const post = createUserObject("post", [{ x: 40, y: 10 }])! as PostObject;
    post.beamId = beam.id;
    p.objects = [beam, post];
    const links = connectedObjects(beam, p);
    expect(links.some((c) => c.id === post.id && /post/i.test(c.role))).toBe(true);
  });
});
