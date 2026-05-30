import * as THREE from 'three';
import type { ThreeSettings } from '../types';
import { LAPTOP_3D } from './threeLaptopConstants';

/**
 * Procedural laptop mesh for imperative Three.js rendering (export pipeline).
 * Muss dieselbe Geometrie wie {@link LaptopR3f} ergeben.
 */
export function createLaptopRoot(
  screenTexture: THREE.Texture | null,
  settings: ThreeSettings,
): THREE.Group {
  const root = new THREE.Group();
  root.position.fromArray(settings.modelPosition);
  root.rotation.set(...settings.modelRotation);
  root.scale.fromArray(settings.modelScale);

  const baseGeom = new THREE.BoxGeometry(...LAPTOP_3D.base.size);
  const baseMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(settings.baseColorHex),
    roughness: 0.62,
    metalness: 0.12,
  });
  const baseMesh = new THREE.Mesh(baseGeom, baseMat);
  baseMesh.position.set(...LAPTOP_3D.base.position);
  baseMesh.castShadow = true;
  baseMesh.receiveShadow = true;
  root.add(baseMesh);

  const lidPivot = new THREE.Group();
  lidPivot.position.set(...LAPTOP_3D.lidPivot.position);
  lidPivot.rotation.x = LAPTOP_3D.lidPivot.rotationX + settings.lidPitchExtra;
  root.add(lidPivot);

  const bezelGeom = new THREE.BoxGeometry(...LAPTOP_3D.bezel.size);
  const bezelMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(settings.bezelColorHex),
    roughness: 0.48,
    metalness: 0.18,
  });
  const bezelMesh = new THREE.Mesh(bezelGeom, bezelMat);
  bezelMesh.position.set(...LAPTOP_3D.bezel.position);
  bezelMesh.castShadow = true;
  lidPivot.add(bezelMesh);

  const planeGeom = new THREE.PlaneGeometry(LAPTOP_3D.screen.width, LAPTOP_3D.screen.height);
  const screenMat = new THREE.MeshBasicMaterial({
    map: screenTexture ?? undefined,
    color: screenTexture ? 0xffffff : 0x020617,
  });
  const screenMesh = new THREE.Mesh(planeGeom, screenMat);
  screenMesh.position.set(...LAPTOP_3D.screen.position);
  screenMesh.rotation.x = Math.PI;
  screenMesh.castShadow = false;
  lidPivot.add(screenMesh);

  return root;
}
