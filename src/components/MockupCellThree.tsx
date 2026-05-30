import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { Camera, CheckCircle2, Loader2, Sparkles, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import type { MockupConfig, ThreeSettings } from '../types';
import { cn } from '../lib/utils';
import { DEFAULT_THREE_SETTINGS, mergeThreeSettings } from '../lib/threeMockupDefaults';
import { LaptopR3f } from './three/LaptopR3f';
import { GltfScreenModel } from './three/GltfScreenModel';
import { ThreeWysiwygEditor, getDefaultModelResetPatch } from './ThreeWysiwygEditor';
import { getGltf } from '../lib/threeGltfStore';
import { DEFAULT_GLTF_SCREEN_MESH_NAME } from '../lib/gltfConstants';
import { MOCKUP_STAGE_DEFAULT_CLASS, MOCKUP_STAGE_TRANSPARENT_CLASS } from '../lib/mockupIframeStyles';

interface MockupCellThreeProps {
  config: MockupConfig;
  screenshotUrl: string | null;
  isSelected: boolean;
  onToggleSelect: () => void;
  onDelete?: () => void;
  onRequestExport: () => void;
  exporting?: boolean;
  exportFormatLabel: string;
  onUpdateMockup: (patch: Partial<MockupConfig>) => void;
}

function CameraAndControls({
  cameraPosition,
  cameraTarget,
  fov,
  onOrbitEnd,
}: {
  cameraPosition: [number, number, number];
  cameraTarget: [number, number, number];
  fov: number;
  onOrbitEnd: (cam: THREE.Vector3, target: THREE.Vector3) => void;
}) {
  const { camera, gl } = useThree();
  const controlsRef = useRef<React.ComponentRef<typeof OrbitControls>>(null);

  useLayoutEffect(() => {
    camera.position.set(...cameraPosition);
    (camera as THREE.PerspectiveCamera).fov = fov;
    (camera as THREE.PerspectiveCamera).updateProjectionMatrix();
    const oc = controlsRef.current;
    if (oc) {
      oc.target.set(...cameraTarget);
      oc.update();
    }
  }, [cameraPosition, cameraTarget, fov, camera, gl]);

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enableDamping
      dampingFactor={0.08}
      minDistance={1.2}
      maxDistance={8}
      onEnd={() => {
        const oc = controlsRef.current;
        if (!oc) return;
        onOrbitEnd(oc.object.position.clone(), oc.target.clone());
      }}
    />
  );
}

function Lights({ settings }: { settings: ThreeSettings }) {
  return (
    <>
      <ambientLight color={settings.ambientColor} intensity={settings.ambientIntensity} />
      <group position={settings.directionalPosition}>
        <directionalLight
          castShadow
          color={settings.directionalColor}
          intensity={settings.directionalIntensity}
          position={[0, 0, 0]}
          shadow-mapSize={[1024, 1024]}
        />
      </group>
    </>
  );
}

function ThreeStage({
  settings,
  screenshotUrl,
  onOrbitEnd,
  gltfBlobUrl,
  screenMeshName,
  onScreenMeshError,
}: {
  settings: ThreeSettings;
  screenshotUrl: string | null;
  onOrbitEnd: (cam: THREE.Vector3, target: THREE.Vector3) => void;
  gltfBlobUrl: string | null;
  screenMeshName: string;
  onScreenMeshError?: (message: string | null) => void;
}) {
  const [map, setMap] = useState<THREE.Texture | null>(null);

  useEffect(() => {
    if (!screenshotUrl) {
      setMap((prev) => {
        prev?.dispose();
        return null;
      });
      return;
    }
    let cancelled = false;
    const loader = new THREE.TextureLoader();
    loader.load(
      screenshotUrl,
      (tex) => {
        if (cancelled) {
          tex.dispose();
          return;
        }
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = 8;
        setMap((prev) => {
          prev?.dispose();
          return tex;
        });
      },
      undefined,
      () => {
        if (!cancelled) {
          setMap((prev) => {
            prev?.dispose();
            return null;
          });
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [screenshotUrl]);

  useEffect(() => {
    return () => {
      setMap((prev) => {
        prev?.dispose();
        return null;
      });
    };
  }, []);

  return (
    <>
      <Lights settings={settings} />
      {gltfBlobUrl ? (
        <GltfScreenModel
          url={gltfBlobUrl}
          map={map}
          settings={settings}
          screenMeshName={screenMeshName}
          onScreenMeshError={onScreenMeshError}
        />
      ) : (
        <LaptopR3f map={map} settings={settings} />
      )}
      <CameraAndControls
        cameraPosition={settings.cameraPosition}
        cameraTarget={settings.cameraTarget}
        fov={settings.fov}
        onOrbitEnd={onOrbitEnd}
      />
    </>
  );
}

export const MockupCellThree: React.FC<MockupCellThreeProps> = ({
  config,
  screenshotUrl,
  isSelected,
  onToggleSelect,
  onDelete,
  onRequestExport,
  exporting = false,
  exportFormatLabel,
  onUpdateMockup,
}) => {
  const [studioOpen, setStudioOpen] = useState(false);
  const merged = mergeThreeSettings(config.threeSettings);
  const gltfAssetId = config.threeGltfAssetId;
  const [gltfBlobUrl, setGltfBlobUrl] = useState<string | null>(null);
  const [gltfStoreErr, setGltfStoreErr] = useState<string | null>(null);
  const [gltfMeshErr, setGltfMeshErr] = useState<string | null>(null);

  const gltfScreenName =
    config.threeScreenMeshName?.trim() || DEFAULT_GLTF_SCREEN_MESH_NAME;

  useEffect(() => {
    setGltfMeshErr(null);
  }, [gltfAssetId, gltfScreenName]);

  useEffect(() => {
    if (!gltfAssetId) {
      setGltfStoreErr(null);
      setGltfBlobUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      return;
    }
    let alive = true;
    void getGltf(gltfAssetId).then((blob) => {
      if (!alive) return;
      if (!blob) {
        setGltfStoreErr('GLB nicht in IndexedDB.');
        setGltfBlobUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return null;
        });
        return;
      }
      setGltfStoreErr(null);
      const url = URL.createObjectURL(blob);
      setGltfBlobUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return url;
      });
    });
    return () => {
      alive = false;
      setGltfBlobUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
    };
  }, [gltfAssetId]);

  const commitCamera = useCallback(
    (pos: THREE.Vector3, target: THREE.Vector3) => {
      onUpdateMockup({
        threeSettings: {
          cameraPosition: pos.toArray() as [number, number, number],
          cameraTarget: target.toArray() as [number, number, number],
        },
      });
    },
    [onUpdateMockup],
  );

  const handleStudioCommit = useCallback(
    (partial: Partial<ThreeSettings>) => {
      onUpdateMockup({ threeSettings: partial });
    },
    [onUpdateMockup],
  );

  const handleResetCamera = useCallback(() => {
    onUpdateMockup({
      threeSettings: {
        cameraPosition: [...DEFAULT_THREE_SETTINGS.cameraPosition],
        cameraTarget: [...DEFAULT_THREE_SETTINGS.cameraTarget],
        fov: DEFAULT_THREE_SETTINGS.fov,
      },
    });
  }, [onUpdateMockup]);

  const handleResetModel = useCallback(() => {
    onUpdateMockup({
      threeSettings: getDefaultModelResetPatch(),
    });
  }, [onUpdateMockup]);

  const stageBg = config.flatAppearance?.stageBackground;
  const stageTransparent = stageBg === null || stageBg === 'transparent';
  const stageDefault = stageBg === undefined;
  const stageSolid =
    typeof stageBg === 'string' && stageBg !== '' && stageBg !== 'transparent';

  return (
    <motion.div
      layout
      data-mockup-id={config.id}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        'group relative flex flex-col bg-[#1E293B] rounded-2xl border transition-all duration-300 overflow-hidden',
        isSelected
          ? 'ring-2 ring-sky-500/50 border-slate-600 shadow-2xl'
          : 'border-slate-700 hover:border-slate-600 hover:shadow-xl shadow-sm',
      )}
    >
      <div className="absolute top-4 left-4 z-30">
        <button
          onClick={onToggleSelect}
          className={cn(
            'w-5 h-5 rounded flex items-center justify-center transition-all border',
            isSelected
              ? 'bg-sky-500 border-sky-500 text-slate-900'
              : 'bg-slate-800/80 backdrop-blur-sm border-slate-600 text-transparent',
          )}
          aria-label="Select for batch export"
        >
          <CheckCircle2 className="w-4 h-4" />
        </button>
      </div>

      <div
        className={cn(
          'relative aspect-[4/3] w-full flex items-center justify-center p-2',
          stageDefault && MOCKUP_STAGE_DEFAULT_CLASS,
          stageTransparent && MOCKUP_STAGE_TRANSPARENT_CLASS,
        )}
        style={stageSolid ? { background: stageBg } : undefined}
      >
        <div className="relative w-full h-full min-h-[200px] rounded-xl overflow-hidden border border-slate-700/80">
          {(gltfStoreErr || gltfMeshErr) && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/65 px-3 text-center text-[11px] font-medium text-red-200">
              {gltfStoreErr || gltfMeshErr}
            </div>
          )}
          <Canvas
            shadows
            className="h-full w-full touch-none"
            camera={{
              position: merged.cameraPosition,
              fov: merged.fov,
              near: 0.08,
              far: 200,
            }}
            gl={{ alpha: true, antialias: true }}
            onCreated={({ gl }) => {
              gl.outputColorSpace = THREE.SRGBColorSpace;
            }}
          >
            {merged.background ? (
              <color attach="background" args={[merged.background]} />
            ) : null}
            <ThreeStage
              settings={merged}
              screenshotUrl={screenshotUrl}
              onOrbitEnd={commitCamera}
              gltfBlobUrl={gltfBlobUrl}
              screenMeshName={gltfScreenName}
              onScreenMeshError={setGltfMeshErr}
            />
          </Canvas>
        </div>
      </div>

      <div className="p-4 border-t border-slate-700/50 flex items-center justify-between bg-[#1E293B]/80 backdrop-blur-sm">
        <div>
          <h3 className="text-xs font-bold text-slate-100 tracking-tight">{config.name}</h3>
          <p className="text-[9px] text-slate-500 uppercase font-bold tracking-widest mt-0.5">
            {config.deviceType} · 3D
            {gltfAssetId ? ' · glTF' : ''}
          </p>
        </div>

        <div className="flex items-center gap-1.5">
          {onDelete && !config.isDefault && (
            <button
              onClick={onDelete}
              className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-400/10 rounded transition-all"
              title="Delete mockup"
              aria-label="Delete mockup"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={() => setStudioOpen(true)}
            className="flex items-center gap-1 rounded-md px-2 py-1.5 text-[10px] font-bold uppercase tracking-wide text-sky-200 bg-sky-500/15 border border-sky-500/40 hover:bg-sky-500/25 transition-all"
            title="3D-Studio (WYSIWYG)"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Studio
          </button>
          <button
            onClick={onRequestExport}
            disabled={exporting}
            className="p-1.5 text-slate-400 hover:text-sky-400 hover:bg-sky-400/10 rounded transition-all disabled:opacity-50 disabled:cursor-wait"
            title={`Export als ${exportFormatLabel}`}
            aria-label={`Export als ${exportFormatLabel}`}
          >
            {exporting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Camera className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>

      <ThreeWysiwygEditor
        open={studioOpen}
        config={config}
        merged={merged}
        screenshotUrl={screenshotUrl}
        gltfBlobUrl={gltfBlobUrl}
        onClose={() => setStudioOpen(false)}
        onCommit={handleStudioCommit}
        onResetCamera={handleResetCamera}
        onResetModel={handleResetModel}
      />

      <AnimatePresence>
        {isSelected && (
          <motion.div
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            exit={{ scaleX: 0 }}
            className="absolute inset-x-0 bottom-0 h-0.5 bg-sky-500 z-20 origin-left"
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}
