import type { ThreeSettings } from '../types';

export const DEFAULT_THREE_SETTINGS: ThreeSettings = {
  cameraPosition: [2.2, 1.35, 2.45],
  cameraTarget: [0, 0.35, 0],
  fov: 38,
  ambientColor: '#94a3b8',
  ambientIntensity: 0.55,
  directionalColor: '#ffffff',
  directionalIntensity: 1.15,
  background: '#0f172a',
  modelPosition: [0, 0, 0],
  modelRotation: [0, 0, 0],
  modelScale: [1, 1, 1],
  lidPitchExtra: 0,
  directionalPosition: [4.5, 7.5, 5.5],
  baseColorHex: '#334155',
  bezelColorHex: '#1e293b',
};

export function mergeThreeSettings(partial?: Partial<ThreeSettings>): ThreeSettings {
  const d = DEFAULT_THREE_SETTINGS;
  return {
    ...d,
    ...partial,
    cameraPosition: partial?.cameraPosition ?? d.cameraPosition,
    cameraTarget: partial?.cameraTarget ?? d.cameraTarget,
    modelPosition: partial?.modelPosition ?? d.modelPosition,
    modelRotation: partial?.modelRotation ?? d.modelRotation,
    modelScale: partial?.modelScale ?? d.modelScale,
    lidPitchExtra: partial?.lidPitchExtra ?? d.lidPitchExtra,
    directionalPosition: partial?.directionalPosition ?? d.directionalPosition,
    baseColorHex: partial?.baseColorHex ?? d.baseColorHex,
    bezelColorHex: partial?.bezelColorHex ?? d.bezelColorHex,
  };
}
