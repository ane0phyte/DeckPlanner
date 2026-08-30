import { useEffect, useRef, useState } from "react";
import { useStore } from "../state/store";
import {
  drawPlanToCanvas,
  getCachedPhoto,
  preloadPhoto,
  worldFromScreen,
  type View,
} from "./render";
import type { Point } from "../model/types";
import { dist, sub } from "../geom/vec";
import { parseLengthToInches } from "../units/length";
import {
  collectHandles,
  hitHandle,
  moveHandle,
  translateObject,
  type Handle,
} from "../edit/handles";
import { hitTestAll, objectDisplayName, objectTypeLabel, type HitCandidate } from "../edit/hit";

export function PlanView() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const {
    project,
    tool,
    selectedIds,
    selection,
    draftPoints,
    select,
    selectHandle,
    addDraftPoint,
    completeLine,
    finishDraft,
    applySnap,
    preview,
    beginTransient,
    endTransient,
    setScale,
    setDraftPoint,
  } = useStore();
  const [view, setView] = useState<View>({ panX: 40, panY: 40, scale: 0.6 });
  const [picker, setPicker] = useState<{
    hits: HitCandidate[];
    x: number;
    y: number;
  } | null>(null);
  const drag = useRef<{
    mode: "pan" | "move-object" | "move-handle" | "draw-line";
    last: Point;
    start?: Point;
    id?: string;
    handle?: Handle;
    moved: boolean;
  } | null>(null);

  useEffect(() => {
    if (project.photo && !getCachedPhoto(project.photo.dataUrl)) {
      void preloadPhoto(project.photo.dataUrl).then(() => redraw());
    }
  }, [project.photo]);

  function redraw() {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const dpr = window.devicePixelRatio || 1;
    const w = wrap.clientWidth;
    const h = wrap.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawPlanToCanvas(ctx, project, {
      width: w,
      height: h,
      selectedIds,
      selection,
      draftPoints,
      tool,
      showAllLabels: project.settings.layers.labels,
      exportMode: false,
      view,
    });
  }

  useEffect(() => {
    redraw();
    const onResize = () => redraw();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  });

  function localPoint(e: React.PointerEvent): Point {
    const r = canvasRef.current!.getBoundingClientRect();
    return worldFromScreen(e.clientX - r.left, e.clientY - r.top, view);
  }

  function pickerPos(e: React.PointerEvent): { x: number; y: number } {
    const r = wrapRef.current!.getBoundingClientRect();
    return {
      x: Math.min(Math.max(8, e.clientX - r.left), r.width - 200),
      y: Math.min(Math.max(8, e.clientY - r.top), r.height - 80),
    };
  }

  function handlesAt(p: Point): Handle | null {
    const radius = Math.max(10 / view.scale, 8);
    return hitHandle(collectHandles(project, draftPoints, selectedIds), p, radius);
  }

  function onPointerDown(e: React.PointerEvent) {
    const p = localPoint(e);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    if (e.button === 1 || tool === "pan" || e.shiftKey) {
      setPicker(null);
      drag.current = { mode: "pan", last: { x: e.clientX, y: e.clientY }, moved: false };
      return;
    }

    const handle = handlesAt(p);
    const drawing = tool !== "select" && tool !== "scale";
    if (handle && (!drawing || handle.kind === "draft")) {
      setPicker(null);
      selectHandle(handle);
      drag.current = { mode: "move-handle", last: p, handle, moved: false };
      return;
    }

    if (tool === "scale") {
      setPicker(null);
      const snapped = applySnap(p);
      if (draftPoints.length === 0) {
        addDraftPoint(snapped);
      } else {
        const raw = window.prompt("Known length (feet-inches, e.g. 12-0 or 10' 6\")", "12-0");
        const inches = raw ? parseLengthToInches(raw) : null;
        if (inches && inches > 0) setScale(draftPoints[0], snapped, inches);
      }
      return;
    }

    if (tool === "ledger" || tool === "houseWall" || tool === "beam" || tool === "joist" || tool === "board" || tool === "guard" || tool === "rim" || tool === "breaker" || tool === "blocking") {
      setPicker(null);
      if (draftPoints.length === 0) {
        addDraftPoint(p);
        drag.current = { mode: "draw-line", last: applySnap(p), start: applySnap(p), moved: false };
      } else {
        addDraftPoint(p);
      }
      return;
    }

    if (tool !== "select") {
      setPicker(null);
      addDraftPoint(p);
      return;
    }

    const hits = hitTestAll(project, p, view.scale);
    if (hits.length === 0) {
      setPicker(null);
      select([]);
      return;
    }
    if (hits.length === 1) {
      setPicker(null);
      select([hits[0].object.id]);
      drag.current = { mode: "move-object", last: p, id: hits[0].object.id, moved: false };
      return;
    }
    select([hits[0].object.id]);
    setPicker({ hits, ...pickerPos(e) });
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!drag.current) return;
    if (drag.current.mode === "pan") {
      const dx = e.clientX - drag.current.last.x;
      const dy = e.clientY - drag.current.last.y;
      drag.current.last = { x: e.clientX, y: e.clientY };
      setView((v) => ({ ...v, panX: v.panX + dx, panY: v.panY + dy }));
      return;
    }
    const p = applySnap(localPoint(e));
    const delta = sub(p, drag.current.last);
    if (dist(p, drag.current.last) < 1e-9) return;
    if (!drag.current.moved) {
      drag.current.moved = true;
      if (
        drag.current.mode === "move-object" ||
        (drag.current.mode === "move-handle" && drag.current.handle?.kind !== "draft")
      ) {
        beginTransient();
      }
    }
    drag.current.last = p;

    if (drag.current.mode === "move-handle" && drag.current.handle) {
      const h = drag.current.handle;
      if (h.kind === "draft") {
        setDraftPoint(h.index, p);
        selectHandle({ ...h, point: p });
        return;
      }
      preview((pr) => moveHandle(pr, h, p));
      selectHandle({ ...h, point: p });
      return;
    }

    if (drag.current.mode === "draw-line") {
      setDraftPoint(1, p);
      return;
    }

    if (drag.current.mode === "move-object" && drag.current.id) {
      const id = drag.current.id;
      preview((pr) => translateObject(pr, id, delta));
    }
  }

  function onPointerUp() {
    if (drag.current?.mode === "draw-line") {
      if (drag.current.moved) completeLine(drag.current.last, drag.current.start);
      drag.current = null;
      return;
    }
    if (drag.current?.mode === "move-object" || drag.current?.mode === "move-handle") {
      if (drag.current.moved && drag.current.handle?.kind !== "draft") {
        endTransient();
      }
    }
    drag.current = null;
  }

  function onWheel(e: React.WheelEvent) {
    e.preventDefault();
    const r = canvasRef.current!.getBoundingClientRect();
    const sx = e.clientX - r.left;
    const sy = e.clientY - r.top;
    const factor = e.deltaY < 0 ? 1.08 : 0.92;
    setView((v) => {
      const nx = sx - (sx - v.panX) * factor;
      const ny = sy - (sy - v.panY) * factor;
      return { scale: Math.min(12, Math.max(0.05, v.scale * factor)), panX: nx, panY: ny };
    });
  }

  function onDoubleClick() {
    if (tool === "outline" || tool === "nodigZone") finishDraft();
  }

  function pickObject(id: string) {
    select([id]);
    setPicker(null);
  }

  return (
    <div className="plan-wrap" ref={wrapRef}>
      <canvas
        ref={canvasRef}
        className={`plan-canvas${tool === "select" ? " select-tool" : ""}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onWheel={onWheel}
        onDoubleClick={onDoubleClick}
      />
      {picker && (
        <div className="hit-picker" style={{ left: picker.x, top: picker.y }}>
          <h3>Which object?</h3>
          <p className="hint">Smallest is listed first. Click the one you meant.</p>
          {picker.hits.map((h, i) => (
            <button
              key={h.object.id}
              type="button"
              className={i === 0 ? "preferred" : ""}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => pickObject(h.object.id)}
            >
              <strong>{objectDisplayName(h.object)}</strong>
              <span>{objectTypeLabel(h.object.type)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
