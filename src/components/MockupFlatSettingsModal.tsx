import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import type { FlatAppearance, MockupConfig } from '../types';
import { cn } from '../lib/utils';
import {
  FlatAppearanceForm,
  flatAppearanceFromConfig,
  sanitizeFlatAppearanceForConfig,
} from './FlatAppearanceForm';

interface MockupFlatSettingsModalProps {
  open: boolean;
  config: MockupConfig;
  onClose: () => void;
  onApply: (next: { flatAppearance: FlatAppearance }) => void;
}

export const MockupFlatSettingsModal: React.FC<MockupFlatSettingsModalProps> = ({
  open,
  config,
  onClose,
  onApply,
}) => {
  const [appearance, setAppearance] = useState<FlatAppearance>(() => flatAppearanceFromConfig(config));

  useEffect(() => {
    if (!open) return;
    setAppearance(flatAppearanceFromConfig(config));
  }, [open, config.flatAppearance, config.id]);

  const handleSave = () => {
    onApply({
      flatAppearance: sanitizeFlatAppearanceForConfig(config, appearance),
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
            aria-labelledby="flat-settings-title"
            className={cn(
              'fixed z-[101] left-1/2 top-1/2 w-[min(92vw,380px)] -translate-x-1/2 -translate-y-1/2',
              'rounded-2xl border border-slate-600 bg-[#1e293b] p-5 shadow-2xl text-slate-100',
            )}
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
          >
            <div className="flex items-start justify-between gap-3 mb-4">
              <h2 id="flat-settings-title" className="text-sm font-bold tracking-tight">
                Darstellung
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

            <FlatAppearanceForm config={config} value={appearance} onChange={setAppearance} />

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
                Übernehmen
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};
