import type { Project } from "../model/types";

export const PROJECT_FILE_TYPE = {
  description: "Deck Planner project",
  accept: { "application/json": [".json", ".deckplanner.json"] },
};

export function projectFileName(project: Project, existing?: string | null): string {
  if (existing?.trim()) return existing;
  const slug =
    project.settings.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") ||
    "deck";
  return `${slug}.deckplanner.json`;
}

export function supportsFilePicker(): boolean {
  return typeof window !== "undefined" && typeof window.showSaveFilePicker === "function";
}

export function supportsOpenPicker(): boolean {
  return typeof window !== "undefined" && typeof window.showOpenFilePicker === "function";
}

function isAbort(e: unknown): boolean {
  return e instanceof DOMException && e.name === "AbortError";
}

export async function parseProjectText(text: string): Promise<Project> {
  const data = JSON.parse(text) as Project;
  if (data.version !== 1 || !data.settings || !Array.isArray(data.objects)) {
    throw new Error("Not a Deck Planner v1 project file.");
  }
  return data;
}

export async function readProjectFile(file: File): Promise<Project> {
  return parseProjectText(await file.text());
}

export function projectJson(project: Project): string {
  return JSON.stringify(project, null, 2);
}

export async function writeProjectToHandle(
  project: Project,
  handle: FileSystemFileHandle,
): Promise<void> {
  const writable = await handle.createWritable();
  await writable.write(projectJson(project));
  await writable.close();
}

function downloadProject(project: Project, fileName: string): void {
  const blob = new Blob([projectJson(project)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(a.href);
}

export type SaveResult =
  | { cancelled: true }
  | { cancelled: false; handle: FileSystemFileHandle | null; fileName: string };

export async function saveProjectAs(
  project: Project,
  suggestedName: string,
): Promise<SaveResult> {
  if (supportsFilePicker() && window.showSaveFilePicker) {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName,
        types: [PROJECT_FILE_TYPE],
      });
      await writeProjectToHandle(project, handle);
      return { cancelled: false, handle, fileName: handle.name };
    } catch (e) {
      if (isAbort(e)) return { cancelled: true };
      throw e;
    }
  }
  downloadProject(project, suggestedName);
  return { cancelled: false, handle: null, fileName: suggestedName };
}

export async function saveProjectToKnownFile(
  project: Project,
  handle: FileSystemFileHandle | null,
  suggestedName: string,
): Promise<SaveResult> {
  if (handle) {
    await writeProjectToHandle(project, handle);
    return { cancelled: false, handle, fileName: handle.name };
  }
  return saveProjectAs(project, suggestedName);
}

export type OpenResult = {
  project: Project;
  handle: FileSystemFileHandle | null;
  fileName: string;
};

export async function pickAndReadProject(): Promise<OpenResult | null> {
  if (!supportsOpenPicker() || !window.showOpenFilePicker) return null;
  try {
    const [handle] = await window.showOpenFilePicker({
      multiple: false,
      types: [PROJECT_FILE_TYPE],
    });
    const file = await handle.getFile();
    return {
      project: await parseProjectText(await file.text()),
      handle,
      fileName: handle.name,
    };
  } catch (e) {
    if (isAbort(e)) return null;
    throw e;
  }
}

/** Legacy download used by tests / fallbacks. */
export function saveProjectFile(project: Project): void {
  downloadProject(project, projectFileName(project));
}
