import { DEFAULT_MOCKUPS } from '../constants';
import type { Corners, MockupConfig } from '../types';

/**
 * Werkzeug-Standard-Ecken für eingebaute Geräte (aus {@link DEFAULT_MOCKUPS}).
 * Custom-Uploads: `null` (Studio bietet dann nur „Seitenstand“-Reset).
 */
export function getFactoryCornersForConfig(config: MockupConfig): Corners | null {
  const byId = DEFAULT_MOCKUPS.find((m) => m.id === config.id && m.renderMode !== 'three');
  if (byId) return { ...byId.corners };
  if (config.builtinFrame) {
    const byFrame = DEFAULT_MOCKUPS.find(
      (m) => m.builtinFrame === config.builtinFrame && m.renderMode !== 'three',
    );
    if (byFrame) return { ...byFrame.corners };
  }
  return null;
}
