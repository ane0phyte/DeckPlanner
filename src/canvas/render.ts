import type { PlannerObject, Point, Project, Tool } from "../model/types";
import { inchesPerUnit } from "../model/project";
import { formatInches } from "../units/length";
import { dist, midpoint } from "../geom/vec";
import { bbox, polygonClosed } from "../geom/polygon";
import {
  collectHandles,
  handleKey,
  type Selection,
} from "../edit/handles";

export interface View {
  panX: number;
  panY: number;
  scale: number;
}

export const defaultView = (): View => ({ panX: 40, panY: 40, scale: 1 });

export function worldFromScreen(sx: number, sy: number, view: View): Point {
  return { x: (sx - view.panX) / view.scale, y: (sy - view.panY) / view.scale };
}

export function screenFromWorld(p: Point, view: View): Point {
  return { x: p.x * view.scale + view.panX, y: p.y * view.scale + view.panY };
}

export interface DrawOpts {
  width: number;
  height: number;
  selectedIds: string[];
  selection?: Selection | null;
  draftPoints: Point[];
  tool: Tool;
  showAllLabels: boolean;
  exportMode: boolean;
  view?: View;
}

export function fitView(project: Project, width: number, height: number): View {
  const pts: Point[] = [];
  if (project.photo) {
    pts.push({ x: 0, y: 0 }, { x: project.photo.widthPx, y: project.photo.heightPx });
  }
  for (const o of project.objects) pts.push(...objectPoints(o));
  if (pts.length === 0) return defaultView();
  const b = bbox(pts);
  const w = Math.max(40, b.max.x - b.min.x);
  const h = Math.max(40, b.max.y - b.min.y);
  const s = Math.min((width - 80) / w, (height - 80) / h);
  return {
    scale: s,
    panX: (width - w * s) / 2 - b.min.x * s,
    panY: (height - h * s) / 2 - b.min.y * s,
  };
}

export function drawPlanToCanvas(
  ctx: CanvasRenderingContext2D,
  project: Project,
  opts: DrawOpts,
): void {
  const view = opts.view ?? (opts.exportMode ? fitView(project, opts.width, opts.height) : defaultView());
  ctx.save();
  ctx.fillStyle = opts.exportMode ? "#f4efe6" : "#1a1814";
  ctx.fillRect(0, 0, opts.width, opts.height);

  ctx.save();
  ctx.translate(view.panX, view.panY);
  ctx.scale(view.scale, view.scale);

  if (project.settings.layers.photo && project.photo) {
    const img = imageCache.get(project.photo.dataUrl);
    if (img) {
      ctx.globalAlpha = opts.exportMode ? 0.35 : 0.55;
      ctx.drawImage(img, 0, 0, project.photo.widthPx, project.photo.heightPx);
      ctx.globalAlpha = 1;
    } else if (opts.exportMode) {
      // sync draw without cache: skip; caller should preload
    }
  }

  const layers = project.settings.layers;
  const iPerU = inchesPerUnit(project);

  for (const o of project.objects) {
    if (!layerOn(o, layers)) continue;
    const selected = opts.selectedIds.includes(o.id);
    drawObject(ctx, o, selected, iPerU, opts.showAllLabels || opts.exportMode, opts.exportMode);
  }

  if (project.scale) {
    ctx.strokeStyle = "#e8c36a";
    ctx.lineWidth = 2 / view.scale;
    ctx.setLineDash([8 / view.scale, 6 / view.scale]);
    ctx.beginPath();
    ctx.moveTo(project.scale.a.x, project.scale.a.y);
    ctx.lineTo(project.scale.b.x, project.scale.b.y);
    ctx.stroke();
    ctx.setLineDash([]);
    const mid = midpoint(project.scale.a, project.scale.b);
    ctx.fillStyle = "#e8c36a";
    ctx.font = `${12 / view.scale}px system-ui`;
    ctx.fillText(`scale ${formatInches(project.scale.knownLengthIn)}`, mid.x + 6, mid.y - 6);
  }

  if (!opts.exportMode) {
    drawHandles(ctx, project, opts.draftPoints, opts.selectedIds, opts.selection ?? null, view.scale);
  }

  if (opts.draftPoints.length) {
    ctx.strokeStyle = "#8ec8ff";
    ctx.lineWidth = 2 / view.scale;
    ctx.beginPath();
    ctx.moveTo(opts.draftPoints[0].x, opts.draftPoints[0].y);
    for (const p of opts.draftPoints.slice(1)) ctx.lineTo(p.x, p.y);
    ctx.stroke();
    for (const p of opts.draftPoints) {
      ctx.fillStyle = "#8ec8ff";
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4 / view.scale, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.restore();

  if (opts.exportMode) {
    ctx.fillStyle = "#1c1916";
    ctx.font = "20px Georgia, serif";
    ctx.fillText(`${project.settings.name}  —  dimensioned plan  —  ${project.settings.code}`, 24, 28);
    ctx.font = "14px system-ui";
    ctx.fillStyle = "#5c5346";
    ctx.fillText(
      `${project.settings.jurisdiction}  ·  Photo is backdrop; existing floating deck is not an object.  ·  Live 40 psf R301.5`,
      24,
      50,
    );
    if (iPerU) {
      const barIn = 96;
      const barPx = (barIn / iPerU) * view.scale;
      ctx.strokeStyle = "#1c1916";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(24, opts.height - 28);
      ctx.lineTo(24 + barPx, opts.height - 28);
      ctx.stroke();
      ctx.fillText(`8'-0"`, 24, opts.height - 36);
    }
  }
  ctx.restore();
}

const imageCache = new Map<string, HTMLImageElement>();

export function preloadPhoto(dataUrl: string): Promise<HTMLImageElement> {
  const hit = imageCache.get(dataUrl);
  if (hit) return Promise.resolve(hit);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      imageCache.set(dataUrl, img);
      resolve(img);
    };
    img.onerror = reject;
    img.src = dataUrl;
  });
}

export function getCachedPhoto(dataUrl: string): HTMLImageElement | undefined {
  return imageCache.get(dataUrl);
}

function layerOn(o: PlannerObject, layers: Project["settings"]["layers"]): boolean {
  if (o.type === "nodigZone" || o.type === "nodigPoint") return layers.nodig;
  if (o.type === "guard") return layers.railings;
  if (o.type === "outline" || o.type === "houseWall" || o.type === "existingStairs") return layers.photo || layers.framing;
  return layers.framing;
}

function drawObject(
  ctx: CanvasRenderingContext2D,
  o: PlannerObject,
  selected: boolean,
  iPerU: number | null,
  labels: boolean,
  exportMode: boolean,
): void {
  const stroke = selected ? "#ffe08a" : colorFor(o);
  ctx.strokeStyle = stroke;
  ctx.fillStyle = stroke;
  ctx.lineWidth = exportMode ? 2 : 1.5;
  ctx.globalAlpha = o.type === "board" ? 0.35 : 1;

  switch (o.type) {
    case "outline":
    case "nodigZone": {
      const pts = polygonClosed(o.points);
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (const p of pts.slice(1)) ctx.lineTo(p.x, p.y);
      ctx.closePath();
      ctx.globalAlpha = o.type === "nodigZone" ? 0.25 : 0.08;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.stroke();
      break;
    }
    case "ledger":
    case "houseWall":
    case "beam":
    case "joist":
    case "board":
    case "breaker":
    case "blocking":
    case "rim":
    case "guard":
    case "flashing": {
      ctx.beginPath();
      ctx.moveTo(o.a.x, o.a.y);
      ctx.lineTo(o.b.x, o.b.y);
      if (o.type === "beam") ctx.lineWidth = exportMode ? 5 : 4;
      if (o.type === "ledger") ctx.lineWidth = exportMode ? 4 : 3;
      if (o.type === "guard") ctx.setLineDash([10, 6]);
      ctx.stroke();
      ctx.setLineDash([]);
      if (labels) {
        const m = midpoint(o.a, o.b);
        const len = iPerU ? formatInches(dist(o.a, o.b) * iPerU) : "";
        ctx.globalAlpha = 1;
        ctx.font = exportMode ? "11px system-ui" : "12px system-ui";
        ctx.fillStyle = exportMode ? "#1c1916" : "#f3ead8";
        ctx.fillText(`${o.label} ${len}`.trim(), m.x + 4, m.y - 4);
      }
      break;
    }
    case "post":
    case "nodigPoint":
    case "lateralDevice": {
      const p = o.type === "post" || o.type === "nodigPoint" || o.type === "lateralDevice" ? o.origin : { x: 0, y: 0 };
      ctx.beginPath();
      const r = o.type === "nodigPoint" ? o.bufferRadiusIn / (iPerU ?? 1) : 5;
      if (o.type === "nodigPoint") {
        ctx.globalAlpha = 0.2;
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      ctx.beginPath();
      ctx.arc(p.x, p.y, o.type === "post" ? 6 : 4, 0, Math.PI * 2);
      ctx.fill();
      if (labels) {
        ctx.font = exportMode ? "11px system-ui" : "12px system-ui";
        ctx.fillStyle = exportMode ? "#1c1916" : "#f3ead8";
        ctx.fillText(o.label, p.x + 8, p.y - 6);
      }
      break;
    }
    case "stairs":
    case "existingStairs": {
      ctx.save();
      ctx.translate(o.origin.x, o.origin.y);
      ctx.rotate((o.angleDeg * Math.PI) / 180);
      const u = iPerU ?? 1;
      const w = (o.widthIn ?? 36) / u;
      const len = o.lengthIn / u;
      ctx.globalAlpha = 0.25;
      ctx.fillRect(0, -w / 2, len, w);
      ctx.globalAlpha = 1;
      ctx.strokeRect(0, -w / 2, len, w);
      ctx.restore();
      if (labels) {
        ctx.fillStyle = exportMode ? "#1c1916" : "#f3ead8";
        ctx.fillText(o.type === "existingStairs" ? "Existing stairs" : "Stairs (reused)", o.origin.x + 6, o.origin.y - 6);
      }
      break;
    }
  }
  ctx.globalAlpha = 1;
}

function colorFor(o: PlannerObject): string {
  switch (o.type) {
    case "outline":
      return "#7dcea0";
    case "ledger":
      return "#e07a3d";
    case "houseWall":
      return "#c9b8a0";
    case "beam":
      return "#d4a017";
    case "joist":
      return "#8ec8ff";
    case "board":
      return "#c4a574";
    case "post":
      return "#f0c27a";
    case "rim":
    case "blocking":
      return "#9ad0c7";
    case "breaker":
      return "#d988b0";
    case "guard":
      return "#b8d4ff";
    case "nodigZone":
    case "nodigPoint":
      return "#e06c75";
    case "lateralDevice":
      return "#c084fc";
    case "flashing":
      return "#94a3b8";
    case "stairs":
    case "existingStairs":
      return "#f0b27a";
    default:
      return "#ddd";
  }
}

export function objectPoints(o: PlannerObject): Point[] {
  switch (o.type) {
    case "outline":
    case "nodigZone":
      return o.points;
    case "post":
    case "nodigPoint":
    case "lateralDevice":
      return [o.origin];
    case "stairs":
    case "existingStairs":
      return [o.origin];
    default:
      return "a" in o && "b" in o ? [o.a, o.b] : [];
  }
}

export function hitTest(project: Project, p: Point, viewScale: number): PlannerObject | null {
  const tol = 8 / viewScale;
  let best: PlannerObject | null = null;
  let bestD = tol;
  for (const o of [...project.objects].reverse()) {
    const d = hitDist(o, p);
    if (d < bestD) {
      bestD = d;
      best = o;
    }
  }
  return best;
}

function drawHandles(
  ctx: CanvasRenderingContext2D,
  project: Project,
  draftPoints: Point[],
  selectedIds: string[],
  selection: Selection | null,
  viewScale: number,
): void {
  const handles = collectHandles(project, draftPoints, selectedIds);
  const inv = 1 / viewScale;
  for (const h of handles) {
    const selected = selection ? handleKey(h) === handleKey(selection) : false;
    const r = (selected ? 7 : 5) * inv;
    ctx.beginPath();
    ctx.arc(h.point.x, h.point.y, r, 0, Math.PI * 2);
    ctx.fillStyle = selected ? "#ffe08a" : "#f3ead8";
    ctx.strokeStyle = selected ? "#1c1916" : "#3a342c";
    ctx.lineWidth = 1.5 * inv;
    ctx.fill();
    ctx.stroke();
    if (selected) {
      ctx.beginPath();
      ctx.arc(h.point.x, h.point.y, r + 3 * inv, 0, Math.PI * 2);
      ctx.strokeStyle = "#ffe08a";
      ctx.lineWidth = 2 * inv;
      ctx.stroke();
    }
  }
}

function hitDist(o: PlannerObject, p: Point): number {
  switch (o.type) {
    case "outline":
    case "nodigZone": {
      let best = 999;
      const pts = polygonClosed(o.points);
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i];
        const b = pts[(i + 1) % pts.length];
        const abx = b.x - a.x;
        const aby = b.y - a.y;
        const l2 = abx * abx + aby * aby;
        const t = l2 < 1e-9 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby) / l2));
        best = Math.min(best, dist(p, { x: a.x + abx * t, y: a.y + aby * t }));
      }
      return best;
    }
    case "post":
    case "nodigPoint":
    case "lateralDevice":
      return dist(p, o.origin);
    case "stairs":
    case "existingStairs":
      return dist(p, o.origin);
    default:
      if ("a" in o && "b" in o) {
        const abx = o.b.x - o.a.x;
        const aby = o.b.y - o.a.y;
        const l2 = abx * abx + aby * aby;
        const t = l2 < 1e-9 ? 0 : Math.max(0, Math.min(1, ((p.x - o.a.x) * abx + (p.y - o.a.y) * aby) / l2));
        return dist(p, { x: o.a.x + abx * t, y: o.a.y + aby * t });
      }
      return 999;
  }
}
