import type { ContentSlot, DeviceType, MockupConfig } from '../types';

/** Default CSS viewport width for live iframe + warp plane (responsive layouts). */
export function defaultContentViewportWidth(deviceType: DeviceType): number {
  switch (deviceType) {
    case 'phone':
      return 390;
    case 'tablet':
      return 768;
    case 'print':
      return 1200;
    case 'laptop':
    case 'custom':
    default:
      return 1280;
  }
}

export function getLogicalContentWidth(
  config: Pick<MockupConfig, 'contentViewportWidth' | 'deviceType' | 'builtinFrame'>,
): number {
  if (
    config.contentViewportWidth != null &&
    config.contentViewportWidth > 0 &&
    Number.isFinite(config.contentViewportWidth)
  ) {
    return Math.round(config.contentViewportWidth);
  }
  /** Eingebaute SVG-Rahmen haben feste sinnvolle Viewports (z. B. Custom mit deviceType falsch). */
  if (config.builtinFrame === 'phone') return 390;
  if (config.builtinFrame === 'studioPhoneNotch' || config.builtinFrame === 'studioPhoneIsland') {
    return 390;
  }
  if (config.builtinFrame === 'tablet') return 768;
  if (
    config.builtinFrame === 'studioTablet' ||
    config.builtinFrame === 'studioTabletThin' ||
    config.builtinFrame === 'studioTabletPhoneCombo'
  ) {
    return 768;
  }
  if (config.builtinFrame === 'laptop') return 1280;
  if (
    config.builtinFrame === 'studioLaptop' ||
    config.builtinFrame === 'studioMonitor' ||
    config.builtinFrame === 'studioDeskLaptopPhone'
  ) {
    return 1280;
  }
  if (config.builtinFrame === 'printBusinessCard') return 900;
  if (config.builtinFrame === 'printPoster') return 1200;
  if (config.builtinFrame === 'printFlyer') return 900;
  if (config.builtinFrame === 'printGeneric') return 1200;
  return defaultContentViewportWidth(config.deviceType);
}

/** Logische Breite für einen Content-Slot (optional Slot-Override). */
export function getSlotLogicalContentWidth(
  config: Pick<MockupConfig, 'contentViewportWidth' | 'deviceType' | 'builtinFrame'>,
  slot: Pick<ContentSlot, 'contentViewportWidth' | 'deviceType'>,
): number {
  return getLogicalContentWidth({
    ...config,
    contentViewportWidth: slot.contentViewportWidth ?? config.contentViewportWidth,
    deviceType: slot.deviceType ?? config.deviceType,
  });
}

/** Logische Höhe für einen Slot (optional Slot-`contentAspect`). */
export function getSlotLogicalContentHeight(
  config: Pick<MockupConfig, 'contentAspect' | 'contentViewportWidth' | 'deviceType' | 'builtinFrame'>,
  slot: Pick<ContentSlot, 'contentAspect' | 'contentViewportWidth' | 'deviceType'>,
  logicalW: number,
  fallbackH = 800,
): number {
  const aspect = slot.contentAspect ?? config.contentAspect;
  return getLogicalContentHeight(aspect, logicalW, fallbackH);
}

/**
 * Height of the logical content box (matches iframe / export warp aspect).
 */
export function getLogicalContentHeight(
  contentAspect: number | null | undefined,
  logicalW: number,
  fallbackH = 800,
): number {
  if (contentAspect != null && contentAspect > 0) {
    return Math.max(1, Math.round(logicalW / contentAspect));
  }
  return fallbackH;
}

const MAX_SCREENSHOT_VIEWPORT_SIDE = 8192;

/**
 * CSS viewport width for screenshot capture (Microlink / proxy / etc.).
 * Matches the live iframe / warp logical width so breakpoints stay aligned with the preview;
 * export pixel size only scales the frame composite, not this viewport.
 */
export function resolveScreenshotFetchWidth(logicalContentW: number): number {
  return Math.min(
    MAX_SCREENSHOT_VIEWPORT_SIDE,
    Math.max(1, Math.round(logicalContentW)),
  );
}
