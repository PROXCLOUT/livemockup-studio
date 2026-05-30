/**
 * One-shot WebGL render of the 3D laptop mockup for PNG export.
 */
import * as THREE from 'three';
import type { MockupConfig } from '../types';
import { mergeThreeSettings } from './threeMockupDefaults';
import { createLaptopRoot } from './threeLaptopModel';
import { fetchScreenshot } from './screenshot';
import { getGltf } from './threeGltfStore';
import { createGltfExportRoot } from './threeGltfExportRoot';
import { DEFAULT_GLTF_SCREEN_MESH_NAME } from './gltfConstants';

const EXPORT_W = 1280;
const EXPORT_H = 720;

function loadTextureFromDataUrl(dataUrl: string): Promise<THREE.Texture> {
  const loader = new THREE.TextureLoader();
  return new Promise((resolve, reject) => {
    loader.load(
      dataUrl,
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = 8;
        resolve(tex);
      },
      undefined,
      reject,
    );
  });
}

function disposeObject3D(root: THREE.Object3D) {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.isMesh) {
      mesh.geometry?.dispose();
      const mat = mesh.material;
      if (Array.isArray(mat)) {
        mat.forEach((m) => m.dispose());
      } else {
        mat?.dispose();
      }
    }
  });
}

/** Verhindert doppeltes dispose der gemeinsamen Screenshot-Textur über Material.dispose(). */
function detachSharedScreenshotMap(root: THREE.Object3D, tex: THREE.Texture | null) {
  if (!tex) return;
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const mat of mats) {
      const m = mat as THREE.MeshBasicMaterial;
      if (m?.map === tex) m.map = null;
    }
  });
}

export interface ThreeExportPayload {
  blob: Blob;
  screenshotIncluded: boolean;
}

export async function renderThreeMockupToPng(
  config: MockupConfig,
  websiteUrl: string,
): Promise<ThreeExportPayload> {
  const settings = mergeThreeSettings(config.threeSettings);

  let shotDataUrl: string | null = null;
  const screenshotAttempted = !!(websiteUrl && /^https?:\/\//i.test(websiteUrl));
  if (screenshotAttempted) {
    try {
      // Same as flat export: use canonical URL for screenshot APIs, not iframe proxy.
      shotDataUrl = await fetchScreenshot(websiteUrl, { width: EXPORT_W });
    } catch (err) {
      console.warn('3D export: screenshot fetch failed', err);
    }
  }

  const screenTex = shotDataUrl ? await loadTextureFromDataUrl(shotDataUrl) : null;

  const scene = new THREE.Scene();
  if (settings.background) {
    scene.background = new THREE.Color(settings.background);
  } else {
    scene.background = null;
  }

  const ambient = new THREE.AmbientLight(settings.ambientColor, settings.ambientIntensity);
  scene.add(ambient);

  const dir = new THREE.DirectionalLight(settings.directionalColor, settings.directionalIntensity);
  dir.position.set(...settings.directionalPosition);
  dir.castShadow = true;
  dir.shadow.mapSize.set(1024, 1024);
  scene.add(dir);

  let laptop: THREE.Group;
  if (config.threeGltfAssetId) {
    const blob = await getGltf(config.threeGltfAssetId);
    if (!blob) {
      throw new Error('3D export: GLB/glTF nicht in IndexedDB gefunden.');
    }
    const meshName =
      config.threeScreenMeshName?.trim() || DEFAULT_GLTF_SCREEN_MESH_NAME;
    laptop = await createGltfExportRoot(blob, meshName, screenTex, settings);
  } else {
    laptop = createLaptopRoot(screenTex, settings);
  }
  scene.add(laptop);

  const camera = new THREE.PerspectiveCamera(settings.fov, EXPORT_W / EXPORT_H, 0.08, 200);
  camera.position.set(...settings.cameraPosition);
  camera.lookAt(new THREE.Vector3(...settings.cameraTarget));

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    preserveDrawingBuffer: true,
  });
  renderer.setSize(EXPORT_W, EXPORT_H);
  renderer.setPixelRatio(1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  if (settings.background) {
    renderer.setClearColor(new THREE.Color(settings.background), 1);
  } else {
    renderer.setClearColor(0x000000, 0);
  }

  renderer.render(scene, camera);

  const blob: Blob = await new Promise((resolve, reject) => {
    renderer.domElement.toBlob(
      (b) => {
        if (b) resolve(b);
        else reject(new Error('3D export: toBlob returned null'));
      },
      'image/png',
      1,
    );
  });

  const screenshotIncluded = !!shotDataUrl && !!screenTex;

  detachSharedScreenshotMap(laptop, screenTex);
  disposeObject3D(laptop);
  screenTex?.dispose();
  renderer.dispose();
  ambient.dispose();
  dir.dispose();

  return { blob, screenshotIncluded };
}
