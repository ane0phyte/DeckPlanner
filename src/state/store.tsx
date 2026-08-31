import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Id, PlannerObject, Point, Project, Tool } from "../model/types";
import { cloneProject, emptyProject, inchesPerUnit } from "../model/project";
import { evaluateProject } from "../irc/checks";
import { convertHouseWallToLedger, createUserObject, fillProject } from "../fill/fill";
import { createBoxObject } from "../edit/typedBox";
import { translateObject } from "../edit/handles";
import { objectPickPoint } from "../edit/hit";
import { maybeSnapSecondPoint, shouldOrthoDraw } from "../edit/ortho";
import { snapPoint } from "../geom/vec";
import {
  deleteSelection,
  type MeasureOverlay,
  type Selection,
} from "../edit/handles";
import {
  parseProjectText,
  pickAndReadProject,
  projectFileName,
  saveProjectAs as writeProjectAs,
  saveProjectToKnownFile,
} from "../export/projectFile";

const MAX_HISTORY = 80;

type DrawTool = Exclude<Tool, "select" | "pan" | "scale" | "measure" | "origin">;

function isDrawTool(t: Tool): t is DrawTool {
  return t !== "select" && t !== "pan" && t !== "scale" && t !== "measure" && t !== "origin";
}

const POINT_PLACE_TOOLS = new Set<Tool>(["post", "nodigPoint"]);
const POLYGON_TOOLS = new Set<Tool>(["outline", "nodigZone"]);
const BOX_TOOLS = new Set<Tool>(["box"]);

interface Store {
  project: Project;
  tool: Tool;
  selectedIds: Id[];
  selection: Selection | null;
  draftPoints: Point[];
  setTool: (t: Tool) => void;
  select: (ids: Id[]) => void;
  selectHandle: (s: Selection | null) => void;
  commit: (next: Project) => void;
  mutate: (fn: (p: Project) => Project) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  applySnap: (p: Point) => Point;
  addDraftPoint: (p: Point) => void;
  completeLine: (end: Point, start?: Point) => void;
  finishDraft: () => void;
  cancelDraft: () => void;
  deleteSelected: () => void;
  runFill: () => string | null;
  loadPhoto: (dataUrl: string, widthPx: number, heightPx: number) => void;
  setScale: (a: Point, b: Point, knownLengthIn: number) => void;
  measure: MeasureOverlay | null;
  setMeasure: (m: MeasureOverlay | null) => void;
  finishMeasure: (a: Point, b: Point) => void;
  setOrigin: (p: Point) => void;
  cursorWorld: Point | null;
  setCursorWorld: (p: Point | null) => void;
  frameNonce: number;
  selectAndFrame: (ids: Id[]) => void;
  newProject: () => void;
  openProject: (p: Project, file?: { fileName?: string; handle?: FileSystemFileHandle | null }) => void;
  updateObject: (id: Id, patch: Partial<PlannerObject>) => void;
  convertSelectedWall: () => void;
  beginTransient: () => void;
  preview: (fn: (p: Project) => Project) => void;
  endTransient: () => void;
  nudgeSelected: (dx: number, dy: number) => void;
  setDraftPoint: (index: number, p: Point) => void;
  fileName: string | null;
  dirty: boolean;
  saveProject: () => Promise<void>;
  saveProjectAs: () => Promise<void>;
  openFromDisk: () => Promise<boolean>;
  openProjectFile: (file: File) => Promise<void>;
}

const StoreContext = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [project, setProject] = useState<Project>(() => {
    const p = emptyProject();
    p.flags = evaluateProject(p);
    return p;
  });
  const [tool, setToolState] = useState<Tool>("select");
  const [selectedIds, setSelectedIds] = useState<Id[]>([]);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [draftPoints, setDraftPoints] = useState<Point[]>([]);
  const [measure, setMeasure] = useState<MeasureOverlay | null>(null);
  const [cursorWorld, setCursorWorld] = useState<Point | null>(null);
  const [frameNonce, setFrameNonce] = useState(0);
  const [fileName, setFileName] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const fileHandleRef = useRef<FileSystemFileHandle | null>(null);

  const setTool = useCallback((t: Tool) => {
    setToolState(t);
    setDraftPoints([]);
  }, []);

  const rememberOpenedFile = useCallback((name: string | null, handle?: FileSystemFileHandle | null) => {
    setFileName(name);
    fileHandleRef.current = handle ?? null;
    setDirty(false);
  }, []);

  const selectHandle = useCallback((s: Selection | null) => {
    setSelection(s);
    if (!s) {
      setSelectedIds([]);
      return;
    }
    if (s.kind === "draft" || s.kind === "scale" || s.kind === "datum" || s.kind === "measure") {
      setSelectedIds([]);
      return;
    }
    setSelectedIds([s.objectId]);
  }, []);

  const select = useCallback((ids: Id[]) => {
    setSelectedIds(ids);
    setSelection(ids[0] ? { kind: "object", objectId: ids[0] } : null);
  }, []);

  const selectAndFrame = useCallback((ids: Id[]) => {
    select(ids);
    setFrameNonce((n) => n + 1);
  }, [select]);
  const past = useRef<Project[]>([]);
  const future = useRef<Project[]>([]);
  const transientFrom = useRef<Project | null>(null);

  const commit = useCallback((next: Project) => {
    past.current = [...past.current, cloneProject(project)].slice(-MAX_HISTORY);
    future.current = [];
    const flagged = { ...next, flags: evaluateProject(next) };
    setProject(flagged);
    setDirty(true);
  }, [project]);

  const mutate = useCallback(
    (fn: (p: Project) => Project) => {
      commit(fn(cloneProject(project)));
    },
    [commit, project],
  );

  const undo = useCallback(() => {
    const prev = past.current.pop();
    if (!prev) return;
    future.current.push(cloneProject(project));
    setProject(prev);
    setDirty(true);
  }, [project]);

  const redo = useCallback(() => {
    const nxt = future.current.pop();
    if (!nxt) return;
    past.current.push(cloneProject(project));
    setProject(nxt);
    setDirty(true);
  }, [project]);

  const applySnap = useCallback(
    (p: Point) => {
      const iPerU = inchesPerUnit(project) ?? 1;
      if (!project.settings.snapOn) return p;
      return snapPoint(p, project.settings.snapIncrementIn, iPerU);
    },
    [project],
  );

  const commitDrawnObject = useCallback(
    (kind: DrawTool, pts: Point[]) => {
      const obj = BOX_TOOLS.has(kind)
        ? pts[0] && pts[1]
          ? createBoxObject("stairs", pts[0], pts[1])
          : null
        : createUserObject(kind as PlannerObject["type"], pts);
      if (!obj) return;
      if (obj.type === "ledger") {
        obj.label = "Ledger";
        if (!obj.flashingProduct) obj.flashingProduct = project.settings.flashingProduct;
      }
      if (obj.type === "stairs" && project.settings.heights.stairRiseIn != null) {
        obj.riseIn = project.settings.heights.stairRiseIn;
      }
      mutate((pr) => ({ ...pr, objects: [...pr.objects, obj] }));
      select([obj.id]);
      setDraftPoints([]);
      if (!POLYGON_TOOLS.has(kind)) setToolState("select");
    },
    [mutate, project.settings.flashingProduct, project.settings.heights.stairRiseIn, select],
  );

  const addDraftPoint = useCallback(
    (p: Point) => {
      let snapped = applySnap(p);
      if (draftPoints.length === 1 && shouldOrthoDraw(tool)) {
        snapped = maybeSnapSecondPoint(draftPoints[0], snapped, tool, project);
      }
      if (POINT_PLACE_TOOLS.has(tool) && isDrawTool(tool)) {
        commitDrawnObject(tool, [snapped]);
        return;
      }
      const nextDraft = [...draftPoints, snapped];
      setDraftPoints(nextDraft);
      selectHandle({ kind: "draft", index: nextDraft.length - 1, point: snapped });
      if (!POLYGON_TOOLS.has(tool) && draftPoints.length >= 1 && isDrawTool(tool)) {
        commitDrawnObject(tool, nextDraft);
      }
    },
    [applySnap, commitDrawnObject, draftPoints, project, selectHandle, tool],
  );

  const completeLine = useCallback(
    (end: Point, start?: Point) => {
      const a = start ?? draftPoints[0];
      if (!isDrawTool(tool) || !a) return;
      const b = maybeSnapSecondPoint(a, applySnap(end), tool, project);
      if (Math.hypot(b.x - a.x, b.y - a.y) < 2) return;
      commitDrawnObject(tool, [a, b]);
    },
    [applySnap, commitDrawnObject, draftPoints, project, tool],
  );

  const finishDraft = useCallback(() => {
    if ((tool !== "outline" && tool !== "nodigZone") || draftPoints.length < 3) {
      setDraftPoints([]);
      return;
    }
    const obj = createUserObject(tool, draftPoints);
    if (obj) {
      mutate((pr) => ({ ...pr, objects: [...pr.objects, obj] }));
      select([obj.id]);
    }
    setDraftPoints([]);
    setToolState("select");
  }, [draftPoints, mutate, select, tool]);

  const cancelDraft = useCallback(() => setDraftPoints([]), []);

  const deleteSelected = useCallback(() => {
    if (selection?.kind === "measure") {
      setMeasure(null);
      selectHandle(null);
      return;
    }
    if (selection) {
      const result = deleteSelection(project, selection, draftPoints);
      if (result.draftPoints) setDraftPoints(result.draftPoints);
      if (selection.kind !== "draft") mutate(() => result.project);
      if (result.clearedSelection) selectHandle(null);
      return;
    }
    if (!selectedIds.length) return;
    mutate((pr) => ({ ...pr, objects: pr.objects.filter((o) => !selectedIds.includes(o.id)) }));
    selectHandle(null);
  }, [draftPoints, mutate, project, selectHandle, selectedIds, selection]);

  const runFill = useCallback(() => {
    const result = fillProject(project);
    if (result.error) return result.error;
    commit(result.project);
    return null;
  }, [commit, project]);

  const loadPhoto = useCallback(
    (dataUrl: string, widthPx: number, heightPx: number) => {
      mutate((pr) => ({ ...pr, photo: { dataUrl, widthPx, heightPx } }));
    },
    [mutate],
  );

  const setScale = useCallback(
    (a: Point, b: Point, knownLengthIn: number) => {
      mutate((pr) => ({ ...pr, scale: { a, b, knownLengthIn } }));
      setDraftPoints([]);
      selectHandle({ kind: "scale", end: "b", point: b });
      setToolState("select");
    },
    [mutate, selectHandle],
  );

  const setOrigin = useCallback(
    (p: Point) => {
      mutate((pr) => ({ ...pr, origin: p }));
      setDraftPoints([]);
      selectHandle({ kind: "datum", point: p });
      setToolState("select");
    },
    [mutate, selectHandle],
  );

  const finishMeasure = useCallback(
    (a: Point, b: Point) => {
      setMeasure({ a, b });
      setDraftPoints([]);
      selectHandle({ kind: "measure", end: "b", point: b });
      setToolState("select");
    },
    [selectHandle],
  );

  const newProject = useCallback(() => {
    past.current = [];
    future.current = [];
    setProject(emptyProject());
    setSelectedIds([]);
    setSelection(null);
    setDraftPoints([]);
    setMeasure(null);
    setCursorWorld(null);
    setToolState("select");
    rememberOpenedFile(null, null);
  }, [rememberOpenedFile]);

  const openProject = useCallback((p: Project, file?: { fileName?: string; handle?: FileSystemFileHandle | null }) => {
    past.current = [];
    future.current = [];
    setProject({ ...p, flags: evaluateProject(p) });
    setSelectedIds([]);
    setSelection(null);
    setDraftPoints([]);
    setMeasure(null);
    setCursorWorld(null);
    setToolState("select");
    rememberOpenedFile(file?.fileName ?? null, file?.handle ?? null);
  }, [rememberOpenedFile]);

  const saveProject = useCallback(async () => {
    try {
      const suggested = projectFileName(project, fileName);
      const result = await saveProjectToKnownFile(project, fileHandleRef.current, suggested);
      if (result.cancelled) return;
      fileHandleRef.current = result.handle;
      setFileName(result.fileName);
      setDirty(false);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Save failed.");
    }
  }, [fileName, project]);

  const saveProjectAs = useCallback(async () => {
    try {
      const suggested = projectFileName(project, fileName);
      const result = await writeProjectAs(project, suggested);
      if (result.cancelled) return;
      fileHandleRef.current = result.handle;
      setFileName(result.fileName);
      setDirty(false);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Save As failed.");
    }
  }, [fileName, project]);

  const openFromDisk = useCallback(async () => {
    const result = await pickAndReadProject();
    if (!result) return false;
    openProject(result.project, { fileName: result.fileName, handle: result.handle });
    return true;
  }, [openProject]);

  const openProjectFile = useCallback(
    async (file: File) => {
      const p = await parseProjectText(await file.text());
      openProject(p, { fileName: file.name, handle: null });
    },
    [openProject],
  );

  const updateObject = useCallback(
    (id: Id, patch: Partial<PlannerObject>) => {
      mutate((pr) => ({
        ...pr,
        objects: pr.objects.map((o) => (o.id === id ? ({ ...o, ...patch } as PlannerObject) : o)),
      }));
    },
    [mutate],
  );

  const convertSelectedWall = useCallback(() => {
    const id = selectedIds[0];
    if (!id) return;
    mutate((pr) => convertHouseWallToLedger(id, pr));
  }, [mutate, selectedIds]);

  const setDraftPoint = useCallback((index: number, p: Point) => {
    setDraftPoints((pts) => {
      if (index < pts.length) return pts.map((q, i) => (i === index ? p : q));
      const next = pts.slice();
      next[index] = p;
      return next;
    });
  }, []);

  const beginTransient = useCallback(() => {
    transientFrom.current = cloneProject(project);
  }, [project]);

  const preview = useCallback((fn: (p: Project) => Project) => {
    setProject((cur) => fn(cloneProject(cur)));
  }, []);

  const selectedIdsRef = useRef(selectedIds);
  selectedIdsRef.current = selectedIds;
  const objectsRef = useRef(project.objects);
  objectsRef.current = project.objects;

  const nudgeSelected = useCallback(
    (dx: number, dy: number) => {
      const ids = selectedIdsRef.current;
      if (!ids.length || (dx === 0 && dy === 0)) return;
      const apply = (pr: Project): Project => {
        let next = pr;
        for (const id of ids) next = translateObject(next, id, { x: dx, y: dy });
        return next;
      };
      if (transientFrom.current) preview(apply);
      else mutate(apply);
      const moved = objectsRef.current.find((o) => ids.includes(o.id));
      if (moved) {
        const pt = objectPickPoint(moved);
        setCursorWorld({ x: pt.x + dx, y: pt.y + dy });
      }
    },
    [mutate, preview],
  );

  const endTransient = useCallback(() => {
    if (transientFrom.current) {
      past.current = [...past.current, transientFrom.current].slice(-MAX_HISTORY);
      future.current = [];
      transientFrom.current = null;
      setDirty(true);
    }
    setProject((cur) => ({ ...cur, flags: evaluateProject(cur) }));
  }, []);

  const value = useMemo<Store>(
    () => ({
      project,
      tool,
      selectedIds,
      selection,
      draftPoints,
      measure,
      setMeasure,
      finishMeasure,
      setOrigin,
      cursorWorld,
      setCursorWorld,
      frameNonce,
      selectAndFrame,
      setTool,
      select,
      selectHandle,
      commit,
      mutate,
      undo,
      redo,
      canUndo: past.current.length > 0,
      canRedo: future.current.length > 0,
      applySnap,
      addDraftPoint,
      completeLine,
      finishDraft,
      cancelDraft,
      deleteSelected,
      runFill,
      loadPhoto,
      setScale,
      newProject,
      openProject,
      updateObject,
      convertSelectedWall,
      beginTransient,
      preview,
      endTransient,
      nudgeSelected,
      setDraftPoint,
      fileName,
      dirty,
      saveProject,
      saveProjectAs,
      openFromDisk,
      openProjectFile,
    }),
    [
      addDraftPoint,
      applySnap,
      cancelDraft,
      commit,
      completeLine,
      convertSelectedWall,
      beginTransient,
      deleteSelected,
      dirty,
      endTransient,
      fileName,
      finishMeasure,
      frameNonce,
      measure,
      cursorWorld,
      selectAndFrame,
      setOrigin,
      draftPoints,
      finishDraft,
      loadPhoto,
      mutate,
      newProject,
      nudgeSelected,
      openFromDisk,
      openProject,
      openProjectFile,
      preview,
      project,
      redo,
      runFill,
      saveProject,
      saveProjectAs,
      select,
      selectHandle,
      selectedIds,
      selection,
      setDraftPoint,
      setScale,
      setTool,
      tool,
      undo,
      updateObject,
    ],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const s = useContext(StoreContext);
  if (!s) throw new Error("useStore outside provider");
  return s;
}
