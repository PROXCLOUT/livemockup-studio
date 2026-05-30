import { v4 as uuidv4 } from 'uuid';
import type { ContentSlot, ContentSlotSource, Corners, MockupConfig } from '../types';

export const MAX_CONTENT_SLOTS = 8;

function cloneCorners(c: Corners): Corners {
  return {
    tl: { ...c.tl },
    tr: { ...c.tr },
    br: { ...c.br },
    bl: { ...c.bl },
  };
}

function cloneSlot(s: ContentSlot): ContentSlot {
  return {
    ...s,
    corners: cloneCorners(s.corners),
  };
}

/**
 * Effektive Slot-Liste: entweder persistierte `contentSlots` oder ein synthetischer
 * Slot aus `corners` + primärer App-URL.
 */
export function getEffectiveContentSlots(config: MockupConfig): ContentSlot[] {
  if (config.contentSlots && config.contentSlots.length > 0) {
    return config.contentSlots.map(cloneSlot);
  }
  return [
    {
      id: 'primary',
      corners: cloneCorners(config.corners),
      source: { kind: 'usePrimarySiteUrl' },
      contentViewportWidth: config.contentViewportWidth,
      contentAspect: config.contentAspect,
      contentInsetPx: config.contentInsetPx,
    },
  ];
}

/** Persistenz-Patch: Slots + erste Fläche bei Einzel-Slot auf Mockup-Ebene spiegeln. */
export function mockupPatchForContentSlots(next: ContentSlot[]): Partial<MockupConfig> {
  const patch: Partial<MockupConfig> = {
    contentSlots: next.length ? next : undefined,
    corners: cornersFromFirstSlot(next),
  };
  if (next.length === 1) {
    const s0 = next[0]!;
    patch.contentAspect =
      s0.contentAspect != null && s0.contentAspect > 0 ? s0.contentAspect : undefined;
    patch.contentInsetPx =
      s0.contentInsetPx != null && s0.contentInsetPx > 0 ? s0.contentInsetPx : undefined;
    if (s0.deviceType != null) {
      patch.deviceType = s0.deviceType;
    }
  }
  return patch;
}

/** Nur ein Slot und dieser nutzt die globale Header-URL (Prefetch-Optimierung). */
export function isSinglePrimaryUrlSlot(config: MockupConfig): boolean {
  const slots = config.contentSlots;
  if (slots && slots.length === 1 && slots[0]!.source.kind === 'usePrimarySiteUrl') {
    return true;
  }
  if (!slots || slots.length === 0) return true;
  return false;
}

export function collectContentMediaAssetIds(config: MockupConfig): string[] {
  const ids = new Set<string>();
  for (const s of config.contentSlots ?? []) {
    if (s.source.kind === 'imageAsset') ids.add(s.source.assetId);
    if (s.source.kind === 'videoAsset') {
      ids.add(s.source.assetId);
      if (s.source.posterAssetId) ids.add(s.source.posterAssetId);
    }
  }
  return [...ids];
}

/** Schrumpft ein Viereck Richtung Schwerpunkt (für neuen Slot). */
export function insetCornersTowardCenter(c: Corners, factor: number): Corners {
  const cx = (c.tl.x + c.tr.x + c.br.x + c.bl.x) / 4;
  const cy = (c.tl.y + c.tr.y + c.br.y + c.bl.y) / 4;
  const lerp = (p: { x: number; y: number }) => ({
    x: cx + (p.x - cx) * factor,
    y: cy + (p.y - cy) * factor,
  });
  return {
    tl: lerp(c.tl),
    tr: lerp(c.tr),
    br: lerp(c.br),
    bl: lerp(c.bl),
  };
}

export function createAdditionalSlot(referenceCorners: Corners): ContentSlot {
  return {
    id: uuidv4(),
    corners: insetCornersTowardCenter(referenceCorners, 0.45),
    source: { kind: 'usePrimarySiteUrl' },
  };
}

/** Erste Slot-Ecken → Top-Level `corners` (Legacy / Export-Rahmenlogik). */
export function cornersFromFirstSlot(slots: ContentSlot[]): Corners {
  return cloneCorners(slots[0]!.corners);
}

/** Auflösbare http(s)-URL für Iframe/Screenshot, sonst `null`. */
export function resolveSlotSiteUrl(
  source: ContentSlotSource,
  primaryUrl: string,
): string | null {
  const p = primaryUrl.trim();
  if (source.kind === 'usePrimarySiteUrl') {
    return p && /^https?:\/\//i.test(p) ? p : null;
  }
  if (source.kind === 'iframeUrl') {
    const u = source.url.trim();
    return u && /^https?:\/\//i.test(u) ? u : null;
  }
  return null;
}

export function slotWebScreenshotAttempted(
  source: ContentSlotSource,
  primaryUrl: string,
): boolean {
  return resolveSlotSiteUrl(source, primaryUrl) != null;
}
