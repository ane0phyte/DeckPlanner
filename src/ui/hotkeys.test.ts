import { describe, expect, it } from "vitest";
import {
  actionFromKey,
  firstUnusedLetter,
  hotkeyLetterForTool,
  hotkeyTooltip,
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
