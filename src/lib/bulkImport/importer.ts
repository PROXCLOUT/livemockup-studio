import { v4 as uuidv4 } from 'uuid';
import { migrateMockup, type ContentSlotSource, type MockupConfig } from '../../types';
import { TRANSPARENT_PIXEL_GIF } from '../deviceFrames';
import { DEFAULT_GLTF_SCREEN_MESH_NAME, MAX_GLB_BYTES } from '../gltfConstants';
import type {
  BulkImportBlobStores,
  BulkImportContentSlot,
  BulkImportMockupEntry,
  BulkImportResult,
  BulkImportSlotSource,
  VirtualPackageFile,
} from './types';
import { parseBulkImportManifestJson } from './manifest';
import { buildVirtualFileIndex, normalizePathKey, pickConfigBlob } from './sources';

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(typeof r.result === 'string' ? r.result : '');
    r.onerror = () => reject(r.error ?? new Error('FileReader'));
    r.readAsDataURL(blob);
  });
}

export function lookupBlob(idx: Map<string, VirtualPackageFile>, relPath: string): Blob | undefined {
  return idx.get(normalizePathKey(relPath))?.blob;
}

async function resolveImportSlotSource(
  src: BulkImportSlotSource,
  idx: Map<string, VirtualPackageFile>,
  generateId: () => string,
  putContentMedia: (id: string, blob: Blob) => Promise<void>,
  ctxLabel: string,
): Promise<ContentSlotSource> {
  if (src.kind === 'usePrimarySiteUrl') return { kind: 'usePrimarySiteUrl' };
  if (src.kind === 'iframeUrl') return { kind: 'iframeUrl', url: src.url };

  const requireBlob = (path: string, what: string) => {
    const blob = lookupBlob(idx, path);
    if (!blob) {
      throw new Error(`${ctxLabel}: „${what}“ nicht gefunden: ${path}`);
    }
    return blob;
  };

  if (src.kind === 'imageAsset') {
    const blob = requireBlob(src.path, 'imageAsset');
    const assetId = generateId();
    await putContentMedia(assetId, blob);
    return { kind: 'imageAsset', assetId };
  }

  if (src.kind === 'videoAsset') {
    const vBlob = requireBlob(src.path, 'video');
    let posterAssetId: string | undefined;
    if (src.posterPath?.trim()) {
      const pb = requireBlob(src.posterPath.trim(), 'poster');
      posterAssetId = generateId();
      await putContentMedia(posterAssetId, pb);
    }
    const assetId = generateId();
    await putContentMedia(assetId, vBlob);
    return { kind: 'videoAsset', assetId, posterAssetId };
  }

  throw new Error(`${ctxLabel}: unbekannter Slot kind`);
}

async function mapContentSlots(
  slots: BulkImportContentSlot[],
  idx: Map<string, VirtualPackageFile>,
  generateId: () => string,
  putContentMedia: (id: string, blob: Blob) => Promise<void>,
): Promise<import('../../types').ContentSlot[]> {
  const out: import('../../types').ContentSlot[] = [];
  for (let si = 0; si < slots.length; si++) {
    const s = slots[si]!;
    const source = await resolveImportSlotSource(
      s.source,
      idx,
      generateId,
      putContentMedia,
      `slot[${si}] „${s.id}“`,
    );
    out.push({
      id: s.id,
      corners: s.corners,
      source,
      ...(s.deviceType ? { deviceType: s.deviceType } : {}),
      ...(s.contentViewportWidth ? { contentViewportWidth: s.contentViewportWidth } : {}),
      ...(s.contentAspect ? { contentAspect: s.contentAspect } : {}),
      ...(typeof s.iframeBorderRadius === 'number' ? { iframeBorderRadius: s.iframeBorderRadius } : {}),
      ...(s.contentInsetPx ? { contentInsetPx: s.contentInsetPx } : {}),
    });
  }
  return out;
}

/** Einzelnen Manifest-Eintrag in ein persistierbares `MockupConfig` umsetzen (inkl. migrateMockup). */
export async function importOneMockupFromEntry(
  entry: BulkImportMockupEntry,
  idx: Map<string, VirtualPackageFile>,
  generateId: () => string,
  stores: BulkImportBlobStores,
): Promise<MockupConfig> {
  const id = generateId();

  const renderMode = entry.renderMode ?? 'flat';

  if (renderMode === 'three') {
    const gltfPath = entry.threeGltfPath!;
    const blob = lookupBlob(idx, gltfPath);
    if (!blob) {
      throw new Error(`GLB/glTF nicht gefunden: ${gltfPath}`);
    }
    if (blob.size > MAX_GLB_BYTES) {
      throw new Error(
        `${gltfPath}: Datei zu groß (max. ${Math.round(MAX_GLB_BYTES / (1024 * 1024))} MB)`,
      );
    }
    const gltfAssetId = generateId();
    await stores.putGltf(gltfAssetId, blob);
    const base: MockupConfig = {
      id,
      name: entry.name,
      imageUrl: TRANSPARENT_PIXEL_GIF,
      renderMode: 'three',
      corners: entry.corners,
      deviceType: entry.deviceType,
      threeGltfAssetId: gltfAssetId,
      threeScreenMeshName: entry.threeScreenMeshName ?? DEFAULT_GLTF_SCREEN_MESH_NAME,
      isDefault: false,
      ...(typeof entry.contentAspect === 'number' && entry.contentAspect > 0
        ? { contentAspect: entry.contentAspect }
        : {}),
      ...(typeof entry.contentViewportWidth === 'number' && entry.contentViewportWidth > 0
        ? { contentViewportWidth: entry.contentViewportWidth }
        : {}),
      ...(entry.threeSettings ? { threeSettings: entry.threeSettings } : {}),
    };
    return migrateMockup(base);
  }

  let imageUrl: string;
  let builtinFrame = entry.builtinFrame;

  if (entry.imagePath) {
    const imgBlob = lookupBlob(idx, entry.imagePath);
    if (!imgBlob) {
      throw new Error(`Bild nicht gefunden: ${entry.imagePath}`);
    }
    imageUrl = await blobToDataUrl(imgBlob);
    builtinFrame = undefined;
  } else if (builtinFrame) {
    imageUrl = TRANSPARENT_PIXEL_GIF;
  } else {
    throw new Error('Flat-Mockup: imagePath oder builtinFrame erforderlich');
  }

  let contentSlots: import('../../types').ContentSlot[] | undefined;
  if (entry.contentSlots?.length) {
    contentSlots = await mapContentSlots(entry.contentSlots, idx, generateId, stores.putContentMedia);
  }

  const base: MockupConfig = {
    id,
    name: entry.name,
    imageUrl,
    ...(builtinFrame ? { builtinFrame } : {}),
    corners: entry.corners,
    deviceType: entry.deviceType,
    isDefault: false,
    ...(typeof entry.contentAspect === 'number' && entry.contentAspect > 0
      ? { contentAspect: entry.contentAspect }
      : {}),
    ...(typeof entry.contentViewportWidth === 'number' && entry.contentViewportWidth > 0
      ? { contentViewportWidth: entry.contentViewportWidth }
      : {}),
    ...(typeof entry.contentInsetPx === 'number' && entry.contentInsetPx > 0
      ? { contentInsetPx: entry.contentInsetPx }
      : {}),
    ...(entry.flatAppearance ? { flatAppearance: entry.flatAppearance } : {}),
    ...(contentSlots?.length ? { contentSlots } : {}),
  };

  return migrateMockup(base);
}

/** Vollständiger Lauf: `virtualFiles` inkl. aller Assets; Manifest-JSON separat (`config.json`-Inhalt). */
export async function runBulkMockupImportPipeline(
  virtualFiles: VirtualPackageFile[],
  configJsonText: string,
  stores: BulkImportBlobStores,
  generateId: () => string = uuidv4,
): Promise<BulkImportResult> {
  const { mockups } = parseBulkImportManifestJson(configJsonText);
  const idx = buildVirtualFileIndex(virtualFiles);
  const imported: MockupConfig[] = [];
  const errors: { index: number; name?: string; message: string }[] = [];

  for (let i = 0; i < mockups.length; i++) {
    const entry = mockups[i]!;
    try {
      const m = await importOneMockupFromEntry(entry, idx, generateId, stores);
      imported.push(m);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push({ index: i, name: entry.name, message: msg });
    }
  }

  return { imported, errors };
}

/** Liest `config.json` aus dem Paket und führt den Import aus. */
export async function importFromVirtualPackageFiles(
  virtualFiles: VirtualPackageFile[],
  stores: BulkImportBlobStores,
  generateId: () => string = uuidv4,
): Promise<BulkImportResult> {
  const cfg = pickConfigBlob(virtualFiles);
  if (!cfg) {
    throw new Error('config.json im Paket nicht gefunden.');
  }
  const text = await cfg.blob.text();
  return runBulkMockupImportPipeline(virtualFiles, text, stores, generateId);
}
