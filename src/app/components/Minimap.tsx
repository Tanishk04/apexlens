import React, { useCallback, useEffect, useRef } from 'react';

export interface MinimapLine {
  /** Left offset in px-equivalents (e.g. tree depth). */
  offset: number;
  /** Bar length proxy (e.g. text length). */
  length: number;
  /** CSS custom property for the bar color, e.g. '--c-method'. */
  colorVar: string;
}

interface Props {
  lines: MinimapLine[];
  /** The scrollable container this minimap mirrors. */
  scrollRef: React.RefObject<HTMLDivElement | null>;
  /** Fixed row height of the virtualized list (px). */
  rowHeight: number;
  /** Row indexes with find matches (drawn in warn color). */
  matchIndexes?: number[];
  theme?: string | undefined;
}

const WIDTH = 72;

function cssVar(name: string, fallback: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

/** VS Code-style page preview: bars per line, draggable viewport overlay. */
export const Minimap = ({ lines, scrollRef, rowHeight, matchIndexes, theme }: Props) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef(0);
  const dragging = useRef(false);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const scroller = scrollRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || !scroller) return;

    const h = canvas.clientHeight;
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== WIDTH * dpr || canvas.height !== h * dpr) {
      canvas.width = WIDTH * dpr;
      canvas.height = h * dpr;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, WIDTH, h);

    const n = lines.length;
    if (n === 0 || h === 0) return;

    // Bucket lines into pixel rows when the log is taller than the canvas.
    const rowsPerPx = Math.max(1, n / h);
    const colorCache = new Map<string, string>();
    const color = (v: string) => {
      let c = colorCache.get(v);
      if (!c) {
        c = cssVar(v, '#888');
        colorCache.set(v, c);
      }
      return c;
    };

    ctx.globalAlpha = 0.85;
    for (let y = 0; y < h; y++) {
      const i = Math.floor(y * rowsPerPx);
      if (i >= n) break;
      const line = lines[i]!;
      const x = Math.min(20, line.offset * 1.5) + 2;
      const w = Math.min(WIDTH - x - 2, Math.max(2, line.length / 3));
      ctx.fillStyle = color(line.colorVar);
      ctx.fillRect(x, y, w, 1);
    }
    ctx.globalAlpha = 1;

    // Find matches — bright warn ticks across the full width.
    if (matchIndexes && matchIndexes.length > 0) {
      ctx.fillStyle = color('--c-warn');
      for (const i of matchIndexes) {
        const y = Math.floor(i / rowsPerPx);
        ctx.fillRect(0, y, WIDTH, 2);
      }
    }

    // Viewport rect.
    const totalPx = n * rowHeight;
    const viewTop = (scroller.scrollTop / totalPx) * h;
    const viewH = Math.max(12, (scroller.clientHeight / totalPx) * h);
    ctx.fillStyle = color('--muted-foreground');
    ctx.globalAlpha = 0.18;
    ctx.fillRect(0, viewTop, WIDTH, viewH);
    ctx.globalAlpha = 0.6;
    ctx.strokeStyle = color('--muted-foreground');
    ctx.strokeRect(0.5, viewTop + 0.5, WIDTH - 1, viewH - 1);
    ctx.globalAlpha = 1;
  }, [lines, matchIndexes, scrollRef, rowHeight]);

  const scheduleDraw = useCallback(() => {
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      draw();
    });
  }, [draw]);

  useEffect(() => {
    scheduleDraw();
  }, [scheduleDraw, theme]);

  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    scroller.addEventListener('scroll', scheduleDraw, { passive: true });
    const ro = new ResizeObserver(scheduleDraw);
    ro.observe(scroller);
    if (canvasRef.current) ro.observe(canvasRef.current);
    return () => {
      scroller.removeEventListener('scroll', scheduleDraw);
      ro.disconnect();
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [scrollRef, scheduleDraw]);

  const scrollTo = (clientY: number) => {
    const canvas = canvasRef.current;
    const scroller = scrollRef.current;
    if (!canvas || !scroller) return;
    const rect = canvas.getBoundingClientRect();
    const frac = Math.min(1, Math.max(0, (clientY - rect.top) / rect.height));
    const totalPx = lines.length * rowHeight;
    scroller.scrollTop = frac * totalPx - scroller.clientHeight / 2;
  };

  return (
    <canvas
      ref={canvasRef}
      style={{ width: WIDTH, touchAction: 'none' }}
      className="h-full shrink-0 cursor-pointer border-l border-border bg-card/40"
      onPointerDown={(e) => {
        dragging.current = true;
        try {
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
        } catch {
          // synthetic pointers may not support capture
        }
        scrollTo(e.clientY);
      }}
      onPointerMove={(e) => {
        if (dragging.current) scrollTo(e.clientY);
      }}
      onPointerUp={() => {
        dragging.current = false;
      }}
    />
  );
};
