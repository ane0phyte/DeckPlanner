export type Id = string;

export type Point = { x: number; y: number };

export type LayerId = "photo" | "framing" | "nodig" | "labels" | "railings";

export type Tool =
  | "select"
  | "pan"
  | "scale"
  | "outline"
  | "ledger"
  | "houseWall"
  | "existingStairs"
  | "stairs"
  | "post"
  | "beam"
  | "joist"
  | "board"
  | "breaker"
  | "blocking"
  | "rim"
  | "guard"
  | "nodigZone"
  | "nodigPoint";

export type ObjectType =
  | "outline"
  | "ledger"
  | "houseWall"
  | "existingStairs"
  | "stairs"
  | "post"
  | "beam"
  | "joist"
  | "board"
  | "breaker"
  | "blocking"
  | "rim"
  | "guard"
  | "lateralDevice"
  | "flashing"
  | "nodigZone"
  | "nodigPoint";

export type ObjectSource = "user" | "fill" | "convert";

export type Treatment = "ground-contact" | "above-ground";

export type BreakerSupport = "doubled-joists" | "blocking";

export type DeckingCategory = "wood-1.25" | "wood-2" | "composite-other";

export type FastenerKind =
  | "lag-1/2-sheathing-1/2"
  | "bolt-1/2-sheathing-1/2"
  | "bolt-1/2-sheathing-1";

export type BandRimType =
  | "2in-solid-sawn-spf-or-better"
  | "1in-engineered-rim-prr410-d7672"
  | "other-do-not-use-oc-table";

export type LedgerSubstrate = "wood-band" | "stone-masonry-veneer" | "other";

export type LateralScheme = "2x1500" | "4x750";

export type FlagSeverity = "info" | "warn" | "violation";

export interface IrcFlag {
  id: string;
  severity: FlagSeverity;
  section: string;
  message: string;
  objectIds: Id[];
}

export interface MemberCommon {
  id: Id;
  type: ObjectType;
  source: ObjectSource;
  label: string;
  speciesLabel: string;
  speciesTable: "southern-pine-no-2";
  material: string;
  treatment: Treatment;
  notes: string;
}

export interface OutlineObject extends MemberCommon {
  type: "outline";
  points: Point[];
}

export interface LedgerObject extends MemberCommon {
  type: "ledger";
  a: Point;
  b: Point;
  nominalSize: string;
  actualWidthIn: number;
  actualDepthIn: number;
  bandRimType: BandRimType;
  substrate: LedgerSubstrate;
  flashingProduct: string;
  fastenerKind: FastenerKind;
  fastenerProduct: string;
}

export interface HouseWallObject extends MemberCommon {
  type: "houseWall";
  a: Point;
  b: Point;
}

export interface StairsObject extends MemberCommon {
  type: "existingStairs" | "stairs";
  origin: Point;
  angleDeg: number;
  widthIn: number | null;
  riseIn: number | null;
  lengthIn: number;
}

export interface PostObject extends MemberCommon {
  type: "post";
  origin: Point;
  nominalSize: string;
  actualWidthIn: number;
  actualDepthIn: number;
  beamId: Id | null;
  tAlongBeam: number | null;
  flaggedNoDig: boolean;
}

export interface BeamObject extends MemberCommon {
  type: "beam";
  a: Point;
  b: Point;
  plyCount: number;
  nominalSize: string;
  actualWidthIn: number;
  actualDepthIn: number;
  drop: true;
  sizeVerified: boolean;
  diagonal: boolean;
}

export interface JoistObject extends MemberCommon {
  type: "joist";
  a: Point;
  b: Point;
  nominalSize: string;
  actualWidthIn: number;
  actualDepthIn: number;
  doubled: boolean;
}

export interface BoardObject extends MemberCommon {
  type: "board";
  a: Point;
  b: Point;
  actualWidthIn: number;
  actualThicknessIn: number;
}

export interface BreakerObject extends MemberCommon {
  type: "breaker";
  a: Point;
  b: Point;
  support: BreakerSupport;
  actualWidthIn: number;
}

export interface BlockingObject extends MemberCommon {
  type: "blocking";
  a: Point;
  b: Point;
  nominalSize: string;
  actualWidthIn: number;
  actualDepthIn: number;
}

export interface RimObject extends MemberCommon {
  type: "rim";
  a: Point;
  b: Point;
  nominalSize: string;
  actualWidthIn: number;
  actualDepthIn: number;
}

export interface GuardObject extends MemberCommon {
  type: "guard";
  a: Point;
  b: Point;
  heightIn: number;
}

export interface LateralDeviceObject extends MemberCommon {
  type: "lateralDevice";
  origin: Point;
  productName: string;
  capacityLbAsd: number;
}

export interface FlashingObject extends MemberCommon {
  type: "flashing";
  a: Point;
  b: Point;
  productName: string;
  verticalAboveIn: number;
  beyondFaceIn: number;
  downFaceIn: number;
}

export interface NoDigZoneObject extends MemberCommon {
  type: "nodigZone";
  points: Point[];
}

export interface NoDigPointObject extends MemberCommon {
  type: "nodigPoint";
  origin: Point;
  bufferRadiusIn: number;
}

export type PlannerObject =
  | OutlineObject
  | LedgerObject
  | HouseWallObject
  | StairsObject
  | PostObject
  | BeamObject
  | JoistObject
  | BoardObject
  | BreakerObject
  | BlockingObject
  | RimObject
  | GuardObject
  | LateralDeviceObject
  | FlashingObject
  | NoDigZoneObject
  | NoDigPointObject;

export interface ScaleMark {
  a: Point;
  b: Point;
  knownLengthIn: number;
}

export interface Heights {
  deckIn: number | null;
  gradeIn: number | null;
  doorSillIn: number | null;
  stairRiseIn: number | null;
}

export interface DeckingSpec {
  productName: string;
  category: DeckingCategory;
  gapIn: number | null;
  maxJoistSpacingIn: number | null;
  boardWidthIn: number;
  thicknessIn: number;
  install: "single-span" | "multiple-span";
}

export interface Accessories {
  hangerProduct: string;
  flashingCoverageSqFtPerRoll: number | null;
  guardLinearFtPerBox: number | null;
  accessoryNotes: string;
}

export interface ProjectSettings {
  name: string;
  jurisdiction: string;
  code: "2024 IRC";
  defaultSpeciesLabel: string;
  snapOn: boolean;
  snapIncrementIn: number;
  joistAngleDeg: number;
  deckingAngleDeg: number;
  beamFillAngleDeg: number | null;
  ledgerToDropBeamClearanceIn: number;
  lateralScheme: LateralScheme;
  lateralProduct: string;
  flashingProduct: string;
  heights: Heights;
  decking: DeckingSpec;
  accessories: Accessories;
  layers: Record<LayerId, boolean>;
}

export interface Project {
  version: 1;
  settings: ProjectSettings;
  photo: {
    dataUrl: string;
    widthPx: number;
    heightPx: number;
  } | null;
  scale: ScaleMark | null;
  objects: PlannerObject[];
  flags: IrcFlag[];
}

export interface HistoryState {
  past: Project[];
  present: Project;
  future: Project[];
}

export const LAYER_LABELS: Record<LayerId, string> = {
  photo: "Photo",
  framing: "Framing",
  nodig: "No-dig",
  labels: "Labels",
  railings: "Railings",
};

export const DEFAULT_SPECIES_LABEL = "Southern Yellow Pine No. 2 Prime";

export function newId(): Id {
  return crypto.randomUUID();
}
