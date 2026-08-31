import type { PlannerObject, Point, Project, Tool } from "../model/types";
import { inchesPerUnit } from "../model/project";
import { formatInches } from "../units/length";
import { dist, midpoint } from "../geom/vec";
import { bbox, polygonClosed } from "../geom/polygon";
import {
  collectHandles,
  handleKey,
  type MeasureOverlay,
  type Selection,
} from "../edit/handles";
import { getOrientedBox } from "../edit/typedBox";
import { boxCorners } from "../geom/box";
import { objectPickPoint, selectionSizeLabel } from "../edit/hit";

export const SELECT_STROKE = "#2ee6ff";

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

/** Zoom the camera around a screen point (work-area local pixels). */
export function zoomView(view: View, sx: number, sy: number, factor: number): View {
  const scale = Math.min(12, Math.max(0.05, view.scale * factor));
  const applied = scale / view.scale;
  return {
    scale,
    panX: sx - (sx - view.panX) * applied,
    panY: sy - (sy - view.panY) * applied,
  };
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
  measure?: MeasureOverlay | null;
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

/** Pan so a world point is on-screen (keep current zoom). */
export function viewToShowPoint(view: View, p: Point, width: number, height: number): View {
  const s = screenFromWorld(p, view);
  const margin = 56;
  if (s.x >= margin && s.x <= width - margin && s.y >= margin && s.y <= height - margin) {
    return view;
  }
  return {
    ...view,
    panX: width / 2 - p.x * view.scale,
    panY: height / 2 - p.y * view.scale,
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
    drawObject(ctx, o, selected, iPerU, opts.showAllLabels || opts.exportMode, opts.exportMode, view.scale);
  }

  if (!opts.exportMode && opts.selectedIds.length) {
    for (const o of project.objects) {
      if (!opts.selectedIds.includes(o.id) || !layerOn(o, layers)) continue;
      drawSelectionChrome(ctx, o, iPerU, view.scale);
    }
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

  if (project.origin) {
    drawOriginCross(ctx, project.origin, view.scale);
  }

  if (opts.measure) {
    drawMeasure(ctx, opts.measure.a, opts.measure.b, iPerU, view.scale);
  }

  if (!opts.exportMode) {
    drawHandles(ctx, project, opts.draftPoints, opts.selectedIds, opts.selection ?? null, view.scale, opts.measure);
  }

  if (opts.draftPoints.length) {
    if (opts.tool === "box" && opts.draftPoints.length >= 2) {
      const a = opts.draftPoints[0];
      const b = opts.draftPoints[1];
      ctx.save();
      ctx.strokeStyle = "#8ec8ff";
      ctx.setLineDash([6 / view.scale, 4 / view.scale]);
      ctx.lineWidth = 2 / view.scale;
      ctx.strokeRect(
        Math.min(a.x, b.x),
        Math.min(a.y, b.y),
        Math.abs(b.x - a.x),
        Math.abs(b.y - a.y),
      );
      ctx.restore();
    } else {
      ctx.strokeStyle = "#8ec8ff";
      ctx.lineWidth = 2 / view.scale;
      ctx.beginPath();
      ctx.moveTo(opts.draftPoints[0].x, opts.draftPoints[0].y);
      for (const p of opts.draftPoints.slice(1)) ctx.lineTo(p.x, p.y);
      ctx.stroke();
    }
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
  if (o.type === "outline" || o.type === "houseWall" || o.type === "stairs" || o.type === "existingStairs") {
    return layers.photo || layers.framing;
  }
  return layers.framing;
}

function drawObject(
  ctx: CanvasRenderingContext2D,
  o: PlannerObject,
  selected: boolean,
  iPerU: number | null,
  labels: boolean,
  exportMode: boolean,
  viewScale = 1,
): void {
  const stroke = selected && !exportMode ? SELECT_STROKE : colorFor(o);
  ctx.strokeStyle = stroke;
  ctx.fillStyle = stroke;
  ctx.lineWidth = selected && !exportMode ? 5 / viewScale : exportMode ? 2 : 1.5;
  ctx.globalAlpha = o.type === "board" ? (selected ? 0.5 : 0.35) : 1;

  switch (o.type) {
    case "outline":
    case "nodigZone": {
      const pts = polygonClosed(o.points);
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (const p of pts.slice(1)) ctx.lineTo(p.x, p.y);
      ctx.closePath();
      ctx.globalAlpha = o.type === "nodigZone" ? (selected ? 0.4 : 0.25) : selected ? 0.18 : 0.08;
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
      if (o.type === "board") {
        const box = getOrientedBox(o);
        if (box) {
          ctx.save();
          ctx.translate(box.origin.x, box.origin.y);
          ctx.rotate((box.angleDeg * Math.PI) / 180);
          ctx.globalAlpha = selected ? 0.5 : 0.32;
          ctx.fillRect(-box.length / 2, -box.width / 2, box.length, box.width);
          ctx.globalAlpha = 1;
          ctx.strokeRect(-box.length / 2, -box.width / 2, box.length, box.width);
          ctx.restore();
          if (labels) {
            ctx.globalAlpha = 1;
            ctx.font = exportMode ? "11px system-ui" : "12px system-ui";
            ctx.fillStyle = exportMode ? "#1c1916" : "#f3ead8";
            ctx.fillText(o.label || "Board", box.origin.x + 6, box.origin.y - 6);
          }
          break;
        }
      }
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
      if (o.type === "post") {
        const worldHalf = ((o.actualWidthIn || 5.5) / 2) / (iPerU || 1);
        const half = Math.max(28, worldHalf);
        ctx.lineWidth = selected && !exportMode ? 6 / viewScale : exportMode ? 3 : 2.5;
        ctx.fillStyle = selected && !exportMode ? "#1b4d55" : stroke;
        ctx.fillRect(p.x - half, p.y - half, half * 2, half * 2);
        ctx.strokeStyle = selected && !exportMode ? SELECT_STROKE : stroke;
        ctx.strokeRect(p.x - half, p.y - half, half * 2, half * 2);
        ctx.font = exportMode ? "12px system-ui" : "14px system-ui";
        ctx.fillStyle = exportMode ? "#1c1916" : "#ffe08a";
        ctx.fillText(o.label, p.x + half + 4, p.y - 4);
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
        ctx.fill();
        if (labels) {
          ctx.font = exportMode ? "11px system-ui" : "12px system-ui";
          ctx.fillStyle = exportMode ? "#1c1916" : "#f3ead8";
          ctx.fillText(o.label, p.x + 8, p.y - 6);
        }
      }
      break;
    }
    case "stairs":
    case "existingStairs": {
      const box = getOrientedBox(o);
      if (!box) break;
      ctx.save();
      ctx.translate(box.origin.x, box.origin.y);
      ctx.rotate((box.angleDeg * Math.PI) / 180);
      ctx.globalAlpha = selected ? 0.45 : 0.28;
      ctx.fillRect(-box.length / 2, -box.width / 2, box.length, box.width);
      ctx.globalAlpha = 1;
      ctx.strokeRect(-box.length / 2, -box.width / 2, box.length, box.width);
      ctx.restore();
      if (labels) {
        ctx.fillStyle = exportMode ? "#1c1916" : "#f3ead8";
        ctx.fillText(o.label || "Stairs", box.origin.x + 6, box.origin.y - 6);
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
    case "existingStairs": {
      const box = getOrientedBox(o);
      return box ? boxCorners(box) : [o.origin];
    }
    default:
      return "a" in o && "b" in o ? [o.a, o.b] : [];
  }
}

export { hitTest } from "../edit/hit";

function drawOriginCross(ctx: CanvasRenderingContext2D, p: Point, viewScale: number): void {
  const arm = 14 / viewScale;
  ctx.save();
  ctx.strokeStyle = "#ff7ad9";
  ctx.lineWidth = 2.4 / viewScale;
  ctx.beginPath();
  ctx.moveTo(p.x - arm, p.y);
  ctx.lineTo(p.x + arm, p.y);
  ctx.moveTo(p.x, p.y - arm);
  ctx.lineTo(p.x, p.y + arm);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(p.x, p.y, 4 / viewScale, 0, Math.PI * 2);
  ctx.fillStyle = "#ff7ad9";
  ctx.fill();
  ctx.font = `${12 / viewScale}px system-ui`;
  ctx.fillText("origin", p.x + 8 / viewScale, p.y - 8 / viewScale);
  ctx.restore();
}

function drawMeasure(
  ctx: CanvasRenderingContext2D,
  a: Point,
  b: Point,
  iPerU: number | null,
  viewScale: number,
): void {
  ctx.save();
  ctx.strokeStyle = "#b8ff6a";
  ctx.lineWidth = 2.2 / viewScale;
  ctx.setLineDash([10 / viewScale, 5 / viewScale]);
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
  ctx.setLineDash([]);
  const tick = 8 / viewScale;
  for (const p of [a, b]) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 4 / viewScale, 0, Math.PI * 2);
    ctx.fillStyle = "#b8ff6a";
    ctx.fill();
  }
  const mid = midpoint(a, b);
  const label = iPerU ? formatInches(dist(a, b) * iPerU) : "set scale";
  ctx.fillStyle = "#b8ff6a";
  ctx.font = `${13 / viewScale}px system-ui`;
  ctx.fillText(label, mid.x + 8 / viewScale, mid.y - 8 / viewScale);
  void tick;
  ctx.restore();
}

function drawSelectionChrome(
  ctx: CanvasRenderingContext2D,
  o: PlannerObject,
  iPerU: number | null,
  viewScale: number,
): void {
  const pts = objectPoints(o);
  if (!pts.length) return;
  const pad = 10 / viewScale;
  const minX = Math.min(...pts.map((p) => p.x)) - pad;
  const maxX = Math.max(...pts.map((p) => p.x)) + pad;
  const minY = Math.min(...pts.map((p) => p.y)) - pad;
  const maxY = Math.max(...pts.map((p) => p.y)) + pad;
  ctx.save();
  ctx.strokeStyle = SELECT_STROKE;
  ctx.lineWidth = 2.5 / viewScale;
  ctx.setLineDash([]);
  ctx.strokeRect(minX, minY, maxX - minX, maxY - minY);
  const corner = 7 / viewScale;
  for (const [x, y] of [
    [minX, minY],
    [maxX, minY],
    [minX, maxY],
    [maxX, maxY],
  ] as const) {
    ctx.fillStyle = SELECT_STROKE;
    ctx.fillRect(x - corner / 2, y - corner / 2, corner, corner);
  }
  const pick = objectPickPoint(o);
  ctx.font = `${13 / viewScale}px system-ui`;
  ctx.fillStyle = SELECT_STROKE;
  ctx.fillText(selectionSizeLabel(o), pick.x + 8 / viewScale, pick.y - 10 / viewScale);
  void iPerU;
  ctx.restore();
}

function drawHandles(
  ctx: CanvasRenderingContext2D,
  project: Project,
  draftPoints: Point[],
  selectedIds: string[],
  selection: Selection | null,
  viewScale: number,
  measure?: MeasureOverlay | null,
): void {
  const handles = collectHandles(project, draftPoints, selectedIds, { measure });
  const inv = 1 / viewScale;
  for (const h of handles) {
    const selected = selection ? handleKey(h) === handleKey(selection) : false;
    const r = (selected ? 7 : 5) * inv;
    ctx.beginPath();
    ctx.arc(h.point.x, h.point.y, r, 0, Math.PI * 2);
    ctx.fillStyle = selected ? SELECT_STROKE : "#f3ead8";
    ctx.strokeStyle = selected ? "#102226" : "#3a342c";
    ctx.lineWidth = 1.5 * inv;
    ctx.fill();
    ctx.stroke();
    if (h.kind === "rotate") {
      ctx.beginPath();
      ctx.strokeStyle = selected ? "#ffe08a" : "#8ec8ff";
      ctx.lineWidth = 1.5 * inv;
      ctx.arc(h.point.x, h.point.y, r + 2 * inv, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (selected) {
      ctx.beginPath();
      ctx.arc(h.point.x, h.point.y, r + 3 * inv, 0, Math.PI * 2);
      ctx.strokeStyle = "#ffe08a";
      ctx.lineWidth = 2 * inv;
      ctx.stroke();
    }
  }
}
