import { useStore } from "../state/store";
import { LengthField, NumField, SelectField, TextField } from "./fields";
import { buildCutList } from "../export/cutlist";
import { formatInches } from "../units/length";
import { dressedSize } from "../units/length";
import type { PlannerObject } from "../model/types";
import { deleteButtonLabel, selectionLabel } from "../edit/handles";
import { drawElevationToCanvas } from "../canvas/elevation";
import { useEffect, useRef, useState } from "react";

export function RightPanel() {
  const { project, selectedIds, selection, mutate, updateObject, convertSelectedWall, select } =
    useStore();
  const selected = project.objects.find((o) => o.id === selectedIds[0]);
  const [tab, setTab] = useState<"inspect" | "flags" | "cut" | "elev">("inspect");

  return (
    <aside className="panel right">
      <div className="tabs">
        {(
          [
            ["inspect", "Inspect"],
            ["flags", "IRC flags"],
            ["cut", "Cut list"],
            ["elev", "Elevation"],
          ] as const
        ).map(([id, label]) => (
          <button key={id} type="button" className={tab === id ? "active" : ""} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>

      {tab === "inspect" && (
        <section>
          <h2>Heights (typed, house/ledger side)</h2>
          <p className="hint">Not from the photo. Grade is one height; site treated as flat. No door object — door sill is a field.</p>
          <LengthField
            label="Deck"
            value={project.settings.heights.deckIn}
            onChange={(v) =>
              mutate((p) => ({ ...p, settings: { ...p.settings, heights: { ...p.settings.heights, deckIn: v } } }))
            }
          />
          <LengthField
            label="Grade"
            value={project.settings.heights.gradeIn}
            onChange={(v) =>
              mutate((p) => ({ ...p, settings: { ...p.settings, heights: { ...p.settings.heights, gradeIn: v } } }))
            }
          />
          <LengthField
            label="Door sill"
            value={project.settings.heights.doorSillIn}
            onChange={(v) =>
              mutate((p) => ({ ...p, settings: { ...p.settings, heights: { ...p.settings.heights, doorSillIn: v } } }))
            }
          />
          <LengthField
            label="Stair rise"
            value={project.settings.heights.stairRiseIn}
            onChange={(v) =>
              mutate((p) => ({ ...p, settings: { ...p.settings, heights: { ...p.settings.heights, stairRiseIn: v } } }))
            }
          />

          <h2>Lateral / flashing products</h2>
          <SelectField
            label="Lateral scheme (R507.9.2)"
            value={project.settings.lateralScheme}
            onChange={(v) =>
              mutate((p) => ({
                ...p,
                settings: { ...p.settings, lateralScheme: v as typeof p.settings.lateralScheme },
              }))
            }
            options={[
              { value: "2x1500", label: "≥2 hold-downs 1500 lb ASD" },
              { value: "4x750", label: "≥4 at 750 lb ASD" },
            ]}
          />
          <TextField
            label="Lateral product"
            value={project.settings.lateralProduct}
            placeholder="Type name — do not invent"
            onChange={(v) => mutate((p) => ({ ...p, settings: { ...p.settings, lateralProduct: v } }))}
          />
          <TextField
            label="Flashing product"
            value={project.settings.flashingProduct}
            placeholder="Type name — do not invent"
            onChange={(v) => mutate((p) => ({ ...p, settings: { ...p.settings, flashingProduct: v } }))}
          />
          <TextField
            label="Hanger product (1:1 count)"
            value={project.settings.accessories.hangerProduct}
            onChange={(v) =>
              mutate((p) => ({
                ...p,
                settings: { ...p.settings, accessories: { ...p.settings.accessories, hangerProduct: v } },
              }))
            }
          />
          <LengthField
            label="Flashing coverage sf / roll (user)"
            value={project.settings.accessories.flashingCoverageSqFtPerRoll}
            onChange={(v) =>
              mutate((p) => ({
                ...p,
                settings: {
                  ...p.settings,
                  accessories: { ...p.settings.accessories, flashingCoverageSqFtPerRoll: v },
                },
              }))
            }
          />
          <LengthField
            label="Guard lin ft / box (user)"
            value={project.settings.accessories.guardLinearFtPerBox}
            onChange={(v) =>
              mutate((p) => ({
                ...p,
                settings: { ...p.settings, accessories: { ...p.settings.accessories, guardLinearFtPerBox: v } },
              }))
            }
          />

          <h2>Selected</h2>
          <SelectionActions />
          {!selected && !selection && <p className="hint">Click a point or vertex to select it, then drag or Delete.</p>}
          {selected && (
            <ObjectInspector
              obj={selected}
              update={updateObject}
              convertWall={convertSelectedWall}
              onDeleteWhole={() => {
                mutate((p) => ({ ...p, objects: p.objects.filter((o) => o.id !== selected.id) }));
                select([]);
              }}
            />
          )}
        </section>
      )}

      {tab === "flags" && (
        <section>
          <h2>2024 IRC flags</h2>
          <p className="hint">Fill completes around violations and keeps flags. Citations use R507, R321, R318.7, R301.5 — not R311.7 / R312.</p>
          <ul className="flags">
            {project.flags.map((f) => (
              <li key={f.id} className={f.severity}>
                <strong>{f.section}</strong> {f.message}
              </li>
            ))}
          </ul>
        </section>
      )}

      {tab === "cut" && <CutListView />}
      {tab === "elev" && <ElevationPreview />}
    </aside>
  );
}

function SelectionActions() {
  const { project, selection, deleteSelected } = useStore();
  if (!selection) return null;
  return (
    <div className="selection-box">
      <p className="hint">{selectionLabel(selection, project)}</p>
      <button type="button" className="wide danger" onClick={deleteSelected}>
        {deleteButtonLabel(selection)}
      </button>
    </div>
  );
}

function ObjectInspector({
  obj,
  update,
  convertWall,
  onDeleteWhole,
}: {
  obj: PlannerObject;
  update: (id: string, patch: Partial<PlannerObject>) => void;
  convertWall: () => void;
  onDeleteWhole: () => void;
}) {
  return (
    <div>
      <p className="hint">
        {obj.type} · {obj.source} · {obj.label}
      </p>
      {(obj.type === "outline" || obj.type === "nodigZone") && (
        <button type="button" className="wide danger" onClick={onDeleteWhole}>
          Delete entire {obj.type === "outline" ? "outline" : "no-dig zone"}
        </button>
      )}
      <TextField label="Label" value={obj.label} onChange={(v) => update(obj.id, { label: v })} />
      <TextField
        label="Species label"
        value={obj.speciesLabel}
        onChange={(v) => update(obj.id, { speciesLabel: v })}
      />
      <SelectField
        label="Treatment"
        value={obj.treatment}
        onChange={(v) => update(obj.id, { treatment: v as PlannerObject["treatment"] })}
        options={[
          { value: "ground-contact", label: "Ground-contact (default posts)" },
          { value: "above-ground", label: "Above-ground (default others)" },
        ]}
      />
      {obj.type === "houseWall" && (
        <button type="button" className="wide" onClick={convertWall}>
          Convert house wall to ledger
        </button>
      )}
      {"nominalSize" in obj && (
        <SelectField
          label="Nominal size (dressed layout for 2x)"
          value={obj.nominalSize}
          onChange={(v) => {
            const d = dressedSize(v);
            update(obj.id, {
              nominalSize: v,
              ...(d && "actualWidthIn" in obj
                ? {
                    actualWidthIn: obj.type === "beam" ? d.w * (obj.plyCount ?? 1) : d.w,
                    actualDepthIn: d.d,
                  }
                : {}),
            } as Partial<PlannerObject>);
          }}
          options={["2x6", "2x8", "2x10", "2x12", "4x4", "4x6", "6x6", "8x8"].map((v) => ({
            value: v,
            label: v,
          }))}
        />
      )}
      {obj.type === "beam" && (
        <NumField
          label="Ply count"
          value={obj.plyCount}
          onChange={(v) => {
            const d = dressedSize(obj.nominalSize);
            update(obj.id, { plyCount: v, actualWidthIn: d ? d.w * v : obj.actualWidthIn });
          }}
        />
      )}
      {obj.type === "ledger" && (
        <>
          <SelectField
            label="Band / rim type"
            value={obj.bandRimType}
            onChange={(v) => update(obj.id, { bandRimType: v as typeof obj.bandRimType })}
            options={[
              { value: "2in-solid-sawn-spf-or-better", label: "2 in solid-sawn SPF or better" },
              { value: "1in-engineered-rim-prr410-d7672", label: "1 in engineered rim PRR 410 / ASTM D7672" },
              { value: "other-do-not-use-oc-table", label: "Other — do not use o.c. table" },
            ]}
          />
          <SelectField
            label="Substrate"
            value={obj.substrate}
            onChange={(v) => update(obj.id, { substrate: v as typeof obj.substrate })}
            options={[
              { value: "wood-band", label: "Wood band" },
              { value: "stone-masonry-veneer", label: "Stone / masonry veneer (not permitted)" },
              { value: "other", label: "Other" },
            ]}
          />
          <SelectField
            label="Fastener (no structural-screw column)"
            value={obj.fastenerKind}
            onChange={(v) => update(obj.id, { fastenerKind: v as typeof obj.fastenerKind })}
            options={[
              { value: "lag-1/2-sheathing-1/2", label: "1/2 in lag, 1/2 in max sheathing" },
              { value: "bolt-1/2-sheathing-1/2", label: "1/2 in bolt, 1/2 in sheathing" },
              { value: "bolt-1/2-sheathing-1", label: "1/2 in bolt, 1 in sheathing" },
            ]}
          />
          <TextField
            label="Fastener product"
            value={obj.fastenerProduct}
            onChange={(v) => update(obj.id, { fastenerProduct: v })}
          />
          <TextField
            label="Flashing product"
            value={obj.flashingProduct}
            onChange={(v) => update(obj.id, { flashingProduct: v })}
          />
        </>
      )}
      {obj.type === "breaker" && (
        <SelectField
          label="Support under seam"
          value={obj.support}
          onChange={(v) => update(obj.id, { support: v as typeof obj.support })}
          options={[
            { value: "doubled-joists", label: "Doubled joists" },
            { value: "blocking", label: "Blocking" },
          ]}
        />
      )}
      {(obj.type === "stairs" || obj.type === "existingStairs") && (
        <>
          <LengthField label="Width (clear)" value={obj.widthIn} onChange={(v) => update(obj.id, { widthIn: v })} />
          <LengthField label="Rise (typed)" value={obj.riseIn} onChange={(v) => update(obj.id, { riseIn: v })} />
        </>
      )}
      {obj.type === "nodigPoint" && (
        <LengthField
          label="Buffer radius"
          value={obj.bufferRadiusIn}
          onChange={(v) => update(obj.id, { bufferRadiusIn: v ?? 24 })}
        />
      )}
      {obj.type === "guard" && (
        <LengthField label="Guard height" value={obj.heightIn} onChange={(v) => update(obj.id, { heightIn: v ?? 36 })} />
      )}
    </div>
  );
}

function CutListView() {
  const { project } = useStore();
  const list = buildCutList(project);
  return (
    <section>
      <h2>Cut list</h2>
      <p className="hint">{list.wasteNote}</p>
      <table>
        <thead>
          <tr>
            <th>Qty</th>
            <th>Member</th>
            <th>Size</th>
            <th>Each</th>
          </tr>
        </thead>
        <tbody>
          {list.lumber.map((r, i) => (
            <tr key={i}>
              <td>{r.qty}</td>
              <td>{r.member}</td>
              <td>{r.nominal}</td>
              <td>{r.eachLength}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h3>1:1 hangers / fasteners</h3>
      <ul>
        {list.counts.map((r, i) => (
          <li key={i}>
            {r.qty}× {r.item} — {r.product}
          </li>
        ))}
      </ul>
      <h3>Area / linear accessories</h3>
      <ul>
        {list.accessories.map((r, i) => (
          <li key={i}>
            {r.item}: {r.layoutAmount} · {r.coverage} → {r.rollsOrBoxes}
          </li>
        ))}
      </ul>
    </section>
  );
}

function ElevationPreview() {
  const { project } = useStore();
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#f7f4ee";
    ctx.fillRect(0, 0, c.width, c.height);
    drawElevationToCanvas(ctx, project, c.width, c.height);
  }, [project]);
  const h = project.settings.heights;
  return (
    <section>
      <h2>Simple elevation</h2>
      <p className="hint">
        Deck {formatInches(h.deckIn)} · Grade {formatInches(h.gradeIn)} · Sill {formatInches(h.doorSillIn)}
      </p>
      <canvas ref={ref} width={420} height={280} className="elev-canvas" />
    </section>
  );
}
