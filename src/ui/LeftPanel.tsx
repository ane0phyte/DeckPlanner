import type { LayerId, Tool } from "../model/types";
import { LAYER_LABELS } from "../model/types";
import { useStore } from "../state/store";
import { Field, LengthField, NumField, SelectField, TextField, Toggle } from "./fields";

const PLACE_TOOLS: { id: Tool; label: string; hint: string }[] = [
  { id: "select", label: "Select / drag", hint: "Click a point or object, then drag or Delete." },
  { id: "pan", label: "Pan", hint: "Drag the photo." },
  { id: "scale", label: "Set scale", hint: "Click two points, type a known length." },
  { id: "outline", label: "New deck outline", hint: "Polygon. Double-click or Enter to close. Not the floating deck." },
];

const CONVERT_TOOLS: { id: Tool; label: string; hint: string }[] = [
  { id: "houseWall", label: "House wall", hint: "Click-to-convert a wall line. Optional — you can draw a ledger directly." },
  { id: "existingStairs", label: "Existing stairs (photo)", hint: "Click-to-convert stairs in the photo." },
  { id: "post", label: "Post", hint: "Click. XY only." },
  { id: "beam", label: "Beam (drop)", hint: "Two clicks. Diagonals allowed when you place them." },
  { id: "joist", label: "Joist", hint: "Two clicks." },
  { id: "board", label: "Board in photo", hint: "Click-to-convert visible boards." },
  { id: "breaker", label: "Breaker board", hint: "Seam. Pick doubled joists vs blocking." },
  { id: "blocking", label: "Blocking", hint: "Two clicks." },
  { id: "rim", label: "Rim", hint: "Two clicks." },
  { id: "guard", label: "Guard", hint: "User-placed. Fill also adds required R321 guards." },
  { id: "nodigZone", label: "No-dig zone", hint: "Polygon. Double-click to close." },
  { id: "nodigPoint", label: "No-dig point", hint: "Click + typed buffer radius." },
];

export function LeftPanel() {
  const { project, tool, setTool, mutate, finishDraft } = useStore();
  const s = project.settings;

  return (
    <aside className="panel left">
      <section>
        <h2>Place on plan</h2>
        <p className="hint">
          Draw these on the canvas. You do not need click-to-convert. The existing floating deck is backdrop only.
        </p>
        <div className="tool-grid">
          {PLACE_TOOLS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={tool === t.id ? "active" : ""}
              title={t.hint}
              onClick={() => setTool(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          className={`wide place-ledger ${tool === "ledger" ? "active" : ""}`}
          title="Two clicks or click-drag along the house. Ledger is its own object (size, band/rim, flashing, fasteners)."
          onClick={() => setTool("ledger")}
        >
          Ledger — click or drag along house
        </button>
        <div className="stair-place">
          <button
            type="button"
            className={`wide ${tool === "stairs" || tool === "existingStairs" ? "active" : ""}`}
            title="Click once to place. Then type rise and width. Drag or Delete after."
            onClick={() => setTool("stairs")}
          >
            Stairs — click to place
          </button>
          <div className="stair-kind">
            <button
              type="button"
              className={tool === "stairs" ? "active" : ""}
              onClick={() => setTool("stairs")}
            >
              Reused
            </button>
            <button
              type="button"
              className={tool === "existingStairs" ? "active" : ""}
              onClick={() => setTool("existingStairs")}
            >
              Existing
            </button>
          </div>
        </div>
        {(tool === "outline" || tool === "nodigZone") && (
          <button type="button" className="wide" onClick={finishDraft}>
            Close polygon
          </button>
        )}
        {tool === "ledger" && (
          <p className="hint">Ledger: click two ends, or press and drag along the house wall. Then drag endpoints or Delete.</p>
        )}
        {(tool === "stairs" || tool === "existingStairs") && (
          <p className="hint">Stairs: click once to place. Type rise and width on the right. One object — not parts.</p>
        )}
      </section>

      <section>
        <h2>Mark on photo (optional convert)</h2>
        <p className="hint">
          Optional. Click-to-convert can still create a house wall, ledger line, or existing stairs from the photo.
          Not an image editor. No auto-extract.
        </p>
        <div className="tool-grid">
          {CONVERT_TOOLS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={tool === t.id ? "active" : ""}
              title={t.hint}
              onClick={() => setTool(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </section>

      <section>
        <h2>Layers</h2>
        {(Object.keys(LAYER_LABELS) as LayerId[]).map((id) => (
          <Toggle
            key={id}
            label={LAYER_LABELS[id]}
            checked={s.layers[id]}
            onChange={(v) =>
              mutate((p) => ({ ...p, settings: { ...p.settings, layers: { ...p.settings.layers, [id]: v } } }))
            }
          />
        ))}
      </section>

      <section>
        <h2>Snap</h2>
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
            mutate((p) => ({ ...p, settings: { ...p.settings, decking: { ...p.settings.decking, productName: v } } }))
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
            mutate((p) => ({ ...p, settings: { ...p.settings, decking: { ...p.settings.decking, gapIn: v } } }))
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
            mutate((p) => ({ ...p, settings: { ...p.settings, decking: { ...p.settings.decking, boardWidthIn: v } } }))
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
    </aside>
  );
}
