import { useEffect } from "react";
import { StoreProvider, useStore } from "./state/store";
import { Toolbar } from "./ui/Toolbar";
import { LeftPanel } from "./ui/LeftPanel";
import { RightPanel } from "./ui/RightPanel";
import { PlanView } from "./canvas/PlanView";
import { inchesPerUnit } from "./model/project";
import { formatInches } from "./units/length";
function Shell() {
  const { project, tool, undo, redo, deleteSelected, finishDraft, cancelDraft } = useStore();
  const iPerU = inchesPerUnit(project);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
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
      if (e.key === "Delete" || e.key === "Backspace") deleteSelected();
      if (e.key === "Enter") finishDraft();
      if (e.key === "Escape") cancelDraft();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cancelDraft, deleteSelected, finishDraft, redo, undo]);

  return (
    <div className="app">
      <Toolbar />
      <div className="main">
        <LeftPanel />
        <div className="center">
          <PlanView />
          <footer className="status">
            <span>Tool: {tool}</span>
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
              Existing floating deck is backdrop only. Fill needs outline + ledger. Snap starts off.
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
