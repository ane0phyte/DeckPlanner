import { useEffect, useRef, useState } from "react";
import { useStore } from "../state/store";
import {
  drawPlanToCanvas,
  getCachedPhoto,
  hitTest,
  preloadPhoto,
  worldFromScreen,
  type View,
} from "./render";
import type { Point } from "../model/types";
import { add, sub } from "../geom/vec";
import { parseLengthToInches } from "../units/length";

export function PlanView() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const {
    project,
    tool,
    selectedIds,
    draftPoints,
    select,
    addDraftPoint,
    finishDraft,
    applySnap,
    preview,
    beginTransient,
    endTransient,
    setScale,
  } = useStore();
  const [view, setView] = useState<View>({ panX: 40, panY: 40, scale: 0.6 });
  const [scalePrompt, setScalePrompt] = useState<Point[] | null>(null);
  const drag = useRef<{
    mode: "pan" | "move";
    last: Point;
    id?: string;
    orig?: Point;
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
      draftPoints: [...draftPoints, ...(scalePrompt ?? [])],
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

  function onPointerDown(e: React.PointerEvent) {
    const p = localPoint(e);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    if (e.button === 1 || tool === "pan" || e.shiftKey) {
      drag.current = { mode: "pan", last: { x: e.clientX, y: e.clientY } };
      return;
    }
    if (tool === "scale") {
      const pts = scalePrompt ?? [];
      const next = [...pts, applySnap(p)];
      if (next.length < 2) {
        setScalePrompt(next);
      } else {
        const raw = window.prompt("Known length (feet-inches, e.g. 12-0 or 10' 6\")", "12-0");
        const inches = raw ? parseLengthToInches(raw) : null;
        if (inches && inches > 0) setScale(next[0], next[1], inches);
        setScalePrompt(null);
      }
      return;
    }
    if (tool !== "select") {
      addDraftPoint(p);
      return;
    }
    const hit = hitTest(project, p, view.scale);
    if (hit) {
      select([hit.id]);
      const orig =
        "origin" in hit ? { ...hit.origin } : "a" in hit ? { ...hit.a } : p;
      drag.current = { mode: "move", last: p, id: hit.id, orig };
      beginTransient();
    } else {
      select([]);
    }
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
    if (drag.current.mode === "move" && drag.current.id) {
      const p = applySnap(localPoint(e));
      const delta = sub(p, drag.current.last);
      drag.current.last = p;
      const id = drag.current.id;
      preview((pr) => ({
        ...pr,
        objects: pr.objects.map((o) => {
          if (o.id !== id) return o;
          if ("origin" in o) return { ...o, origin: add(o.origin, delta) };
          if ("a" in o && "b" in o) return { ...o, a: add(o.a, delta), b: add(o.b, delta) };
          if ("points" in o) return { ...o, points: o.points.map((q) => add(q, delta)) };
          return o;
        }),
      }));
    }
  }

  function onPointerUp() {
    if (drag.current?.mode === "move") endTransient();
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

  return (
    <div className="plan-wrap" ref={wrapRef}>
      <canvas
        ref={canvasRef}
        className="plan-canvas"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onWheel={onWheel}
        onDoubleClick={onDoubleClick}
      />
    </div>
  );
}
