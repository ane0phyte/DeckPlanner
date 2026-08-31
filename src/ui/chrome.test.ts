import { createElement } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "../App";
import "../index.css";

function headingTexts(el: HTMLElement): string[] {
  return [...el.querySelectorAll("h2")].map((n) => (n.textContent ?? "").trim());
}

function clickTab(host: HTMLElement, id: string) {
  const btn = host.querySelector(`[data-tab="${id}"]`) as HTMLButtonElement | null;
  expect(btn).toBeTruthy();
  act(() => {
    btn!.click();
  });
}

describe("left-column chrome", () => {
  let root: Root | null = null;
  let host: HTMLDivElement | null = null;

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

  async function renderApp() {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => {
      root!.render(createElement(App));
    });
    return host;
  }

  it("expands the canvas, binds B to beam, and has no Heights/Lateral headings", async () => {
    await renderApp();

    expect(host!.querySelector(".right")).toBeNull();
    expect(host!.querySelector(".left")).not.toBeNull();
    expect(host!.querySelector(".center")).not.toBeNull();
    expect(host!.querySelector(".main")?.children.length).toBe(2);
    expect(headingTexts(host!).some((h) => /^Heights/i.test(h))).toBe(false);
    expect(headingTexts(host!).some((h) => /^Lateral/i.test(h))).toBe(false);
    expect(host!.textContent).not.toMatch(/Lateral scheme/);

    const beam = host!.querySelector('[data-hotkey="B"]');
    expect(beam).toBeTruthy();
    expect(beam!.querySelector("u")?.textContent?.toLowerCase()).toBe("b");
    expect(beam!.getAttribute("title")).toMatch(/Beam \(B\)/);

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "b", bubbles: true }));
    });
    expect(host!.textContent).toMatch(/Tool: beam/);
  });

  it("uses a section switcher: Cut list hides the tool grid; Tools hides list bodies", async () => {
    await renderApp();
    const canvas = host!.querySelector(".plan-canvas");
    expect(canvas).toBeTruthy();
    expect(host!.querySelector(".tool-grid")).toBeTruthy();
    expect(headingTexts(host!)).toContain("Tools");
    expect(headingTexts(host!)).not.toContain("Inspect");
    expect(headingTexts(host!)).not.toContain("Cut list");

    clickTab(host!, "cut");
    expect(host!.querySelector("[data-left-tab]")?.getAttribute("data-left-tab")).toBe("cut");
    expect(host!.querySelector(".tool-grid")).toBeNull();
    expect(headingTexts(host!)).toContain("Cut list");
    expect(headingTexts(host!)).not.toContain("Tools");
    expect(host!.querySelector(".plan-canvas")).toBe(canvas);

    clickTab(host!, "inspect");
    expect(host!.querySelector(".tool-grid")).toBeNull();
    expect(host!.textContent).toMatch(/select an object/i);
    expect(host!.querySelector(".plan-canvas")).toBe(canvas);

    clickTab(host!, "tools");
    expect(host!.querySelector(".tool-grid")).toBeTruthy();
    expect(headingTexts(host!)).not.toContain("Cut list");
    expect(host!.querySelector(".plan-canvas")).toBe(canvas);
  });

  it("keeps hotkeys global without switching the left section", async () => {
    await renderApp();
    clickTab(host!, "shop");
    expect(host!.querySelector(".tool-grid")).toBeNull();
    expect(headingTexts(host!)).toContain("Shopping list");

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "b", bubbles: true }));
    });
    expect(host!.textContent).toMatch(/Tool: beam/);
    expect(host!.querySelector(".tool-grid")).toBeNull();
    expect(headingTexts(host!)).toContain("Shopping list");
  });

  it("switches left pane with Ctrl+I / Ctrl+T and does not treat Ctrl+S as Tools", async () => {
    const alert = vi.spyOn(window, "alert").mockImplementation(() => {});
    await renderApp();
    const toolsTab = host!.querySelector('[data-tab="tools"]');
    expect(toolsTab?.getAttribute("title")).toMatch(/Ctrl\+T/);
    expect(toolsTab?.textContent).toMatch(/Tools/);
    expect(toolsTab?.textContent).toMatch(/Ctrl\+T/);

    await act(async () => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key: "i", ctrlKey: true, bubbles: true, cancelable: true }),
      );
    });
    expect(host!.querySelector("[data-left-tab]")?.getAttribute("data-left-tab")).toBe("inspect");
    expect(host!.textContent).toMatch(/select an object/i);
    expect(host!.querySelector(".tool-grid")).toBeNull();

    await act(async () => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key: "s", ctrlKey: true, bubbles: true, cancelable: true }),
      );
    });
    expect(host!.querySelector("[data-left-tab]")?.getAttribute("data-left-tab")).toBe("inspect");
    expect(alert).toHaveBeenCalled();

    await act(async () => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key: "t", ctrlKey: true, bubbles: true, cancelable: true }),
      );
    });
    expect(host!.querySelector("[data-left-tab]")?.getAttribute("data-left-tab")).toBe("tools");
    expect(host!.querySelector(".tool-grid")).toBeTruthy();
    alert.mockRestore();
  });

  it("has no type-in boxes on the shopping tab", async () => {
    await renderApp();
    clickTab(host!, "shop");
    expect(headingTexts(host!)).toContain("Shopping list");
    expect(host!.querySelector(".left-body input")).toBeNull();
    expect(host!.querySelector('[data-section="shop"] input')).toBeNull();
    expect(host!.textContent).not.toMatch(/Waste %/);
    clickTab(host!, "settings");
    expect(host!.querySelector(".left-body input")).not.toBeNull();
  });
});
