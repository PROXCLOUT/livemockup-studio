import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import type { MockupConfig, ThreeSettings } from '../types';
import { DEFAULT_THREE_SETTINGS, mergeThreeSettings } from '../lib/threeMockupDefaults';
import { cn } from '../lib/utils';

function hexOrEmpty(v: string): string {
  if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v)) return v;
  return '#ffffff';
}

interface MockupThreeSettingsModalProps {
  open: boolean;
  config: MockupConfig;
  onClose: () => void;
  onApply: (next: Partial<ThreeSettings>) => void;
  onResetCamera: () => void;
}

export const MockupThreeSettingsModal: React.FC<MockupThreeSettingsModalProps> = ({
  open,
  config,
  onClose,
  onApply,
  onResetCamera,
}) => {
  const merged = mergeThreeSettings(config.threeSettings);
  const [ambientColor, setAmbientColor] = useState(merged.ambientColor);
  const [ambientIntensity, setAmbientIntensity] = useState(merged.ambientIntensity);
  const [directionalColor, setDirectionalColor] = useState(merged.directionalColor);
  const [directionalIntensity, setDirectionalIntensity] = useState(merged.directionalIntensity);
  const [fov, setFov] = useState(merged.fov);
  const [bgTransparent, setBgTransparent] = useState(merged.background === null);
  const [bgColor, setBgColor] = useState(
    merged.background ?? DEFAULT_THREE_SETTINGS.background ?? '#0f172a',
  );

  useEffect(() => {
    if (!open) return;
    const m = mergeThreeSettings(config.threeSettings);
    setAmbientColor(m.ambientColor);
    setAmbientIntensity(m.ambientIntensity);
    setDirectionalColor(m.directionalColor);
    setDirectionalIntensity(m.directionalIntensity);
    setFov(m.fov);
    setBgTransparent(m.background === null);
    setBgColor(m.background ?? '#0f172a');
  }, [open, config.threeSettings, config.id]);

  const handleSave = () => {
    onApply({
      ambientColor,
      ambientIntensity,
      directionalColor,
      directionalIntensity,
      fov,
      background: bgTransparent ? null : bgColor,
    });
    onClose();
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.button
            type="button"
            aria-label="Schließen"
            className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="three-settings-title"
            className={cn(
              'fixed z-[101] left-1/2 top-1/2 w-[min(92vw,400px)] max-h-[min(88vh,520px)] overflow-y-auto -translate-x-1/2 -translate-y-1/2',
              'rounded-2xl border border-slate-600 bg-[#1e293b] p-5 shadow-2xl text-slate-100',
            )}
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
          >
            <div className="flex items-start justify-between gap-3 mb-4">
              <h2 id="three-settings-title" className="text-sm font-bold tracking-tight">
                3D-Szene
              </h2>
              <button
                type="button"
                onClick={onClose}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700/80"
                aria-label="Schließen"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-[10px] text-slate-500 mb-3 leading-relaxed">
              Kamera frei mit der Maus drehen (Orbit). Änderungen an Licht und Hintergrund
              werden beim Speichern übernommen; die Kameraposition wird beim Loslassen der
              Maus automatisch gemerkt.
            </p>

            <div className="space-y-3 text-[11px]">
              <label className="flex flex-col gap-1">
                <span className="text-slate-400 font-semibold uppercase tracking-wider">
                  Umgebungslicht Farbe
                </span>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={hexOrEmpty(ambientColor)}
                    onChange={(e) => setAmbientColor(e.target.value)}
                    className="h-8 w-14 cursor-pointer rounded border border-slate-600 bg-slate-800"
                  />
                  <input
                    type="range"
                    min={0}
                    max={2}
                    step={0.05}
                    value={ambientIntensity}
                    onChange={(e) => setAmbientIntensity(Number(e.target.value))}
                    className="flex-1"
                  />
                  <span className="w-8 text-right text-slate-400 tabular-nums">
                    {ambientIntensity.toFixed(2)}
                  </span>
                </div>
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-slate-400 font-semibold uppercase tracking-wider">
                  Richtlicht Farbe
                </span>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={hexOrEmpty(directionalColor)}
                    onChange={(e) => setDirectionalColor(e.target.value)}
                    className="h-8 w-14 cursor-pointer rounded border border-slate-600 bg-slate-800"
                  />
                  <input
                    type="range"
                    min={0}
                    max={3}
                    step={0.05}
                    value={directionalIntensity}
                    onChange={(e) => setDirectionalIntensity(Number(e.target.value))}
                    className="flex-1"
                  />
                  <span className="w-8 text-right text-slate-400 tabular-nums">
                    {directionalIntensity.toFixed(2)}
                  </span>
                </div>
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-slate-400 font-semibold uppercase tracking-wider">
                  Sichtfeld (FOV)
                </span>
                <input
                  type="range"
                  min={18}
                  max={55}
                  step={1}
                  value={fov}
                  onChange={(e) => setFov(Number(e.target.value))}
                  className="w-full"
                />
                <span className="text-slate-500">{fov}°</span>
              </label>

              <div className="pt-2 border-t border-slate-700/80 space-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={bgTransparent}
                    onChange={(e) => setBgTransparent(e.target.checked)}
                    className="rounded border-slate-500"
                  />
                  <span className="text-slate-300 font-medium">Hintergrund transparent</span>
                </label>
                {!bgTransparent && (
                  <label className="flex items-center justify-between gap-3">
                    <span className="text-slate-400 font-semibold uppercase tracking-wider">
                      Hintergrundfarbe
                    </span>
                    <input
                      type="color"
                      value={hexOrEmpty(bgColor)}
                      onChange={(e) => setBgColor(e.target.value)}
                      className="h-8 w-14 cursor-pointer rounded border border-slate-600 bg-slate-800"
                    />
                  </label>
                )}
              </div>

              <button
                type="button"
                onClick={() => {
                  onResetCamera();
                }}
                className="w-full py-2 rounded-lg text-xs font-semibold border border-slate-600 text-slate-300 hover:bg-slate-700/60"
              >
                Kamera zurücksetzen
              </button>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-400 hover:bg-slate-700/60"
              >
                Abbrechen
              </button>
              <button
                type="button"
                onClick={handleSave}
                className="px-3 py-1.5 rounded-lg text-xs font-bold bg-sky-500 text-slate-900 hover:bg-sky-400"
              >
                Licht &amp; Hintergrund speichern
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};
