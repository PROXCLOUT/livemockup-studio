/**
 * Iframe HTML proxy + optional headless screenshots (same `/iframe` document as the UI).
 *
 * Run: node proxy-server/iframe-proxy.mjs
 *
 * Env:
 *   PORT                     default 8787
 *   PROXY_ALLOW_HOSTS        comma-separated hostnames (e.g. creo-code.at,www.foo.com).
 *                            If set, only these hosts (exact or subdomain) are allowed.
 *   PROXY_DENY_PRIVATE       default "1" — block localhost/private IPs (hostname + DNS).
 *   PROXY_MAX_BYTES          default 2097152 (2 MiB)
 *   PROXY_TIMEOUT_MS         default 25000
 *
 * Screenshots (`GET /screenshot?url=&width=&height=&scrollX=&scrollY=&scale=`):
 *   Optional `scale` (1–3): Playwright deviceScaleFactor — larger PNG at same CSS viewport.
 *   Requires devDependency `playwright` (from project root: `npm install`).
 *   First run may need browsers: `npx playwright install chromium`
 */

import http from 'node:http';
import { URL } from 'node:url';
import dns from 'node:dns/promises';

const PORT = Number(process.env.PORT) || 8787;
const MAX_BYTES = Number(process.env.PROXY_MAX_BYTES) || 2 * 1024 * 1024;
const TIMEOUT_MS = Number(process.env.PROXY_TIMEOUT_MS) || 25_000;
const DENY_PRIVATE = process.env.PROXY_DENY_PRIVATE !== '0';
const SELF_ORIGIN = `http://127.0.0.1:${PORT}`;
const SCREENSHOT_MAX_SIDE = 4096;
const SCREENSHOT_SETTLE_MS = 1500;
const SCREENSHOT_SCROLL_PAUSE_MS = 250;

const allowHosts = (process.env.PROXY_ALLOW_HOSTS ?? '')
  .split(',')
  .map((h) => h.trim().toLowerCase())
  .filter(Boolean);

function isPrivateIPv4(parts) {
  if (parts.length !== 4 || parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)) {
    return true;
  }
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

function ipv4FromHostname(hostname) {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(hostname);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])];
}

function isPrivateIPv6(addr) {
  const a = addr.toLowerCase();
  if (a === '::1') return true;
  if (a.startsWith('fe80:')) return true;
  if (a.startsWith('fc') || a.startsWith('fd')) return true;
  return false;
}

function hostAllowed(hostname) {
  const h = hostname.toLowerCase();
  if (allowHosts.length === 0) return true;
  return allowHosts.some(
    (allowed) => h === allowed || h.endsWith(`.${allowed}`),
  );
}

async function assertSafeTarget(targetUrl) {
  let u;
  try {
    u = new URL(targetUrl);
  } catch {
    throw new Error('invalid url');
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new Error('only http(s)');
  }
  if (!hostAllowed(u.hostname)) {
    throw new Error('host not allowed');
  }
  if (!DENY_PRIVATE) return;

  const v4 = ipv4FromHostname(u.hostname);
  if (v4) {
    if (isPrivateIPv4(v4)) throw new Error('private host');
    return;
  }
  if (u.hostname === 'localhost') throw new Error('private host');

  const { address, family } = await dns.lookup(u.hostname, { verbatim: true });
  if (family === 4) {
    const parts = address.split('.').map(Number);
    if (isPrivateIPv4(parts)) throw new Error('private host');
  } else if (family === 6 && isPrivateIPv6(address)) {
    throw new Error('private host');
  }
}

function baseHrefForPage(targetUrl) {
  const u = new URL(targetUrl);
  u.hash = '';
  return new URL('.', u).href;
}

function transformHtml(html, targetUrl) {
  let out = html.replace(
    /<meta[^>]*http-equiv\s*=\s*["']?content-security-policy["']?[^>]*>/gi,
    '',
  );
  out = out.replace(/<base[^>]*>/gi, '');
  const base = baseHrefForPage(targetUrl);
  const inject = `<base href="${base.replace(/"/g, '&quot;')}">`;
  if (/<head[^>]*>/i.test(out)) {
    out = out.replace(/<head[^>]*>/i, (m) => `${m}${inject}`);
  } else {
    out = `${inject}${out}`;
  }
  return out;
}

async function readBodyLimited(res) {
  const reader = res.body.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BYTES) {
      reader.cancel();
      throw new Error('response too large');
    }
    chunks.push(value);
  }
  const buf = Buffer.concat(chunks.map((c) => Buffer.from(c)));
  return buf;
}

async function proxyFetch(targetUrl) {
  await assertSafeTarget(targetUrl);
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(targetUrl, {
      method: 'GET',
      redirect: 'follow',
      signal: ac.signal,
      headers: {
        'user-agent': 'livemockup-iframe-proxy/1.0',
        accept: 'text/html,application/xhtml+xml,*/*;q=0.8',
      },
    });
    const buf = await readBodyLimited(res);
    return { res, buf };
  } finally {
    clearTimeout(t);
  }
}

function sendJson(res, status, obj, extraHeaders = {}) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'access-control-allow-origin': '*',
    ...extraHeaders,
  });
  res.end(body);
}

let pwBrowser = null;
/** @type {Promise<void>} */
let pwScreenshotChain = Promise.resolve();

async function loadPlaywrightChromium() {
  try {
    const pw = await import('playwright');
    return pw.chromium;
  } catch {
    return null;
  }
}

async function closePwBrowser() {
  if (pwBrowser) {
    try {
      await pwBrowser.close();
    } catch {
      /* ok */
    }
    pwBrowser = null;
  }
}

/**
 * @param {{ targetUrl: string, width: number, height: number, scrollX: number, scrollY: number, scale: number }} p
 */
async function takePlaywrightScreenshot(p) {
  const chromium = await loadPlaywrightChromium();
  if (!chromium) {
    const err = new Error('playwright module or browsers missing');
    err.code = 'PLAYWRIGHT_UNAVAILABLE';
    throw err;
  }

  await assertSafeTarget(p.targetUrl);
  const inner = `${SELF_ORIGIN}/iframe?url=${encodeURIComponent(p.targetUrl)}`;

  if (!pwBrowser || !pwBrowser.isConnected()) {
    await closePwBrowser();
    pwBrowser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
  }

  const scale = Number.isFinite(p.scale) && p.scale > 0 ? p.scale : 1;
  const context = await pwBrowser.newContext({
    viewport: { width: p.width, height: p.height },
    deviceScaleFactor: scale,
  });
  const page = await context.newPage();
  try {
    await page.goto(inner, { waitUntil: 'domcontentloaded', timeout: TIMEOUT_MS });
    await new Promise((r) => setTimeout(r, SCREENSHOT_SETTLE_MS));
    await page.evaluate(
      ([sx, sy]) => {
        window.scrollTo(sx, sy);
      },
      [p.scrollX, p.scrollY],
    );
    await new Promise((r) => setTimeout(r, SCREENSHOT_SCROLL_PAUSE_MS));
    return await page.screenshot({
      type: 'png',
      clip: { x: 0, y: 0, width: p.width, height: p.height },
    });
  } finally {
    await context.close();
  }
}

function enqueueScreenshot(asyncFn) {
  const done = pwScreenshotChain.then(() => asyncFn());
  pwScreenshotChain = done.then(
    () => undefined,
    () => undefined,
  );
  return done;
}

function corsImageHeaders() {
  return {
    'content-type': 'image/png',
    'cache-control': 'no-store',
    'access-control-allow-origin': '*',
  };
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'content-type': 'text/plain', 'cache-control': 'no-store' });
    res.end('ok');
    return;
  }

  if (req.method === 'GET' && req.url?.startsWith('/screenshot')) {
    let q;
    try {
      q = new URL(req.url, SELF_ORIGIN);
    } catch {
      sendJson(res, 400, { error: 'bad query' });
      return;
    }

    const target = q.searchParams.get('url');
    if (!target) {
      sendJson(res, 400, { error: 'missing url' });
      return;
    }

    const width = Math.min(
      SCREENSHOT_MAX_SIDE,
      Math.max(1, Number.parseInt(q.searchParams.get('width') ?? '1280', 10) || 1280),
    );
    const height = Math.min(
      SCREENSHOT_MAX_SIDE,
      Math.max(1, Number.parseInt(q.searchParams.get('height') ?? '800', 10) || 800),
    );
    const scrollX = Number.parseInt(q.searchParams.get('scrollX') ?? '0', 10) || 0;
    const scrollY = Number.parseInt(q.searchParams.get('scrollY') ?? '0', 10) || 0;
    const scaleRaw = Number.parseInt(q.searchParams.get('scale') ?? '1', 10) || 1;
    const scale = Math.min(3, Math.max(1, scaleRaw));

    try {
      const png = await enqueueScreenshot(async () =>
        takePlaywrightScreenshot({
          targetUrl: target,
          width,
          height,
          scrollX,
          scrollY,
          scale,
        }),
      );
      res.writeHead(200, corsImageHeaders());
      res.end(png);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const code = e && typeof e === 'object' && 'code' in e ? e.code : '';
      if (code === 'PLAYWRIGHT_UNAVAILABLE') {
        sendJson(res, 503, {
          error: 'Playwright nicht verfügbar. Im Projektroot: npm install && npx playwright install chromium',
          code: 'PLAYWRIGHT_UNAVAILABLE',
        });
        return;
      }
      if (msg === 'host not allowed' || msg === 'private host') {
        sendJson(res, 403, { error: msg });
        return;
      }
      console.error('[iframe-proxy] screenshot', msg);
      sendJson(res, 502, { error: msg });
    }
    return;
  }

  if (req.method !== 'GET' || !req.url?.startsWith('/iframe')) {
    res.writeHead(404, { 'cache-control': 'no-store' });
    res.end('not found');
    return;
  }

  let target;
  try {
    const q = new URL(req.url, SELF_ORIGIN);
    target = q.searchParams.get('url');
  } catch {
    sendJson(res, 400, { error: 'bad query' });
    return;
  }

  if (!target) {
    sendJson(res, 400, { error: 'missing url' });
    return;
  }

  let upstream;
  try {
    upstream = await proxyFetch(target);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const code = msg === 'host not allowed' || msg === 'private host' ? 403 : 502;
    sendJson(res, code, { error: msg });
    return;
  }

  const { res: upRes, buf } = upstream;
  const ct = upRes.headers.get('content-type') ?? 'application/octet-stream';
  const isHtml = ct.split(';')[0].trim().toLowerCase() === 'text/html';

  let body = buf;
  if (isHtml) {
    const charsetMatch = /charset\s*=\s*["']?([^"';\s]+)/i.exec(ct);
    const enc = charsetMatch?.[1]?.toLowerCase() || 'utf-8';
    try {
      const decoder = new TextDecoder(enc === 'utf8' ? 'utf-8' : enc);
      let html = decoder.decode(buf);
      html = transformHtml(html, target);
      body = Buffer.from(html, 'utf-8');
    } catch {
      body = buf;
    }
  }

  res.writeHead(upRes.ok ? 200 : upRes.status, {
    'content-type': isHtml ? 'text/html; charset=utf-8' : ct,
    'cache-control': 'no-store',
  });
  res.end(body);
});

server.on('error', (err) => {
  console.error('[iframe-proxy]', err.message);
  process.exit(1);
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, async () => {
    await closePwBrowser();
    process.exit(0);
  });
}

server.listen(PORT, '0.0.0.0', () => {
  console.error(
    `[iframe-proxy] http://0.0.0.0:${PORT}/iframe?url=…  /screenshot?url=…  allowHosts=${allowHosts.length ? allowHosts.join(',') : '(any public)'} denyPrivate=${DENY_PRIVATE}`,
  );
});
