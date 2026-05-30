import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Canvas, useThree } from '@react-three/fiber';
import {
  GizmoHelper,
  GizmoViewport,
  Grid,
  OrbitControls,
  TransformControls,
} from '@react-three/drei';
import * as THREE from 'three';
import {
  Hand,
  Laptop,
  Move3d,
  PanelLeftClose,
  Rotate3d,
  RotateCcw,
  Scaling,
  Sun,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import type { MockupConfig, ThreeSettings } from '../types';
import { DEFAULT_THREE_SETTINGS } from '../lib/threeMockupDefaults';
import { cn } from '../lib/utils';
import { LaptopR3f } from './three/LaptopR3f';
import { GltfScreenModel } from './three/GltfScreenModel';
import { DEFAULT_GLTF_SCREEN_MESH_NAME } from '../lib/gltfConstants';

export type ThreeEditTool = 'orbit' | 'translate' | 'rotate' | 'scale';
export type ThreeEditorSelection = 'light' | 'model' | 'lid';

interface ThreeWysiwygEditorProps {
  open: boolean;
  config: MockupConfig;
  merged: ThreeSettings;
  screenshotUrl: string | null;
  /** Blob-URL aus IndexedDB-GLB; wenn gesetzt, wird das glTF statt des Laptops gerendert. */
  gltfBlobUrl: string | null;
  onClose: () => void;
  onCommit: (patch: Partial<ThreeSettings>) => void;
  onResetCamera: () => void;
  onResetModel: () => void;
}

function hexOk(h: string, fallback: string): string {
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(h) ? h : fallback;
}

function ToolBtn({
  active,
  onClick,
  title,
  children,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={cn(
        'flex h-10 w-10 items-center justify-center rounded-xl border transition-colors',
        active
          ? 'border-sky-500 bg-sky-500/15 text-sky-300'
          : 'border-transparent text-slate-400 hover:bg-slate-800 hover:text-slate-200',
      )}
    >
      {children}
    </button>
  );
}

function OutlinerRow({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2 rounded-lg border px-2 py-2 text-left text-[12px] font-medium transition-colors',
        active
          ? 'border-sky-500/60 bg-sky-500/10 text-sky-100'
          : 'border-slate-700/80 bg-slate-900/40 text-slate-300 hover:border-slate-600',
      )}
    >
      <span className="shrink-0 opacity-90">{icon}</span>
      <span className="truncate">{label}</span>
    </button>
  );
}

function SceneFields({
  merged,
  onCommit,
}: {
  merged: ThreeSettings;
  onCommit: (p: Partial<ThreeSettings>) => void;
}) {
  const [bgT, setBgT] = useState(merged.background === null);
  const [bgHex, setBgHex] = useState(merged.background ?? '#0f172a');

  useEffect(() => {
    setBgT(merged.background === null);
    setBgHex(merged.background ?? '#0f172a');
  }, [merged.background]);

  return (
    <div className="space-y-3 text-[11px]">
      <label className="flex flex-col gap-1">
        <span className="text-slate-500 font-semibold uppercase tracking-wider text-[10px]">
          Umgebungslicht
        </span>
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={hexOk(merged.ambientColor, '#94a3b8')}
            onChange={(e) => onCommit({ ambientColor: e.target.value })}
            className="h-8 w-12 cursor-pointer rounded border border-slate-600 bg-slate-800"
          />
          <input
            type="range"
            min={0}
            max={2}
            step={0.02}
            value={merged.ambientIntensity}
            onChange={(e) => onCommit({ ambientIntensity: Number(e.target.value) })}
            className="flex-1"
          />
        </div>
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-slate-500 font-semibold uppercase tracking-wider text-[10px]">
          Richtlicht
        </span>
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={hexOk(merged.directionalColor, '#ffffff')}
            onChange={(e) => onCommit({ directionalColor: e.target.value })}
            className="h-8 w-12 cursor-pointer rounded border border-slate-600 bg-slate-800"
          />
          <input
            type="range"
            min={0}
            max={3}
            step={0.02}
            value={merged.directionalIntensity}
            onChange={(e) => onCommit({ directionalIntensity: Number(e.target.value) })}
            className="flex-1"
          />
        </div>
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-slate-500 font-semibold uppercase tracking-wider text-[10px]">
          Sichtfeld (FOV)
        </span>
        <input
          type="range"
          min={18}
          max={55}
          step={1}
          value={merged.fov}
          onChange={(e) => onCommit({ fov: Number(e.target.value) })}
          className="w-full"
        />
        <span className="text-slate-500">{merged.fov}°</span>
      </label>
      <div className="space-y-2 border-t border-slate-800 pt-2">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={bgT}
            onChange={(e) => {
              const t = e.target.checked;
              setBgT(t);
              onCommit({ background: t ? null : bgHex });
            }}
            className="rounded border-slate-600"
          />
          <span className="text-slate-300">Hintergrund transparent</span>
        </label>
        {!bgT && (
          <label className="flex items-center justify-between gap-2">
            <span className="text-slate-500">Farbe</span>
            <input
              type="color"
              value={hexOk(bgHex, '#0f172a')}
              onChange={(e) => {
                setBgHex(e.target.value);
                onCommit({ background: e.target.value });
              }}
              className="h-8 w-12 cursor-pointer rounded border border-slate-600 bg-slate-800"
            />
          </label>
        )}
      </div>
    </div>
  );
}

function CameraRig({
  merged,
  orbitEnabled,
  onOrbitEnd,
}: {
  merged: ThreeSettings;
  orbitEnabled: boolean;
  onOrbitEnd: (pos: [number, number, number], tgt: [number, number, number]) => void;
}) {
  const { camera } = useThree();
  const ocRef = useRef<React.ComponentRef<typeof OrbitControls>>(null);

  useLayoutEffect(() => {
    camera.position.set(...merged.cameraPosition);
    (camera as THREE.PerspectiveCamera).fov = merged.fov;
    (camera as THREE.PerspectiveCamera).updateProjectionMatrix();
    const oc = ocRef.current;
    if (oc) {
      oc.target.set(...merged.cameraTarget);
      oc.update();
    }
  }, [merged.cameraPosition, merged.cameraTarget, merged.fov, camera]);

  return (
    <OrbitControls
      ref={ocRef}
      makeDefault
      enableDamping
      dampingFactor={0.08}
      minDistance={1.1}
      maxDistance={12}
      enabled={orbitEnabled}
      onEnd={() => {
        const oc = ocRef.current;
        if (!oc) return;
        onOrbitEnd(
          oc.object.position.toArray() as [number, number, number],
          oc.target.toArray() as [number, number, number],
        );
      }}
    />
  );
}

function EditorScene({
  merged,
  screenshotUrl,
  tool,
  selection,
  orbitEnabled,
  onCommit,
  gltfBlobUrl,
  screenMeshName,
}: {
  merged: ThreeSettings;
  screenshotUrl: string | null;
  tool: ThreeEditTool;
  selection: ThreeEditorSelection;
  orbitEnabled: boolean;
  onCommit: (patch: Partial<ThreeSettings>) => void;
  gltfBlobUrl: string | null;
  screenMeshName: string;
}) {
  const rootRef = useRef<THREE.Group | null>(null);
  const lightGrpRef = useRef<THREE.Group | null>(null);
  const [map, setMap] = useState<THREE.Texture | null>(null);
  const [tcDrag, setTcDrag] = useState(false);
  const [tcAttachV, setTcAttach] = useState(0);

  const rootCb = useCallback((el: THREE.Group | null) => {
    rootRef.current = el;
    if (el) setTcAttach((n) => n + 1);
  }, []);

  const lightCb = useCallback((el: THREE.Group | null) => {
    lightGrpRef.current = el;
    if (el) setTcAttach((n) => n + 1);
  }, []);

  useEffect(() => {
    if (!screenshotUrl) {
      setMap((p) => {
        p?.dispose();
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
        setMap((p) => {
          p?.dispose();
          return tex;
        });
      },
      undefined,
      () => {
        if (!cancelled) setMap((p) => { p?.dispose(); return null; });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [screenshotUrl]);

  useEffect(() => () => setMap((p) => { p?.dispose(); return null; }), []);

  useLayoutEffect(() => {
    const r = rootRef.current;
    if (!r) return;
    r.position.fromArray(merged.modelPosition);
    r.rotation.set(...merged.modelRotation);
    r.scale.fromArray(merged.modelScale);
  }, [merged.modelPosition, merged.modelRotation, merged.modelScale]);

  useLayoutEffect(() => {
    const g = lightGrpRef.current;
    if (!g) return;
    g.position.fromArray(merged.directionalPosition);
  }, [merged.directionalPosition]);

  const flushFromRefs = useCallback(() => {
    const patch: Partial<ThreeSettings> = {};
    const r = rootRef.current;
    const lg = lightGrpRef.current;
    if (r) {
      patch.modelPosition = r.position.toArray() as [number, number, number];
      patch.modelRotation = [r.rotation.x, r.rotation.y, r.rotation.z];
      patch.modelScale = r.scale.toArray() as [number, number, number];
    }
    if (lg) {
      patch.directionalPosition = lg.position.toArray() as [number, number, number];
    }
    onCommit(patch);
  }, [onCommit]);

  const tcObject = useMemo((): THREE.Object3D | null => {
    if (tool === 'orbit') return null;
    if (selection === 'model') return rootRef.current;
    if (selection === 'light' && tool === 'translate') return lightGrpRef.current;
    return null;
  }, [tool, selection, tcAttachV]);

  const tcMode: 'translate' | 'rotate' | 'scale' =
    tool === 'translate' ? 'translate' : tool === 'rotate' ? 'rotate' : 'scale';

  const showTc =
    tool !== 'orbit' &&
    tcObject &&
    (selection === 'model' || (selection === 'light' && tool === 'translate'));

  return (
    <>
      <ambientLight color={merged.ambientColor} intensity={merged.ambientIntensity} />

      <group ref={lightCb}>
        <directionalLight
          castShadow
          color={merged.directionalColor}
          intensity={merged.directionalIntensity}
          position={[0, 0, 0]}
          shadow-mapSize={[1024, 1024]}
        />
        <mesh visible={selection === 'light'} raycast={() => null}>
          <sphereGeometry args={[0.14, 14, 14]} />
          <meshBasicMaterial
            color="#fbbf24"
            transparent
            opacity={0.45}
            depthWrite={false}
          />
        </mesh>
      </group>

      {gltfBlobUrl ? (
        <GltfScreenModel
          url={gltfBlobUrl}
          map={map}
          settings={merged}
          rootRef={rootCb}
          screenMeshName={screenMeshName}
        />
      ) : (
        <LaptopR3f map={map} settings={merged} rootRef={rootCb} />
      )}

      <Grid
        args={[40, 40]}
        cellColor="#1e293b"
        sectionColor="#334155"
        fadeDistance={42}
        infiniteGrid
        position={[0, -0.52, 0]}
      />

      <GizmoHelper alignment="bottom-right" margin={[72, 72]}>
        <GizmoViewport
          axisColors={['#f43f5e', '#22c55e', '#38bdf8']}
          labelColor="white"
        />
      </GizmoHelper>

      {showTc && tcObject && (
        <TransformControls
          object={tcObject}
          mode={selection === 'light' ? 'translate' : tcMode}
          space="world"
          onMouseDown={() => setTcDrag(true)}
          onMouseUp={() => {
            setTcDrag(false);
            flushFromRefs();
          }}
        />
      )}

      <CameraRig
        merged={merged}
        orbitEnabled={orbitEnabled && !tcDrag}
        onOrbitEnd={(pos, tgt) => onCommit({ cameraPosition: pos, cameraTarget: tgt })}
      />
    </>
  );
}

export function ThreeWysiwygEditor({
  open,
  config,
  merged,
  screenshotUrl,
  gltfBlobUrl,
  onClose,
  onCommit,
  onResetCamera,
  onResetModel,
}: ThreeWysiwygEditorProps) {
  const [tool, setTool] = useState<ThreeEditTool>('orbit');
  const [selection, setSelection] = useState<ThreeEditorSelection>('model');
  const isGltfMockup = !!gltfBlobUrl;

  useEffect(() => {
    if (isGltfMockup && selection === 'lid') setSelection('model');
  }, [isGltfMockup, selection]);

  useEffect(() => {
    if (!open) {
      setTool('orbit');
      setSelection('model');
    }
  }, [open, config.id]);

  const mount = typeof document !== 'undefined' ? document.body : null;
  if (!mount) return null;

  const bg = merged.background ?? '#0b1020';

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          role="dialog"
          aria-modal
          aria-label="3D-Studio"
          className="fixed inset-0 z-[500] flex flex-col bg-[#0b1020] text-slate-100"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
        >
          <header className="flex h-12 shrink-0 items-center justify-between border-b border-slate-800 px-3 gap-2 bg-[#0f172a]/95 backdrop-blur-md">
            <div className="flex items-center gap-2 min-w-0">
              <Laptop className="w-4 h-4 text-sky-400 shrink-0" />
              <span className="text-sm font-bold truncate">{config.name}</span>
              <span className="text-[10px] uppercase tracking-widest text-slate-500 shrink-0">
                3D-Studio
              </span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={onResetCamera}
                className="hidden sm:flex items-center gap-1.5 rounded-lg border border-slate-700 px-2.5 py-1.5 text-[11px] font-semibold text-slate-300 hover:bg-slate-800"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Kamera
              </button>
              <button
                type="button"
                onClick={onResetModel}
                className="hidden sm:flex items-center gap-1.5 rounded-lg border border-slate-700 px-2.5 py-1.5 text-[11px] font-semibold text-slate-300 hover:bg-slate-800"
              >
                Modell
              </button>
              <button
                type="button"
                onClick={onClose}
                className="flex items-center gap-1 rounded-lg bg-slate-800 px-2.5 py-1.5 text-[11px] font-bold text-slate-200 hover:bg-slate-700 border border-slate-600"
              >
                <PanelLeftClose className="w-4 h-4" />
                Fertig
              </button>
            </div>
          </header>

          <div className="flex flex-1 min-h-0">
            <nav
              className="flex w-[52px] shrink-0 flex-col items-center gap-1 border-r border-slate-800 bg-[#0f172a] py-2"
              aria-label="Werkzeuge"
            >
              <ToolBtn
                active={tool === 'orbit'}
                onClick={() => setTool('orbit')}
                title="Ansicht drehen (Orbit)"
              >
                <Hand className="w-4 h-4" />
              </ToolBtn>
              <ToolBtn
                active={tool === 'translate'}
                onClick={() => {
                  setSelection('model');
                  setTool('translate');
                }}
                title="Modell verschieben"
              >
                <Move3d className="w-4 h-4" />
              </ToolBtn>
              <ToolBtn
                active={tool === 'rotate'}
                onClick={() => {
                  setSelection('model');
                  setTool('rotate');
                }}
                title="Modell drehen"
              >
                <Rotate3d className="w-4 h-4" />
              </ToolBtn>
              <ToolBtn
                active={tool === 'scale'}
                onClick={() => {
                  setSelection('model');
                  setTool('scale');
                }}
                title="Modell skalieren"
              >
                <Scaling className="w-4 h-4" />
              </ToolBtn>
              <div className="my-1 h-px w-6 bg-slate-700" />
              <ToolBtn
                active={selection === 'light' && tool === 'translate'}
                onClick={() => {
                  setSelection('light');
                  setTool('translate');
                }}
                title="Licht positionieren"
              >
                <Sun className="w-4 h-4" />
              </ToolBtn>
            </nav>

            <div className="relative flex-1 min-w-0 min-h-0 bg-[#020617]">
              <Canvas
                shadows
                className="h-full w-full"
                camera={{
                  position: merged.cameraPosition,
                  fov: merged.fov,
                  near: 0.08,
                  far: 220,
                }}
                gl={{ alpha: false, antialias: true }}
                onCreated={({ gl }) => {
                  gl.outputColorSpace = THREE.SRGBColorSpace;
                }}
              >
                <color attach="background" args={[bg]} />
                <EditorScene
                  merged={merged}
                  screenshotUrl={screenshotUrl}
                  tool={tool}
                  selection={selection}
                  orbitEnabled={tool === 'orbit'}
                  onCommit={onCommit}
                  gltfBlobUrl={gltfBlobUrl}
                  screenMeshName={
                    config.threeScreenMeshName?.trim() || DEFAULT_GLTF_SCREEN_MESH_NAME
                  }
                />
              </Canvas>

              <div className="pointer-events-none absolute bottom-3 left-3 right-3 flex flex-wrap gap-2 text-[10px] text-slate-500">
                <span className="rounded bg-black/45 px-2 py-1 backdrop-blur-sm border border-slate-800">
                  {tool === 'orbit'
                    ? 'Linke Maustaste: drehen · Mausrad: Zoom · Rechts: Schwenken'
                    : selection === 'light'
                      ? 'Licht: am Gizmo ziehen (nur Verschieben)'
                      : 'Achsen-Gizmo am Modell ziehen · Hand-Werkzeug zum Navigieren'}
                </span>
              </div>
            </div>

            <aside className="w-[min(100%,300px)] shrink-0 overflow-y-auto border-l border-slate-800 bg-[#0f172a] p-3 space-y-4">
              <div>
                <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">
                  Szene
                </h3>
                <SceneFields merged={merged} onCommit={onCommit} />
              </div>

              <div>
                <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">
                  Outliner
                </h3>
                <div className="space-y-1">
                  <OutlinerRow
                    active={selection === 'light'}
                    onClick={() => {
                      setSelection('light');
                      setTool('translate');
                    }}
                    icon={<Sun className="w-3.5 h-3.5 text-amber-300" />}
                    label="Sonne (Richtlicht)"
                  />
                  <OutlinerRow
                    active={selection === 'model'}
                    onClick={() => {
                      setSelection('model');
                      if (tool === 'orbit') setTool('translate');
                    }}
                    icon={<Laptop className="w-3.5 h-3.5 text-sky-400" />}
                    label={isGltfMockup ? 'glTF (Modell)' : 'Laptop (Modell)'}
                  />
                  {!isGltfMockup && (
                    <OutlinerRow
                      active={selection === 'lid'}
                      onClick={() => setSelection('lid')}
                      icon={<span className="text-sky-300 text-xs font-mono">⌒</span>}
                      label="Deckel (Winkel)"
                    />
                  )}
                </div>
              </div>

              {!isGltfMockup && selection === 'lid' && (
                <div>
                  <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">
                    Deckel
                  </h3>
                  <label className="block text-[11px] text-slate-400 mb-1">
                    Zusätzliche Öffnung: {Math.round((merged.lidPitchExtra * 180) / Math.PI)}°
                  </label>
                  <input
                    type="range"
                    min={0}
                    max={60}
                    step={1}
                    value={Math.round((merged.lidPitchExtra * 180) / Math.PI)}
                    onChange={(e) => {
                      const deg = Number(e.target.value);
                      onCommit({ lidPitchExtra: (deg * Math.PI) / 180 });
                    }}
                    className="w-full"
                  />
                </div>
              )}

              {!isGltfMockup && (
              <div>
                <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">
                  Material
                </h3>
                <div className="space-y-2 text-[11px]">
                  <label className="flex items-center justify-between gap-2">
                    <span className="text-slate-400">Unterteil</span>
                    <input
                      type="color"
                      value={hexOk(merged.baseColorHex, '#334155')}
                      onChange={(e) => onCommit({ baseColorHex: e.target.value })}
                      className="h-8 w-14 cursor-pointer rounded border border-slate-600 bg-slate-800"
                    />
                  </label>
                  <label className="flex items-center justify-between gap-2">
                    <span className="text-slate-400">Bezel</span>
                    <input
                      type="color"
                      value={hexOk(merged.bezelColorHex, '#1e293b')}
                      onChange={(e) => onCommit({ bezelColorHex: e.target.value })}
                      className="h-8 w-14 cursor-pointer rounded border border-slate-600 bg-slate-800"
                    />
                  </label>
                </div>
              </div>
              )}
            </aside>
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    mount,
  );
}

export function getDefaultModelResetPatch(): Partial<ThreeSettings> {
  return {
    modelPosition: [...DEFAULT_THREE_SETTINGS.modelPosition],
    modelRotation: [...DEFAULT_THREE_SETTINGS.modelRotation],
    modelScale: [...DEFAULT_THREE_SETTINGS.modelScale],
    lidPitchExtra: DEFAULT_THREE_SETTINGS.lidPitchExtra,
    directionalPosition: [...DEFAULT_THREE_SETTINGS.directionalPosition],
    baseColorHex: DEFAULT_THREE_SETTINGS.baseColorHex,
    bezelColorHex: DEFAULT_THREE_SETTINGS.bezelColorHex,
  };
}
