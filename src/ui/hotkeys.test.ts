import { describe, expect, it } from "vitest";
import {
  actionFromKey,
  firstUnusedLetter,
  hotkeyLetterForTool,
  hotkeyTooltip,
  paneShortcutLabel,
  paneTabFromKey,
  underlineIndex,
} from "./hotkeys";

describe("tool hotkeys", () => {
  it("B enters the beam tool", () => {
    expect(actionFromKey("b")).toEqual({ kind: "tool", tool: "beam" });
    expect(actionFromKey("B")).toEqual({ kind: "tool", tool: "beam" });
    expect(hotkeyLetterForTool("beam")).toBe("B");
  });

  it("underlines the hotkey letter in the label", () => {
    expect(underlineIndex("Beam", "B")).toBe(0);
    expect(hotkeyTooltip("Beam", "B")).toBe("Beam (B)");
    expect(underlineIndex("Select", "V")).toBe(-1);
  });

  it("does not steal Ctrl/Cmd+S", () => {
    expect(actionFromKey("s", { ctrlOrMeta: true })).toBeNull();
    expect(actionFromKey("s")).toEqual({ kind: "tool", tool: "scale" });
  });

  it("binds Fill and Ortho", () => {
    expect(actionFromKey("f")).toEqual({ kind: "fill" });
    expect(actionFromKey("a")).toEqual({ kind: "ortho" });
  });

  it("assigns the first unused letter of an unlisted label", () => {
    expect(firstUnusedLetter("Close polygon")).toBe("C");
  });
});

describe("left pane section hotkeys", () => {
  it("maps Ctrl/Cmd and Alt chords to pane tabs", () => {
    expect(paneTabFromKey("i", { ctrlOrMeta: true })).toBe("inspect");
    expect(paneTabFromKey("t", { ctrlOrMeta: true })).toBe("tools");
    expect(paneTabFromKey("g", { ctrlOrMeta: true })).toBe("flags");
    expect(paneTabFromKey("u", { ctrlOrMeta: true })).toBe("cut");
    expect(paneTabFromKey("b", { ctrlOrMeta: true })).toBe("shop");
    expect(paneTabFromKey("e", { alt: true })).toBe("settings");
    expect(paneShortcutLabel("T")).toBe("Ctrl+T");
  });

  it("does not steal Ctrl/Cmd+S, undo, or unmodified tool keys", () => {
    expect(paneTabFromKey("s", { ctrlOrMeta: true })).toBeNull();
    expect(paneTabFromKey("z", { ctrlOrMeta: true })).toBeNull();
    expect(paneTabFromKey("y", { ctrlOrMeta: true })).toBeNull();
    expect(paneTabFromKey("t")).toBeNull();
    expect(paneTabFromKey("b")).toBeNull();
    expect(actionFromKey("b")).toEqual({ kind: "tool", tool: "beam" });
    expect(actionFromKey("b", { ctrlOrMeta: true })).toBeNull();
  });
});
