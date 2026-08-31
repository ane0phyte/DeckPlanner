import { createElement } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import App from "../App";
import "../index.css";

function headingTexts(el: HTMLElement): string[] {
  return [...el.querySelectorAll("h2")].map((n) => (n.textContent ?? "").trim());
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

  it("expands the canvas, binds B to beam, and has no Heights/Lateral headings", async () => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => {
      root!.render(createElement(App));
    });

    expect(host.querySelector(".right")).toBeNull();
    expect(host.querySelector(".left")).not.toBeNull();
    expect(host.querySelector(".center")).not.toBeNull();
    expect(host.querySelector(".main")?.children.length).toBe(2);
    expect(headingTexts(host).some((h) => /^Heights/i.test(h))).toBe(false);
    expect(headingTexts(host).some((h) => /^Lateral/i.test(h))).toBe(false);
    expect(host.textContent).not.toMatch(/Lateral scheme/);
    expect(host.textContent).toMatch(/select an object/i);
    expect(host.textContent).toMatch(/Cut list/);
    expect(host.textContent).toMatch(/Shopping list/);
    expect(host.textContent).toMatch(/Inspect/);

    const beam = host.querySelector('[data-hotkey="B"]');
    expect(beam).toBeTruthy();
    expect(beam!.querySelector("u")?.textContent?.toLowerCase()).toBe("b");
    expect(beam!.getAttribute("title")).toMatch(/Beam \(B\)/);

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "b", bubbles: true }));
    });
    expect(host.textContent).toMatch(/Tool: beam/);
  });
});
