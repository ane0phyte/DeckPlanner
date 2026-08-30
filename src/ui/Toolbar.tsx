import { useRef } from "react";
import { useStore } from "../state/store";
import {
  exportCutListPng,
  exportElevationPng,
  exportLetterPdf,
  exportPlanPng,
  readProjectFile,
  saveProjectFile,
} from "../export/exportPlan";
import { preloadPhoto } from "../canvas/render";

export function Toolbar() {
  const {
    project,
    undo,
    redo,
    canUndo,
    canRedo,
    deleteSelected,
    selection,
    runFill,
    loadPhoto,
    setTool,
    tool,
    newProject,
    openProject,
  } = useStore();
  const photoRef = useRef<HTMLInputElement>(null);
  const openRef = useRef<HTMLInputElement>(null);

  async function onPhoto(file: File | undefined) {
    if (!file) return;
    const dataUrl = await fileToDataUrl(file);
    const img = await preloadPhoto(dataUrl);
    loadPhoto(dataUrl, img.naturalWidth, img.naturalHeight);
  }

  return (
    <header className="toolbar">
      <div className="brand">
        <strong>Deck Planner</strong>
        <span>v1 · 2024 IRC · local only</span>
      </div>
      <div className="toolbar-group">
        <button type="button" onClick={newProject}>
          New
        </button>
        <button type="button" onClick={() => photoRef.current?.click()}>
          Photo
        </button>
        <button
          type="button"
          onClick={() => {
            void fetch("/sample-overhead.svg")
              .then((r) => r.blob())
              .then((b) => new File([b], "sample-overhead.svg", { type: "image/svg+xml" }))
              .then(onPhoto);
          }}
        >
          Sample photo
        </button>
        <button type="button" onClick={() => openRef.current?.click()}>
          Open
        </button>
        <button type="button" onClick={() => saveProjectFile(project)}>
          Save
        </button>
        <input
          ref={photoRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => void onPhoto(e.target.files?.[0])}
        />
        <input
          ref={openRef}
          type="file"
          accept="application/json,.json,.deckplanner.json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            void readProjectFile(f).then(openProject);
          }}
        />
      </div>
      <div className="toolbar-group">
        <button type="button" disabled={!canUndo} onClick={undo}>
          Undo
        </button>
        <button type="button" disabled={!canRedo} onClick={redo}>
          Redo
        </button>
        <button
          type="button"
          className="danger"
          disabled={!selection}
          onClick={deleteSelected}
          title="Delete selected point, vertex, or object (Delete / Backspace)"
        >
          Delete
        </button>
      </div>
      <div className="toolbar-group">
        <button
          type="button"
          className={tool === "ledger" ? "active" : ""}
          onClick={() => setTool("ledger")}
        >
          Ledger
        </button>
        <button
          type="button"
          className={tool === "stairs" || tool === "existingStairs" ? "active" : ""}
          onClick={() => setTool("stairs")}
        >
          Stairs
        </button>
      </div>
      <div className="toolbar-group">
        <button
          type="button"
          className="primary"
          onClick={() => {
            const err = runFill();
            if (err) window.alert(err);
          }}
        >
          Fill
        </button>
      </div>
      <div className="toolbar-group">
        <button type="button" onClick={() => void exportPlanPng(project)}>
          PNG plan
        </button>
        <button type="button" onClick={() => void exportCutListPng(project)}>
          PNG cut list
        </button>
        <button type="button" onClick={() => void exportElevationPng(project)}>
          PNG elev.
        </button>
        <button type="button" onClick={() => void exportLetterPdf(project)}>
          Letter PDF
        </button>
      </div>
      <div className="toolbar-note">Chrome · no account · project file stays in the browser</div>
    </header>
  );
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}
