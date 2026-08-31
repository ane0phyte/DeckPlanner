import {
  DEFAULT_SPECIES_LABEL,
  type PlannerObject,
  type Project,
  type ProjectSettings,
} from "./types";

export function defaultSettings(): ProjectSettings {
  return {
    name: "Untitled deck",
    jurisdiction: "Sevierville / Sevier County, TN",
    code: "2024 IRC",
    defaultSpeciesLabel: DEFAULT_SPECIES_LABEL,
    snapOn: false,
    snapIncrementIn: 6,
    orthoSnap: true,
    joistAngleDeg: 90,
    deckingAngleDeg: 0,
    beamFillAngleDeg: null,
    ledgerToDropBeamClearanceIn: 0,
    lateralScheme: "2x1500",
    lateralProduct: "",
    flashingProduct: "",
    heights: {
      deckIn: null,
      gradeIn: null,
      doorSillIn: null,
      stairRiseIn: null,
    },
    decking: {
      productName: "",
      category: "wood-1.25",
      gapIn: null,
      maxJoistSpacingIn: null,
      boardWidthIn: 5.5,
      thicknessIn: 1.25,
      install: "single-span",
    },
    accessories: {
      hangerProduct: "",
      flashingCoverageSqFtPerRoll: null,
      guardLinearFtPerBox: null,
      accessoryNotes: "",
    },
    layers: {
      photo: true,
      framing: true,
      nodig: true,
      labels: true,
      railings: true,
    },
    wastePercent: null,
  };
}

export function emptyProject(): Project {
  return {
    version: 1,
    settings: defaultSettings(),
    photo: null,
    scale: null,
    origin: null,
    objects: [],
    flags: [],
  };
}

export function cloneProject(p: Project): Project {
  return structuredClone(p);
}

export function inchesPerUnit(project: Project): number | null {
  if (!project.scale) return null;
  const dx = project.scale.b.x - project.scale.a.x;
  const dy = project.scale.b.y - project.scale.a.y;
  const pix = Math.hypot(dx, dy);
  if (pix < 1e-6) return null;
  return project.scale.knownLengthIn / pix;
}

export function findByType<T extends PlannerObject["type"]>(
  project: Project,
  type: T,
): Extract<PlannerObject, { type: T }>[] {
  return project.objects.filter((o): o is Extract<PlannerObject, { type: T }> => o.type === type);
}

export function projectAreaSqIn(project: Project, iPerU: number): number {
  const outline = project.objects.find((o) => o.type === "outline");
  if (!outline || outline.type !== "outline" || outline.points.length < 3) return 0;
  let a = 0;
  const pts = outline.points;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    a += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
  }
  return (Math.abs(a) / 2) * iPerU * iPerU;
}
