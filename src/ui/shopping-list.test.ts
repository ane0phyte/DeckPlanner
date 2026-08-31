import { createElement } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emptyProject } from "../model/project";
import { createUserObject } from "../fill/fill";
import type { JoistObject } from "../model/types";

const harness = vi.hoisted(() => ({
  store: {} as Record<string, unknown>,
}));

vi.mock("../state/store", () => ({
  useStore: () => harness.store,
}));

import { ShoppingListSection } from "./ListSections";

describe("Shopping list section", () => {
  let root: Root | null = null;
  let host: HTMLDivElement | null = null;

  beforeEach(() => {
    const project = emptyProject();
    project.scale = { a: { x: 0, y: 0 }, b: { x: 12, y: 0 }, knownLengthIn: 12 };
    const joist = createUserObject("joist", [
      { x: 0, y: 0 },
      { x: 114, y: 0 },
    ])! as JoistObject;
    const boardA = createUserObject("board", [
      { x: 0, y: 0 },
      { x: 72, y: 0 },
    ])!;
    const boardB = createUserObject("board", [
      { x: 0, y: 6 },
      { x: 72, y: 6 },
    ])!;
    project.objects = [joist, boardA, boardB];
    project.settings.wastePercent = 10;
    Object.assign(harness.store, {
      project,
      selectedIds: [],
      selectAndFrame: vi.fn(),
      mutate: vi.fn(),
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

  it("shows packed stock lines and computed waste with no type-in boxes", async () => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => {
      root!.render(createElement(ShoppingListSection));
    });
    expect(host.querySelector("input")).toBeNull();
    expect(host.textContent).toMatch(/1 — 2x8 × 12'/);
    expect(host.textContent).not.toMatch(/× 10'/);
    expect(host.textContent).not.toMatch(/× 16'/);
    expect(host.textContent).not.toMatch(/× 20'/);
    expect(host.textContent).toMatch(/1 — decking × 12'/);
    expect(host.textContent).toMatch(/2x8 waste/);
    expect(host.textContent).toMatch(/decking waste/);
    expect(host.textContent).not.toMatch(/Waste %/);
    expect(host.querySelector("[data-shop-waste]")?.textContent).toMatch(/waste/);
  });
});
