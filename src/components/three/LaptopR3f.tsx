import React from 'react';
import * as THREE from 'three';
import type { ThreeSettings } from '../../types';
import { LAPTOP_3D } from '../../lib/threeLaptopConstants';

export interface LaptopR3fProps {
  map: THREE.Texture | null;
  settings: ThreeSettings;
  rootRef?: React.Ref<THREE.Group>;
  lidRef?: React.Ref<THREE.Group>;
}

/**
 * Procedural laptop — shared between Karten-Vorschau und 3D-Studio (WYSIWYG).
 */
export function LaptopR3f({ map, settings, rootRef, lidRef }: LaptopR3fProps) {
  const b = LAPTOP_3D;
  const lidRx = b.lidPivot.rotationX + settings.lidPitchExtra;

  return (
    <group
      ref={rootRef}
      position={settings.modelPosition}
      rotation={settings.modelRotation}
      scale={settings.modelScale}
    >
      <mesh position={b.base.position} castShadow receiveShadow>
        <boxGeometry args={[...b.base.size]} />
        <meshStandardMaterial
          color={settings.baseColorHex}
          roughness={0.62}
          metalness={0.12}
        />
      </mesh>
      <group ref={lidRef} position={b.lidPivot.position} rotation={[lidRx, 0, 0]}>
        <mesh position={b.bezel.position} castShadow>
          <boxGeometry args={[...b.bezel.size]} />
          <meshStandardMaterial
            color={settings.bezelColorHex}
            roughness={0.48}
            metalness={0.18}
          />
        </mesh>
        <mesh position={b.screen.position} rotation={[Math.PI, 0, 0]}>
          <planeGeometry args={[b.screen.width, b.screen.height]} />
          <meshBasicMaterial
            map={map ?? undefined}
            color={map ? 0xffffff : 0x020617}
            toneMapped={false}
          />
        </mesh>
      </group>
    </group>
  );
}
