import { useEffect } from "react";
import { StoreProvider, useStore } from "./state/store";
import { Toolbar } from "./ui/Toolbar";
import { LeftPanel } from "./ui/LeftPanel";
import { RightPanel } from "./ui/RightPanel";
import { PlanView } from "./canvas/PlanView";
import { inchesPerUnit } from "./model/project";
import { formatInches } from "./units/length";
import { selectionLabel } from "./edit/handles";
import { offsetFromOriginIn } from "./edit/measure";
function Shell() {
  const {
    project,
    tool,
    undo,
    redo,
    deleteSelected,
    finishDraft,
    cancelDraft,
    selection,
    setTool,
    saveProject,
    saveProjectAs,
    cursorWorld,
  } = useStore();
  const iPerU = inchesPerUnit(project);
  const origin = project.origin;
  const xyLabel =
    !origin
      ? "set origin"
      : !iPerU
        ? "set scale for XY"
        : cursorWorld
          ? (() => {
              const off = offsetFromOriginIn(cursorWorld, origin, iPerU);
              return `X ${formatInches(off.xIn)}  Y ${formatInches(off.yIn)}`;
            })()
          : "X —  Y —";

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (e.shiftKey) void saveProjectAs();
        else void saveProject();
        return;
      }
      if (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT") return;
      if ((e.ctrlKey || e.metaKey) && e.key === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "y") {
        e.preventDefault();
        redo();
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        deleteSelected();
      }
      if (e.key === "Enter") finishDraft();
      if (e.key === "Escape") {
        cancelDraft();
        setTool("select");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cancelDraft, deleteSelected, finishDraft, redo, saveProject, saveProjectAs, setTool, undo]);

  return (
    <div className="app">
      <Toolbar />
      <div className="main">
        <LeftPanel />
        <div className="center">
          <PlanView />
          <footer className="status">
            <span>Tool: {tool}</span>
            <span className="status-xy">{xyLabel}</span>
            <span>
              Scale: {iPerU ? `${formatInches(iPerU)} / plan unit` : "not set — mark a known length"}
            </span>
            <span>
              {project.objects.filter((o) => o.type === "outline").length ? "outline" : "no outline"} ·{" "}
              {project.objects.filter((o) => o.type === "ledger").length ? "ledger" : "no ledger"} ·{" "}
              {project.settings.decking.productName.trim() &&
              project.settings.decking.gapIn != null &&
              project.settings.decking.maxJoistSpacingIn != null
                ? "decking ready"
                : "decking incomplete"}
            </span>
            <span>{project.flags.filter((f) => f.severity === "violation").length} violations</span>
            <span className="muted">
              {selectionLabel(selection, project) ??
                "Select tool: click an object (or its bounds) to select, then drag or Delete. Esc returns to Select. Existing floating deck is backdrop only."}
            </span>
          </footer>
        </div>
        <RightPanel />
      </div>
    </div>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  );
}
