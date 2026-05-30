import React, { useCallback, useEffect, useId, useState } from 'react';
import { motion } from 'motion/react';
import {
  ArrowLeft,
  Box,
  Check,
  ChevronRight,
  ImageIcon,
  Layers,
  X,
} from 'lucide-react';
import type { Corners, DeviceType } from '../types';
import { cn } from '../lib/utils';
import { DEFAULT_GLTF_SCREEN_MESH_NAME, MAX_GLB_BYTES } from '../lib/gltfConstants';
import { CalibrationEditor } from './CalibrationEditor';

function asSvgDataUrl(svgText: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svgText.trim())}`;
}

export function isLikelySvgDocument(text: string): boolean {
  return /<svg[\s>]/i.test(text.trim());
}

export function buildSvgDataUrlFromText(text: string): string | null {
  const t = text.trim();
  if (!isLikelySvgDocument(t)) return null;
  return asSvgDataUrl(t);
}

type DeviceKind = 'svg' | 'raster' | 'three';

interface AddDeviceModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Aktuelle URL für die Kalibrierungs-Iframe-Vorschau */
  previewUrl: string;
  onSaveFlatMockup: (payload: {
    imageUrl: string;
    corners: Corners;
    name: string;
    deviceType: DeviceType;
  }) => void;
  onSubmitGltf: (payload: {
    blob: Blob;
    name: string;
    screenMeshName: string;
    deviceType: DeviceType;
  }) => Promise<void>;
}

const STEPS = ['Typ', 'Inhalt', 'Optionen'] as const;

export const AddDeviceModal: React.FC<AddDeviceModalProps> = ({
  isOpen,
  onClose,
  previewUrl,
  onSaveFlatMockup,
  onSubmitGltf,
}) => {
  const titleId = useId();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [kind, setKind] = useState<DeviceKind | null>(null);

  const [flatImageDataUrl, setFlatImageDataUrl] = useState<string | null>(null);
  const [svgPaste, setSvgPaste] = useState('');
  const [step2Error, setStep2Error] = useState<string | null>(null);

  const [threeName, setThreeName] = useState('Mein 3D-Device');
  const [screenMesh, setScreenMesh] = useState(DEFAULT_GLTF_SCREEN_MESH_NAME);
  const [deviceType, setDeviceType] = useState<DeviceType>('laptop');
  const [gltfFile, setGltfFile] = useState<File | null>(null);
  const [threeBusy, setThreeBusy] = useState(false);
  const [threeError, setThreeError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setStep(1);
    setKind(null);
    setFlatImageDataUrl(null);
    setSvgPaste('');
    setStep2Error(null);
    setThreeName('Mein 3D-Device');
    setScreenMesh(DEFAULT_GLTF_SCREEN_MESH_NAME);
    setDeviceType('laptop');
    setGltfFile(null);
    setThreeBusy(false);
    setThreeError(null);
  }, [isOpen]);

  const selectKind = (k: DeviceKind) => {
    setKind(k);
    setStep2Error(null);
    setFlatImageDataUrl(null);
    setSvgPaste('');
    setGltfFile(null);
    setStep(2);
  };

  const readFileAsDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = () => reject(new Error('read'));
      r.readAsDataURL(file);
    });

  const handleRasterPick = async (files: FileList | null) => {
    setStep2Error(null);
    const file = files?.[0];
    if (!file) return;
    try {
      const url = await readFileAsDataUrl(file);
      setFlatImageDataUrl(url);
    } catch {
      setStep2Error('Bild konnte nicht gelesen werden.');
    }
  };

  const handleSvgFilePick = async (files: FileList | null) => {
    setStep2Error(null);
    const file = files?.[0];
    if (!file) return;
    const text = await file.text();
    const url = buildSvgDataUrlFromText(text);
    if (!url) {
      setStep2Error('Kein gültiges SVG (Root-Element <svg> fehlt).');
      return;
    }
    setFlatImageDataUrl(url);
  };

  const validateStep2Flat = () => {
    setStep2Error(null);
    if (kind === 'svg') {
      if (svgPaste.trim()) {
        const url = buildSvgDataUrlFromText(svgPaste);
        if (!url) {
          setStep2Error('Eingefügtes SVG ist ungültig (<svg> fehlt).');
          return false;
        }
        setFlatImageDataUrl(url);
        return true;
      }
      if (!flatImageDataUrl) {
        setStep2Error('Bitte SVG-Datei wählen oder SVG-Code einfügen.');
        return false;
      }
      return true;
    }
    if (kind === 'raster') {
      if (!flatImageDataUrl) {
        setStep2Error('Bitte ein Bild hochladen.');
        return false;
      }
      return true;
    }
    return false;
  };

  const goNextFromStep2 = () => {
    if (kind === 'svg' || kind === 'raster') {
      if (!validateStep2Flat()) return;
      setStep(3);
      return;
    }
    if (kind === 'three') {
      setStep2Error(null);
      if (!gltfFile) {
        setStep2Error('Bitte eine .glb- oder .gltf-Datei wählen.');
        return;
      }
      if (
        !gltfFile.name.toLowerCase().endsWith('.glb') &&
        !gltfFile.name.toLowerCase().endsWith('.gltf')
      ) {
        setStep2Error('Nur .glb oder .gltf (empfohlen: .glb).');
        return;
      }
      if (gltfFile.size > MAX_GLB_BYTES) {
        setStep2Error(`Datei zu groß (max. ${Math.round(MAX_GLB_BYTES / (1024 * 1024))} MB).`);
        return;
      }
      setStep(3);
    }
  };

  const handleFlatCalibrationSave = useCallback(
    (corners: Corners, name: string, type: DeviceType) => {
      if (!flatImageDataUrl) return;
      onSaveFlatMockup({
        imageUrl: flatImageDataUrl,
        corners,
        name,
        deviceType: type,
      });
      onClose();
    },
    [flatImageDataUrl, onClose, onSaveFlatMockup],
  );

  const handleThreeFinish = useCallback(async () => {
    if (!gltfFile) return;
    setThreeError(null);
    setThreeBusy(true);
    try {
      await onSubmitGltf({
        blob: gltfFile,
        name: threeName.trim() || '3D Mockup',
        screenMeshName: screenMesh.trim() || DEFAULT_GLTF_SCREEN_MESH_NAME,
        deviceType,
      });
      onClose();
    } catch (e) {
      console.error(e);
      setThreeError('Import fehlgeschlagen. Siehe Konsole.');
    } finally {
      setThreeBusy(false);
    }
  }, [deviceType, gltfFile, onClose, onSubmitGltf, screenMesh, threeName]);

  const goBack = () => {
    setStep2Error(null);
    setThreeError(null);
    if (step === 2) {
      setStep(1);
      setKind(null);
      setFlatImageDataUrl(null);
      setSvgPaste('');
      setGltfFile(null);
    } else if (step === 3) {
      setStep(2);
    }
  };

  if (!isOpen) return null;

  const showFlatStep3 = step === 3 && (kind === 'svg' || kind === 'raster') && flatImageDataUrl;
  const showThreeStep3 = step === 3 && kind === 'three';

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        className={cn(
          'relative w-full rounded-2xl border border-slate-600 bg-[#0F172A] shadow-2xl flex flex-col overflow-hidden',
          showFlatStep3 ? 'max-w-6xl max-h-[min(94vh,900px)]' : 'max-w-lg max-h-[min(92vh,720px)]',
        )}
      >
        <button
          type="button"
          onClick={onClose}
          disabled={threeBusy}
          className="absolute top-3 right-3 z-20 p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 disabled:opacity-40"
          aria-label="Schließen"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="px-5 pt-5 pb-3 border-b border-slate-800 shrink-0 pr-12">
          <h2 id={titleId} className="text-lg font-bold text-slate-100">
            New Device
          </h2>
          <nav className="mt-4 flex items-center gap-1" aria-label="Schritte">
            {STEPS.map((label, i) => {
              const n = (i + 1) as 1 | 2 | 3;
              const active = step === n;
              const done = step > n;
              return (
                <React.Fragment key={label}>
                  {i > 0 && (
                    <ChevronRight className="w-3.5 h-3.5 text-slate-600 shrink-0" aria-hidden />
                  )}
                  <span
                    className={cn(
                      'text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-md',
                      active && 'bg-sky-500/20 text-sky-300 ring-1 ring-sky-500/40',
                      done && !active && 'text-emerald-400/90',
                      !active && !done && 'text-slate-600',
                    )}
                  >
                    {n}. {label}
                  </span>
                </React.Fragment>
              );
            })}
          </nav>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
          {step === 1 && (
            <div className="p-5 space-y-3">
              <p className="text-xs text-slate-500 mb-4">
                Wähle, was du anlegen möchtest. Im nächsten Schritt lädst du Inhalte hoch oder fügst sie ein.
              </p>
              <button
                type="button"
                onClick={() => selectKind('svg')}
                className="w-full flex items-center gap-3 rounded-xl border border-slate-700 bg-slate-900/40 p-4 text-left hover:border-sky-500/50 hover:bg-sky-500/5 transition-colors"
              >
                <div className="w-11 h-11 rounded-lg bg-sky-500/15 border border-sky-500/30 flex items-center justify-center shrink-0">
                  <Layers className="w-5 h-5 text-sky-400" />
                </div>
                <div>
                  <div className="text-sm font-bold text-slate-100">SVG-Gerät</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">Vektor-Rahmen, kein Live-HTML</div>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-600 ml-auto shrink-0" />
              </button>
              <button
                type="button"
                onClick={() => selectKind('raster')}
                className="w-full flex items-center gap-3 rounded-xl border border-slate-700 bg-slate-900/40 p-4 text-left hover:border-emerald-500/50 hover:bg-emerald-500/5 transition-colors"
              >
                <div className="w-11 h-11 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center shrink-0">
                  <ImageIcon className="w-5 h-5 text-emerald-400" />
                </div>
                <div>
                  <div className="text-sm font-bold text-slate-100">Custom Bild</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">PNG, JPEG, WebP …</div>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-600 ml-auto shrink-0" />
              </button>
              <button
                type="button"
                onClick={() => selectKind('three')}
                className="w-full flex items-center gap-3 rounded-xl border border-slate-700 bg-slate-900/40 p-4 text-left hover:border-violet-500/50 hover:bg-violet-500/5 transition-colors"
              >
                <div className="w-11 h-11 rounded-lg bg-violet-500/15 border border-violet-500/30 flex items-center justify-center shrink-0">
                  <Box className="w-5 h-5 text-violet-300" />
                </div>
                <div>
                  <div className="text-sm font-bold text-slate-100">3D (glTF / GLB)</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">Screen-Mesh z. B. LM_Screen</div>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-600 ml-auto shrink-0" />
              </button>
            </div>
          )}

          {step === 2 && kind === 'svg' && (
            <div className="p-5 space-y-4">
              <p className="text-xs text-slate-400">
                SVG-Datei wählen oder Code einfügen. Schritt 3: vier Ecken für die Iframe-Fläche setzen.
              </p>
              <label className="flex flex-col gap-1">
                <span className="text-[10px] font-bold uppercase text-slate-500">SVG-Datei</span>
                <input
                  type="file"
                  accept=".svg,image/svg+xml"
                  className="text-xs text-slate-300 file:mr-2 file:rounded file:border-0 file:bg-slate-700 file:px-2 file:py-1"
                  onChange={(e) => void handleSvgFilePick(e.target.files)}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[10px] font-bold uppercase text-slate-500">Oder SVG einfügen</span>
                <textarea
                  value={svgPaste}
                  onChange={(e) => setSvgPaste(e.target.value)}
                  rows={6}
                  placeholder="<svg viewBox='0 0 800 600' …>"
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-mono text-slate-200"
                />
              </label>
              {step2Error && <p className="text-[11px] text-red-400">{step2Error}</p>}
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={goBack}
                  className="flex items-center gap-1.5 rounded-lg border border-slate-600 px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-800"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  Zurück
                </button>
                <button
                  type="button"
                  onClick={goNextFromStep2}
                  className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-sky-600 px-3 py-2 text-xs font-bold text-white hover:bg-sky-500"
                >
                  Weiter
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {step === 2 && kind === 'raster' && (
            <div className="p-5 space-y-4">
              <p className="text-xs text-slate-400">
                Bild mit sichtbarem Display. Anschließend positionierst du im nächsten Schritt die Iframe-Ecken.
              </p>
              <label
                className={cn(
                  'flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-600 bg-slate-950/50 px-4 py-10 text-center hover:border-emerald-500/50',
                  flatImageDataUrl && 'border-emerald-500/40 bg-emerald-500/5',
                )}
              >
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/jpg,image/gif,image/webp,image/avif,.png,.jpg,.jpeg,.gif,.webp,.avif"
                  className="sr-only"
                  onChange={(e) => void handleRasterPick(e.target.files)}
                />
                {flatImageDataUrl ? (
                  <>
                    <Check className="w-8 h-8 text-emerald-400 mb-2" />
                    <span className="text-xs font-bold text-emerald-300">Bild geladen</span>
                    <img
                      src={flatImageDataUrl}
                      alt=""
                      className="mt-3 max-h-32 rounded border border-slate-700 object-contain"
                    />
                  </>
                ) : (
                  <>
                    <ImageIcon className="w-10 h-10 text-slate-600 mb-2" />
                    <span className="text-xs font-bold text-slate-400">Klicken oder ablegen</span>
                  </>
                )}
              </label>
              {step2Error && <p className="text-[11px] text-red-400">{step2Error}</p>}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={goBack}
                  className="flex items-center gap-1.5 rounded-lg border border-slate-600 px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-800"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  Zurück
                </button>
                <button
                  type="button"
                  onClick={goNextFromStep2}
                  className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-sky-600 px-3 py-2 text-xs font-bold text-white hover:bg-sky-500"
                >
                  Weiter
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {step === 2 && kind === 'three' && (
            <div className="p-5 space-y-4">
              <p className="text-xs text-slate-400">
                Eine <strong className="text-slate-300">.glb</strong> (empfohlen). Externe .gltf-Assets ohne
                Einbettung werden nicht unterstützt.
              </p>
              <label
                className={cn(
                  'flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-600 bg-slate-950/50 px-4 py-10 text-center hover:border-violet-500/50',
                  gltfFile && 'border-violet-500/40 bg-violet-500/5',
                )}
              >
                <input
                  type="file"
                  accept=".glb,.gltf"
                  className="sr-only"
                  onChange={(e) => {
                    setStep2Error(null);
                    const f = e.target.files?.[0];
                    setGltfFile(f ?? null);
                    e.target.value = '';
                  }}
                />
                {gltfFile ? (
                  <>
                    <Check className="w-8 h-8 text-violet-400 mb-2" />
                    <span className="text-xs font-bold text-violet-200 break-all px-2">{gltfFile.name}</span>
                  </>
                ) : (
                  <>
                    <Box className="w-10 h-10 text-slate-600 mb-2" />
                    <span className="text-xs font-bold text-slate-400">GLB / glTF wählen</span>
                  </>
                )}
              </label>
              {step2Error && <p className="text-[11px] text-red-400">{step2Error}</p>}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={goBack}
                  className="flex items-center gap-1.5 rounded-lg border border-slate-600 px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-800"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  Zurück
                </button>
                <button
                  type="button"
                  onClick={goNextFromStep2}
                  className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-sky-600 px-3 py-2 text-xs font-bold text-white hover:bg-sky-500"
                >
                  Weiter
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {showFlatStep3 && (
            <motion.div
              key="cal"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col min-h-[min(80vh,820px)] max-h-[min(90vh,880px)]"
            >
              <CalibrationEditor
                active={step === 3 && !!flatImageDataUrl && (kind === 'svg' || kind === 'raster')}
                imageUrl={flatImageDataUrl}
                previewUrl={previewUrl}
                variant="embedded"
                onSave={handleFlatCalibrationSave}
                leadingHeaderActions={
                  <button
                    type="button"
                    onClick={goBack}
                    className="flex items-center gap-1 rounded-lg border border-slate-600 px-2 py-1 text-[10px] font-semibold text-slate-300 hover:bg-slate-800 shrink-0"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    Zurück
                  </button>
                }
              />
            </motion.div>
          )}

          {showThreeStep3 && (
            <div className="p-5 space-y-4">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={goBack}
                  className="flex items-center gap-1 rounded-lg border border-slate-600 px-2 py-1.5 text-[11px] font-semibold text-slate-300 hover:bg-slate-800"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  Zurück
                </button>
                <span className="text-xs text-slate-500">Optionen für das 3D-Device</span>
              </div>
              <label className="flex flex-col gap-1 text-[11px]">
                <span className="text-slate-500 font-semibold">Anzeigename</span>
                <input
                  value={threeName}
                  onChange={(e) => setThreeName(e.target.value)}
                  className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-100"
                />
              </label>
              <label className="flex flex-col gap-1 text-[11px]">
                <span className="text-slate-500 font-semibold">Screen-Mesh (Name)</span>
                <input
                  value={screenMesh}
                  onChange={(e) => setScreenMesh(e.target.value)}
                  className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs font-mono text-slate-100"
                />
              </label>
              <label className="flex flex-col gap-1 text-[11px]">
                <span className="text-slate-500 font-semibold">Gerätekategorie</span>
                <select
                  value={deviceType}
                  onChange={(e) => setDeviceType(e.target.value as DeviceType)}
                  className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-100"
                >
                  <option value="laptop">Laptop</option>
                  <option value="phone">Phone</option>
                  <option value="tablet">Tablet</option>
                  <option value="print">Druck / Print</option>
                  <option value="custom">Custom</option>
                </select>
              </label>
              <p className="text-[10px] text-slate-500 leading-relaxed">
                Mesh <code className="text-violet-300/90">{screenMesh.trim() || DEFAULT_GLTF_SCREEN_MESH_NAME}</code>{' '}
                erhält den Screenshot. Sehr große GLBs können langsam laden.
              </p>
              {threeError && <p className="text-[11px] text-red-400">{threeError}</p>}
              <button
                type="button"
                disabled={threeBusy}
                onClick={() => void handleThreeFinish()}
                className="w-full rounded-lg bg-violet-600 py-3 text-xs font-bold text-white hover:bg-violet-500 disabled:opacity-50"
              >
                {threeBusy ? 'Import …' : 'Device anlegen'}
              </button>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
};
