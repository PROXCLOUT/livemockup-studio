/**
 * Screenshot service used by the export pipeline (and by `useScreenshot` for
 * UI status). Returns CORS-clean data: URLs so they can be drawn into a
 * canvas without tainting.
 *
 * When the iframe proxy is enabled (`VITE_IFRAME_PROXY_BASE`), the app first
 * requests `GET …/screenshot` on that proxy (Playwright renders the same
 * `/iframe` HTML as the live preview, including scroll). If that fails
 * (Playwright missing, etc.), it falls back to the configured provider.
 *
 * Env:
 *   VITE_SCREENSHOT_PROVIDER   "microlink" | "thum-io" | "custom"
 *   VITE_SCREENSHOT_API_KEY    optional key for paid microlink
 *   VITE_SCREENSHOT_CUSTOM_URL endpoint with {url} placeholder
 *   VITE_SCREENSHOT_SKIP_IFRAME_PROXY  "1" to never call the proxy screenshot route
 */

import {
  buildProxyScreenshotAbsoluteUrl,
  isIframeProxyEnabled,
} from './iframeUrl';

export type ScreenshotProvider = 'microlink' | 'thum-io' | 'custom';

export interface ScreenshotOptions {
  width?: number;
  height?: number;
  /** When set and `height` omitted: `height = round(width / contentAspect)` (mockup screen ratio). */
  contentAspect?: number;
  /** Document scroll in CSS px (proxy screenshot only; matches live iframe). */
  scrollX?: number;
  scrollY?: number;
  /**
   * Iframe-proxy only: Playwright `deviceScaleFactor` (1–3). Sharper bitmap at the same CSS viewport.
   * Microlink / other providers ignore this.
   */
  devicePixelRatio?: number;
}

const DEFAULT_WIDTH = 1280;

interface EnvShape {
  VITE_SCREENSHOT_PROVIDER?: string;
  VITE_SCREENSHOT_API_KEY?: string;
  VITE_SCREENSHOT_CUSTOM_URL?: string;
  VITE_SCREENSHOT_SKIP_IFRAME_PROXY?: string;
}

function env(): EnvShape {
  return (import.meta as unknown as { env: EnvShape }).env ?? {};
}

export function getProvider(): ScreenshotProvider {
  const v = env().VITE_SCREENSHOT_PROVIDER;
  if (v === 'thum-io' || v === 'custom') return v;
  return 'microlink';
}

function skipIframeProxyScreenshot(): boolean {
  const v = env().VITE_SCREENSHOT_SKIP_IFRAME_PROXY?.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === 'string') resolve(result);
      else reject(new Error('FileReader returned non-string result'));
    };
    reader.onerror = () => reject(reader.error ?? new Error('FileReader error'));
    reader.readAsDataURL(blob);
  });
}

async function fetchImageAsDataUrl(url: string): Promise<string> {
  const res = await fetch(url, { method: 'GET', mode: 'cors' });
  if (!res.ok) {
    throw new Error(`Screenshot fetch ${res.status} ${res.statusText} for ${url}`);
  }
  const contentType = res.headers.get('content-type') ?? '';
  const blob = await res.blob();
  if (!contentType.startsWith('image/') && !blob.type.startsWith('image/')) {
    throw new Error(`Screenshot response was not an image (got "${contentType || blob.type || 'unknown'}")`);
  }
  return blobToDataUrl(blob);
}

interface MicrolinkResponse {
  status: 'success' | 'fail';
  message?: string;
  data?: {
    screenshot?: { url?: string };
  };
}

async function fetchMicrolink(
  pageUrl: string,
  opts: ScreenshotOptions,
): Promise<string> {
  const params = new URLSearchParams({
    url: pageUrl,
    screenshot: 'true',
    meta: 'false',
    'viewport.width': String(opts.width ?? DEFAULT_WIDTH),
    'viewport.height': String(
      opts.height ?? Math.round((opts.width ?? DEFAULT_WIDTH) * 0.625),
    ),
    waitForTimeout: '1500',
  });
  const apiKey = env().VITE_SCREENSHOT_API_KEY ?? '';
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (apiKey) headers['x-api-key'] = apiKey;

  const res = await fetch(`https://api.microlink.io/?${params.toString()}`, {
    method: 'GET',
    mode: 'cors',
    headers,
  });
  if (!res.ok) {
    throw new Error(`Microlink API ${res.status} ${res.statusText}`);
  }
  const json = (await res.json()) as MicrolinkResponse;
  if (json.status !== 'success' || !json.data?.screenshot?.url) {
    throw new Error(`Microlink failed: ${json.message ?? 'no screenshot URL'}`);
  }
  return fetchImageAsDataUrl(json.data.screenshot.url);
}

async function fetchThumIo(
  pageUrl: string,
  opts: ScreenshotOptions,
): Promise<string> {
  const width = opts.width ?? DEFAULT_WIDTH;
  const url = `https://image.thum.io/get/width/${width}/${pageUrl}`;
  return fetchImageAsDataUrl(url);
}

async function fetchCustom(
  pageUrl: string,
): Promise<string> {
  const tmpl = env().VITE_SCREENSHOT_CUSTOM_URL ?? '';
  if (!tmpl) throw new Error('VITE_SCREENSHOT_CUSTOM_URL is empty');
  const url = tmpl.replace('{url}', encodeURIComponent(pageUrl));
  return fetchImageAsDataUrl(url);
}

interface CacheEntry {
  dataUrl: string;
  loadedAt: number;
}

const memoryCache = new Map<string, CacheEntry>();
const manualOverrides = new Map<string, string>();
const inFlight = new Map<string, Promise<string>>();

/** Viewport height in CSS px for a given mockup `contentAspect` (width/height). */
export function screenshotViewportHeightPx(
  width: number,
  contentAspect: number | null | undefined,
): number {
  if (contentAspect != null && contentAspect > 0) {
    return Math.round(width / contentAspect);
  }
  return Math.round(width * 0.625);
}

function resolvedViewport(opts: ScreenshotOptions): { width: number; height: number } {
  const width = opts.width ?? DEFAULT_WIDTH;
  if (opts.height != null) return { width, height: opts.height };
  if (opts.contentAspect != null && opts.contentAspect > 0) {
    return { width, height: Math.round(width / opts.contentAspect) };
  }
  return { width, height: Math.round(width * 0.625) };
}

function cacheKey(url: string, opts: ScreenshotOptions): string {
  const { width, height } = resolvedViewport(opts);
  const sx = opts.scrollX ?? 0;
  const sy = opts.scrollY ?? 0;
  const dpr = Math.min(3, Math.max(1, Math.round(opts.devicePixelRatio ?? 1)));
  return `${url}::${width}::${height}::${sx}::${sy}::${dpr}`;
}

/** Force a user-uploaded screenshot to be used for a URL. */
export function setManualScreenshot(pageUrl: string, dataUrl: string) {
  manualOverrides.set(pageUrl, dataUrl);
}

export function clearManualScreenshot(pageUrl: string) {
  manualOverrides.delete(pageUrl);
}

export function hasManualScreenshot(pageUrl: string): boolean {
  return manualOverrides.has(pageUrl);
}

/**
 * Same HTML as the in-app iframe; requires Playwright on the proxy process
 * (`npm install` in project root, optionally `npx playwright install chromium`).
 */
async function tryFetchProxyScreenshot(
  pageUrl: string,
  opts: ScreenshotOptions,
): Promise<string | null> {
  if (!isIframeProxyEnabled() || skipIframeProxyScreenshot()) return null;
  const { width, height } = resolvedViewport(opts);
  const dpr = Math.min(3, Math.max(1, Math.round(opts.devicePixelRatio ?? 1)));
  const abs = buildProxyScreenshotAbsoluteUrl(pageUrl, {
    width,
    height,
    scrollX: opts.scrollX,
    scrollY: opts.scrollY,
    devicePixelRatio: dpr,
  });
  if (!abs) return null;

  try {
    const res = await fetch(abs, { method: 'GET', mode: 'cors' });
    const ct = res.headers.get('content-type') ?? '';
    if (ct.includes('application/json')) {
      await res.json().catch(() => null);
      return null;
    }
    if (!res.ok) return null;
    const blob = await res.blob();
    if (!blob.type.startsWith('image/')) return null;
    return blobToDataUrl(blob);
  } catch {
    return null;
  }
}

async function fetchViaProvider(pageUrl: string, opts: ScreenshotOptions): Promise<string> {
  const provider = getProvider();
  if (provider === 'thum-io') return fetchThumIo(pageUrl, opts);
  if (provider === 'custom') return fetchCustom(pageUrl);
  return fetchMicrolink(pageUrl, opts);
}

/**
 * Fetch a screenshot of `pageUrl` as a data: URL. Tries the configured
 * provider; if no manual override is set, the error propagates
 * so callers can decide how to fall back.
 */
export async function fetchScreenshot(
  pageUrl: string,
  opts: ScreenshotOptions = {},
): Promise<string> {
  if (manualOverrides.has(pageUrl)) {
    return manualOverrides.get(pageUrl)!;
  }
  const key = cacheKey(pageUrl, opts);
  const cached = memoryCache.get(key);
  if (cached) return cached.dataUrl;

  const existing = inFlight.get(key);
  if (existing) return existing;

  const promise = (async () => {
    const fromProxy = await tryFetchProxyScreenshot(pageUrl, opts);
    if (fromProxy) {
      memoryCache.set(key, { dataUrl: fromProxy, loadedAt: Date.now() });
      return fromProxy;
    }
    const dataUrl = await fetchViaProvider(pageUrl, opts);
    memoryCache.set(key, { dataUrl, loadedAt: Date.now() });
    return dataUrl;
  })();

  inFlight.set(key, promise);
  try {
    return await promise;
  } finally {
    inFlight.delete(key);
  }
}

export function invalidateScreenshot(pageUrl?: string) {
  if (!pageUrl) {
    memoryCache.clear();
    return;
  }
  for (const key of [...memoryCache.keys()]) {
    if (key.startsWith(`${pageUrl}::`)) memoryCache.delete(key);
  }
}
