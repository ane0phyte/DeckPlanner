import { useStore } from "../state/store";
import { LengthField, NumField, SelectField, TextField } from "./fields";
import { dressedSize, formatInches } from "../units/length";
import type { PlannerObject } from "../model/types";
import { deleteButtonLabel, selectionLabel } from "../edit/handles";
import { connectedObjects, inspectCoords, inspectSizeLine } from "../edit/inspect";
import { defaultWidthIn, getOrientedBox, relabelBox, type BoxKind } from "../edit/typedBox";
import { inchesPerUnit } from "../model/project";

export const INSPECT_HEADING = "Inspect";

export function InspectPanel() {
  const { project, selectedIds, selection, select, selectAndFrame, mutate, updateObject, convertSelectedWall } =
    useStore();
  const selected = selectedIds.map((id) => project.objects.find((o) => o.id === id)).filter(Boolean) as PlannerObject[];

  return (
    <section>
      <h2>{INSPECT_HEADING}</h2>
      <SelectionActions />
      {selectedIds.length === 0 && !selection && <p className="hint">select an object</p>}
      {selected.length > 1 && (
        <MultiInspect
          objects={selected}
          onPick={(id) => selectAndFrame([id])}
        />
      )}
      {selected.length === 1 && (
        <ObjectInspector
          obj={selected[0]}
          update={updateObject}
          convertWall={convertSelectedWall}
          onPickConnected={(id) => selectAndFrame([id])}
          onDeleteWhole={() => {
            mutate((p) => ({ ...p, objects: p.objects.filter((o) => o.id !== selected[0].id) }));
            select([]);
          }}
        />
      )}
    </section>
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

function MultiInspect({
  objects,
  onPick,
}: {
  objects: PlannerObject[];
  onPick: (id: string) => void;
}) {
  const types = [...new Set(objects.map((o) => o.type))];
  const sizes = [...new Set(objects.map((o) => ("nominalSize" in o ? o.nominalSize : "")))].filter(Boolean);
  return (
    <div>
      <p>
        {objects.length} selected{types.length === 1 ? ` · ${types[0]}` : ""}
        {sizes.length === 1 ? ` · ${sizes[0]}` : ""}
      </p>
      <ul className="connect-list">
        {objects.map((o) => (
          <li key={o.id}>
            <button type="button" className="linkish" onClick={() => onPick(o.id)}>
              {o.label || o.type}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ObjectInspector({
  obj,
  update,
  convertWall,
  onPickConnected,
  onDeleteWhole,
}: {
  obj: PlannerObject;
  update: (id: string, patch: Partial<PlannerObject>) => void;
  convertWall: () => void;
  onPickConnected: (id: string) => void;
  onDeleteWhole: () => void;
}) {
  const { project, mutate } = useStore();
  const iPerU = inchesPerUnit(project);
  const fromBox =
    obj.type === "stairs" || obj.type === "existingStairs" ? defaultWidthIn(obj, iPerU) : null;
  const coords = inspectCoords(obj, project);
  const size = inspectSizeLine(obj);
  const links = connectedObjects(obj, project);

  return (
    <div>
      <p className="hint">
        {obj.type} · {obj.source} · {obj.label}
      </p>
      {coords.map((c) => (
        <p key={c.label} className="inspect-xy">
          <strong>{c.label}</strong> {c.value}
        </p>
      ))}
      {size && (
        <p className="inspect-xy">
          <strong>Size</strong> {size}
        </p>
      )}
      {"plyCount" in obj && (
        <p className="inspect-xy">
          <strong>Ply</strong> {obj.plyCount}
        </p>
      )}
      {obj.type === "joist" && (
        <p className="inspect-xy">
          <strong>Doubled</strong> {obj.doubled ? "yes" : "no"}
        </p>
      )}
      {obj.material ? (
        <p className="inspect-xy">
          <strong>Material</strong> {obj.material}
        </p>
      ) : null}
      <p className="inspect-xy">
        <strong>Treatment</strong> {obj.treatment}
      </p>
      {links.length > 0 && (
        <div>
          <p className="hint">Connecting objects</p>
          <ul className="connect-list">
            {links.map((c) => (
              <li key={c.id}>
                <button type="button" className="linkish" onClick={() => onPickConnected(c.id)}>
                  {c.label}
                </button>
                <span className="muted"> {c.role}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {getOrientedBox(obj) && (
        <SelectField
          label="Type"
          value={obj.type === "board" ? "board" : "stairs"}
          onChange={(v) => {
            mutate((p) => ({
              ...p,
              objects: p.objects.map((o) => (o.id === obj.id ? relabelBox(o, v as BoxKind) : o)),
            }));
          }}
          options={[
            { value: "stairs", label: "Stairs" },
            { value: "board", label: "Board" },
          ]}
        />
      )}
      {(obj.type === "stairs" || obj.type === "existingStairs") && (
        <>
          <LengthField
            label="Width (clear)"
            value={obj.widthIn}
            placeholder={fromBox != null ? formatInches(fromBox) : "from box when scale is set"}
            onChange={(v) => update(obj.id, { widthIn: v })}
          />
          <LengthField label="Rise (typed)" value={obj.riseIn} onChange={(v) => update(obj.id, { riseIn: v })} />
        </>
      )}
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

