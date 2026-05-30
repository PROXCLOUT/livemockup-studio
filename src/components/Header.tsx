import React, { useEffect, useRef, useState } from 'react';
import { Plus, Layout, ChevronDown, SlidersHorizontal, Settings, FolderInput } from 'lucide-react';
import { motion } from 'motion/react';
import type { ScreenshotStatus } from '../lib/useScreenshot';
import type { ExportUiSettings } from '../lib/export';
import { exportFormatShortLabel } from '../lib/export';
import { ExportSettingsForm } from './ExportSettingsForm';

interface HeaderProps {
  url: string;
  setUrl: (url: string) => void;
  onAddMockup: () => void;
  onBulkImport: () => void;
  onOpenSettings: () => void;
  onExportSelected: () => void;
  selectedCount: number;
  hasXFrameError: boolean;
  screenshotStatus: ScreenshotStatus;
  exporting: boolean;
  exportSettings: ExportUiSettings;
  onExportSettingsChange: (next: ExportUiSettings) => void;
}

export const Header: React.FC<HeaderProps> = ({
  url,
  setUrl,
  onAddMockup,
  onBulkImport,
  onOpenSettings,
  onExportSelected,
  selectedCount,
  hasXFrameError,
  screenshotStatus,
  exporting,
  exportSettings,
  onExportSettingsChange,
}) => {
  const [optionsOpen, setOptionsOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!optionsOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOptionsOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [optionsOpen]);

  const statusBadge = (() => {
    if (screenshotStatus === 'loading') {
      return (
        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-sky-500/10 border border-sky-500/20">
          <span className="flex h-1.5 w-1.5 rounded-full bg-sky-400 animate-pulse" />
          <span className="text-[9px] text-sky-400 uppercase font-bold">Capturing</span>
        </div>
      );
    }
    if (screenshotStatus === 'error') {
      return (
        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-red-500/10 border border-red-500/20">
          <span className="flex h-1.5 w-1.5 rounded-full bg-red-500" />
          <span className="text-[9px] text-red-400 uppercase font-bold">Capture Failed</span>
        </div>
      );
    }
    if (hasXFrameError) {
      return (
        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20">
          <span className="flex h-1.5 w-1.5 rounded-full bg-amber-500" />
          <span className="text-[9px] text-amber-400 uppercase font-bold">Iframe Blocked</span>
        </div>
      );
    }
    if (screenshotStatus === 'ready') {
      return (
        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
          <span className="flex h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-[9px] text-emerald-500 uppercase font-bold">Export Ready</span>
        </div>
      );
    }
    return (
      <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-slate-500/10 border border-slate-500/20">
        <span className="flex h-1.5 w-1.5 rounded-full bg-slate-500" />
        <span className="text-[9px] text-slate-400 uppercase font-bold">Idle</span>
      </div>
    );
  })();

  return (
    <header className="sticky top-0 z-50 w-full bg-[#1E293B]/50 backdrop-blur-md border-b border-slate-700 px-6 py-4">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center gap-4">
        <div className="flex items-center gap-2 sm:gap-3 mr-2 sm:mr-4 shrink-0">
          <div className="w-8 h-8 bg-sky-500 rounded-lg flex items-center justify-center font-bold text-slate-900">
            <Layout className="w-5 h-5" />
          </div>
          <h1 className="text-lg font-bold text-slate-100 hidden lg:block tracking-tight">
            LiveMockup<span className="text-sky-400">Studio</span>
          </h1>
          <motion.button
            type="button"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={onOpenSettings}
            className="flex items-center gap-1.5 px-2.5 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-200 rounded-lg text-sm font-medium transition-all"
            title="Einstellungen"
            aria-label="Einstellungen"
          >
            <Settings className="w-4 h-4 shrink-0" />
            <span className="hidden md:inline">Einstellungen</span>
          </motion.button>
        </div>

        <div className="flex-1 w-full relative">
          <div className="absolute left-3 inset-y-0 flex items-center pointer-events-none text-slate-400 text-[10px] uppercase font-bold tracking-widest pl-2">
            HTTPS://
          </div>
          <input
            type="text"
            value={url.replace(/^https?:\/\//, '')}
            onChange={(e) => setUrl(`https://${e.target.value.replace(/^https?:\/\//, '')}`)}
            placeholder="design-portfolio.io"
            className="w-full pl-22 pr-40 py-2.5 bg-[#0F172A] border border-slate-600 rounded-full text-sm focus:outline-none focus:border-sky-400 transition-all placeholder-slate-500 text-sky-100"
          />
          <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
            {statusBadge}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 shrink-0" ref={panelRef}>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={onBulkImport}
            className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-100 rounded-lg text-sm font-medium transition-all shrink-0"
            title="Paket aus Ordner oder ZIP importieren"
            type="button"
          >
            <FolderInput className="w-4 h-4" />
            Bulk Import
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={onAddMockup}
            className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-100 rounded-lg text-sm font-medium transition-all"
            type="button"
          >
            <Plus className="w-4 h-4" />
            Upload Mockup
          </motion.button>

          <div className="relative flex items-center gap-0">
            <motion.button
              type="button"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setOptionsOpen((o) => !o)}
              className="flex items-center gap-1 px-3 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-600 border-r-0 rounded-l-lg text-slate-200 text-sm"
              aria-expanded={optionsOpen}
              aria-haspopup="true"
              title="Export-Optionen"
            >
              <SlidersHorizontal className="w-4 h-4" />
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${optionsOpen ? 'rotate-180' : ''}`} />
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              disabled={selectedCount === 0 || exporting}
              onClick={onExportSelected}
              className="px-4 py-2 bg-sky-500 hover:bg-sky-400 text-slate-900 rounded-r-lg text-sm font-bold transition-all shadow-lg shadow-sky-500/20 disabled:opacity-50 disabled:cursor-not-allowed border border-sky-500"
            >
              {exporting
                ? 'Exporting…'
                : `Export Selected${selectedCount > 0 ? ` (${selectedCount})` : ''}`}
            </motion.button>

            {optionsOpen && (
              <div className="absolute right-0 top-full mt-2 w-[min(100vw-2rem,20rem)] p-4 rounded-xl border border-slate-600 bg-[#0F172A] shadow-2xl z-[60] text-left space-y-3">
                <p className="text-[10px] uppercase font-bold tracking-widest text-slate-500">
                  Export-Optionen
                </p>

                <ExportSettingsForm value={exportSettings} onChange={onExportSettingsChange} />

                <p className="text-[9px] text-slate-500 leading-snug">
                  Mehrere ausgewählte Mockups → eine ZIP. Pro Karte: Kamera öffnet ein Dialogfenster
                  mit denselben Optionen ({exportFormatShortLabel(exportSettings.format)}).
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
