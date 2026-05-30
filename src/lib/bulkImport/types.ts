import type {
  BuiltinFrameId,
  Corners,
  DeviceType,
  FlatAppearance,
  RenderMode,
  ThreeSettings,
} from '../../types';

export const BULK_IMPORT_MANIFEST_VERSION = 1 as const;

/** Max. Mockups pro Import (DoS / localStorage). */
export const MAX_BULK_IMPORT_MOCKUPS = 100;

/** Max. ZIP-Größe in Bytes. */
export const MAX_BULK_IMPORT_ZIP_BYTES = 80 * 1024 * 1024;

/**
 * Slot-Quelle im Manifest: bei Medien `path` relativ zum Paket (Ordner/Wurzel der ZIP).
 */
export type BulkImportSlotSource =
  | { kind: 'usePrimarySiteUrl' }
  | { kind: 'iframeUrl'; url: string }
  | { kind: 'imageAsset'; path: string }
  | { kind: 'videoAsset'; path: string; posterPath?: string };

export interface BulkImportContentSlot {
  id: string;
  corners: Corners;
  source: BulkImportSlotSource;
  deviceType?: DeviceType;
  contentViewportWidth?: number;
  contentAspect?: number;
  iframeBorderRadius?: number;
  contentInsetPx?: number;
}

/**
 * Ein Mockup-Eintrag im Manifest (ohne Runtime-`id` / Data-URLs).
 * `imagePath` oder `builtinFrame` für Flat; `threeGltfPath` für Three.
 */
export interface BulkImportMockupEntry {
  name: string;
  deviceType: DeviceType;
  corners: Corners;
  renderMode?: RenderMode;
  builtinFrame?: BuiltinFrameId;
  /** Raster/SVG als Datei relativ zum Paket (Flat ohne builtinFrame Pflicht). */
  imagePath?: string;
  threeGltfPath?: string;
  threeScreenMeshName?: string;
  threeSettings?: Partial<ThreeSettings>;
  flatAppearance?: FlatAppearance;
  contentAspect?: number;
  contentViewportWidth?: number;
  contentInsetPx?: number;
  contentSlots?: BulkImportContentSlot[];
}

export interface BulkImportManifest {
  version: typeof BULK_IMPORT_MANIFEST_VERSION;
  mockups: BulkImportMockupEntry[];
}

export interface VirtualPackageFile {
  /** Normalisierte relativen Pfad (Slash, ohne führende `./`). */
  path: string;
  blob: Blob;
}

export interface BulkImportBlobStores {
  putGltf: (id: string, blob: Blob) => Promise<void>;
  putContentMedia: (id: string, blob: Blob) => Promise<void>;
}

export interface BulkImportResult {
  imported: import('../../types').MockupConfig[];
  errors: { index: number; name?: string; message: string }[];
}

/** Nach Validierung bereit zum Auflösen der Pfade → MockupConfig. */
export interface ValidatedBulkImportManifest {
  mockups: BulkImportMockupEntry[];
}
