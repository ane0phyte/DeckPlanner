import { createElement } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emptyProject } from "../model/project";
import { createUserObject } from "../fill/fill";
import type { PostObject } from "../model/types";

const harness = vi.hoisted(() => ({
  store: {} as Record<string, unknown>,
}));

vi.mock("../state/store", () => ({
  useStore: () => harness.store,
}));

import { InspectPanel } from "./InspectPanel";

describe("Inspect panel", () => {
  let root: Root | null = null;
  let host: HTMLDivElement | null = null;

  beforeEach(() => {
    const project = emptyProject();
    project.scale = { a: { x: 0, y: 0 }, b: { x: 12, y: 0 }, knownLengthIn: 12 };
    project.origin = { x: 0, y: 0 };
    const post = createUserObject("post", [{ x: 24, y: 12 }])! as PostObject;
    post.nominalSize = "6x6";
    post.actualWidthIn = 5.5;
    post.actualDepthIn = 5.5;
    project.objects = [post];
    Object.assign(harness.store, {
      project,
      selectedIds: [post.id],
      selection: { kind: "object", objectId: post.id },
      select: vi.fn(),
      selectAndFrame: vi.fn(),
      mutate: vi.fn(),
      updateObject: vi.fn(),
      convertSelectedWall: vi.fn(),
      deleteSelected: vi.fn(),
    });
  });

  afterEach(() => {
    if (root && host) {
      act(() => {
        root!.unmount();
      });
    }
    host?.remove();
    root = null;
    host = null;
  });

  it("shows XY and 6x6 for a selected post", async () => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => {
      root!.render(createElement(InspectPanel));
    });
    expect(host.textContent).toMatch(/XY/);
    expect(host.textContent).toMatch(/6x6/);
    expect(host.textContent).toMatch(/2'-0"/);
  });
});
