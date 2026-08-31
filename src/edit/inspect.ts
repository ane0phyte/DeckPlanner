import type { PlannerObject, Point, Project } from "../model/types";
import { findByType, inchesPerUnit } from "../model/project";
import { dist, distToSeg } from "../geom/vec";
import { formatInches } from "../units/length";
import { offsetFromOriginIn } from "./measure";
import { objectDisplayName, objectPickPoint } from "./hit";

export interface ConnectedRef {
  id: string;
  label: string;
  role: string;
}

export interface CoordLine {
  label: string;
  value: string;
}

export function formatPointDisplay(p: Point, project: Project): string {
  const origin = project.origin;
  const iPerU = inchesPerUnit(project);
  if (!origin || !iPerU) return `plan (${p.x.toFixed(1)}, ${p.y.toFixed(1)})`;
  const off = offsetFromOriginIn(p, origin, iPerU);
  return `X ${formatInches(off.xIn)}  Y ${formatInches(off.yIn)}`;
}

export function inspectCoords(obj: PlannerObject, project: Project): CoordLine[] {
  if (obj.type === "post" || obj.type === "nodigPoint" || obj.type === "lateralDevice") {
    return [{ label: "XY", value: formatPointDisplay(obj.origin, project) }];
  }
  if (obj.type === "stairs" || obj.type === "existingStairs") {
    return [{ label: "Origin", value: formatPointDisplay(obj.origin, project) }];
  }
  if ("a" in obj && "b" in obj) {
    return [
      { label: "A", value: formatPointDisplay(obj.a, project) },
      { label: "B", value: formatPointDisplay(obj.b, project) },
    ];
  }
  return [{ label: "XY", value: formatPointDisplay(objectPickPoint(obj), project) }];
}

function padWorld(project: Project): number {
  const iPerU = inchesPerUnit(project);
  return iPerU ? 4 / iPerU : 4;
}

export function connectedObjects(obj: PlannerObject, project: Project): ConnectedRef[] {
  const pad = padWorld(project);
  const out: ConnectedRef[] = [];
  const add = (o: PlannerObject | undefined, role: string) => {
    if (!o || out.some((c) => c.id === o.id)) return;
    out.push({ id: o.id, label: objectDisplayName(o), role });
  };

  if (obj.type === "beam") {
    for (const p of findByType(project, "post")) {
      const on =
        p.beamId === obj.id ||
        distToSeg(p.origin, obj.a, obj.b) <= pad;
      if (on) add(p, "post under beam");
    }
  }

  if (obj.type === "post") {
    const beam =
      (obj.beamId ? project.objects.find((o) => o.id === obj.beamId) : undefined) ??
      findByType(project, "beam").find((b) => distToSeg(obj.origin, b.a, b.b) <= pad);
    if (beam && beam.type === "beam") add(beam, "beam this post sits on");
  }

  if (obj.type === "joist") {
    const ledger = findByType(project, "ledger")[0];
    if (ledger && distToSeg(objectPickPoint(obj), ledger.a, ledger.b) <= pad * 4) {
      add(ledger, "ledger this joist bears on");
    }
    for (const b of findByType(project, "beam")) {
      const hits =
        distToSeg(obj.a, b.a, b.b) <= pad ||
        distToSeg(obj.b, b.a, b.b) <= pad ||
        distToSeg(objectPickPoint(obj), b.a, b.b) <= Math.max(pad, dist(obj.a, obj.b) * 0.02);
      const crosses =
        distToSeg(b.a, obj.a, obj.b) <= pad || distToSeg(b.b, obj.a, obj.b) <= pad;
      if (hits || crosses) add(b, "beam this joist bears on");
    }
  }

  if (obj.type === "blocking") {
    const mid = objectPickPoint(obj);
    for (const br of findByType(project, "breaker")) {
      if (distToSeg(mid, br.a, br.b) <= pad * 2) add(br, "breaker this blocking follows");
    }
  }

  if (obj.type === "breaker") {
    const mid = objectPickPoint(obj);
    for (const blk of findByType(project, "blocking")) {
      if (distToSeg(mid, blk.a, blk.b) <= pad * 2) add(blk, "blocking at this breaker");
    }
  }

  return out;
}

export function inspectSizeLine(obj: PlannerObject): string | null {
  const nominal = "nominalSize" in obj && obj.nominalSize ? obj.nominalSize : null;
  const actual =
    "actualWidthIn" in obj && obj.actualWidthIn != null
      ? `${obj.actualWidthIn}×${"actualDepthIn" in obj && obj.actualDepthIn != null ? obj.actualDepthIn : "—"} in actual`
      : null;
  if (nominal && actual) return `${nominal} · ${actual}`;
  if (nominal) return nominal;
  if (actual) return actual;
  return null;
}
