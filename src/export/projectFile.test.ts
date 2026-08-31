import { describe, expect, it, vi, afterEach } from "vitest";
import { emptyProject } from "../model/project";
import {
  PROJECT_FILE_TYPE,
  parseProjectText,
  projectFileName,
  projectJson,
  saveProjectAs,
  saveProjectToKnownFile,
} from "./projectFile";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("project file", () => {
  it("uses accept extensions Chrome allows (max 16 chars including the dot)", () => {
    const exts = Object.values(PROJECT_FILE_TYPE.accept).flat();
    for (const ext of exts) {
      expect(ext.startsWith(".")).toBe(true);
      expect(ext.length).toBeLessThanOrEqual(16);
    }
    expect(projectFileName(emptyProject())).toMatch(/\.deckplanner\.json$/);
  });

  it("names a .deckplanner.json from the project title", () => {
    const p = emptyProject();
    p.settings.name = "Back yard deck";
    expect(projectFileName(p)).toBe("back-yard-deck.deckplanner.json");
    expect(projectFileName(p, "kept.deckplanner.json")).toBe("kept.deckplanner.json");
  });

  it("rejects a file that is not a v1 project", async () => {
    await expect(parseProjectText("{}")).rejects.toThrow(/Deck Planner v1/);
    const ok = emptyProject();
    await expect(parseProjectText(projectJson(ok))).resolves.toMatchObject({ version: 1 });
  });

  it("persists origin and typed waste percent", async () => {
    const p = emptyProject();
    p.origin = { x: 12, y: 34 };
    p.settings.wastePercent = 10;
    const round = await parseProjectText(projectJson(p));
    expect(round.origin).toEqual({ x: 12, y: 34 });
    expect(round.settings.wastePercent).toBe(10);
  });

  it("defaults missing origin and waste percent on old files", async () => {
    const raw = JSON.parse(projectJson(emptyProject())) as { origin?: unknown; settings: { wastePercent?: unknown } };
    delete raw.origin;
    delete raw.settings.wastePercent;
    const round = await parseProjectText(JSON.stringify(raw));
    expect(round.origin).toBeNull();
    expect(round.settings.wastePercent).toBeNull();
  });

  it("Save with a handle writes that file and does not open a picker", async () => {
    const picker = vi.fn();
    vi.stubGlobal("showSaveFilePicker", picker);
    const chunks: string[] = [];
    const handle = {
      name: "yard.deckplanner.json",
      createWritable: async () => ({
        write: async (data: string) => {
          chunks.push(data);
        },
        close: async () => {},
      }),
    } as unknown as FileSystemFileHandle;
    const p = emptyProject();
    p.settings.name = "Yard";
    const result = await saveProjectToKnownFile(p, handle, "ignored.json");
    expect(result).toEqual({
      cancelled: false,
      handle,
      fileName: "yard.deckplanner.json",
    });
    expect(picker).not.toHaveBeenCalled();
    expect(chunks.join()).toContain('"version": 1');
  });

  it("Save without a handle opens Save As (picker)", async () => {
    const handle = {
      name: "new.deckplanner.json",
      createWritable: async () => ({
        write: async () => {},
        close: async () => {},
      }),
    };
    const picker = vi.fn(async () => handle);
    vi.stubGlobal("showSaveFilePicker", picker);
    const result = await saveProjectToKnownFile(emptyProject(), null, "untitled.deckplanner.json");
    expect(picker).toHaveBeenCalled();
    expect(result.cancelled).toBe(false);
    if (!result.cancelled) expect(result.fileName).toBe("new.deckplanner.json");
  });

  it("Save As always opens a picker even when a handle exists", async () => {
    const picker = vi.fn(async () => ({
      name: "copy.deckplanner.json",
      createWritable: async () => ({
        write: async () => {},
        close: async () => {},
      }),
    }));
    vi.stubGlobal("showSaveFilePicker", picker);
    const existing = {
      name: "old.deckplanner.json",
      createWritable: async () => ({
        write: async () => {
          throw new Error("should not write the old handle");
        },
        close: async () => {},
      }),
    } as unknown as FileSystemFileHandle;
    void existing;
    const result = await saveProjectAs(emptyProject(), "old.deckplanner.json");
    expect(picker).toHaveBeenCalled();
    if (!result.cancelled) expect(result.fileName).toBe("copy.deckplanner.json");
  });

  it("treats picker abort as cancelled", async () => {
    vi.stubGlobal("showSaveFilePicker", async () => {
      throw new DOMException("The user aborted a request.", "AbortError");
    });
    const result = await saveProjectAs(emptyProject(), "x.deckplanner.json");
    expect(result).toEqual({ cancelled: true });
  });
});
