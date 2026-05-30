import React, { Suspense, useEffect, useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import type { ThreeSettings } from '../../types';
import { applyScreenshotToNamedMesh, disposeGltfClone } from '../../lib/gltfScreenTexture';

function GltfFromUrl({
  url,
  map,
  settings,
  rootRef,
  screenMeshName,
  onScreenMeshError,
}: {
  url: string;
  map: THREE.Texture | null;
  settings: ThreeSettings;
  rootRef?: React.Ref<THREE.Group>;
  screenMeshName: string;
  onScreenMeshError?: (message: string | null) => void;
}) {
  const gltf = useGLTF(url);
  const clone = useMemo(() => gltf.scene.clone(true), [gltf.scene, url]);

  useEffect(() => {
    return () => {
      disposeGltfClone(clone);
    };
  }, [clone]);

  useEffect(() => {
    const result = applyScreenshotToNamedMesh(clone, screenMeshName, map);
    if (result.ok === false) {
      onScreenMeshError?.(result.message);
    } else {
      onScreenMeshError?.(null);
    }
  }, [clone, map, screenMeshName, onScreenMeshError]);

  return (
    <group
      ref={rootRef}
      position={settings.modelPosition}
      rotation={settings.modelRotation}
      scale={settings.modelScale}
    >
      <primitive object={clone} />
    </group>
  );
}

export interface GltfScreenModelProps {
  url: string;
  map: THREE.Texture | null;
  settings: ThreeSettings;
  rootRef?: React.Ref<THREE.Group>;
  screenMeshName: string;
  onScreenMeshError?: (message: string | null) => void;
}

/**
 * glTF-Szene mit Screenshot auf dem benannten Screen-Mesh; Root-Transform wie beim prozeduralen Laptop.
 */
export function GltfScreenModel(props: GltfScreenModelProps) {
  return (
    <Suspense fallback={null}>
      <GltfFromUrl {...props} />
    </Suspense>
  );
}
