/** Seitenverhältnis Breite:Höhe (CSS-Logik-Box) für Content-Slots. */

export interface ContentAspectPreset {
  id: string;
  label: string;
  /** Breite / Höhe */
  aspect: number;
}

export const CONTENT_ASPECT_PRESETS: ContentAspectPreset[] = [
  { id: '1-1', label: '1∶1 Quadrat', aspect: 1 },
  { id: '16-9', label: '16∶9 Quer', aspect: 16 / 9 },
  { id: '9-16', label: '9∶16 Hoch', aspect: 9 / 16 },
  { id: '4-3', label: '4∶3 Quer', aspect: 4 / 3 },
  { id: '3-4', label: '3∶4 Hoch', aspect: 3 / 4 },
  { id: '2-1', label: '2∶1 Quer', aspect: 2 },
  { id: '1-2', label: '1∶2 Hoch', aspect: 1 / 2 },
  { id: '21-9', label: '21∶9', aspect: 21 / 9 },
];

export function formatAspectRatio(aspect: number): string {
  if (!Number.isFinite(aspect) || aspect <= 0) return '—';
  const tol = 0.02;
  for (const p of CONTENT_ASPECT_PRESETS) {
    if (Math.abs(p.aspect - aspect) < tol) return p.label.split(' ')[0] ?? String(aspect);
  }
  return aspect >= 1 ? `${aspect.toFixed(2)}∶1` : `1∶${(1 / aspect).toFixed(2)}`;
}
