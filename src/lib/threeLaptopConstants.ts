/**
 * Shared layout numbers for the procedural 3D laptop (preview + PNG export).
 * Keep preview (R3F) and imperative export in sync when changing these.
 */
export const LAPTOP_3D = {
  base: {
    size: [2.45, 0.11, 1.58] as [number, number, number],
    position: [0, -0.07, 0] as [number, number, number],
    color: 0x334155,
  },
  lidPivot: {
    position: [0, 0.015, -0.74] as [number, number, number],
    rotationX: -0.38,
  },
  bezel: {
    size: [2.32, 0.065, 1.46] as [number, number, number],
    position: [0, 0.038, 0] as [number, number, number],
    color: 0x1e293b,
  },
  /** PlaneGeometry args — screen is X×Y in lid space, facing +Z. */
  screen: {
    width: 2.05,
    height: 1.15,
    position: [0, 0.038, 0.036] as [number, number, number],
  },
} as const;
