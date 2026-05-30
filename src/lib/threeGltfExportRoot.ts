import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as THREE from 'three';
import type { ThreeSettings } from '../types';
import { applyScreenshotToNamedMesh, disposeGltfClone } from './gltfScreenTexture';

export async function createGltfExportRoot(
  blob: Blob,
  screenMeshName: string,
  screenTexture: THREE.Texture | null,
  settings: ThreeSettings,
): Promise<THREE.Group> {
  const loader = new GLTFLoader();
  const buffer = await blob.arrayBuffer();
  const gltf = await loader.parseAsync(buffer, '');
  const sceneClone = gltf.scene.clone(true);
  const result = applyScreenshotToNamedMesh(sceneClone, screenMeshName, screenTexture);
  if (result.ok === false) {
    disposeGltfClone(sceneClone);
    throw new Error(result.message);
  }
  const wrap = new THREE.Group();
  wrap.position.fromArray(settings.modelPosition);
  wrap.rotation.set(...settings.modelRotation);
  wrap.scale.fromArray(settings.modelScale);
  wrap.add(sceneClone);
  return wrap;
}
