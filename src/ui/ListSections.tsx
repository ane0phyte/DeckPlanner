import { useEffect, useRef } from "react";
import { useStore } from "../state/store";
import { Field, LengthField, TextField } from "./fields";
import { buildCutList, buildShoppingList } from "../export/cutlist";
import { cutRowHighlighted } from "../edit/measure";
import { formatInches } from "../units/length";
import { drawElevationToCanvas } from "../canvas/elevation";

export const FLAGS_HEADING = "IRC flags";
export const CUT_LIST_HEADING = "Cut list";
export const SHOPPING_HEADING = "Shopping list";
export const ELEVATION_HEADING = "Elevation";

export function FlagsSection() {
  const { project, selectAndFrame } = useStore();
  return (
    <section>
      <h2>{FLAGS_HEADING}</h2>
      <p className="hint">Fill completes around violations and keeps flags. Citations use R507, R321, R318.7, R301.5.</p>
      <ul className="flags">
        {project.flags.map((f) => (
          <li
            key={f.id}
            className={`${f.severity}${f.objectIds.length ? " cut-row" : ""}`}
            onClick={() => f.objectIds.length && selectAndFrame(f.objectIds)}
          >
            <strong>{f.section}</strong> {f.message}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function CutListSection() {
  const { project, selectedIds, selectAndFrame } = useStore();
  const list = buildCutList(project);
  return (
    <section>
      <h2>{CUT_LIST_HEADING}</h2>
      <p className="hint">{list.wasteNote}</p>
      <p className="hint">Net cuts. Click a row to select those members on the canvas.</p>
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
            <tr
              key={`${r.member}-${r.eachLength}-${i}`}
              className={`cut-row${cutRowHighlighted(r.objectIds, selectedIds) ? " active" : ""}`}
              onClick={() => r.objectIds.length && selectAndFrame(r.objectIds)}
            >
              <td>{r.qty}</td>
              <td>{r.member}</td>
              <td>{r.nominal}</td>
              <td>{r.eachLength}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h3>1:1 hangers / fasteners</h3>
      <ul className="cut-counts">
        {list.counts.map((r, i) => (
          <li
            key={`${r.item}-${i}`}
            className={`cut-row${cutRowHighlighted(r.objectIds, selectedIds) ? " active" : ""}`}
            onClick={() => r.objectIds.length && selectAndFrame(r.objectIds)}
          >
            {r.qty}× {r.item} — {r.product}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function ShoppingListSection() {
  const { project, selectedIds, selectAndFrame, mutate } = useStore();
  const shop = buildShoppingList(project);
  const waste = project.settings.wastePercent;
  return (
    <section>
      <h2>{SHOPPING_HEADING}</h2>
      <Field label="Waste % (lumber + decking; empty = net only)">
        <input
          inputMode="decimal"
          placeholder="empty = net only"
          value={waste == null ? "" : String(waste)}
          onChange={(e) => {
            const t = e.target.value.trim();
            mutate((p) => ({
              ...p,
              settings: {
                ...p.settings,
                wastePercent: t === "" ? null : Number.isNaN(Number(t)) ? p.settings.wastePercent : Number(t),
              },
            }));
          }}
        />
      </Field>
      <p className="hint">{shop.note}</p>
      <ul className="cut-counts">
        {shop.lines.map((r, i) => (
          <li
            key={`${r.text}-${i}`}
            className={`cut-row${cutRowHighlighted(r.objectIds, selectedIds) ? " active" : ""}`}
            onClick={() => r.objectIds.length && selectAndFrame(r.objectIds)}
          >
            {r.text}
          </li>
        ))}
      </ul>
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
      <TextField
        label="Flashing product"
        value={project.settings.flashingProduct}
        placeholder="Type name — do not invent"
        onChange={(v) => mutate((p) => ({ ...p, settings: { ...p.settings, flashingProduct: v } }))}
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
            settings: {
              ...p.settings,
              accessories: { ...p.settings.accessories, guardLinearFtPerBox: v },
            },
          }))
        }
      />
    </section>
  );
}

export function ElevationSection() {
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
  const bits = [
    h.deckIn != null ? `Deck ${formatInches(h.deckIn)}` : null,
    h.gradeIn != null ? `Grade ${formatInches(h.gradeIn)}` : null,
    h.doorSillIn != null ? `Sill ${formatInches(h.doorSillIn)}` : null,
  ].filter(Boolean);
  return (
    <section>
      <h2>{ELEVATION_HEADING}</h2>
      <p className="hint">
        {bits.length
          ? bits.join(" · ")
          : "Uses values from the project file if present. Not edited here."}
      </p>
      <canvas ref={ref} width={420} height={280} className="elev-canvas" />
    </section>
  );
}
