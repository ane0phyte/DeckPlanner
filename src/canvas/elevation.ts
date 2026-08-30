import type { Project } from "../model/types";
import { findByType } from "../model/project";
import { formatInches } from "../units/length";

export function drawElevationToCanvas(
  ctx: CanvasRenderingContext2D,
  project: Project,
  w: number,
  h: number,
): void {
  const pad = 80;
  const { deckIn, gradeIn, doorSillIn, stairRiseIn } = project.settings.heights;
  ctx.fillStyle = "#1c1916";
  ctx.font = "700 28px Georgia, serif";
  ctx.fillText("Elevation — house / ledger side", 48, 48);
  ctx.font = "16px system-ui";
  ctx.fillStyle = "#5c5346";
  ctx.fillText("Heights are typed. Not read from the photo. Grade is one height; site treated as flat. No door object.", 48, 74);

  const values = [deckIn, gradeIn, doorSillIn, stairRiseIn].filter((n): n is number => n != null);
  const min = values.length ? Math.min(...values, 0) : 0;
  const max = values.length ? Math.max(...values, 36) : 96;
  const range = Math.max(12, max - min);
  const yAt = (inches: number) => pad + 80 + ((max - inches) / range) * (h - pad * 2 - 120);

  const groundY = gradeIn != null ? yAt(gradeIn) : h - pad - 40;
  ctx.strokeStyle = "#8a7a5c";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(pad, groundY);
  ctx.lineTo(w - pad, groundY);
  ctx.stroke();
  label(ctx, pad, groundY - 8, `Grade ${formatInches(gradeIn)}`);

  ctx.fillStyle = "#d9cbb0";
  ctx.fillRect(pad, pad + 60, 70, groundY - (pad + 60));
  ctx.fillStyle = "#3d3428";
  ctx.font = "14px system-ui";
  ctx.fillText("House", pad + 8, pad + 88);

  const ledger = findByType(project, "ledger")[0];
  const deckY = deckIn != null ? yAt(deckIn) : groundY - 80;
  ctx.fillStyle = "#c4a574";
  ctx.fillRect(pad + 70, deckY - 8, w - pad * 2 - 80, 16);
  label(ctx, pad + 90, deckY - 14, `Deck ${formatInches(deckIn)}  ${ledger ? "ledger" : ""}`);

  if (doorSillIn != null) {
    const sy = yAt(doorSillIn);
    ctx.strokeStyle = "#2a4d6e";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(pad + 70, sy);
    ctx.lineTo(pad + 160, sy);
    ctx.stroke();
    label(ctx, pad + 170, sy, `Door sill ${formatInches(doorSillIn)}`);
  }

  const stairs = [...findByType(project, "stairs"), ...findByType(project, "existingStairs")][0];
  if (stairs && stairRiseIn != null && deckIn != null && gradeIn != null) {
    const rise = stairRiseIn;
    ctx.strokeStyle = "#5a4030";
    ctx.lineWidth = 2;
    let x = w - pad - 220;
    let y = deckY;
    ctx.beginPath();
    ctx.moveTo(x, y);
    const n = Math.max(1, Math.round((deckIn - gradeIn) / rise));
    for (let i = 0; i < n; i++) {
      y += (groundY - deckY) / n;
      ctx.lineTo(x, y);
      x += 18;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
    label(ctx, w - pad - 220, deckY - 10, `Stairs rise ${formatInches(rise)} (typed)`);
  }

  ctx.fillStyle = "#7a5340";
  ctx.font = "14px system-ui";
  ctx.fillText("Existing floating deck in the overhead photo is backdrop only — not an elevation object.", 48, h - 28);
}

function label(ctx: CanvasRenderingContext2D, x: number, y: number, text: string): void {
  ctx.fillStyle = "#1c1916";
  ctx.font = "14px system-ui";
  ctx.fillText(text, x, y);
}
