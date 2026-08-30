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
import { snapPoint } from "../geom/vec";
import {
  deleteSelection,
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

type DrawTool = Exclude<Tool, "select" | "pan" | "scale">;

function isDrawTool(t: Tool): t is DrawTool {
  return t !== "select" && t !== "pan" && t !== "scale";
}

const POINT_PLACE_TOOLS = new Set<Tool>(["post", "nodigPoint", "stairs", "existingStairs"]);
const POLYGON_TOOLS = new Set<Tool>(["outline", "nodigZone"]);

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
  newProject: () => void;
  openProject: (p: Project, file?: { fileName?: string; handle?: FileSystemFileHandle | null }) => void;
  updateObject: (id: Id, patch: Partial<PlannerObject>) => void;
  convertSelectedWall: () => void;
  beginTransient: () => void;
  preview: (fn: (p: Project) => Project) => void;
  endTransient: () => void;
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
    if (s.kind === "draft" || s.kind === "scale") {
      setSelectedIds([]);
      return;
    }
    setSelectedIds([s.objectId]);
  }, []);

  const select = useCallback((ids: Id[]) => {
    setSelectedIds(ids);
    setSelection(ids[0] ? { kind: "object", objectId: ids[0] } : null);
  }, []);
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
      const obj = createUserObject(kind, pts);
      if (!obj) return;
      if (obj.type === "ledger") {
        obj.label = "Ledger";
        if (!obj.flashingProduct) obj.flashingProduct = project.settings.flashingProduct;
      }
      if (obj.type === "stairs") obj.label = "Stairs (reused)";
      if (obj.type === "existingStairs") obj.label = "Existing stairs";
      if ((obj.type === "stairs" || obj.type === "existingStairs") && project.settings.heights.stairRiseIn != null) {
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
      const snapped = applySnap(p);
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
    [applySnap, commitDrawnObject, draftPoints, selectHandle, tool],
  );

  const completeLine = useCallback(
    (end: Point, start?: Point) => {
      const a = start ?? draftPoints[0];
      if (!isDrawTool(tool) || !a) return;
      const b = applySnap(end);
      if (Math.hypot(b.x - a.x, b.y - a.y) < 2) return;
      commitDrawnObject(tool, [a, b]);
    },
    [applySnap, commitDrawnObject, draftPoints, tool],
  );

  const finishDraft = useCallback(() => {
    if (!POLYGON_TOOLS.has(tool) || draftPoints.length < 3) {
      setDraftPoints([]);
      return;
    }
    if (!isDrawTool(tool)) {
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

  const newProject = useCallback(() => {
    past.current = [];
    future.current = [];
    setProject(emptyProject());
    setSelectedIds([]);
    setSelection(null);
    setDraftPoints([]);
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
    setToolState("select");
    rememberOpenedFile(file?.fileName ?? null, file?.handle ?? null);
  }, [rememberOpenedFile]);

  const saveProject = useCallback(async () => {
    const suggested = projectFileName(project, fileName);
    const result = await saveProjectToKnownFile(project, fileHandleRef.current, suggested);
    if (result.cancelled) return;
    fileHandleRef.current = result.handle;
    setFileName(result.fileName);
    setDirty(false);
  }, [fileName, project]);

  const saveProjectAs = useCallback(async () => {
    const suggested = projectFileName(project, fileName);
    const result = await writeProjectAs(project, suggested);
    if (result.cancelled) return;
    fileHandleRef.current = result.handle;
    setFileName(result.fileName);
    setDirty(false);
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
      draftPoints,
      finishDraft,
      loadPhoto,
      mutate,
      newProject,
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
