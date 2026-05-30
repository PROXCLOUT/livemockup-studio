/**
 * Projective (homography) transforms used by both the live preview and the
 * canvas-based export engine.
 *
 *   - `getMatrix3d` produces a CSS `matrix3d(...)` string for transforming an
 *     element so its 0..W, 0..H rectangle maps onto a target quadrilateral.
 *   - `drawImageWithPerspective` warps an `HTMLImageElement` onto a target
 *     quadrilateral on a 2D canvas. Canvas2D can't render full perspective
 *     natively, so we subdivide the source rectangle into a triangle mesh
 *     and `setTransform` an affine map onto each triangle. With ~24
 *     subdivisions the error is sub-pixel for typical mockup sizes.
 *     Large exports use `projectPointStable` (scaled solve); preview/CSS keeps raw `getProjective`.
 *
 * The math is the standard projective transform (Franklin Ta, 2014).
 */
import type { Point } from '../types';

type Mat = number[][];

/** Solve A x = b for a square matrix A using partial-pivoting Gauss-Jordan. */
function solve(A: Mat, b: number[]): number[] {
  const n = b.length;
  const M: Mat = A.map((row, i) => [...row, b[i]]);

  for (let i = 0; i < n; i++) {
    let pivot = i;
    for (let r = i + 1; r < n; r++) {
      if (Math.abs(M[r][i]) > Math.abs(M[pivot][i])) pivot = r;
    }
    if (pivot !== i) [M[i], M[pivot]] = [M[pivot], M[i]];
    const div = M[i][i];
    if (Math.abs(div) < 1e-12) return new Array(n).fill(0);
    for (let r = i + 1; r < n; r++) {
      const factor = M[r][i] / div;
      for (let c = i; c <= n; c++) M[r][c] -= factor * M[i][c];
    }
  }

  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let sum = M[i][n];
    for (let c = i + 1; c < n; c++) sum -= M[i][c] * x[c];
    x[i] = sum / M[i][i];
  }
  return x;
}

export function cornersBBox(corners: { tl: Point; tr: Point; br: Point; bl: Point }) {
  const pts = [corners.tl, corners.tr, corners.br, corners.bl];
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const maxX = Math.max(...xs);
  const maxY = Math.max(...ys);
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

export type Projective = [number, number, number, number, number, number, number, number];

/** DLT 4-point homography: maps each `src[i]` to `dst[i]` (inhomogeneous destination). */
function computeHomography8(src: [number, number][], dst: Point[]): Projective {
  const A: Mat = [];
  const B: number[] = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i];
    const u = dst[i].x;
    const v = dst[i].y;
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    B.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    B.push(v);
  }
  const c = solve(A, B);
  return [c[0], c[1], c[2], c[3], c[4], c[5], c[6], c[7]];
}

/**
 * Computes the 8 coefficients (a..h) of the projective transform
 *   x' = (a*x + b*y + c) / (g*x + h*y + 1)
 *   y' = (d*x + e*y + f) / (g*x + h*y + 1)
 * mapping source rect (0,0)..(W,H) onto the destination quadrilateral.
 */
export function getProjective(
  srcW: number,
  srcH: number,
  dst: [Point, Point, Point, Point],
): Projective {
  return computeHomography8(
    [
      [0, 0],
      [srcW, 0],
      [srcW, srcH],
      [0, srcH],
    ],
    dst,
  );
}

/**
 * Same mapping as `getProjective` + `projectPoint`, but scales coordinates before the 8×8 solve
 * so large export pixels (e.g. 3–4k) do not destabilise Gauss elimination (avoids full-canvas warp).
 */
export function projectPointStable(
  srcW: number,
  srcH: number,
  dst: [Point, Point, Point, Point],
  sx: number,
  sy: number,
): Point {
  const tx = dst[0].x;
  const ty = dst[0].y;
  const d1: Point = { x: dst[1].x - tx, y: dst[1].y - ty };
  const d2: Point = { x: dst[2].x - tx, y: dst[2].y - ty };
  const d3: Point = { x: dst[3].x - tx, y: dst[3].y - ty };
  const sm = Math.max(
    srcW,
    srcH,
    Math.abs(d1.x),
    Math.abs(d1.y),
    Math.abs(d2.x),
    Math.abs(d2.y),
    Math.abs(d3.x),
    Math.abs(d3.y),
    1e-6,
  );
  const srcPts: [number, number][] = [
    [0, 0],
    [srcW / sm, 0],
    [srcW / sm, srcH / sm],
    [0, srcH / sm],
  ];
  const dstPts: Point[] = [
    { x: 0, y: 0 },
    { x: d1.x / sm, y: d1.y / sm },
    { x: d2.x / sm, y: d2.y / sm },
    { x: d3.x / sm, y: d3.y / sm },
  ];
  const coeff = computeHomography8(srcPts, dstPts);
  const q = projectPoint(coeff, sx / sm, sy / sm);
  return { x: q.x * sm + tx, y: q.y * sm + ty };
}

export function projectPoint(coeffs: Projective, x: number, y: number): Point {
  const [a, b, c, d, e, f, g, h] = coeffs;
  const w = g * x + h * y + 1;
  if (Math.abs(w) < 1e-14 || !Number.isFinite(w)) {
    return { x: 0, y: 0 };
  }
  return {
    x: (a * x + b * y + c) / w,
    y: (d * x + e * y + f) / w,
  };
}

/**
 * Returns a CSS `matrix3d(...)` string transforming the source rectangle
 * (rendered at `srcW x srcH` with `transform-origin: 0 0`) onto the four
 * destination points (in any unit, must match the parent element).
 */
export function getMatrix3d(
  srcW: number,
  srcH: number,
  dst: { tl: Point; tr: Point; br: Point; bl: Point },
): string {
  const [a, b, c, d, e, f, g, h] = getProjective(srcW, srcH, [dst.tl, dst.tr, dst.br, dst.bl]);
  // 4x4 CSS matrix in column-major order. The Z axis is unused (set to 1).
  const m: number[] = [
    a, d, 0, g,
    b, e, 0, h,
    0, 0, 1, 0,
    c, f, 0, 1,
  ];
  return `matrix3d(${m.map((n) => (Number.isFinite(n) ? n.toFixed(6) : 0)).join(',')})`;
}

export function cornersInPixels(
  corners: { tl: Point; tr: Point; br: Point; bl: Point },
  containerW: number,
  containerH: number,
) {
  const s = (p: Point): Point => ({
    x: (p.x / 100) * containerW,
    y: (p.y / 100) * containerH,
  });
  return { tl: s(corners.tl), tr: s(corners.tr), br: s(corners.br), bl: s(corners.bl) };
}

/**
 * Draw a single textured triangle: maps (sx0..2, sy0..2) on `img` onto
 * (dx0..2, dy0..2) on the canvas using the unique affine map that takes
 * three source points to three destination points.
 *
 * Standard formula. The 2x3 affine is
 *   [a c e]
 *   [b d f]
 * such that dx = a*sx + c*sy + e and dy = b*sx + d*sy + f.
 */
function drawTexturedTriangle(
  ctx: CanvasRenderingContext2D,
  img: CanvasImageSource,
  sx0: number, sy0: number,
  sx1: number, sy1: number,
  sx2: number, sy2: number,
  dx0: number, dy0: number,
  dx1: number, dy1: number,
  dx2: number, dy2: number,
) {
  const A = sx1 - sx0;
  const B = sy1 - sy0;
  const C = sx2 - sx0;
  const D = sy2 - sy0;
  const det = A * D - B * C;
  if (Math.abs(det) < 1e-12) return;

  const a = ((dx1 - dx0) * D - (dx2 - dx0) * B) / det;
  const c = ((dx2 - dx0) * A - (dx1 - dx0) * C) / det;
  const e = dx0 - a * sx0 - c * sy0;

  const b = ((dy1 - dy0) * D - (dy2 - dy0) * B) / det;
  const d = ((dy2 - dy0) * A - (dy1 - dy0) * C) / det;
  const f = dy0 - b * sx0 - d * sy0;

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(dx0, dy0);
  ctx.lineTo(dx1, dy1);
  ctx.lineTo(dx2, dy2);
  ctx.closePath();
  ctx.clip();
  ctx.transform(a, b, c, d, e, f);
  ctx.drawImage(img, 0, 0);
  ctx.restore();
}

export interface PerspectiveDrawOptions {
  subdivisions?: number;
}

/**
 * Draws `img` (rendered at its natural size, with src rect 0,0..srcW,srcH)
 * onto `ctx` warped so that the four corners of the source rectangle map
 * onto `dst.tl / tr / br / bl`. Internally subdivides into a triangle mesh
 * for perspective fidelity.
 */
export function drawImageWithPerspective(
  ctx: CanvasRenderingContext2D,
  img: CanvasImageSource,
  srcW: number,
  srcH: number,
  dst: { tl: Point; tr: Point; br: Point; bl: Point },
  opts: PerspectiveDrawOptions = {},
) {
  const N = Math.max(2, opts.subdivisions ?? 24);
  const dstArr: [Point, Point, Point, Point] = [dst.tl, dst.tr, dst.br, dst.bl];
  const bb = cornersBBox(dst);
  const span = Math.max(srcW, srcH, bb.w, bb.h);
  /** Above ~2.4k px the raw DLT system becomes ill-conditioned and can cover the whole canvas. */
  const useStable = span > 2400;
  let coeffs: Projective | null = null;
  const project = (sx: number, sy: number) =>
    useStable
      ? projectPointStable(srcW, srcH, dstArr, sx, sy)
      : projectPoint((coeffs ??= getProjective(srcW, srcH, dstArr)), sx, sy);

  ctx.save();
  const prevSmooth = ctx.imageSmoothingEnabled;
  const prevQuality = ctx.imageSmoothingQuality;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  const grid: Point[][] = [];
  for (let j = 0; j <= N; j++) {
    const row: Point[] = [];
    for (let i = 0; i <= N; i++) {
      const sx = (i / N) * srcW;
      const sy = (j / N) * srcH;
      row.push(project(sx, sy));
    }
    grid.push(row);
  }

  try {
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const sx0 = (i / N) * srcW;
        const sy0 = (j / N) * srcH;
        const sx1 = ((i + 1) / N) * srcW;
        const sy1 = (j / N) * srcH;
        const sx2 = ((i + 1) / N) * srcW;
        const sy2 = ((j + 1) / N) * srcH;
        const sx3 = (i / N) * srcW;
        const sy3 = ((j + 1) / N) * srcH;

        const p0 = grid[j][i];
        const p1 = grid[j][i + 1];
        const p2 = grid[j + 1][i + 1];
        const p3 = grid[j + 1][i];

        drawTexturedTriangle(
          ctx, img,
          sx0, sy0, sx1, sy1, sx2, sy2,
          p0.x, p0.y, p1.x, p1.y, p2.x, p2.y,
        );
        drawTexturedTriangle(
          ctx, img,
          sx0, sy0, sx2, sy2, sx3, sy3,
          p0.x, p0.y, p2.x, p2.y, p3.x, p3.y,
        );
      }
    }
  } finally {
    ctx.imageSmoothingEnabled = prevSmooth;
    ctx.imageSmoothingQuality = prevQuality;
    ctx.restore();
  }
}
