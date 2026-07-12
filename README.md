# LiveMockup Studio

Browser-only mockup generator. Drop in any URL, see it embedded perspective-correct
across any number of device frames, and export production-ready PNGs. No
backend, no AI, no Gemini.

## Quick start

```bash
npm install
npm run dev
```
OR
npm run build && electron-builder --mac --x64

Open [http://localhost:3000](http://localhost:3000), enter a URL in the top bar,
and select mockups to export.

## 1. Stack

- **Frontend**: React 19, TypeScript, Vite 6, Tailwind v4
- **Animations**: `motion` (Framer Motion)
- **Rasterizer**: pure Canvas 2D with triangle-mesh perspective warping —
  no `html-to-image`, no `html2canvas`, no foreignObject
- **Storage**: `localStorage` for user mockup configs (image + corner points)
- **Math**: dependency-free 8×8 Gauss-Jordan solver for the projective homography

There are no AI dependencies. The previous `@google/genai`, `claude`, `express`
and `dotenv` packages have been removed.

## 2. Architecture

```
+----------------------+        +-----------------------+
| Header (URL + state) |        | CalibrationModal      |
+----------+-----------+        | 4 corner handles      |
           |                    +-----------+-----------+
           v                                |
+----------------------+                    v
| MockupCell (gallery) |        +-----------------------+
| <img mockup>         |        | localStorage v2       |
| <iframe matrix3d>    |        | { id, corners, ... }  |
+----------+-----------+        +-----------+-----------+
           |                                |
           | export                         |
           v                                v
+----------------------+   +----------------------------+
| lib/export.ts        |<--+ lib/screenshot.ts          |
| hidden composite DOM |   | microlink / thum.io / etc. |
| html-to-image -> PNG |   +----------------------------+
+----------------------+
```

## 3. Core modules

### 3.1 [src/lib/perspective.ts](src/lib/perspective.ts)

Given a source rectangle `W × H` and four destination corner points
(`tl, tr, br, bl`), computes the 8 coefficients of a 2D projective transform
and packs them into a CSS `matrix3d(...)` string. This is the standard
homography used by Photoshop's "Distort" tool and by CSS warps.

### 3.2 [src/components/MockupCell.tsx](src/components/MockupCell.tsx)

Renders the live preview. The iframe is rendered at a fixed pixel size
(1280×800 by default) and warped onto the mockup image's screen area via
`transform: matrix3d(...)`. Scrolling and clicking inside the warped iframe
work as expected — pointer events follow the projective map.

### 3.3 [src/components/CalibrationModal.tsx](src/components/CalibrationModal.tsx)

Four draggable handles (`TL`, `TR`, `BR`, `BL`) plus a live perspective preview
of `react.dev` showing the result as you drag. The SVG outline updates in real
time. "Reset to rectangle" snaps back to a clean axis-aligned box.

### 3.4 [src/lib/screenshot.ts](src/lib/screenshot.ts)

Configurable screenshot provider used by the export pipeline.

| Provider     | Key required | Notes                                      |
| ------------ | ------------ | ------------------------------------------ |
| `microlink`  | optional     | Default. ~50 req/day free, no signup.      |
| `thum-io`    | no           | Free, no signup, has a small watermark.    |
| `custom`     | depends      | Any endpoint with a `{url}` placeholder.   |

Configure in `.env` (see [`.env.example`](.env.example)):

```bash
VITE_SCREENSHOT_PROVIDER="microlink"
VITE_SCREENSHOT_API_KEY=""
VITE_SCREENSHOT_CUSTOM_URL=""
```

Manual override is also supported: `setManualScreenshot(url, dataUrl)` injects
a user-uploaded image for a given URL.

### 3.5 [src/lib/export.ts](src/lib/export.ts)

The reason exports look correct now:

1. Load the mockup image at its **native** resolution
2. Fetch a screenshot of the target URL via the configured provider and
   convert it to a CORS-clean `data:` URL
3. Create an offscreen `<canvas>` at the mockup's native size
4. Subdivide the screenshot into a 24×24 grid of triangles, compute the affine
   map for each triangle from the projective homography, and draw it onto the
   canvas. This gives sub-pixel-accurate perspective warping without WebGL.
5. Draw the mockup photo on top so the bezel covers any over-spill
6. `canvas.toBlob('image/png')` → trigger a download

Crucially, the export does **not** screenshot the gallery card — no checkboxes,
buttons, padding or shadows end up in the output. And because nothing is ever
cloned into the document, there's no "tainted canvas" risk and no library
quirks: just two `Image` objects, one `<canvas>`, and `drawImage` calls.

## 4. CORS, X-Frame-Options, CSP & iframe proxy

The live preview uses a real `<iframe>`. Sites that send `X-Frame-Options: DENY`
or a restrictive `Content-Security-Policy` (e.g. `frame-ancestors 'none'`) can
block embedding in the preview — the browser enforces this on the **navigation
response** when you load the site directly.

### HTML proxy (dev / self-hosted)

`npm run dev` starts **two** processes: the Node iframe proxy (port **8787**) and
Vite. In development, `vite.config.ts` injects `VITE_IFRAME_PROXY_BASE=/__iframe-proxy`
by default so the browser loads previews **same-origin** (works with `localhost`
or a LAN IP). Vite forwards `/__iframe-proxy/*` to `http://127.0.0.1:8787`.

To run Vite alone without the proxy: `npm run dev:vite`.

For production builds, set `VITE_IFRAME_PROXY_BASE` at build time to a **full**
origin (e.g. `https://proxy.example.com`) if you host the proxy separately; otherwise
previews use direct `https://…` URLs again.

The proxy fetches the target HTML server-side, does not forward framing-related
upstream headers, strips common CSP `<meta>` tags, injects `<base href="…">` for
relative assets, and returns HTML from the proxy path/origin so the iframe can
load. **Limits:** some SPAs inspect `location.origin` and break. **Security:** never
expose an open proxy without `PROXY_ALLOW_HOSTS`, rate limits, and auth — see
[proxy-server/iframe-proxy.mjs](proxy-server/iframe-proxy.mjs). `PROXY_DENY_PRIVATE=1`
(default) blocks localhost and private IPs after DNS.

Env for the Node proxy: `PORT` (default 8787), `PROXY_ALLOW_HOSTS`, `PROXY_DENY_PRIVATE`,
`PROXY_MAX_BYTES`, `PROXY_TIMEOUT_MS`. `GET /health` returns `ok`.

When a proxy base is active, the header badge no longer shows the heuristic
“Iframe blocked” list for known domains.

**Export:** previews may go through the proxy, but `fetchScreenshot` always uses the
**canonical page URL** (Microlink / custom provider). Screenshot services run on the
public internet and cannot reach `localhost`; the live site URL is the correct input.

## 5. User workflow

1. Type a URL into the bar at the top.
2. The gallery renders that URL in all device frames, perspective-correct.
3. Optionally click **Upload Mockup** to add your own photo. Drag the four
   corner handles onto the screen edges in the calibration modal, save.
4. Tick the checkboxes on whichever mockups you want and hit **Export Selected**
   for a batch download, or use the camera icon on any card for a single export.

## 6. Data persistence

User-uploaded mockups are stored under `live-mockup-studio-custom-configs-v2`
in `localStorage`. Legacy v1 entries (rectangle-based) are automatically
migrated to the new four-corner format on load.

## 7. Default mockups

Three hand-built SVG device frames ship as defaults: a laptop, a smartphone
and a tablet — see [src/lib/deviceFrames.ts](src/lib/deviceFrames.ts). All
three are axis-aligned by design, so the perspective math demos cleanly with
user-uploaded photos. A fourth default is a **3D laptop** scene (React Three Fiber).

## 8. Mockup modes

- **Flat (2D)**: perspective iframe over the frame image. Built-in SVG frames
  support **gear icon** color theming (bezel / hinge / base where applicable)
  and an optional **transparent stage** behind the device. Export uses the same
  Canvas 2D pipeline as before.
- **3D**: WebGL preview with **OrbitControls**; **Studio** opens a fullscreen WYSIWYG
  workspace (toolbar, transform gizmo, grid, outliner, lighting and materials). Export
  renders a one-off WebGL frame to PNG (always PNG for this path).
