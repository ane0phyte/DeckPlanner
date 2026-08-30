import { jsPDF } from "jspdf";
import type { Project } from "../model/types";
import { inchesPerUnit } from "../model/project";
import { buildCutList } from "./cutlist";
import { formatInches } from "../units/length";
import { drawPlanToCanvas } from "../canvas/render";
import { drawElevationToCanvas } from "../canvas/elevation";

export async function exportPlanPng(project: Project): Promise<void> {
  const canvas = renderExportCanvas(project, 2200, 1700);
  downloadDataUrl(canvas.toDataURL("image/png"), slug(project.settings.name) + "-plan.png");
}

export async function exportCutListPng(project: Project): Promise<void> {
  const canvas = document.createElement("canvas");
  canvas.width = 1700;
  canvas.height = 2200;
  const ctx = canvas.getContext("2d")!;
  paintCutList(ctx, project, canvas.width, canvas.height);
  downloadDataUrl(canvas.toDataURL("image/png"), slug(project.settings.name) + "-cutlist.png");
}

export async function exportElevationPng(project: Project): Promise<void> {
  const canvas = document.createElement("canvas");
  canvas.width = 2200;
  canvas.height = 1400;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#f7f4ee";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  drawElevationToCanvas(ctx, project, canvas.width, canvas.height);
  downloadDataUrl(canvas.toDataURL("image/png"), slug(project.settings.name) + "-elevation.png");
}

export async function exportLetterPdf(project: Project): Promise<void> {
  const pdf = new jsPDF({ orientation: "landscape", unit: "in", format: "letter" });
  const plan = renderExportCanvas(project, 2200, 1600);
  pdf.addImage(plan.toDataURL("image/jpeg", 0.92), "JPEG", 0.4, 0.35, 10.2, 7.4);
  pdf.setFontSize(9);
  pdf.text(
    `${project.settings.name}  ·  ${project.settings.jurisdiction}  ·  ${project.settings.code}  ·  40 psf live (R301.5)`,
    0.4,
    8.15,
  );

  pdf.addPage("letter", "portrait");
  const cut = document.createElement("canvas");
  cut.width = 1700;
  cut.height = 2200;
  paintCutList(cut.getContext("2d")!, project, cut.width, cut.height);
  pdf.addImage(cut.toDataURL("image/jpeg", 0.92), "JPEG", 0.4, 0.4, 7.7, 10);

  pdf.addPage("letter", "landscape");
  const elev = document.createElement("canvas");
  elev.width = 2200;
  elev.height = 1400;
  const ectx = elev.getContext("2d")!;
  ectx.fillStyle = "#f7f4ee";
  ectx.fillRect(0, 0, elev.width, elev.height);
  drawElevationToCanvas(ectx, project, elev.width, elev.height);
  pdf.addImage(elev.toDataURL("image/jpeg", 0.92), "JPEG", 0.4, 0.4, 10.2, 6.5);
  pdf.setFontSize(9);
  pdf.text("Simple elevation from typed heights, house/ledger side. Grade is one height (site treated as flat).", 0.4, 8.15);

  pdf.save(slug(project.settings.name) + "-deck-planner.pdf");
}

function renderExportCanvas(project: Project, w: number, h: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  drawPlanToCanvas(ctx, project, {
    width: w,
    height: h,
    selectedIds: [],
    draftPoints: [],
    tool: "select",
    showAllLabels: true,
    exportMode: true,
  });
  return canvas;
}

function paintCutList(ctx: CanvasRenderingContext2D, project: Project, w: number, h: number): void {
  ctx.fillStyle = "#fffdf8";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#1c1916";
  ctx.font = "700 36px Georgia, serif";
  ctx.fillText("Cut list — Deck Planner v1", 48, 64);
  ctx.font = "22px system-ui, sans-serif";
  ctx.fillStyle = "#5c5346";
  ctx.fillText(
    `${project.settings.name}  ·  ${project.settings.jurisdiction}  ·  ${project.settings.code}`,
    48,
    100,
  );
  const list = buildCutList(project);
  let y = 150;
  ctx.font = "700 24px system-ui";
  ctx.fillStyle = "#1c1916";
  ctx.fillText("Lumber (net lengths)", 48, y);
  y += 36;
  ctx.font = "18px ui-monospace, monospace";
  for (const row of list.lumber) {
    ctx.fillText(
      `${row.qty}×  ${row.member}  ${row.nominal}  ${row.eachLength}  (${row.netLinearFt.toFixed(1)} lf)  ${row.notes}`,
      48,
      y,
    );
    y += 26;
    if (y > h - 80) break;
  }
  y += 20;
  ctx.font = "700 24px system-ui";
  ctx.fillText("Hangers / fasteners (1:1 — type product names)", 48, y);
  y += 36;
  ctx.font = "18px ui-monospace, monospace";
  for (const row of list.counts) {
    ctx.fillText(`${row.qty}×  ${row.item}  ${row.product}  ${row.notes}`, 48, y);
    y += 26;
  }
  y += 20;
  ctx.font = "700 24px system-ui";
  ctx.fillText("Area / linear accessories (user coverage only)", 48, y);
  y += 36;
  ctx.font = "18px ui-monospace, monospace";
  for (const row of list.accessories) {
    ctx.fillText(
      `${row.item}  ${row.product}  layout ${row.layoutAmount}  coverage ${row.coverage}  → ${row.rollsOrBoxes}`,
      48,
      y,
    );
    y += 26;
  }
  y += 30;
  ctx.fillStyle = "#7a5340";
  ctx.font = "18px system-ui";
  ctx.fillText(list.wasteNote, 48, y);
  const iPerU = inchesPerUnit(project);
  if (iPerU) {
    ctx.fillText(`Scale ${formatInches(iPerU)} per plan unit.`, 48, y + 28);
  }
}

function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "deck";
}

function downloadDataUrl(url: string, filename: string): void {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
}

export { saveProjectFile, readProjectFile } from "./projectFile";
