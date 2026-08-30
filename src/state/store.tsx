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

const MAX_HISTORY = 80;

type DrawTool = Exclude<Tool, "select" | "pan" | "scale">;

function isDrawTool(t: Tool): t is DrawTool {
  return t !== "select" && t !== "pan" && t !== "scale";
}

interface Store {
  project: Project;
  tool: Tool;
  selectedIds: Id[];
  draftPoints: Point[];
  setTool: (t: Tool) => void;
  select: (ids: Id[]) => void;
  commit: (next: Project) => void;
  mutate: (fn: (p: Project) => Project) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  applySnap: (p: Point) => Point;
  addDraftPoint: (p: Point) => void;
  finishDraft: () => void;
  cancelDraft: () => void;
  deleteSelected: () => void;
  runFill: () => string | null;
  loadPhoto: (dataUrl: string, widthPx: number, heightPx: number) => void;
  setScale: (a: Point, b: Point, knownLengthIn: number) => void;
  newProject: () => void;
  openProject: (p: Project) => void;
  updateObject: (id: Id, patch: Partial<PlannerObject>) => void;
  convertSelectedWall: () => void;
  beginTransient: () => void;
  preview: (fn: (p: Project) => Project) => void;
  endTransient: () => void;
}

const StoreContext = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [project, setProject] = useState<Project>(() => {
    const p = emptyProject();
    p.flags = evaluateProject(p);
    return p;
  });
  const [tool, setTool] = useState<Tool>("select");
  const [selectedIds, setSelectedIds] = useState<Id[]>([]);
  const [draftPoints, setDraftPoints] = useState<Point[]>([]);
  const past = useRef<Project[]>([]);
  const future = useRef<Project[]>([]);
  const transientFrom = useRef<Project | null>(null);

  const commit = useCallback((next: Project) => {
    past.current = [...past.current, cloneProject(project)].slice(-MAX_HISTORY);
    future.current = [];
    const flagged = { ...next, flags: evaluateProject(next) };
    setProject(flagged);
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
  }, [project]);

  const redo = useCallback(() => {
    const nxt = future.current.pop();
    if (!nxt) return;
    past.current.push(cloneProject(project));
    setProject(nxt);
  }, [project]);

  const applySnap = useCallback(
    (p: Point) => {
      const iPerU = inchesPerUnit(project) ?? 1;
      if (!project.settings.snapOn) return p;
      return snapPoint(p, project.settings.snapIncrementIn, iPerU);
    },
    [project],
  );

  const addDraftPoint = useCallback(
    (p: Point) => {
      const snapped = applySnap(p);
      const polygonTools = new Set<Tool>(["outline", "nodigZone"]);
      const pointTools = new Set<Tool>(["post", "nodigPoint"]);
      if (pointTools.has(tool) && isDrawTool(tool)) {
        const obj = createUserObject(tool, [snapped]);
        if (obj) mutate((pr) => ({ ...pr, objects: [...pr.objects, obj] }));
        setDraftPoints([]);
        return;
      }
      setDraftPoints((pts) => [...pts, snapped]);
      if (!polygonTools.has(tool) && draftPoints.length >= 1 && isDrawTool(tool)) {
        const obj = createUserObject(tool, [...draftPoints, snapped]);
        if (obj) mutate((pr) => ({ ...pr, objects: [...pr.objects, obj] }));
        setDraftPoints([]);
      }
    },
    [applySnap, draftPoints, mutate, tool],
  );

  const finishDraft = useCallback(() => {
    const polygonTools = new Set<Tool>(["outline", "nodigZone"]);
    if (!polygonTools.has(tool) || draftPoints.length < 3) {
      setDraftPoints([]);
      return;
    }
    if (!isDrawTool(tool)) {
      setDraftPoints([]);
      return;
    }
    const obj = createUserObject(tool, draftPoints);
    if (obj) mutate((pr) => ({ ...pr, objects: [...pr.objects, obj] }));
    setDraftPoints([]);
  }, [draftPoints, mutate, tool]);

  const cancelDraft = useCallback(() => setDraftPoints([]), []);

  const deleteSelected = useCallback(() => {
    if (!selectedIds.length) return;
    mutate((pr) => ({ ...pr, objects: pr.objects.filter((o) => !selectedIds.includes(o.id)) }));
    setSelectedIds([]);
  }, [mutate, selectedIds]);

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
    },
    [mutate],
  );

  const newProject = useCallback(() => {
    past.current = [];
    future.current = [];
    setProject(emptyProject());
    setSelectedIds([]);
    setDraftPoints([]);
    setTool("select");
  }, []);

  const openProject = useCallback((p: Project) => {
    past.current = [];
    future.current = [];
    setProject({ ...p, flags: evaluateProject(p) });
    setSelectedIds([]);
    setDraftPoints([]);
  }, []);

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
    }
    setProject((cur) => ({ ...cur, flags: evaluateProject(cur) }));
  }, []);

  const value = useMemo<Store>(
    () => ({
      project,
      tool,
      selectedIds,
      draftPoints,
      setTool: (t) => {
        setTool(t);
        setDraftPoints([]);
      },
      select: setSelectedIds,
      commit,
      mutate,
      undo,
      redo,
      canUndo: past.current.length > 0,
      canRedo: future.current.length > 0,
      applySnap,
      addDraftPoint,
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
    }),
    [
      addDraftPoint,
      applySnap,
      cancelDraft,
      commit,
      convertSelectedWall,
      beginTransient,
      deleteSelected,
      endTransient,
      draftPoints,
      finishDraft,
      loadPhoto,
      mutate,
      newProject,
      openProject,
      preview,
      project,
      redo,
      runFill,
      selectedIds,
      setScale,
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
