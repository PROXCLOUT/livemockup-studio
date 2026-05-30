import React, { useEffect, useId, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { FolderUp, Package, X } from 'lucide-react';
import type { VirtualPackageFile } from '../lib/bulkImport/types';
import type { MockupConfig } from '../types';
import { putContentMedia } from '../lib/contentMediaStore';
import { putGltf } from '../lib/threeGltfStore';
import { importFromVirtualPackageFiles } from '../lib/bulkImport/importer';
import {
  unpackZipToVirtualFiles,
  virtualFilesFromDirectoryInput,
} from '../lib/bulkImport/sources';
import { cn } from '../lib/utils';

interface BulkImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImported: (imported: MockupConfig[]) => void;
}

export const BulkImportModal: React.FC<BulkImportModalProps> = ({
  isOpen,
  onClose,
  onImported,
}) => {
  const titleId = useId();
  const folderInputRef = useRef<HTMLInputElement>(null);
  const zipInputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [fatal, setFatal] = useState<string | null>(null);
  const [resultLog, setResultLog] = useState<string[]>([]);

  useEffect(() => {
    if (!isOpen) return;
    setBusy(false);
    setFatal(null);
    setResultLog([]);
  }, [isOpen]);

  const finalizeResult = (
    imported: MockupConfig[],
    errors: { index: number; name?: string; message: string }[],
  ) => {
    const lines: string[] = [];
    lines.push(`${imported.length} Mockup(s) importiert.`);
    if (errors.length) {
      lines.push(`${errors.length} Eintrag/Einträge mit Fehler (übersprungen):`);
      for (const e of errors.slice(0, 20)) {
        lines.push(`• [${e.index + 1}] ${e.name ?? '?'} — ${e.message}`);
      }
      if (errors.length > 20) {
        lines.push(`… und ${errors.length - 20} weitere`);
      }
    }
    setResultLog(lines);
    if (imported.length) {
      onImported(imported);
    }
    if (!imported.length && !errors.length) {
      setFatal('Keine Mockups importiert.');
    }
  };

  const runPackage = async (virtualFiles: VirtualPackageFile[]) => {
    setBusy(true);
    setFatal(null);
    try {
      const { imported, errors } = await importFromVirtualPackageFiles(virtualFiles, {
        putGltf,
        putContentMedia,
      });
      finalizeResult(imported, errors);
    } catch (e) {
      setFatal(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const handleFolderPick = async (files: FileList | null) => {
    setFatal(null);
    setResultLog([]);
    if (!files?.length) return;
    try {
      const vf = virtualFilesFromDirectoryInput(files);
      await runPackage(vf);
    } catch (e) {
      setFatal(e instanceof Error ? e.message : String(e));
    }
  };

  const handleZipPick = async (files: FileList | null) => {
    setFatal(null);
    setResultLog([]);
    const z = files?.[0];
    if (!z) return;
    if (!z.name.toLowerCase().endsWith('.zip')) {
      setFatal('Bitte eine .zip-Datei wählen.');
      return;
    }
    try {
      const vf = await unpackZipToVirtualFiles(z);
      await runPackage(vf);
    } catch (e) {
      setFatal(e instanceof Error ? e.message : String(e));
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[130] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        className="relative w-full max-w-lg max-h-[min(92vh,720px)] rounded-2xl border border-slate-600 bg-[#0F172A] shadow-2xl flex flex-col overflow-hidden"
      >
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          className="absolute top-3 right-3 z-20 p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 disabled:opacity-40"
          aria-label="Schließen"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="px-5 pt-5 pb-3 border-b border-slate-800 shrink-0 pr-12">
          <h2 id={titleId} className="text-lg font-bold text-slate-100">
            Bulk Import
          </h2>
          <p className="text-[11px] text-slate-500 mt-1">
            Ordner oder ZIP mit <code className="text-sky-400/90 text-[10px]">config.json</code> und
            Bildern/GLBs.
          </p>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-4">
          <input
            ref={folderInputRef}
            type="file"
            multiple
            {...({ webkitdirectory: '', directory: '' } as React.InputHTMLAttributes<HTMLInputElement>)}
            className="sr-only"
            onChange={(e) => {
              void handleFolderPick(e.target.files);
              e.target.value = '';
            }}
          />
          <input
            ref={zipInputRef}
            type="file"
            accept=".zip,application/zip"
            className="sr-only"
            onChange={(e) => {
              void handleZipPick(e.target.files);
              e.target.value = '';
            }}
          />

          <div className="space-y-3">
            <button
              type="button"
              disabled={busy}
              onClick={() => folderInputRef.current?.click()}
              className={cn(
                'w-full flex items-center gap-3 rounded-xl border border-slate-700 bg-slate-900/40 p-4 text-left hover:border-sky-500/50 hover:bg-sky-500/5 transition-colors',
                busy && 'opacity-50 pointer-events-none',
              )}
            >
              <div className="w-11 h-11 rounded-lg bg-sky-500/15 border border-sky-500/30 flex items-center justify-center shrink-0">
                <FolderUp className="w-5 h-5 text-sky-400" />
              </div>
              <div>
                <div className="text-sm font-bold text-slate-100">Ordner wählen</div>
                <div className="text-[11px] text-slate-500 mt-0.5">Enthält config.json und Assets</div>
              </div>
            </button>

            <button
              type="button"
              disabled={busy}
              onClick={() => zipInputRef.current?.click()}
              className={cn(
                'w-full flex items-center gap-3 rounded-xl border border-slate-700 bg-slate-900/40 p-4 text-left hover:border-emerald-500/50 hover:bg-emerald-500/5 transition-colors',
                busy && 'opacity-50 pointer-events-none',
              )}
            >
              <div className="w-11 h-11 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center shrink-0">
                <Package className="w-5 h-5 text-emerald-400" />
              </div>
              <div>
                <div className="text-sm font-bold text-slate-100">ZIP hochladen</div>
                <div className="text-[11px] text-slate-500 mt-0.5">Entpackung im Browser</div>
              </div>
            </button>
          </div>

          {busy ? <p className="text-xs text-sky-400 animate-pulse">Import läuft …</p> : null}

          {fatal ? (
            <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-[11px] text-red-200">
              {fatal}
            </div>
          ) : null}

          {resultLog.length > 0 ? (
            <div className="rounded-lg border border-slate-700 bg-slate-950/50 px-3 py-2 space-y-1">
              <p className="text-[10px] font-bold uppercase text-slate-500">Ergebnis</p>
              <ul className="text-[11px] text-slate-300 space-y-1 font-mono leading-relaxed whitespace-pre-wrap">
                {resultLog.map((line, i) => (
                  <li key={`bulk-log-${i}:${line.slice(0, 32)}`}>{line}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </motion.div>
    </div>
  );
};
