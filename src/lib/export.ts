/**
 * Export pipeline. Renders the mockup frame, then a perspective-warped website
 * screenshot on top (flat mode), on a canvas at the **target export size** (native or chosen
 * width). The composite is drawn at that resolution; the screenshot uses the same CSS viewport as
 * the preview, with optional iframe-proxy `deviceScaleFactor` for sharp upscales
 * (`getScreenshotDevicePixelRatio`).
 *
 * No DOM cloning, no html-to-image, no foreignObject — purely canvas2D with
 * triangle-mesh perspective warping.
 *
 * The website is fetched via the configured screenshot provider, so
 * X-Frame-blocked URLs still export correctly.
 *
 * **Draw order (flat):** mockup image first, then perspective-warped screenshot on top.
 * That way opaque “black screen” areas in SVG or custom photos are replaced by the site;
 * the old order (screenshot then mockup) only worked when the frame had a transparent hole.
 *
 * Screenshot viewport width matches the mockup’s logical iframe width
 * (`contentViewportWidth` / device default); see `resolveScreenshotFetchWidth`.
 */
import type { ContentSlot, MockupConfig } from '../types';
import {
  getBuiltinFrameIntrinsicSize,
  getScreenshotDevicePixelRatio,
  resolveMockupFrameDataUrl,
} from './deviceFrames';
import { cornersInPixels, drawImageWithPerspective } from './perspective';
import { renderThreeMockupToPng } from './renderThreeMockupToPng';
import { fetchScreenshot } from './screenshot';
import {
  getLogicalContentHeight,
  getSlotLogicalContentHeight,
  getSlotLogicalContentWidth,
  resolveScreenshotFetchWidth,
} from './contentViewport';
import { getContentMedia } from './contentMediaStore';
import {
  getEffectiveContentSlots,
  isSinglePrimaryUrlSlot,
  resolveSlotSiteUrl,
  slotWebScreenshotAttempted,
} from './contentSlots';

const DEFAULT_CONTENT_HEIGHT = 800;

export type ExportImageFormat = 'png' | 'jpeg' | 'webp';

export interface ExportResult {
  blob: Blob;
  dataUrl: string;
  filename: string;
  /** True when a website screenshot was composited into the mockup. */
  screenshotIncluded: boolean;
  /** True when a valid http(s) URL was given (attempt was made or skipped meaningfully). */
  screenshotAttempted: boolean;
}

/** Values controlled from the export options UI. */
export interface ExportUiSettings {
  format: ExportImageFormat;
  quality: number;
  /** `null` = native mockup pixel size. When set, final image width in px (scale up or down, height proportional). */
  maxOutputWidth: number | null;
}

export const DEFAULT_EXPORT_UI_SETTINGS: ExportUiSettings = {
  format: 'png',
  quality: 0.92,
  maxOutputWidth: null,
};

export function toExportOptions(ui: ExportUiSettings): ExportOptions {
  return {
    format: ui.format,
    quality: ui.quality,
    maxOutputWidth: ui.maxOutputWidth,
  };
}

export function exportFormatShortLabel(format: ExportImageFormat): string {
  if (format === 'jpeg') return 'JPEG';
  if (format === 'webp') return 'WebP';
  return 'PNG';
}

export interface ExportOptions {
  /**
   * When set (e.g. from `useScreenshot` when viewport width matches), skips a second
   * `fetchScreenshot` call — avoids rate limits and cache key mismatches with the preview.
   */
  prefetchedScreenshotDataUrl?: string | null;
  /** Document scroll in CSS px; forwarded to the iframe-proxy `/screenshot` route when used. */
  previewScroll?: { x: number; y: number } | null;
  /** Triangle-mesh resolution for perspective warping (default 24x24). */
  subdivisions?: number;
  /** Output image format (default png). WebP falls back to JPEG if unsupported. */
  format?: ExportImageFormat;
  /** Encoder quality 0..1 for JPEG/WebP (default 0.92). Ignored for PNG. */
  quality?: number;
  /**
   * Target output width in pixels (scale up or down; height proportional).
   * `null` / omit = native mockup resolution.
   */
  maxOutputWidth?: number | null;
}

let webpEncodeSupported: boolean | null = null;

function supportsWebpEncode(): boolean {
  if (webpEncodeSupported !== null) return webpEncodeSupported;
  const c = document.createElement('canvas');
  c.width = 1;
  c.height = 1;
  const u = c.toDataURL('image/webp');
  webpEncodeSupported = u.startsWith('data:image/webp');
  return webpEncodeSupported;
}

function mimeForFormat(format: ExportImageFormat): string {
  if (format === 'jpeg') return 'image/jpeg';
  if (format === 'webp') return supportsWebpEncode() ? 'image/webp' : 'image/jpeg';
  return 'image/png';
}

function extensionForMime(mime: string): string {
  if (mime === 'image/jpeg') return 'jpg';
  if (mime === 'image/webp') return 'webp';
  return 'png';
}

/** Load an image to ready-to-draw state. Sets crossOrigin **before** src when needed. */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const skipCors =
      /^data:/i.test(src) || /^blob:/i.test(src);
    if (!skipCors) {
      img.crossOrigin = 'anonymous';
    }
    img.decoding = 'async';
    img.onload = () => {
      const decode = (img as HTMLImageElement & { decode?: () => Promise<void> }).decode;
      if (typeof decode === 'function') {
        decode.call(img).then(() => resolve(img)).catch(() => resolve(img));
      } else {
        resolve(img);
      }
    };
    img.onerror = () => reject(new Error(`Failed to load image (${src.slice(0, 100)}...)`));
    img.src = src;
  });
}

function clampIframeRadius(r: number, cw: number, ch: number): number {
  return Math.max(0, Math.min(r, Math.min(cw, ch) / 2));
}

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.moveTo(x + rad, y);
  ctx.lineTo(x + w - rad, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rad);
  ctx.lineTo(x + w, y + h - rad);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rad, y + h);
  ctx.lineTo(x + rad, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rad);
  ctx.lineTo(x, y + rad);
  ctx.quadraticCurveTo(x, y, x + rad, y);
  ctx.closePath();
}

/**
 * Renders the screenshot into a `contentW × contentH` canvas with optional
 * rounded-rect clip (same coordinate system as the flat preview iframe), using
 * object-cover scaling. Used for export so rounded corners match the UI.
 */
function screenshotToContentCanvas(
  screenshotImg: HTMLImageElement,
  contentW: number,
  contentH: number,
  borderRadiusPx: number,
): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = contentW;
  c.height = contentH;
  const g = c.getContext('2d');
  if (!g) throw new Error('Canvas 2D context unavailable');

  /** Matches typical SVG screen fill; hides sub-pixel gaps at rounded corners / mesh edges. */
  g.fillStyle = '#020617';
  g.fillRect(0, 0, contentW, contentH);

  const r = clampIframeRadius(borderRadiusPx, contentW, contentH);
  if (r > 0) {
    g.beginPath();
    const gRound = g as CanvasRenderingContext2D & {
      roundRect?: (x: number, y: number, w: number, h: number, radii: number) => void;
    };
    if (typeof gRound.roundRect === 'function') {
      gRound.roundRect(0, 0, contentW, contentH, r);
    } else {
      roundRectPath(g, 0, 0, contentW, contentH, r);
    }
    g.clip();
  }

  const sw = screenshotImg.naturalWidth || contentW;
  const sh = screenshotImg.naturalHeight || contentH;
  const scale = Math.max(contentW / sw, contentH / sh);
  const dw = sw * scale;
  const dh = sh * scale;
  const ox = (contentW - dw) / 2;
  const oy = (contentH - dh) / 2;
  g.drawImage(screenshotImg, 0, 0, sw, sh, ox, oy, dw, dh);
  return c;
}

/** Letterbox im Bitmap-Raum; `insetCssPx` bezieht sich auf die logische Content-Box. */
function applyContentInsetLetterbox(
  source: HTMLCanvasElement,
  logicalW: number,
  logicalH: number,
  insetCssPx: number,
): HTMLCanvasElement {
  if (!insetCssPx || insetCssPx <= 0) return source;
  const lw = Math.max(1, logicalW);
  const lh = Math.max(1, logicalH);
  const scaleX = source.width / lw;
  const scaleY = source.height / lh;
  const ix = Math.min(Math.round(insetCssPx * scaleX), Math.floor(source.width / 4));
  const iy = Math.min(Math.round(insetCssPx * scaleY), Math.floor(source.height / 4));
  if (ix <= 0 && iy <= 0) return source;
  const c = document.createElement('canvas');
  c.width = source.width;
  c.height = source.height;
  const g = c.getContext('2d');
  if (!g) return source;
  g.fillStyle = '#020617';
  g.fillRect(0, 0, c.width, c.height);
  g.drawImage(source, ix, iy, source.width - 2 * ix, source.height - 2 * iy);
  return c;
}

/**
 * Pixel width for the final export after compositing.
 * - `maxOutputWidth` when set: always scale to this value (up or down).
 * - When `maxOutputWidth` is null (“Nativ”): native mockup frame width (no extra upscale).
 */
function resolveExportTargetWidth(nativeCompositeWidth: number, opts: ExportOptions): number | null {
  const cap = opts.maxOutputWidth;
  if (cap != null && cap > 0) return cap;
  return null;
}

/** Mesh density scales with largest output / warp side to limit perspective seam artifacts. */
function perspectiveSubdivisions(longestSide: number, explicit?: number): number {
  if (explicit != null && explicit >= 2) return explicit;
  return Math.min(96, Math.max(36, Math.round(longestSide / 22)));
}

async function rasterFromVideoBlob(
  blob: Blob,
  posterAssetId?: string,
): Promise<HTMLImageElement | null> {
  if (posterAssetId) {
    const poster = await getContentMedia(posterAssetId);
    if (poster) {
      const u = URL.createObjectURL(poster);
      try {
        return await loadImage(u);
      } catch {
        return null;
      } finally {
        URL.revokeObjectURL(u);
      }
    }
  }
  const url = URL.createObjectURL(blob);
  try {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.src = url;
    await new Promise<void>((resolve, reject) => {
      video.onloadeddata = () => resolve();
      video.onerror = () => reject(new Error('video load'));
      setTimeout(() => reject(new Error('video timeout')), 20000);
    });
    if (video.duration && !Number.isNaN(video.duration)) {
      video.currentTime = Math.min(0.15, Math.max(0.02, video.duration * 0.02));
    } else {
      video.currentTime = 0;
    }
    await new Promise<void>((resolve) => {
      video.onseeked = () => resolve();
      setTimeout(() => resolve(), 600);
    });
    const w = Math.max(1, video.videoWidth || 640);
    const h = Math.max(1, video.videoHeight || 360);
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const g = c.getContext('2d');
    if (!g) return null;
    g.drawImage(video, 0, 0, w, h);
    const dataUrl = c.toDataURL('image/png');
    return await loadImage(dataUrl);
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function loadSlotRaster(
  slot: ContentSlot,
  config: MockupConfig,
  primaryUrl: string,
  opts: ExportOptions,
  slotIndex: number,
  captureDpr: number,
): Promise<HTMLImageElement | null> {
  const src = slot.source;
  if (src.kind === 'imageAsset') {
    const blob = await getContentMedia(src.assetId);
    if (!blob) return null;
    const u = URL.createObjectURL(blob);
    try {
      return await loadImage(u);
    } finally {
      URL.revokeObjectURL(u);
    }
  }
  if (src.kind === 'videoAsset') {
    const blob = await getContentMedia(src.assetId);
    if (!blob) return null;
    return rasterFromVideoBlob(blob, src.posterAssetId);
  }
  const site = resolveSlotSiteUrl(src, primaryUrl);
  if (!site) return null;
  const logicalW = getSlotLogicalContentWidth(config, slot);
  const logicalH = getSlotLogicalContentHeight(config, slot, logicalW, DEFAULT_CONTENT_HEIGHT);
  const fetchW = resolveScreenshotFetchWidth(logicalW);
  const viewportH = Math.max(1, Math.round((fetchW * logicalH) / logicalW));
  const scroll = opts.previewScroll;
  const hasScroll = scroll != null && (scroll.x !== 0 || scroll.y !== 0);
  const usePrefetch =
    slotIndex === 0 &&
    isSinglePrimaryUrlSlot(config) &&
    opts.prefetchedScreenshotDataUrl &&
    !hasScroll &&
    captureDpr === 1;
  const screenshotUrl = usePrefetch
    ? opts.prefetchedScreenshotDataUrl
    : await fetchScreenshot(site, {
        width: fetchW,
        height: viewportH,
        scrollX: scroll?.x,
        scrollY: scroll?.y,
        devicePixelRatio: captureDpr,
      });
  return loadImage(screenshotUrl);
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  mime: string,
  quality?: number,
): Promise<Blob> {
  const q =
    mime === 'image/png' ? undefined : Math.min(1, Math.max(0.05, quality ?? 0.92));
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('canvas.toBlob returned null'))),
      mime,
      q,
    );
  });
}

/**
 * Build the composite for `config + websiteUrl` and return an encoded Blob.
 */
export async function renderMockup(
  config: MockupConfig,
  websiteUrl: string,
  opts: ExportOptions = {},
): Promise<ExportResult> {
  if (config.renderMode === 'three') {
    const { blob, screenshotIncluded } = await renderThreeMockupToPng(config, websiteUrl);
    const safeName = config.name.replace(/[^a-z0-9-_]+/gi, '_').toLowerCase();
    const filename = `mockup-${safeName || config.id}.png`;
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => {
        if (typeof r.result === 'string') resolve(r.result);
        else reject(new Error('FileReader failed'));
      };
      r.onerror = () => reject(r.error ?? new Error('FileReader error'));
      r.readAsDataURL(blob);
    });
    const screenshotAttempted = !!(websiteUrl && /^https?:\/\//i.test(websiteUrl));
    return {
      blob,
      dataUrl,
      filename,
      screenshotIncluded,
      screenshotAttempted,
    };
  }

  const frameUrl = resolveMockupFrameDataUrl(config);
  const mockupImg = await loadImage(frameUrl);
  /** SVG-as-Image meldet in Browsern oft falsche `naturalWidth`/`naturalHeight` → Export-Seitenverhältnis und Ecken wichen ab. */
  const builtIn = getBuiltinFrameIntrinsicSize(config);
  const W = builtIn?.w ?? (mockupImg.naturalWidth || 1600);
  const H = builtIn?.h ?? (mockupImg.naturalHeight || 1000);

  const targetW = resolveExportTargetWidth(W, opts);
  const MAX_EXPORT_SIDE = 8192;
  let exportW = targetW != null ? Math.max(1, Math.floor(targetW)) : W;
  exportW = Math.min(exportW, MAX_EXPORT_SIDE);
  const exportH = Math.max(1, Math.round((H * exportW) / W));

  const slots = getEffectiveContentSlots(config);
  const captureDpr = getScreenshotDevicePixelRatio(config, opts.maxOutputWidth);

  let maxWarpSide = Math.max(exportW, exportH);
  for (const slot of slots) {
    const lw = getSlotLogicalContentWidth(config, slot);
    const lh = getSlotLogicalContentHeight(config, slot, lw, DEFAULT_CONTENT_HEIGHT);
    maxWarpSide = Math.max(maxWarpSide, lw * captureDpr, lh * captureDpr);
  }

  const canvas = document.createElement('canvas');
  canvas.width = exportW;
  canvas.height = exportH;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  const subdiv = perspectiveSubdivisions(maxWarpSide, opts.subdivisions);

  const stageBg = config.flatAppearance?.stageBackground;
  if (
    stageBg !== null &&
    stageBg !== undefined &&
    stageBg !== '' &&
    stageBg !== 'transparent'
  ) {
    ctx.fillStyle = stageBg;
    ctx.fillRect(0, 0, exportW, exportH);
  }

  let screenshotAttempted = false;
  for (const slot of slots) {
    if (slotWebScreenshotAttempted(slot.source, websiteUrl)) {
      screenshotAttempted = true;
      break;
    }
  }

  let screenshotIncluded = false;

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.drawImage(mockupImg, 0, 0, exportW, exportH);
  ctx.restore();

  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i]!;
    let screenshotImg: HTMLImageElement | null = null;
    try {
      screenshotImg = await loadSlotRaster(slot, config, websiteUrl, opts, i, captureDpr);
    } catch (err) {
      console.warn('[export] Slot-Raster fehlgeschlagen:', err);
    }
    if (!screenshotImg) continue;
    screenshotIncluded = true;
    const logicalW = getSlotLogicalContentWidth(config, slot);
    const logicalH = getSlotLogicalContentHeight(config, slot, logicalW, DEFAULT_CONTENT_HEIGHT);
    const dstPx = cornersInPixels(slot.corners, exportW, exportH);
    const bitmapW = Math.max(1, screenshotImg.naturalWidth);
    const bitmapH = Math.max(1, screenshotImg.naturalHeight);
    const rawRadius = slot.iframeBorderRadius ?? config.flatAppearance?.iframeBorderRadius ?? 0;
    const radiusWarp =
      rawRadius > 0
        ? clampIframeRadius(rawRadius * (bitmapW / logicalW), bitmapW, bitmapH)
        : 0;
    let warpSource = screenshotToContentCanvas(
      screenshotImg,
      bitmapW,
      bitmapH,
      radiusWarp,
    );
    const insetPx = slot.contentInsetPx ?? 0;
    if (insetPx > 0) {
      warpSource = applyContentInsetLetterbox(warpSource, logicalW, logicalH, insetPx);
    }
    drawImageWithPerspective(ctx, warpSource, bitmapW, bitmapH, dstPx, {
      subdivisions: subdiv,
    });
  }

  const requestedFormat = opts.format ?? 'png';
  let effectiveFormat: ExportImageFormat = requestedFormat;
  if (effectiveFormat === 'webp' && !supportsWebpEncode()) {
    effectiveFormat = 'jpeg';
  }

  const mime = mimeForFormat(effectiveFormat);
  const ext = extensionForMime(mime);

  const blob = await canvasToBlob(canvas, mime, opts.quality);
  const dataUrl = canvas.toDataURL(mime, mime === 'image/png' ? undefined : opts.quality ?? 0.92);

  const safeName = config.name.replace(/[^a-z0-9-_]+/gi, '_').toLowerCase();

  return {
    blob,
    dataUrl,
    filename: `mockup-${safeName || config.id}.${ext}`,
    screenshotIncluded,
    screenshotAttempted,
  };
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Render and trigger a browser download. */
export async function exportMockup(
  config: MockupConfig,
  websiteUrl: string,
  opts?: ExportOptions,
): Promise<ExportResult> {
  const result = await renderMockup(config, websiteUrl, opts);
  downloadBlob(result.blob, result.filename);
  return result;
}
