/**
 * Point in image-relative coordinates (0..100 percentage of the mockup image).
 */
export interface Point {
  x: number;
  y: number;
}

/**
 * Four corners of the display area on the mockup image, in % of image size.
 * Order is fixed: top-left, top-right, bottom-right, bottom-left.
 * Required for projective (perspective) transforms.
 */
export interface Corners {
  tl: Point;
  tr: Point;
  br: Point;
  bl: Point;
}

export type DeviceType = 'laptop' | 'phone' | 'tablet' | 'custom' | 'print';

/**
 * Eingebaute SVG-Rahmen: klassische drei Typen plus „MOCKUPS_EXAMPLE“-Studio-Varianten
 * (reine SVG-Nachzeichnung, gleiche Homographie wie Upload-Mockups).
 */
export type BuiltinFrameId =
  | 'laptop'
  | 'phone'
  | 'tablet'
  | 'studioLaptop'
  | 'studioMonitor'
  | 'studioPhoneNotch'
  | 'studioPhoneIsland'
  | 'studioTablet'
  | 'studioTabletThin'
  | 'studioDeskLaptopPhone'
  | 'studioTabletPhoneCombo'
  | 'printBusinessCard'
  | 'printPoster'
  | 'printFlyer'
  | 'printGeneric';

/** Quelle für eine perspektivische Inhaltsfläche innerhalb eines Flat-Mockups. */
export type ContentSlotSource =
  | { kind: 'usePrimarySiteUrl' }
  | { kind: 'iframeUrl'; url: string }
  | { kind: 'imageAsset'; assetId: string }
  | { kind: 'videoAsset'; assetId: string; posterAssetId?: string };

/**
 * Eine warpbare Inhaltsfläche (eigene Homographie). Ohne `contentSlots` am Mockup
 * gilt implizit ein einzelner Slot: `corners` + globale Header-URL.
 */
export interface ContentSlot {
  id: string;
  corners: Corners;
  source: ContentSlotSource;
  /** Optional: Viewport-Kategorie (Breakpoints / Default-Breite), sonst Mockup-`deviceType`. */
  deviceType?: DeviceType;
  /** Optional: überschreibt Mockup-weite Viewport-Breite für diesen Iframe/Screenshot. */
  contentViewportWidth?: number;
  /** Optional: überschreibt Seitenverhältnis (Breite/Höhe) des logischen Inhalts. */
  contentAspect?: number;
  /** Optional: abgerundete Ecken in CSS-px der logischen Content-Box. */
  iframeBorderRadius?: number;
  /**
   * Gleichmäßiger Innenabstand in CSS-px innerhalb der logischen Content-Fläche
   * (Letterboxing zur Mockup-Kante).
   */
  contentInsetPx?: number;
}

export type RenderMode = 'flat' | 'three';

/** Optional theme for built-in SVG device frames and the preview stage. */
export interface FlatAppearance {
  /** Laptop / phone / tablet body & bezel tones (hex). */
  bezel?: string;
  /** Laptop base / keyboard deck area. */
  base?: string;
  /** Laptop hinge strip. */
  hinge?: string;
  /**
   * CSS color for the area behind the mockup in preview & export host.
   * `null` = fully transparent in export (editor preview uses a solid stage color).
   */
  stageBackground?: string | null;
  /**
   * Border radius of the live iframe / screenshot content area, in CSS pixels
   * of the logical content box (`contentViewportWidth` × derived height).
   * 0 = sharp corners.
   */
  iframeBorderRadius?: number;
}

/** Serializable 3D scene / camera / light options for `renderMode: 'three'`. */
export interface ThreeSettings {
  cameraPosition: [number, number, number];
  cameraTarget: [number, number, number];
  fov: number;
  ambientColor: string;
  ambientIntensity: number;
  directionalColor: string;
  directionalIntensity: number;
  /** `null` = transparent GL clear color. */
  background: string | null;
  /** Root-Transform des Laptop-Modells (Meter, Euler XYZ in Radiant). */
  modelPosition: [number, number, number];
  modelRotation: [number, number, number];
  modelScale: [number, number, number];
  /** Zusätzliche Deckel-Neigung in Radiant (addiert zur Konstruktionspose). */
  lidPitchExtra: number;
  /** Richtlicht-Position im Weltraum. */
  directionalPosition: [number, number, number];
  /** Hex-Farben für Gehäuse-Materialien. */
  baseColorHex: string;
  bezelColorHex: string;
}

export interface MockupConfig {
  id: string;
  name: string;
  imageUrl: string;
  /** When set, frame image is generated from SVG factory + `flatAppearance`. */
  builtinFrame?: BuiltinFrameId;
  /** Defaults to `flat` when missing (localStorage migration). */
  renderMode?: RenderMode;
  flatAppearance?: FlatAppearance;
  /** Persisted overrides; merged with defaults via `mergeThreeSettings`. */
  threeSettings?: Partial<ThreeSettings>;
  /**
   * IndexedDB key for an uploaded glTF/glB binary (see `threeGltfStore`).
   * When set, 3D preview/export load this asset instead of the procedural laptop.
   */
  threeGltfAssetId?: string;
  /** glTF mesh name that receives the screenshot texture (default `LM_Screen`). */
  threeScreenMeshName?: string;
  /** Source aspect ratio width/height of the iframe content area. */
  contentAspect?: number;
  /**
   * CSS pixel width of the live iframe viewport (responsive breakpoints).
   * When omitted, `defaultContentViewportWidth(deviceType)` is used.
   */
  contentViewportWidth?: number;
  /**
   * Ohne `contentSlots`: Innenabstand für den impliziten primären Slot (wie
   * `ContentSlot.contentInsetPx`).
   */
  contentInsetPx?: number;
  corners: Corners;
  /**
   * Mehrere Inhaltsflächen mit eigenen Ecken und Quellen. Fehlt die Liste, wird
   * ein synthetischer Slot aus `corners` + primärer App-URL verwendet.
   */
  contentSlots?: ContentSlot[];
  deviceType: DeviceType;
  isDefault?: boolean;
}

/**
 * Legacy data shape used in v1 storage. Preserved here so migrations can
 * detect and convert old localStorage entries on load.
 */
export interface LegacyMockupConfig {
  id: string;
  name: string;
  imageUrl: string;
  viewport: {
    top: number;
    left: number;
    width: number;
    height: number;
  };
  deviceType: DeviceType;
  isDefault?: boolean;
}

/**
 * Convert a legacy axis-aligned rectangle into the new four-corner format.
 */
export function rectToCorners(rect: {
  top: number;
  left: number;
  width: number;
  height: number;
}): Corners {
  const { top, left, width, height } = rect;
  return {
    tl: { x: left, y: top },
    tr: { x: left + width, y: top },
    br: { x: left + width, y: top + height },
    bl: { x: left, y: top + height },
  };
}

function sanitizeContentSlots(slots: unknown): ContentSlot[] | undefined {
  if (!Array.isArray(slots) || slots.length === 0) return undefined;
  const out: ContentSlot[] = [];
  for (const raw of slots) {
    if (!raw || typeof raw !== 'object') continue;
    const s = raw as Partial<ContentSlot>;
    if (!s.id || typeof s.id !== 'string') continue;
    if (!s.corners || !isCorners(s.corners)) continue;
    if (!s.source || typeof s.source !== 'object' || !('kind' in s.source)) continue;
    const src = s.source as ContentSlotSource;
    if (src.kind === 'iframeUrl' && typeof src.url !== 'string') continue;
    if (src.kind === 'imageAsset' && typeof src.assetId !== 'string') continue;
    if (src.kind === 'videoAsset' && typeof src.assetId !== 'string') continue;
    const deviceTypes: DeviceType[] = ['laptop', 'phone', 'tablet', 'custom', 'print'];
    const slotDevice =
      typeof s.deviceType === 'string' && deviceTypes.includes(s.deviceType as DeviceType)
        ? (s.deviceType as DeviceType)
        : undefined;
    out.push({
      id: s.id,
      corners: s.corners,
      source: src,
      deviceType: slotDevice,
      contentViewportWidth:
        typeof s.contentViewportWidth === 'number' && s.contentViewportWidth > 0
          ? s.contentViewportWidth
          : undefined,
      contentAspect:
        typeof s.contentAspect === 'number' && s.contentAspect > 0 ? s.contentAspect : undefined,
      iframeBorderRadius:
        typeof s.iframeBorderRadius === 'number' && s.iframeBorderRadius >= 0
          ? s.iframeBorderRadius
          : undefined,
      contentInsetPx:
        typeof s.contentInsetPx === 'number' && s.contentInsetPx > 0
          ? Math.round(Math.min(120, Math.max(0, s.contentInsetPx)))
          : undefined,
    });
  }
  return out.length ? out : undefined;
}

function isCorners(c: unknown): c is Corners {
  if (!c || typeof c !== 'object') return false;
  const o = c as Corners;
  const pts = [o.tl, o.tr, o.br, o.bl];
  return pts.every(
    (p) =>
      p &&
      typeof p === 'object' &&
      typeof (p as Point).x === 'number' &&
      typeof (p as Point).y === 'number',
  );
}

function normalizeMockup(m: MockupConfig): MockupConfig {
  const renderMode: RenderMode = m.renderMode ?? 'flat';
  const out: MockupConfig = {
    ...m,
    renderMode,
    contentSlots: sanitizeContentSlots(m.contentSlots),
  };
  if (typeof out.contentInsetPx === 'number') {
    out.contentInsetPx = Math.round(Math.min(120, Math.max(0, out.contentInsetPx)));
    if (out.contentInsetPx === 0) delete out.contentInsetPx;
  }
  if (renderMode === 'three' && !out.threeSettings) {
    // Defaults applied in consumers via mergeThreeSettings; omit heavy import here.
    out.threeSettings = undefined;
  }
  if (renderMode === 'three') {
    out.contentSlots = undefined;
  }
  return out;
}

/**
 * Type-guard / migration helper for stored mockups.
 */
export function migrateMockup(
  data: MockupConfig | LegacyMockupConfig,
): MockupConfig {
  let base: MockupConfig;
  if ('corners' in data && data.corners) {
    base = { ...(data as MockupConfig) };
  } else {
    const legacy = data as LegacyMockupConfig;
    base = {
      id: legacy.id,
      name: legacy.name,
      imageUrl: legacy.imageUrl,
      corners: rectToCorners(legacy.viewport),
      deviceType: legacy.deviceType,
      isDefault: legacy.isDefault,
    };
  }
  return normalizeMockup(base);
}
