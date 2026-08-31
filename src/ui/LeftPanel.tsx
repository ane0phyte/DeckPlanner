import { useState } from "react";
import type { LayerId, Tool } from "../model/types";
import { LAYER_LABELS } from "../model/types";
import { useStore } from "../state/store";
import { Field, LengthField, NumField, SelectField, TextField, Toggle } from "./fields";
import { HotkeyButton, HotkeyLabel } from "./HotkeyButton";
import { FILL_HOTKEY, ORTHO_HOTKEY, TOOL_HOTKEY, hotkeyTooltip } from "./hotkeys";
import { InspectPanel } from "./InspectPanel";
import { CutListSection, ElevationSection, FlagsSection, ShoppingListSection } from "./ListSections";

export const LEFT_TABS = [
  { id: "tools", label: "Tools" },
  { id: "inspect", label: "Inspect" },
  { id: "flags", label: "IRC flags" },
  { id: "cut", label: "Cut list" },
  { id: "shop", label: "Shopping list" },
  { id: "settings", label: "Elevation" },
] as const;

export type LeftTabId = (typeof LEFT_TABS)[number]["id"];

const PLACE_TOOLS: { id: keyof typeof TOOL_HOTKEY; label: string; hint: string }[] = [
  { id: "select", label: "Select", hint: "Click an object or its bounds, then drag or Delete." },
  { id: "pan", label: "Pan", hint: "Drag the photo." },
  { id: "scale", label: "Set scale", hint: "Click two points, type a known length." },
  { id: "origin", label: "Set origin", hint: "Click the zero point. Status bar then shows live XY." },
  { id: "measure", label: "Measure", hint: "Two clicks. Shows feet-inches. Does not change scale." },
];

const OBJECT_TOOLS: { id: keyof typeof TOOL_HOTKEY; label: string; hint: string }[] = [
  { id: "outline", label: "Deck outline", hint: "Polygon. Double-click or Enter to close. Not the floating deck." },
  { id: "ledger", label: "Ledger", hint: "Two clicks or click-drag along the house." },
  { id: "houseWall", label: "House wall", hint: "Optional convert line. You can draw a ledger directly." },
  { id: "post", label: "Post", hint: "Click. XY only." },
  { id: "beam", label: "Beam", hint: "Two clicks. Diagonals allowed when Ortho is off." },
  { id: "joist", label: "Joist", hint: "Two clicks." },
  { id: "breaker", label: "Breaker", hint: "Seam. Pick doubled joists vs blocking." },
  { id: "blocking", label: "Blocking", hint: "Two clicks." },
  { id: "rim", label: "Rim", hint: "Two clicks." },
  { id: "guard", label: "Guard", hint: "User-placed. Fill also adds required R321 guards." },
  { id: "nodigZone", label: "No-dig zone", hint: "Polygon. Double-click to close." },
  { id: "nodigPoint", label: "No-dig point", hint: "Click + typed buffer radius." },
  { id: "box", label: "Stairs / box", hint: "Draw a rectangle (stairs or board in photo). Then set Type in Inspect." },
];

export function LeftPanel() {
  const [tab, setTab] = useState<LeftTabId>("tools");

  return (
    <aside className="panel left left-pane" data-left-tab={tab}>
      <div className="tabs left-tabs" role="tablist" aria-label="Left pane sections">
        {LEFT_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            data-tab={t.id}
            aria-selected={tab === t.id}
            className={tab === t.id ? "active" : ""}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="left-body">
        {tab === "tools" && <ToolsSection />}
        {tab === "inspect" && <InspectPanel />}
        {tab === "flags" && <FlagsSection />}
        {tab === "cut" && <CutListSection />}
        {tab === "shop" && <ShoppingListSection />}
        {tab === "settings" && <SettingsSection />}
      </div>
    </aside>
  );
}

function ToolsSection() {
  const { tool, setTool, mutate, finishDraft, runFill, project } = useStore();
  const s = project.settings;
  return (
    <section className="left-tools">
      <h2>Tools</h2>
      <p className="hint">
        Draw these on the canvas. After you place something, the app returns to Select so you can click, drag, or Delete.
      </p>
      <div className="tool-grid">
        {PLACE_TOOLS.map((t) => (
          <HotkeyButton
            key={t.id}
            letter={TOOL_HOTKEY[t.id]}
            label={t.label}
            title={t.hint}
            active={tool === t.id}
            onClick={() => setTool(t.id as Tool)}
          />
        ))}
      </div>
      <p className="muted place-label">Place on plan</p>
      <div className="tool-grid">
        {OBJECT_TOOLS.map((t) => (
          <HotkeyButton
            key={t.id}
            letter={TOOL_HOTKEY[t.id]}
            label={t.label}
            title={t.hint}
            active={tool === t.id}
            onClick={() => setTool(t.id as Tool)}
          />
        ))}
      </div>
      {(tool === "outline" || tool === "nodigZone") && (
        <button type="button" className="wide" onClick={finishDraft}>
          Close polygon
        </button>
      )}
      <div className="tool-grid tool-actions">
        <HotkeyButton
          letter={FILL_HOTKEY}
          label="Fill"
          title="Places posts, beams, joists, boards around flags"
          className="fill-btn primary"
          onClick={() => {
            const err = runFill();
            if (err) window.alert(err);
          }}
        />
        <button
          type="button"
          className={s.orthoSnap ? "active" : ""}
          data-hotkey={ORTHO_HOTKEY}
          title={hotkeyTooltip("Ortho snap", ORTHO_HOTKEY)}
          onClick={() => mutate((p) => ({ ...p, settings: { ...p.settings, orthoSnap: !p.settings.orthoSnap } }))}
        >
          <HotkeyLabel label="Ortho snap" letter={ORTHO_HOTKEY} />
        </button>
      </div>
    </section>
  );
}

function SettingsSection() {
  const { project, mutate } = useStore();
  const s = project.settings;
  return (
    <>
      <ElevationSection />
      <section>
        <h2>Layers &amp; snap</h2>
        {(Object.keys(LAYER_LABELS) as LayerId[]).map((id) => (
          <Toggle
            key={id}
            label={LAYER_LABELS[id]}
            checked={s.layers[id]}
            onChange={(v) =>
              mutate((p) => ({
                ...p,
                settings: { ...p.settings, layers: { ...p.settings.layers, [id]: v } },
              }))
            }
          />
        ))}
        <Toggle
          label="Snap increment (starts off)"
          checked={s.snapOn}
          onChange={(v) => mutate((p) => ({ ...p, settings: { ...p.settings, snapOn: v } }))}
        />
        <LengthField
          label="Increment"
          value={s.snapIncrementIn}
          onChange={(v) =>
            mutate((p) => ({ ...p, settings: { ...p.settings, snapIncrementIn: v ?? 6 } }))
          }
        />
      </section>
      <section>
        <h2>Directions — set before Fill</h2>
        <NumField
          label="Joist direction (deg)"
          value={s.joistAngleDeg}
          onChange={(v) => mutate((p) => ({ ...p, settings: { ...p.settings, joistAngleDeg: v } }))}
        />
        <NumField
          label="Decking direction (deg)"
          value={s.deckingAngleDeg}
          onChange={(v) => mutate((p) => ({ ...p, settings: { ...p.settings, deckingAngleDeg: v } }))}
        />
        <NumField
          label="Beam Fill direction (deg, blank = ⊥ joists)"
          value={s.beamFillAngleDeg ?? s.joistAngleDeg + 90}
          onChange={(v) => mutate((p) => ({ ...p, settings: { ...p.settings, beamFillAngleDeg: v } }))}
        />
        <LengthField
          label="Ledger-to-drop-beam clearance (nudge)"
          value={s.ledgerToDropBeamClearanceIn}
          onChange={(v) =>
            mutate((p) => ({
              ...p,
              settings: { ...p.settings, ledgerToDropBeamClearanceIn: v ?? 0 },
            }))
          }
        />
      </section>
      <section>
        <h2>Decking — required before Fill</h2>
        <TextField
          label="Product name"
          value={s.decking.productName}
          placeholder="Type the product — no catalog"
          onChange={(v) =>
            mutate((p) => ({
              ...p,
              settings: { ...p.settings, decking: { ...p.settings.decking, productName: v } },
            }))
          }
        />
        <SelectField
          label="Category"
          value={s.decking.category}
          onChange={(v) =>
            mutate((p) => ({
              ...p,
              settings: {
                ...p.settings,
                decking: { ...p.settings.decking, category: v as typeof s.decking.category },
              },
            }))
          }
          options={[
            { value: "wood-1.25", label: "Wood 1-1/4 in (Table R507.7)" },
            { value: "wood-2", label: "Wood 2 in (Table R507.7)" },
            { value: "composite-other", label: "Composite / other (typed max only)" },
          ]}
        />
        <LengthField
          label="Gap"
          value={s.decking.gapIn}
          placeholder="1/8 or 0.125"
          onChange={(v) =>
            mutate((p) => ({
              ...p,
              settings: { ...p.settings, decking: { ...p.settings.decking, gapIn: v } },
            }))
          }
        />
        <LengthField
          label="Max joist spacing"
          placeholder="16"
          value={s.decking.maxJoistSpacingIn}
          onChange={(v) =>
            mutate((p) => ({
              ...p,
              settings: { ...p.settings, decking: { ...p.settings.decking, maxJoistSpacingIn: v } },
            }))
          }
        />
        <NumField
          label="Board width (in actual)"
          value={s.decking.boardWidthIn}
          step={0.125}
          onChange={(v) =>
            mutate((p) => ({
              ...p,
              settings: { ...p.settings, decking: { ...p.settings.decking, boardWidthIn: v } },
            }))
          }
        />
        <SelectField
          label="Install (R507.7 single / multiple)"
          value={s.decking.install}
          onChange={(v) =>
            mutate((p) => ({
              ...p,
              settings: {
                ...p.settings,
                decking: { ...p.settings.decking, install: v as typeof s.decking.install },
              },
            }))
          }
          options={[
            { value: "single-span", label: "Single span" },
            { value: "multiple-span", label: "Multiple span" },
          ]}
        />
      </section>
      <section>
        <h2>Project</h2>
        <TextField
          label="Name"
          value={s.name}
          onChange={(v) => mutate((p) => ({ ...p, settings: { ...p.settings, name: v } }))}
        />
        <Field label="Jurisdiction">
          <input value={s.jurisdiction} readOnly />
        </Field>
        <TextField
          label="Species label default"
          value={s.defaultSpeciesLabel}
          onChange={(v) => mutate((p) => ({ ...p, settings: { ...p.settings, defaultSpeciesLabel: v } }))}
        />
        <p className="hint">TABLE LOOKUP is Southern pine No. 2. There is no Prime table.</p>
      </section>
    </>
  );
}
