import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ExecutionNode } from '../../types';
import { buildFlameLayout, clampStartNs, flameColor, type FlameRect } from '../utils/flameLayout';

interface TimelineProps {
  root: ExecutionNode | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** Current theme; triggers a redraw with the active CSS palette. */
  theme?: string;
}

const ROW_H = 18;
const RULER_H = 24;
const MINIMAP_H = 28;
// Approx rendered hover-tooltip size, used to keep it inside the container.
const TIP_W = 260;
const TIP_H = 76;

/** Resolve a CSS custom property against the active theme. */
function token(name: string, fallback: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

interface Tip {
  left: number;
  top: number;
  rect: FlameRect;
}

/** Choose a "nice" tick interval (ns) for a target pixel spacing. */
function niceInterval(nsPerPx: number, targetPx: number): number {
  const raw = nsPerPx * targetPx;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  for (const m of [1, 2, 5, 10]) {
    if (pow * m >= raw) return pow * m;
  }
  return pow * 10;
}

function fmtNs(ns: number): string {
  const ms = ns / 1_000_000;
  if (ms >= 1000) return (ms / 1000).toFixed(2) + ' s';
  if (ms >= 1) return ms.toFixed(1) + ' ms';
  return (ns / 1000).toFixed(0) + ' µs';
}

export const Timeline = ({ root, selectedId, onSelect, theme }: TimelineProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const minimapCanvasRef = useRef<HTMLCanvasElement>(null);
  const [tip, setTip] = useState<Tip | null>(null);

  const layout = useMemo(() => buildFlameLayout(root), [root]);

  // Rects bucketed by depth for fast hit-testing.
  const rectsByDepth = useMemo(() => {
    const m = new Map<number, FlameRect[]>();
    for (const r of layout.rects) {
      const arr = m.get(r.depth);
      if (arr) arr.push(r);
      else m.set(r.depth, [r]);
    }
    return m;
  }, [layout]);

  // Mutable viewport (avoids re-render on every pan/zoom frame).
  const view = useRef({ startNs: layout.t0, nsPerPx: 1 });
  const size = useRef({ w: 0, h: 0 });
  const hoverId = useRef<string | null>(null);
  const rafRef = useRef(0);

  const fit = useCallback(() => {
    const span = Math.max(1, layout.t1 - layout.t0);
    const w = size.current.w || 1;
    view.current.startNs = layout.t0;
    view.current.nsPerPx = span / w;
  }, [layout]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const { w, h } = size.current;
    const { startNs, nsPerPx } = view.current;
    const dpr = window.devicePixelRatio || 1;

    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr;
      canvas.height = h * dpr;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = token('--background', '#09090b');
    ctx.fillRect(0, 0, w, h);

    // Ruler
    ctx.fillStyle = token('--card', '#18181b');
    ctx.fillRect(0, 0, w, RULER_H);
    const interval = niceInterval(nsPerPx, 90);
    const firstTick = Math.ceil(startNs / interval) * interval;
    ctx.fillStyle = token('--muted-foreground', '#71717a');
    ctx.strokeStyle = token('--border', '#27272a');
    ctx.font = '10px ui-monospace, monospace';
    ctx.lineWidth = 1;
    for (let t = firstTick; ; t += interval) {
      const x = (t - startNs) / nsPerPx;
      if (x > w) break;
      if (x < 0) continue;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
      ctx.fillText(fmtNs(t - layout.t0), x + 3, 14);
    }

    // Rects
    ctx.textBaseline = 'middle';
    for (const r of layout.rects) {
      const x = (r.start - startNs) / nsPerPx;
      const wRect = Math.max(1, (r.end - r.start) / nsPerPx);
      if (x > w || x + wRect < 0) continue;
      const y = RULER_H + r.depth * ROW_H;
      if (y > h) continue;

      const isSel = r.id === selectedId;
      const isHover = r.id === hoverId.current;
      ctx.fillStyle = flameColor(r.type);
      ctx.globalAlpha = isSel || isHover ? 1 : 0.85;
      ctx.fillRect(x, y, wRect, ROW_H - 1);
      ctx.globalAlpha = 1;

      if (r.unclosed) {
        ctx.strokeStyle = token('--c-error', '#ef4444');
        ctx.strokeRect(x + 0.5, y + 0.5, wRect - 1, ROW_H - 2);
      }
      if (isSel) {
        ctx.strokeStyle = token('--foreground', '#ffffff');
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x + 0.75, y + 0.75, wRect - 1.5, ROW_H - 2.5);
        ctx.lineWidth = 1;
      }

      if (wRect > 30) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(x, y, wRect - 2, ROW_H - 1);
        ctx.clip();
        ctx.fillStyle = '#0a0a0a';
        ctx.fillText(r.name, x + 4, y + ROW_H / 2);
        ctx.restore();
      }
    }

    // Exception markers
    for (const m of layout.markers) {
      const x = (m.timestamp - startNs) / nsPerPx;
      if (x < 0 || x > w) continue;
      ctx.strokeStyle = token('--c-error', '#ef4444');
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x, RULER_H);
      ctx.lineTo(x, h);
      ctx.stroke();
      ctx.fillStyle = token('--c-error', '#ef4444');
      ctx.beginPath();
      ctx.moveTo(x - 4, RULER_H);
      ctx.lineTo(x + 4, RULER_H);
      ctx.lineTo(x, RULER_H + 5);
      ctx.fill();
      ctx.lineWidth = 1;
    }
  }, [layout, selectedId]);

  const drawMinimap = useCallback(() => {
    const canvas = minimapCanvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const w = size.current.w;
    const h = MINIMAP_H;
    const dpr = window.devicePixelRatio || 1;

    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr;
      canvas.height = h * dpr;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = token('--card', '#18181b');
    ctx.fillRect(0, 0, w, h);

    const span = Math.max(1, layout.t1 - layout.t0);
    const lanes = Math.max(1, layout.maxDepth + 1);
    const trackTop = 2;
    const trackH = h - 4;

    ctx.globalAlpha = 0.85;
    for (const r of layout.rects) {
      const x = ((r.start - layout.t0) / span) * w;
      const rw = Math.max(0.5, ((r.end - r.start) / span) * w);
      const y = trackTop + (r.depth / lanes) * trackH;
      const rh = Math.max(1, trackH / lanes);
      ctx.fillStyle = flameColor(r.type);
      ctx.fillRect(x, y, rw, rh);
    }
    ctx.globalAlpha = 1;

    for (const m of layout.markers) {
      const x = ((m.timestamp - layout.t0) / span) * w;
      ctx.fillStyle = token('--c-error', '#ef4444');
      ctx.fillRect(x, 0, 1, h);
    }

    // Current viewport ("the frame"), overlaid on the full-range strip.
    // Foreground border (not --ring, too low-contrast against the card bg) so
    // it stays clearly visible in both themes.
    const { startNs, nsPerPx } = view.current;
    const mainW = size.current.w || 1;
    const vx = ((startNs - layout.t0) / span) * w;
    const vw = Math.max(2, ((nsPerPx * mainW) / span) * w);
    ctx.fillStyle = token('--foreground', '#fff');
    ctx.globalAlpha = 0.12;
    ctx.fillRect(vx, 0, vw, h);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = token('--foreground', '#fff');
    ctx.lineWidth = 2;
    // Snap each stroke edge independently to the device-pixel grid — with a
    // fractional dpr (e.g. 1.25x displays), unsnapped fractional coordinates
    // make the canvas anti-alias the left/right/top/bottom strokes to
    // different apparent widths.
    const snap = (v: number) => Math.round(v * dpr) / dpr;
    const left = snap(vx + 1);
    const right = snap(vx + vw - 1);
    const top = snap(1);
    const bottom = snap(h - 1);
    ctx.strokeRect(left, top, Math.max(0, right - left), Math.max(0, bottom - top));
    ctx.lineWidth = 1;
  }, [layout]);

  const scheduleDraw = useCallback(() => {
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      draw();
      drawMinimap();
    });
  }, [draw, drawMinimap]);

  // Resize handling + initial fit.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      size.current = { w: el.clientWidth, h: el.clientHeight };
      scheduleDraw();
    });
    ro.observe(el);
    size.current = { w: el.clientWidth, h: el.clientHeight };
    return () => {
      ro.disconnect();
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [scheduleDraw]);

  // Refit + redraw whenever the log (layout) changes.
  useEffect(() => {
    fit();
    scheduleDraw();
  }, [fit, scheduleDraw]);

  useEffect(() => {
    scheduleDraw();
  }, [selectedId, theme, scheduleDraw]);

  const hitTest = useCallback(
    (mx: number, my: number): FlameRect | null => {
      const depth = Math.floor((my - RULER_H) / ROW_H);
      if (depth < 0) return null;
      const { startNs, nsPerPx } = view.current;
      const arr = rectsByDepth.get(depth);
      if (!arr) return null;
      for (const r of arr) {
        const x = (r.start - startNs) / nsPerPx;
        const wRect = Math.max(1, (r.end - r.start) / nsPerPx);
        if (mx >= x && mx <= x + wRect) return r;
      }
      return null;
    },
    [rectsByDepth],
  );

  // Wheel = zoom about cursor.
  const onWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      const rect = canvasRef.current!.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const v = view.current;
      const timeAtCursor = v.startNs + mx * v.nsPerPx;
      const factor = e.deltaY < 0 ? 1 / 1.15 : 1.15;
      const span = Math.max(1, layout.t1 - layout.t0);
      const maxNsPerPx = (span / (size.current.w || 1)) * 1.2;
      const minNsPerPx = maxNsPerPx / 100000;
      v.nsPerPx = Math.min(maxNsPerPx, Math.max(minNsPerPx, v.nsPerPx * factor));
      v.startNs = timeAtCursor - mx * v.nsPerPx;
      v.startNs = clampStartNs(v.startNs, v.nsPerPx, layout.t0, layout.t1, size.current.w);
      scheduleDraw();
    },
    [layout, scheduleDraw],
  );

  const drag = useRef<{ x: number; startNs: number } | null>(null);

  const onPointerDown = (e: React.PointerEvent) => {
    try {
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // Pointer capture can fail (e.g. synthetic events); dragging still works.
    }
    drag.current = { x: e.clientX, startNs: view.current.startNs };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    if (drag.current) {
      const dx = e.clientX - drag.current.x;
      view.current.startNs = drag.current.startNs - dx * view.current.nsPerPx;
      view.current.startNs = clampStartNs(
        view.current.startNs,
        view.current.nsPerPx,
        layout.t0,
        layout.t1,
        size.current.w,
      );
      setTip(null);
      scheduleDraw();
      return;
    }

    const hit = hitTest(mx, my);
    const newId = hit?.id ?? null;
    if (newId !== hoverId.current) {
      hoverId.current = newId;
      scheduleDraw();
    }
    if (hit) {
      // Keep the tooltip inside the container: flip to the other side of the
      // cursor when it would otherwise overflow the (overflow-hidden) edge.
      const { w, h } = size.current;
      let left = mx + 12;
      let top = my + 12;
      if (left + TIP_W > w) left = mx - TIP_W - 12;
      if (top + TIP_H > h) top = my - TIP_H - 12;
      left = Math.max(4, left);
      top = Math.max(4, top);
      setTip({ left, top, rect: hit });
    } else if (tip) {
      setTip(null);
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const wasDragging = drag.current;
    drag.current = null;
    // Treat as click if pointer barely moved.
    if (wasDragging && Math.abs(e.clientX - wasDragging.x) < 4) {
      const rect = canvasRef.current!.getBoundingClientRect();
      const hit = hitTest(e.clientX - rect.left, e.clientY - rect.top);
      if (hit) onSelect(hit.id);
    }
  };

  const onLeave = () => {
    hoverId.current = null;
    setTip(null);
    scheduleDraw();
  };

  // Minimap: click/drag jumps the main viewport to that time (keeps current zoom).
  const minimapDrag = useRef(false);

  /** Time (ns) at a given client X on the minimap strip. */
  const minimapTimeAt = useCallback(
    (clientX: number): number => {
      const canvas = minimapCanvasRef.current;
      if (!canvas) return layout.t0;
      const rect = canvas.getBoundingClientRect();
      const span = Math.max(1, layout.t1 - layout.t0);
      const frac = Math.min(1, Math.max(0, (clientX - rect.left) / (rect.width || 1)));
      return layout.t0 + frac * span;
    },
    [layout],
  );

  const minimapSeek = useCallback(
    (clientX: number) => {
      const targetNs = minimapTimeAt(clientX);
      const viewSpan = view.current.nsPerPx * (size.current.w || 1);
      view.current.startNs = clampStartNs(
        targetNs - viewSpan / 2,
        view.current.nsPerPx,
        layout.t0,
        layout.t1,
        size.current.w,
      );
      scheduleDraw();
    },
    [layout, minimapTimeAt, scheduleDraw],
  );

  /** 'move' = grabbed inside the current frame (drag it, preserving grab offset); 'seek' = clicked elsewhere (jump/re-center, existing scroll behavior). */
  const minimapDragMode = useRef<'move' | 'seek'>('seek');
  const minimapGrabOffsetNs = useRef(0);

  const onMinimapPointerDown = (e: React.PointerEvent) => {
    try {
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // Pointer capture can fail (e.g. synthetic events); dragging still works.
    }
    minimapDrag.current = true;
    const clickedNs = minimapTimeAt(e.clientX);
    const { startNs, nsPerPx } = view.current;
    const viewSpan = nsPerPx * (size.current.w || 1);
    if (clickedNs >= startNs && clickedNs <= startNs + viewSpan) {
      // Grabbed the frame itself — drag it, keeping the click point fixed
      // relative to the frame (feels like dragging the frame, not jumping).
      minimapDragMode.current = 'move';
      minimapGrabOffsetNs.current = clickedNs - startNs;
    } else {
      minimapDragMode.current = 'seek';
      minimapSeek(e.clientX);
    }
  };

  const onMinimapPointerMove = (e: React.PointerEvent) => {
    if (!minimapDrag.current) return;
    if (minimapDragMode.current === 'move') {
      const targetNs = minimapTimeAt(e.clientX);
      view.current.startNs = clampStartNs(
        targetNs - minimapGrabOffsetNs.current,
        view.current.nsPerPx,
        layout.t0,
        layout.t1,
        size.current.w,
      );
      scheduleDraw();
    } else {
      minimapSeek(e.clientX);
    }
  };

  const onMinimapPointerUp = () => {
    minimapDrag.current = false;
  };

  const empty = layout.rects.length === 0;

  return (
    <div className="relative flex h-full min-h-0 flex-col bg-background">
      <div className="flex shrink-0 items-center justify-between border-b border-border px-3 py-1.5 text-xs text-muted-foreground">
        <span>Scroll to zoom · drag to pan · click a frame to inspect</span>
        <button
          type="button"
          onClick={() => {
            fit();
            scheduleDraw();
          }}
          className="rounded border border-border px-2 py-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          Reset zoom
        </button>
      </div>
      {!empty ? (
        <canvas
          ref={minimapCanvasRef}
          className="block w-full shrink-0 cursor-pointer"
          style={{ height: MINIMAP_H, touchAction: 'none' }}
          onPointerDown={onMinimapPointerDown}
          onPointerMove={onMinimapPointerMove}
          onPointerUp={onMinimapPointerUp}
          onPointerLeave={onMinimapPointerUp}
        />
      ) : null}
      <div ref={containerRef} className="relative min-h-0 flex-1 overflow-hidden">
        {empty ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground/70">
            No timed execution events to chart.
          </div>
        ) : (
          <canvas
            ref={canvasRef}
            className="block h-full w-full cursor-crosshair"
            style={{ touchAction: 'none' }}
            onWheel={onWheel}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={onLeave}
          />
        )}
        {tip ? (
          <div
            className="pointer-events-none absolute z-10 max-w-xs rounded-md border border-input bg-card px-2.5 py-1.5 text-xs shadow-lg"
            style={{ left: tip.left, top: tip.top }}
          >
            <div className="mb-0.5 flex items-center gap-1.5">
              <span
                className="inline-block h-2 w-2 rounded-sm"
                style={{ backgroundColor: flameColor(tip.rect.type) }}
              />
              <span className="font-semibold uppercase tracking-wide text-muted-foreground">
                {tip.rect.type}
              </span>
            </div>
            <div className="break-words font-mono text-foreground">{tip.rect.name}</div>
            <div className="mt-1 font-mono text-muted-foreground">
              {fmtNs(tip.rect.end - tip.rect.start)}
              {tip.rect.lineNumber ? ` · line ${tip.rect.lineNumber}` : ''}
              {tip.rect.unclosed ? ' · unclosed' : ''}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
};
