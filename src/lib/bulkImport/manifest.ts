import type { BuiltinFrameId } from '../../types';
import type {
  BulkImportContentSlot,
  BulkImportManifest,
  BulkImportMockupEntry,
  BulkImportSlotSource,
  ValidatedBulkImportManifest,
} from './types';
import { BULK_IMPORT_MANIFEST_VERSION, MAX_BULK_IMPORT_MOCKUPS } from './types';
import type { Corners, DeviceType, FlatAppearance } from '../../types';

const DEVICE_TYPES = new Set<DeviceType>([
  'laptop',
  'phone',
  'tablet',
  'custom',
  'print',
]);

const BUILTIN_FRAMES = new Set<BuiltinFrameId>([
  'laptop',
  'phone',
  'tablet',
  'studioLaptop',
  'studioMonitor',
  'studioPhoneNotch',
  'studioPhoneIsland',
  'studioTablet',
  'studioTabletThin',
  'studioDeskLaptopPhone',
  'studioTabletPhoneCombo',
  'printBusinessCard',
  'printPoster',
  'printFlyer',
  'printGeneric',
]);

function parsePoint(raw: unknown, ctx: string): { x: number; y: number } {
  if (!raw || typeof raw !== 'object') {
    throw new Error(`${ctx}: Punkt-Objekt erwartet`);
  }
  const o = raw as Record<string, unknown>;
  if (typeof o.x !== 'number' || typeof o.y !== 'number' || Number.isNaN(o.x) || Number.isNaN(o.y)) {
    throw new Error(`${ctx}: x/y als Zahl erwartet`);
  }
  return { x: o.x, y: o.y };
}

export function parseCorners(raw: unknown, ctx: string): Corners {
  if (!raw || typeof raw !== 'object') {
    throw new Error(`${ctx}: corners-Objekt erwartet`);
  }
  const o = raw as Record<string, unknown>;
  return {
    tl: parsePoint(o.tl, `${ctx}.tl`),
    tr: parsePoint(o.tr, `${ctx}.tr`),
    br: parsePoint(o.br, `${ctx}.br`),
    bl: parsePoint(o.bl, `${ctx}.bl`),
  };
}

function parseFlatAppearance(raw: unknown, ctx: string): FlatAppearance | undefined {
  if (raw === undefined) return undefined;
  if (!raw || typeof raw !== 'object') {
    throw new Error(`${ctx}: flatAppearance muss Objekt sein`);
  }
  const fa = raw as Record<string, unknown>;
  const out: FlatAppearance = {};
  const copyStr = (
    key: keyof FlatAppearance & string,
    val: unknown,
  ): void => {
    if (val === undefined || val === null) return;
    if (typeof val === 'string') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (out as any)[key] = val;
    } else {
      throw new Error(`${ctx}.${key}: String erwartet`);
    }
  };
  copyStr('bezel', fa.bezel);
  copyStr('base', fa.base);
  copyStr('hinge', fa.hinge);
  if (fa.stageBackground !== undefined) {
    if (fa.stageBackground === null || fa.stageBackground === 'transparent') {
      out.stageBackground = fa.stageBackground as null | 'transparent';
    } else if (typeof fa.stageBackground === 'string') {
      out.stageBackground = fa.stageBackground;
    } else throw new Error(`${ctx}.stageBackground: ungültig`);
  }
  if (typeof fa.iframeBorderRadius === 'number' && fa.iframeBorderRadius >= 0) {
    out.iframeBorderRadius = fa.iframeBorderRadius;
  }
  return Object.keys(out).length ? out : undefined;
}

export function parseSlotSource(raw: unknown, ctx: string): BulkImportSlotSource {
  if (!raw || typeof raw !== 'object' || typeof (raw as { kind?: unknown }).kind !== 'string') {
    throw new Error(`${ctx}: Slot-Source mit kind erwartet`);
  }
  const o = raw as Record<string, unknown>;
  const k = o.kind as string;
  if (k === 'usePrimarySiteUrl') {
    return { kind: 'usePrimarySiteUrl' };
  }
  if (k === 'iframeUrl') {
    const url = o.url;
    if (typeof url !== 'string' || !url.trim()) {
      throw new Error(`${ctx}: iframeUrl benötigt url`);
    }
    return { kind: 'iframeUrl', url: url.trim() };
  }
  if (k === 'imageAsset') {
    const path = o.path;
    if (typeof path !== 'string' || !path.trim()) {
      throw new Error(`${ctx}: imageAsset benötigt path`);
    }
    return { kind: 'imageAsset', path: path.trim() };
  }
  if (k === 'videoAsset') {
    const path = o.path;
    if (typeof path !== 'string' || !path.trim()) {
      throw new Error(`${ctx}: videoAsset benötigt path`);
    }
    let posterPath: string | undefined;
    if (o.posterPath != null) {
      if (typeof o.posterPath !== 'string' || !o.posterPath.trim()) {
        throw new Error(`${ctx}: posterPath ungültig`);
      }
      posterPath = o.posterPath.trim();
    }
    return { kind: 'videoAsset', path: path.trim(), posterPath };
  }
  throw new Error(`${ctx}: unbekanntes Slot kind „${k}“`);
}

function parseSlot(raw: unknown, index: number): BulkImportContentSlot {
  const ctx = `contentSlots[${index}]`;
  if (!raw || typeof raw !== 'object') throw new Error(`${ctx}: Objekt erwartet`);
  const o = raw as Record<string, unknown>;
  if (typeof o.id !== 'string' || !o.id.trim()) {
    throw new Error(`${ctx}: id (string) erforderlich`);
  }
  return {
    id: o.id.trim(),
    corners: parseCorners(o.corners, `${ctx}.corners`),
    source: parseSlotSource(o.source, `${ctx}.source`),
    ...(typeof o.deviceType === 'string' && DEVICE_TYPES.has(o.deviceType as DeviceType)
      ? { deviceType: o.deviceType as DeviceType }
      : {}),
    ...(typeof o.contentViewportWidth === 'number' && o.contentViewportWidth > 0
      ? { contentViewportWidth: o.contentViewportWidth }
      : {}),
    ...(typeof o.contentAspect === 'number' && o.contentAspect > 0 ? { contentAspect: o.contentAspect } : {}),
    ...(typeof o.iframeBorderRadius === 'number' && o.iframeBorderRadius >= 0
      ? { iframeBorderRadius: o.iframeBorderRadius }
      : {}),
    ...(typeof o.contentInsetPx === 'number' && o.contentInsetPx > 0
      ? { contentInsetPx: o.contentInsetPx }
      : {}),
  };
}

function parseMockupEntry(raw: unknown, index: number): BulkImportMockupEntry {
  const ctx = `mockups[${index}]`;
  if (!raw || typeof raw !== 'object') {
    throw new Error(`${ctx}: Objekt erwartet`);
  }
  const o = raw as Record<string, unknown>;
  if (typeof o.name !== 'string' || !o.name.trim()) {
    throw new Error(`${ctx}: name (string) erforderlich`);
  }
  const deviceType = o.deviceType;
  if (typeof deviceType !== 'string' || !DEVICE_TYPES.has(deviceType as DeviceType)) {
    throw new Error(`${ctx}: deviceType muss eines von laptop|phone|tablet|custom|print sein`);
  }
  const corners = parseCorners(o.corners, `${ctx}.corners`);

  let renderMode = o.renderMode;
  if (renderMode !== undefined && renderMode !== 'flat' && renderMode !== 'three') {
    throw new Error(`${ctx}.renderMode: flat oder three`);
  }
  if (!renderMode) renderMode = 'flat';

  let builtinFrame: BuiltinFrameId | undefined;
  if (o.builtinFrame !== undefined) {
    if (typeof o.builtinFrame !== 'string' || !BUILTIN_FRAMES.has(o.builtinFrame as BuiltinFrameId)) {
      throw new Error(`${ctx}.builtinFrame: ungültige builtin-ID`);
    }
    builtinFrame = o.builtinFrame as BuiltinFrameId;
  }

  const imagePath =
    typeof o.imagePath === 'string' && o.imagePath.trim() ? o.imagePath.trim() : undefined;
  const threeGltfPath =
    typeof o.threeGltfPath === 'string' && o.threeGltfPath.trim()
      ? o.threeGltfPath.trim()
      : undefined;

  if (renderMode === 'three') {
    if (!threeGltfPath) {
      throw new Error(`${ctx}: renderMode „three“ benötigt threeGltfPath`);
    }
    if (o.contentSlots && Array.isArray(o.contentSlots) && o.contentSlots.length > 0) {
      throw new Error(`${ctx}: Three-Mockups dürfen keine contentSlots haben`);
    }
  } else {
    if (!builtinFrame && !imagePath) {
      throw new Error(`${ctx}: Flat-Mockup benötigt imagePath oder builtinFrame`);
    }
    if (builtinFrame && imagePath) {
      throw new Error(`${ctx}: Entweder builtinFrame oder imagePath, nicht beides`);
    }
  }

  let contentSlots: BulkImportContentSlot[] | undefined;
  if (o.contentSlots !== undefined) {
    if (!Array.isArray(o.contentSlots)) {
      throw new Error(`${ctx}.contentSlots: Array erwartet`);
    }
    if (renderMode !== 'three' && o.contentSlots.length > 8) {
      throw new Error(`${ctx}: maximal 8 contentSlots`);
    }
    contentSlots = o.contentSlots.map((item, i) => parseSlot(item, i));
  }

  let threeScreenMeshName: string | undefined;
  if (o.threeScreenMeshName !== undefined) {
    if (typeof o.threeScreenMeshName !== 'string' || !o.threeScreenMeshName.trim()) {
      throw new Error(`${ctx}.threeScreenMeshName ungültig`);
    }
    threeScreenMeshName = o.threeScreenMeshName.trim();
  }

  return {
    name: o.name.trim(),
    deviceType: deviceType as DeviceType,
    corners,
    renderMode: renderMode as 'flat' | 'three',
    ...(builtinFrame ? { builtinFrame } : {}),
    ...(imagePath ? { imagePath } : {}),
    ...(threeGltfPath ? { threeGltfPath } : {}),
    ...(threeScreenMeshName ? { threeScreenMeshName } : {}),
    ...(o.threeSettings && typeof o.threeSettings === 'object'
      ? { threeSettings: o.threeSettings as Partial<import('../../types').ThreeSettings> }
      : {}),
    flatAppearance: parseFlatAppearance(o.flatAppearance, `${ctx}.flatAppearance`),
    ...(typeof o.contentAspect === 'number' && o.contentAspect > 0
      ? { contentAspect: o.contentAspect }
      : {}),
    ...(typeof o.contentViewportWidth === 'number' && o.contentViewportWidth > 0
      ? { contentViewportWidth: o.contentViewportWidth }
      : {}),
    ...(typeof o.contentInsetPx === 'number' && o.contentInsetPx > 0
      ? { contentInsetPx: o.contentInsetPx }
      : {}),
    ...(contentSlots?.length ? { contentSlots } : {}),
  };
}

/** Validiert rohes JSON eines Manifests (`config.json`). */
export function parseAndValidateBulkImportManifest(raw: unknown): ValidatedBulkImportManifest {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Manifest: gültiges JSON-Objekt erwartet');
  }
  const o = raw as Record<string, unknown>;
  const ver = o.version;
  if (ver !== BULK_IMPORT_MANIFEST_VERSION) {
    throw new Error(`Manifest: version muss ${BULK_IMPORT_MANIFEST_VERSION} sein (ist: ${String(ver)})`);
  }
  const mockups = o.mockups;
  if (!Array.isArray(mockups)) {
    throw new Error('Manifest: „mockups“ muss ein Array sein');
  }
  if (mockups.length === 0) {
    throw new Error('Manifest: mindestens ein Mockup-Eintrag erforderlich');
  }
  if (mockups.length > MAX_BULK_IMPORT_MOCKUPS) {
    throw new Error(`Manifest: höchstens ${MAX_BULK_IMPORT_MOCKUPS} Mockups pro Import`);
  }
  const parsed: BulkImportMockupEntry[] = mockups.map((m, i) => parseMockupEntry(m, i));
  return {
    mockups: parsed,
  };
}

/** Liest `config.json`-Text und gibt ein validiertes Manifest zurück. */
export function parseBulkImportManifestJson(text: string): ValidatedBulkImportManifest {
  let data: unknown;
  try {
    data = JSON.parse(text) as unknown;
  } catch {
    throw new Error('config.json ist kein gültiges JSON');
  }
  return parseAndValidateBulkImportManifest(data);
}

export function manifestFromValidated(v: ValidatedBulkImportManifest): BulkImportManifest {
  return {
    version: BULK_IMPORT_MANIFEST_VERSION,
    mockups: v.mockups,
  };
}
