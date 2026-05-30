import type { Corners, Point } from '../types';

const KEYS = ['tl', 'tr', 'br', 'bl'] as const;
export type CornerHandleKey = (typeof KEYS)[number];

function clamp01Pct(p: Point): Point {
  return {
    x: Math.max(0, Math.min(100, p.x)),
    y: Math.max(0, Math.min(100, p.y)),
  };
}

/** Axis-aligned Bounding-Box-Seitenverhältnis Breite/Höhe (Bild-%). */
export function bboxAspectRatio(c: Corners): number {
  const xs = [c.tl.x, c.tr.x, c.br.x, c.bl.x];
  const ys = [c.tl.y, c.tr.y, c.br.y, c.bl.y];
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const w = Math.max(1e-6, maxX - minX);
  const h = Math.max(1e-6, maxY - minY);
  return w / h;
}

function centroidExcept(corners0: Corners, k: CornerHandleKey): Point {
  let sx = 0;
  let sy = 0;
  let n = 0;
  for (const j of KEYS) {
    if (j === k) continue;
    sx += corners0[j].x;
    sy += corners0[j].y;
    n += 1;
  }
  return { x: sx / Math.max(1, n), y: sy / Math.max(1, n) };
}

/**
 * Ziehe Ecke `k` nach `dragged`, skaliere die übrigen drei Ecken um den Schwerpunkt
 * der Start-Ecken (ohne k), um das BBox-Verhältnis näher an `targetAspect` zu bringen.
 */
export function fitCornersPreserveBBoxAspect(
  corners0: Corners,
  k: CornerHandleKey,
  dragged: Point,
  targetAspect: number,
): Corners {
  const G = centroidExcept(corners0, k);
  const pk = clamp01Pct(dragged);
  let best: Corners = {
    ...corners0,
    [k]: pk,
  };
  let bestErr = Math.abs(bboxAspectRatio(best) - targetAspect);

  for (let i = 0; i <= 48; i++) {
    const s = 0.03 + (4 - 0.03) * (i / 48);
    const next: Corners = { ...corners0, [k]: pk };
    for (const j of KEYS) {
      if (j === k) continue;
      next[j] = clamp01Pct({
        x: G.x + s * (corners0[j].x - G.x),
        y: G.y + s * (corners0[j].y - G.y),
      });
    }
    const err = Math.abs(bboxAspectRatio(next) - targetAspect);
    if (err < bestErr) {
      bestErr = err;
      best = next;
    }
  }
  return best;
}
