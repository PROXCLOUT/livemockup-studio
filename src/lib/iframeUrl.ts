/**
 * Optional HTML proxy for live iframe previews (X-Frame-Options / CSP).
 *
 * `VITE_IFRAME_PROXY_BASE` may be:
 * - Absolute origin, e.g. `https://proxy.example.com` (no trailing `/iframe`)
 * - Same-origin path prefix in dev, e.g. `/__iframe-proxy` (Vite forwards to the Node proxy)
 *
 * Export: `buildProxyScreenshotAbsoluteUrl` hits the proxy’s `/screenshot` (Playwright, same
 * HTML as `/iframe`). Otherwise screenshot providers use the canonical page URL.
 */

function proxyBase(): string {
  const raw = import.meta.env.VITE_IFRAME_PROXY_BASE ?? '';
  if (typeof raw !== 'string') return '';
  const t = raw.trim();
  if (!t) return '';
  // Path prefix: keep single leading slash, trim trailing slashes only on the right
  if (t.startsWith('/')) return t.replace(/\/+$/, '') || '/';
  return t.replace(/\/+$/, '');
}

export function isIframeProxyEnabled(): boolean {
  return proxyBase().length > 0;
}

/**
 * Maps a page URL to the iframe `src`. When no proxy is configured, returns `url` unchanged.
 */
export function buildIframeSrc(url: string): string {
  if (!url || !/^https?:\/\//i.test(url)) return url;
  const base = proxyBase();
  if (!base) return url;
  const q = `/iframe?url=${encodeURIComponent(url)}`;
  if (base.startsWith('/')) {
    const root = base === '/' ? '' : base;
    return `${root}${q}`;
  }
  return `${base}${q}`;
}

export interface ProxyScreenshotQuery {
  width: number;
  height: number;
  scrollX?: number;
  scrollY?: number;
  /** Playwright `deviceScaleFactor` (1–3), query `scale` on the proxy. */
  devicePixelRatio?: number;
}

/**
 * Absolute URL for `GET …/screenshot` on the iframe proxy (same document as `buildIframeSrc`,
 * rendered headlessly). Returns `null` when no proxy is configured.
 */
export function buildProxyScreenshotAbsoluteUrl(
  pageUrl: string,
  opts: ProxyScreenshotQuery,
): string | null {
  if (!pageUrl || !/^https?:\/\//i.test(pageUrl)) return null;
  const base = proxyBase();
  if (!base) return null;

  const q = new URLSearchParams();
  q.set('url', pageUrl);
  q.set('width', String(Math.max(1, Math.round(opts.width))));
  q.set('height', String(Math.max(1, Math.round(opts.height))));
  const sx = opts.scrollX ?? 0;
  const sy = opts.scrollY ?? 0;
  if (sx !== 0) q.set('scrollX', String(Math.round(sx)));
  if (sy !== 0) q.set('scrollY', String(Math.round(sy)));
  const scale = Math.min(
    3,
    Math.max(1, Math.round(opts.devicePixelRatio ?? 1)),
  );
  q.set('scale', String(scale));

  const path = `${base.replace(/\/+$/, '')}/screenshot?${q.toString()}`;
  if (base.startsWith('/')) {
    if (typeof window === 'undefined' || !window.location?.origin) return null;
    return `${window.location.origin}${path}`;
  }
  return path;
}
