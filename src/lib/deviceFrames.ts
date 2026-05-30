/**
 * Hand-authored SVG device frames used as default mockups. Each frame defines
 * a known viewport rectangle in image-relative percentages, so the perspective
 * calibration is deterministic out of the box.
 *
 * Users can still upload arbitrary photos (with angled/perspective screens)
 * and calibrate them via the four-corner editor.
 */

import type { BuiltinFrameId, FlatAppearance, MockupConfig } from '../types';

/** Pixelmaße der eingebauten SVGs (identisch mit `viewBox` in den Buildern). */
export function getBuiltinFrameIntrinsicSize(
  config: Pick<MockupConfig, 'builtinFrame' | 'renderMode'>,
): { w: number; h: number } | null {
  if (config.renderMode === 'three') return null;
  switch (config.builtinFrame) {
    case 'laptop':
    case 'studioLaptop':
      return { w: 1600, h: 1000 };
    case 'phone':
    case 'studioPhoneNotch':
    case 'studioPhoneIsland':
      return { w: 700, h: 1400 };
    case 'tablet':
    case 'studioTablet':
    case 'studioTabletThin':
      return { w: 1400, h: 1000 };
    case 'studioMonitor':
      return { w: 1600, h: 1000 };
    case 'studioDeskLaptopPhone':
      return { w: 2200, h: 1000 };
    case 'studioTabletPhoneCombo':
      return { w: 2200, h: 1000 };
    case 'printBusinessCard':
      return { w: 1600, h: 1008 };
    case 'printPoster':
      return { w: 1400, h: 2000 };
    case 'printFlyer':
      return { w: 1200, h: 1700 };
    case 'printGeneric':
      return { w: 1600, h: 1600 };
    default:
      return null;
  }
}

const MAX_EXPORT_WIDTH_CAP = 8192;
const MAX_SCREENSHOT_DEVICE_SCALE = 3;

/**
 * Playwright `deviceScaleFactor` when exporting wider than the frame’s native bitmap width.
 * Keeps CSS viewport at logical size; multiplies screenshot pixels for sharp upscales.
 * Preview screenshots always use 1.
 */
export function getScreenshotDevicePixelRatio(
  config: MockupConfig,
  maxOutputWidth: number | null | undefined,
): number {
  const dim = getBuiltinFrameIntrinsicSize(config);
  const nativeW = dim != null && dim.w > 0 ? dim.w : 1600;
  const exportW =
    maxOutputWidth != null && maxOutputWidth > 0
      ? Math.min(MAX_EXPORT_WIDTH_CAP, Math.max(1, Math.floor(maxOutputWidth)))
      : nativeW;
  return Math.min(
    MAX_SCREENSHOT_DEVICE_SCALE,
    Math.max(1, Math.ceil(exportW / Math.max(1, nativeW))),
  );
}

function asDataUrl(svg: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/** 1×1 transparent GIF — placeholder when `renderMode === 'three'`. */
export const TRANSPARENT_PIXEL_GIF =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

function parseHex(hex: string): { r: number; g: number; b: number } | null {
  const h = hex.trim().replace('#', '');
  if (h.length === 3) {
    return {
      r: parseInt(h[0] + h[0], 16),
      g: parseInt(h[1] + h[1], 16),
      b: parseInt(h[2] + h[2], 16),
    };
  }
  if (h.length === 6) {
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
    };
  }
  return null;
}

function shadeHex(hex: string, factor: number): string {
  const rgb = parseHex(hex);
  if (!rgb) return hex;
  const r = Math.round(rgb.r * factor);
  const g = Math.round(rgb.g * factor);
  const b = Math.round(rgb.b * factor);
  const to = (n: number) => n.toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
}

const DEFAULT_LAPTOP = {
  bezel: '#1f2937',
  bezelEnd: '#0f172a',
  hinge: '#334155',
  hingeEnd: '#1e293b',
  base: '#475569',
  baseEnd: '#1e293b',
  trackpad: '#0f172a',
};

const DEFAULT_PHONE = {
  bezel: '#1f2937',
  bezelEnd: '#0b1220',
  notch: '#0b1220',
  camRing: '#1f2937',
};

const DEFAULT_TABLET = {
  bezel: '#1f2937',
  bezelEnd: '#0b1220',
  detail: '#0b1220',
};

export function buildLaptopFrameDataUrl(appearance?: FlatAppearance): string {
  const a = appearance ?? {};
  const bezel0 = a.bezel ?? DEFAULT_LAPTOP.bezel;
  const bezel1 = a.bezel ? shadeHex(a.bezel, 0.55) : DEFAULT_LAPTOP.bezelEnd;
  const hinge0 = a.hinge ?? DEFAULT_LAPTOP.hinge;
  const hinge1 = a.hinge ? shadeHex(a.hinge, 0.6) : DEFAULT_LAPTOP.hingeEnd;
  const base0 = a.base ?? DEFAULT_LAPTOP.base;
  const base1 = a.base ? shadeHex(a.base, 0.55) : DEFAULT_LAPTOP.baseEnd;
  const trackpad = a.bezel ? shadeHex(a.bezel, 0.45) : DEFAULT_LAPTOP.trackpad;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000" shape-rendering="geometricPrecision">
  <defs>
    <linearGradient id="bezel" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${bezel0}"/>
      <stop offset="1" stop-color="${bezel1}"/>
    </linearGradient>
    <linearGradient id="hinge" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${hinge0}"/>
      <stop offset="1" stop-color="${hinge1}"/>
    </linearGradient>
    <linearGradient id="base" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${base0}"/>
      <stop offset="1" stop-color="${base1}"/>
    </linearGradient>
  </defs>
  <rect x="120" y="60" width="1360" height="800" rx="24" fill="url(#bezel)"/>
  <rect x="160" y="100" width="1280" height="720" rx="6" fill="#020617"/>
  <rect x="60" y="860" width="1480" height="40" rx="12" fill="url(#hinge)"/>
  <path d="M40 900 L1560 900 L1500 960 L100 960 Z" fill="url(#base)"/>
  <rect x="700" y="900" width="200" height="20" rx="8" fill="${trackpad}"/>
</svg>`;
  return asDataUrl(svg);
}

export function buildPhoneFrameDataUrl(appearance?: FlatAppearance): string {
  const a = appearance ?? {};
  const b0 = a.bezel ?? DEFAULT_PHONE.bezel;
  const b1 = a.bezel ? shadeHex(a.bezel, 0.42) : DEFAULT_PHONE.bezelEnd;
  const notch = a.bezel ? shadeHex(a.bezel, 0.35) : DEFAULT_PHONE.notch;
  const cam = a.bezel ? shadeHex(a.bezel, 0.85) : DEFAULT_PHONE.camRing;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 700 1400" shape-rendering="geometricPrecision">
  <defs>
    <linearGradient id="pbezel" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${b0}"/>
      <stop offset="1" stop-color="${b1}"/>
    </linearGradient>
  </defs>
  <rect x="40" y="40" width="620" height="1320" rx="80" fill="url(#pbezel)"/>
  <rect x="70" y="80" width="560" height="1240" rx="56" fill="#020617"/>
  <rect x="280" y="92" width="140" height="22" rx="11" fill="${notch}"/>
  <circle cx="395" cy="103" r="6" fill="${cam}"/>
</svg>`;
  return asDataUrl(svg);
}

export function buildTabletFrameDataUrl(appearance?: FlatAppearance): string {
  const a = appearance ?? {};
  const b0 = a.bezel ?? DEFAULT_TABLET.bezel;
  const b1 = a.bezel ? shadeHex(a.bezel, 0.42) : DEFAULT_TABLET.bezelEnd;
  const detail = a.bezel ? shadeHex(a.bezel, 0.35) : DEFAULT_TABLET.detail;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1400 1000" shape-rendering="geometricPrecision">
  <defs>
    <linearGradient id="tbezel" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${b0}"/>
      <stop offset="1" stop-color="${b1}"/>
    </linearGradient>
  </defs>
  <rect x="40" y="40" width="1320" height="920" rx="48" fill="url(#tbezel)"/>
  <rect x="80" y="80" width="1240" height="840" rx="20" fill="#020617"/>
  <circle cx="700" cy="60" r="8" fill="${detail}"/>
  <rect x="690" y="935" width="20" height="20" rx="10" fill="${detail}"/>
</svg>`;
  return asDataUrl(svg);
}

/** Pixel-identical defaults (no `flatAppearance` overrides). */
export const LAPTOP_FRAME = buildLaptopFrameDataUrl();
export const PHONE_FRAME = buildPhoneFrameDataUrl();
export const TABLET_FRAME = buildTabletFrameDataUrl();

// ── Studio-Rahmen (Orientierung an MOCKUPS_EXAMPLE.html, SVG) ──────────────

const STUDIO_BEZEL = '#0a0a0a';
const STUDIO_SPACE = '#1d1d1f';

function buildStudioLaptopFrameDataUrl(appearance?: FlatAppearance): string {
  const bezel = appearance?.bezel ?? STUDIO_BEZEL;
  const hinge = appearance?.hinge ?? '#334155';
  const base = appearance?.base ?? '#a8a9ad';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000" shape-rendering="geometricPrecision">
  <defs>
    <linearGradient id="slBase" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#c8c9cc"/>
      <stop offset="0.4" stop-color="${base}"/>
      <stop offset="1" stop-color="#8e8f93"/>
    </linearGradient>
    <linearGradient id="slHinge" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${hinge}"/>
      <stop offset="1" stop-color="#1e293b"/>
    </linearGradient>
  </defs>
  <rect x="120" y="60" width="1360" height="800" rx="12" fill="${bezel}"/>
  <circle cx="800" cy="72" r="3" fill="#1a1a2e" stroke="rgba(255,255,255,0.12)" stroke-width="0.5"/>
  <rect x="160" y="100" width="1280" height="720" rx="4" fill="#000"/>
  <rect x="60" y="860" width="1480" height="40" rx="10" fill="url(#slHinge)"/>
  <path d="M40 900 L1560 900 L1520 958 L80 958 Z" fill="url(#slBase)"/>
  <rect x="740" y="902" width="120" height="4" rx="2" fill="#999"/>
  <rect x="700" y="912" width="200" height="18" rx="8" fill="#0f172a"/>
</svg>`;
  return asDataUrl(svg);
}

function buildStudioMonitorFrameDataUrl(): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000" shape-rendering="geometricPrecision">
  <defs>
    <linearGradient id="smNeck" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#a1a1a6"/>
      <stop offset="1" stop-color="#e3e4e6"/>
    </linearGradient>
    <linearGradient id="smStand" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#e3e4e6"/>
      <stop offset="1" stop-color="#ccc"/>
    </linearGradient>
    <linearGradient id="smChin" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#0f0f0f"/>
      <stop offset="1" stop-color="#1a1a1e"/>
    </linearGradient>
  </defs>
  <rect x="378" y="80" width="844" height="536" rx="14" fill="${STUDIO_BEZEL}" stroke="rgba(255,255,255,0.06)" stroke-width="1"/>
  <rect x="400" y="102" width="800" height="492" rx="4" fill="#000"/>
  <rect x="378" y="616" width="844" height="24" rx="0 0 14 14" fill="url(#smChin)"/>
  <circle cx="800" cy="628" r="5" fill="#111" stroke="rgba(255,255,255,0.06)" stroke-width="0.5"/>
  <path d="M770 640 L830 640 L860 700 L740 700 Z" fill="url(#smNeck)"/>
  <rect x="710" y="700" width="180" height="12" rx="6" fill="url(#smStand)"/>
</svg>`;
  return asDataUrl(svg);
}

function buildStudioPhoneNotchFrameDataUrl(appearance?: FlatAppearance): string {
  const b = appearance?.bezel ?? STUDIO_SPACE;
  const b1 = appearance?.bezel ? shadeHex(appearance.bezel, 0.72) : '#0b0b0d';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 700 1400" shape-rendering="geometricPrecision">
  <defs>
    <linearGradient id="spnBez" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${b}"/>
      <stop offset="1" stop-color="${b1}"/>
    </linearGradient>
  </defs>
  <rect x="40" y="40" width="620" height="1320" rx="44" fill="url(#spnBez)" stroke="rgba(255,255,255,0.08)" stroke-width="1.5"/>
  <rect x="305" y="52" width="90" height="22" rx="0 0 16 16" fill="${b}"/>
  <rect x="64" y="64" width="572" height="1272" rx="24" fill="#000"/>
  <rect x="668" y="140" width="4" height="40" rx="0 2 2 0" fill="#333"/>
  <rect x="32" y="130" width="4" height="30" rx="2 0 0 2" fill="#333"/>
  <rect x="32" y="166" width="4" height="30" rx="2 0 0 2" fill="#333"/>
</svg>`;
  return asDataUrl(svg);
}

function buildStudioPhoneIslandFrameDataUrl(appearance?: FlatAppearance): string {
  const b = appearance?.bezel ?? STUDIO_SPACE;
  const b1 = appearance?.bezel ? shadeHex(appearance.bezel, 0.72) : '#0b0b0d';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 700 1400" shape-rendering="geometricPrecision">
  <defs>
    <linearGradient id="spiBez" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${b}"/>
      <stop offset="1" stop-color="${b1}"/>
    </linearGradient>
  </defs>
  <rect x="40" y="40" width="620" height="1320" rx="44" fill="url(#spiBez)" stroke="rgba(255,255,255,0.08)" stroke-width="1.5"/>
  <rect x="314" y="58" width="72" height="20" rx="10" fill="#000" stroke="rgba(255,255,255,0.06)" stroke-width="0.5"/>
  <rect x="64" y="64" width="572" height="1272" rx="24" fill="#000"/>
  <rect x="668" y="140" width="4" height="40" rx="0 2 2 0" fill="#333"/>
  <rect x="32" y="130" width="4" height="30" rx="2 0 0 2" fill="#333"/>
  <rect x="32" y="166" width="4" height="30" rx="2 0 0 2" fill="#333"/>
</svg>`;
  return asDataUrl(svg);
}

function buildStudioTabletFrameDataUrl(appearance?: FlatAppearance): string {
  const b = appearance?.bezel ?? STUDIO_SPACE;
  const b1 = appearance?.bezel ? shadeHex(appearance.bezel, 0.65) : '#0f0f12';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1400 1000" shape-rendering="geometricPrecision">
  <defs>
    <linearGradient id="stBez" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${b}"/>
      <stop offset="1" stop-color="${b1}"/>
    </linearGradient>
  </defs>
  <rect x="40" y="40" width="1320" height="920" rx="28" fill="url(#stBez)" stroke="rgba(255,255,255,0.06)" stroke-width="1.5"/>
  <rect x="88" y="88" width="1224" height="824" rx="8" fill="#000"/>
  <circle cx="1332" cy="500" r="4" fill="#111" stroke="rgba(255,255,255,0.1)" stroke-width="0.5"/>
  <rect x="690" y="935" width="20" height="20" rx="10" fill="#111"/>
</svg>`;
  return asDataUrl(svg);
}

function buildStudioTabletThinFrameDataUrl(appearance?: FlatAppearance): string {
  const b = appearance?.bezel ?? STUDIO_SPACE;
  const b1 = appearance?.bezel ? shadeHex(appearance.bezel, 0.65) : '#0f0f12';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1400 1000" shape-rendering="geometricPrecision">
  <defs>
    <linearGradient id="sttBez" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${b}"/>
      <stop offset="1" stop-color="${b1}"/>
    </linearGradient>
  </defs>
  <rect x="50" y="50" width="1300" height="900" rx="18" fill="url(#sttBez)" stroke="rgba(255,255,255,0.06)" stroke-width="1.5"/>
  <rect x="78" y="78" width="1244" height="844" rx="6" fill="#000"/>
  <rect x="688" y="62" width="24" height="6" rx="3" fill="#111"/>
</svg>`;
  return asDataUrl(svg);
}

function buildStudioDeskLaptopPhoneFrameDataUrl(appearance?: FlatAppearance): string {
  const bezel = appearance?.bezel ?? STUDIO_BEZEL;
  const hinge = appearance?.hinge ?? '#334155';
  const base = appearance?.base ?? '#a8a9ad';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2200 1000" shape-rendering="geometricPrecision">
  <defs>
    <linearGradient id="deskWood" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#d4c5a9"/>
      <stop offset="0.4" stop-color="#c7b899"/>
      <stop offset="1" stop-color="#bfae8e"/>
    </linearGradient>
    <linearGradient id="deskBase" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#c8c9cc"/>
      <stop offset="0.5" stop-color="${base}"/>
      <stop offset="1" stop-color="#8e8f93"/>
    </linearGradient>
    <linearGradient id="deskPhoneScr" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#0a0a0a"/>
      <stop offset="1" stop-color="#1a1a1a"/>
    </linearGradient>
  </defs>
  <rect width="2200" height="1000" rx="16" fill="url(#deskWood)"/>
  <ellipse cx="1100" cy="920" rx="720" ry="28" fill="rgba(0,0,0,0.12)"/>
  <g transform="translate(72, 32)">
    <rect x="0" y="0" width="1008" height="648" rx="10" fill="${bezel}"/>
    <circle cx="504" cy="14" r="3" fill="#1a1a2e"/>
    <rect x="24" y="24" width="960" height="600" rx="3" fill="#000"/>
    <rect x="-60" y="648" width="1128" height="28" rx="8" fill="${hinge}"/>
    <path d="M-100 676 L1128 676 L1080 732 L-52 732 Z" fill="url(#deskBase)"/>
    <rect x="444" y="682" width="120" height="3" rx="1.5" fill="#999"/>
  </g>
  <g transform="translate(1520, 280)">
    <rect x="0" y="0" width="170" height="350" rx="26" fill="${STUDIO_SPACE}" stroke="rgba(255,255,255,0.08)" stroke-width="1"/>
    <rect x="78" y="14" width="56" height="16" rx="8" fill="#000" stroke="rgba(255,255,255,0.06)" stroke-width="0.5"/>
    <rect x="12" y="12" width="146" height="310" rx="18" fill="url(#deskPhoneScr)"/>
    <rect x="12" y="12" width="146" height="44" fill="#0a0a0a" opacity="0.35"/>
    <line x1="24" y1="110" x2="146" y2="110" stroke="rgba(255,255,255,0.06)" stroke-width="1"/>
    <line x1="24" y1="130" x2="120" y2="130" stroke="rgba(255,255,255,0.04)" stroke-width="1"/>
    <rect x="-3" y="90" width="3" height="26" rx="1" fill="#333"/>
    <rect x="172" y="100" width="3" height="36" rx="1" fill="#333"/>
  </g>
</svg>`;
  return asDataUrl(svg);
}

function buildStudioTabletPhoneComboFrameDataUrl(appearance?: FlatAppearance): string {
  const b = appearance?.bezel ?? STUDIO_SPACE;
  const b1 = appearance?.bezel ? shadeHex(appearance.bezel, 0.65) : '#0f0f12';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2200 1000" shape-rendering="geometricPrecision">
  <defs>
    <linearGradient id="comboBez" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${b}"/>
      <stop offset="1" stop-color="${b1}"/>
    </linearGradient>
    <linearGradient id="comboPhoneScr" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#0a0a0a"/>
      <stop offset="1" stop-color="#151515"/>
    </linearGradient>
  </defs>
  <rect width="2200" height="1000" fill="#f5f5f7"/>
  <rect x="40" y="120" width="1240" height="760" rx="16" fill="url(#comboBez)" stroke="rgba(0,0,0,0.06)" stroke-width="1"/>
  <rect x="68" y="148" width="1184" height="704" rx="6" fill="#000"/>
  <rect x="700" y="132" width="28" height="8" rx="4" fill="#111"/>
  <g transform="translate(1520, 420)">
    <rect x="0" y="0" width="180" height="370" rx="28" fill="${STUDIO_SPACE}" stroke="rgba(255,255,255,0.08)" stroke-width="1"/>
    <rect x="82" y="16" width="56" height="16" rx="8" fill="#000" stroke="rgba(255,255,255,0.06)" stroke-width="0.5"/>
    <rect x="12" y="12" width="156" height="330" rx="20" fill="url(#comboPhoneScr)"/>
    <rect x="12" y="12" width="156" height="40" fill="#0a0a0a" opacity="0.3"/>
    <line x1="22" y1="120" x2="158" y2="120" stroke="rgba(255,255,255,0.05)" stroke-width="1"/>
    <rect x="-3" y="75" width="3" height="28" rx="1" fill="#333"/>
    <rect x="182" y="85" width="3" height="36" rx="1" fill="#333"/>
  </g>
</svg>`;
  return asDataUrl(svg);
}

function buildPrintBusinessCardFrameDataUrl(appearance?: FlatAppearance): string {
  const paper = appearance?.bezel ?? '#f4f4f5';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1008" shape-rendering="geometricPrecision">
  <defs>
    <filter id="pcbShadow" x="-15%" y="-15%" width="130%" height="130%">
      <feDropShadow dx="0" dy="14" stdDeviation="18" flood-opacity="0.22"/>
    </filter>
  </defs>
  <rect width="1600" height="1008" fill="#e4e4e8"/>
  <g filter="url(#pcbShadow)">
    <rect x="72" y="96" width="1456" height="816" rx="10" fill="${paper}" stroke="rgba(0,0,0,0.07)" stroke-width="2"/>
    <rect x="120" y="144" width="1360" height="720" rx="4" fill="#0a0a0a"/>
  </g>
</svg>`;
  return asDataUrl(svg);
}

function buildPrintPosterFrameDataUrl(appearance?: FlatAppearance): string {
  const paper = appearance?.bezel ?? '#ececf0';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1400 2000" shape-rendering="geometricPrecision">
  <defs>
    <filter id="ppShadow" x="-12%" y="-8%" width="124%" height="116%">
      <feDropShadow dx="0" dy="24" stdDeviation="28" flood-opacity="0.2"/>
    </filter>
  </defs>
  <rect width="1400" height="2000" fill="#d8d8de"/>
  <g filter="url(#ppShadow)">
    <rect x="120" y="160" width="1160" height="1680" rx="6" fill="${paper}" stroke="rgba(0,0,0,0.06)" stroke-width="2"/>
    <rect x="180" y="260" width="1000" height="1414" rx="2" fill="#050505"/>
  </g>
</svg>`;
  return asDataUrl(svg);
}

function buildPrintFlyerFrameDataUrl(appearance?: FlatAppearance): string {
  const paper = appearance?.bezel ?? '#f5f5f7';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 1700" shape-rendering="geometricPrecision">
  <defs>
    <filter id="pfShadow" x="-12%" y="-10%" width="124%" height="120%">
      <feDropShadow dx="0" dy="16" stdDeviation="20" flood-opacity="0.2"/>
    </filter>
  </defs>
  <rect width="1200" height="1700" fill="#e0e0e6"/>
  <g filter="url(#pfShadow)">
    <rect x="100" y="140" width="1000" height="1420" rx="8" fill="${paper}" stroke="rgba(0,0,0,0.06)" stroke-width="2"/>
    <rect x="140" y="220" width="920" height="1304" rx="2" fill="#080808"/>
  </g>
</svg>`;
  return asDataUrl(svg);
}

function buildPrintGenericFrameDataUrl(appearance?: FlatAppearance): string {
  const paper = appearance?.bezel ?? '#eef0f4';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1600" shape-rendering="geometricPrecision">
  <defs>
    <filter id="pgShadow" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="0" dy="18" stdDeviation="22" flood-opacity="0.18"/>
    </filter>
  </defs>
  <rect width="1600" height="1600" fill="#dcdce2"/>
  <g filter="url(#pgShadow)">
    <rect x="120" y="120" width="1360" height="1360" rx="12" fill="${paper}" stroke="rgba(0,0,0,0.06)" stroke-width="2"/>
    <rect x="200" y="200" width="1200" height="1200" rx="4" fill="#0a0a0a"/>
  </g>
</svg>`;
  return asDataUrl(svg);
}

export const STUDIO_LAPTOP_FRAME = buildStudioLaptopFrameDataUrl();
export const STUDIO_MONITOR_FRAME = buildStudioMonitorFrameDataUrl();
export const STUDIO_PHONE_NOTCH_FRAME = buildStudioPhoneNotchFrameDataUrl();
export const STUDIO_PHONE_ISLAND_FRAME = buildStudioPhoneIslandFrameDataUrl();
export const STUDIO_TABLET_FRAME = buildStudioTabletFrameDataUrl();
export const STUDIO_TABLET_THIN_FRAME = buildStudioTabletThinFrameDataUrl();
export const STUDIO_DESK_FRAME = buildStudioDeskLaptopPhoneFrameDataUrl();
export const STUDIO_COMBO_FRAME = buildStudioTabletPhoneComboFrameDataUrl();

function resolvePrintBuiltinFrameDataUrl(config: MockupConfig): string | null {
  switch (config.builtinFrame as BuiltinFrameId | undefined) {
    case 'printBusinessCard':
      return buildPrintBusinessCardFrameDataUrl(config.flatAppearance);
    case 'printPoster':
      return buildPrintPosterFrameDataUrl(config.flatAppearance);
    case 'printFlyer':
      return buildPrintFlyerFrameDataUrl(config.flatAppearance);
    case 'printGeneric':
      return buildPrintGenericFrameDataUrl(config.flatAppearance);
    default:
      return null;
  }
}

function resolveStudioBuiltinFrameDataUrl(config: MockupConfig): string | null {
  switch (config.builtinFrame as BuiltinFrameId | undefined) {
    case 'studioLaptop':
      return buildStudioLaptopFrameDataUrl(config.flatAppearance);
    case 'studioMonitor':
      return buildStudioMonitorFrameDataUrl();
    case 'studioPhoneNotch':
      return buildStudioPhoneNotchFrameDataUrl(config.flatAppearance);
    case 'studioPhoneIsland':
      return buildStudioPhoneIslandFrameDataUrl(config.flatAppearance);
    case 'studioTablet':
      return buildStudioTabletFrameDataUrl(config.flatAppearance);
    case 'studioTabletThin':
      return buildStudioTabletThinFrameDataUrl(config.flatAppearance);
    case 'studioDeskLaptopPhone':
      return buildStudioDeskLaptopPhoneFrameDataUrl(config.flatAppearance);
    case 'studioTabletPhoneCombo':
      return buildStudioTabletPhoneComboFrameDataUrl(config.flatAppearance);
    default:
      return null;
  }
}

/**
 * Effective frame image for preview/export. Built-in SVG devices ignore stale
 * `imageUrl` when `builtinFrame` is set; uploads use `imageUrl` as-is.
 */
export function resolveMockupFrameDataUrl(config: MockupConfig): string {
  if (config.renderMode === 'three') {
    return config.imageUrl || TRANSPARENT_PIXEL_GIF;
  }
  const print = resolvePrintBuiltinFrameDataUrl(config);
  if (print) return print;
  const studio = resolveStudioBuiltinFrameDataUrl(config);
  if (studio) return studio;
  switch (config.builtinFrame) {
    case 'laptop':
      return buildLaptopFrameDataUrl(config.flatAppearance);
    case 'phone':
      return buildPhoneFrameDataUrl(config.flatAppearance);
    case 'tablet':
      return buildTabletFrameDataUrl(config.flatAppearance);
    default:
      return config.imageUrl;
  }
}

/** Intrinsic frame width in px for built-in SVGs; heuristic for uploads (prefetch / screenshot width). */
export function estimateMockupFrameNativeWidth(config: MockupConfig): number {
  if (config.renderMode === 'three') return 1600;
  const dim = getBuiltinFrameIntrinsicSize(config);
  if (dim) return dim.w;
  return 1600;
}
