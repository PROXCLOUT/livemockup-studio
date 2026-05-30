import * as THREE from 'three';

/**
 * Applies screenshot texture to the named mesh on a glTF scene (cloned instance).
 * Replaces material with a tone-mapped-off basic material suitable for sRGB textures.
 */
export function applyScreenshotToNamedMesh(
  root: THREE.Object3D,
  screenMeshName: string,
  texture: THREE.Texture | null,
): { ok: true } | { ok: false; message: string } {
  const mesh = root.getObjectByName(screenMeshName) as THREE.Mesh | undefined;
  if (!mesh || !mesh.isMesh) {
    return {
      ok: false,
      message: `Kein Mesh mit Namen „${screenMeshName}“. Benenne den Bildschirm im Modell exakt so (glTF).`,
    };
  }

  const prev = mesh.material;
  const disposePrev = () => {
    if (!prev) return;
    if (Array.isArray(prev)) {
      prev.forEach((m) => m.dispose());
    } else {
      (prev as THREE.Material).dispose();
    }
  };

  disposePrev();

  const mat = new THREE.MeshBasicMaterial({
    map: texture ?? undefined,
    color: texture ? 0xffffff : 0x020617,
    toneMapped: false,
  });
  mesh.material = mat;
  return { ok: true };
}

export function disposeGltfClone(root: THREE.Object3D) {
  root.traverse((obj) => {
    const m = obj as THREE.Mesh;
    if (m.isMesh) {
      m.geometry?.dispose();
      const mat = m.material;
      if (Array.isArray(mat)) {
        mat.forEach((x) => x.dispose());
      } else {
        mat?.dispose();
      }
    }
  });
}
