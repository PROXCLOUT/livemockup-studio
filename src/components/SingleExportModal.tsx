import React, { useCallback, useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { X } from 'lucide-react';
import type { ExportUiSettings } from '../lib/export';
import { ExportSettingsForm } from './ExportSettingsForm';
import type { ProjectFieldDef, ProjectPushSettings } from '../lib/projectPushSettings';
import { fetchProjectFieldDefinitions, ProjectPushHttpError } from '../lib/projectPushApi';

export type PushFileBinding =
  | { kind: 'user'; file: File }
  | { kind: 'mockupPng' };

interface SingleExportModalProps {
  isOpen: boolean;
  mockupId: string;
  mockupName: string;
  draftSettings: ExportUiSettings;
  onDraftChange: (next: ExportUiSettings) => void;
  onCancel: () => void;
  onConfirm: () => void;
  exporting: boolean;
  projectPushConfigured: boolean;
  projectPushSettings: ProjectPushSettings;
  pushSessionBasicPassword: string;
  onPushSessionBasicPasswordChange: (value: string) => void;
  onOpenAppSettings: () => void;
  onPushToWebsite: (
    mockupId: string,
    input: { stringValues: Record<string, string>; fileBindings: Record<string, PushFileBinding> },
  ) => Promise<{ webhookWarning?: string; missingScreenshot?: boolean }>;
}

export const SingleExportModal: React.FC<SingleExportModalProps> = ({
  isOpen,
  mockupId,
  mockupName,
  draftSettings,
  onDraftChange,
  onCancel,
  onConfirm,
  exporting,
  projectPushConfigured,
  projectPushSettings,
  pushSessionBasicPassword,
  onPushSessionBasicPasswordChange,
  onOpenAppSettings,
  onPushToWebsite,
}) => {
  const [pushStep, setPushStep] = useState(false);
  const [fields, setFields] = useState<ProjectFieldDef[] | null>(null);
  const [fieldsError, setFieldsError] = useState<string | null>(null);
  const [fieldsLoading, setFieldsLoading] = useState(false);
  const [stringValues, setStringValues] = useState<Record<string, string>>({});
  const [fileMode, setFileMode] = useState<Record<string, 'mockup' | 'user'>>({});
  const [userFiles, setUserFiles] = useState<Record<string, File | null>>({});
  const [pushBusy, setPushBusy] = useState(false);

  const resetPushUi = useCallback(() => {
    setPushStep(false);
    setFields(null);
    setFieldsError(null);
    setFieldsLoading(false);
    setStringValues({});
    setFileMode({});
    setUserFiles({});
    setPushBusy(false);
  }, []);

  useEffect(() => {
    if (!isOpen) resetPushUi();
  }, [isOpen, resetPushUi]);

  const loadFields = useCallback(async () => {
    setFieldsError(null);
    setFieldsLoading(true);
    try {
      const list = await fetchProjectFieldDefinitions(
        projectPushSettings,
        projectPushSettings.authMode === 'basic' ? pushSessionBasicPassword : undefined,
      );
      setFields(list);
      const initStr: Record<string, string> = {};
      const initFile: Record<string, 'mockup' | 'user'> = {};
      const initUser: Record<string, File | null> = {};
      for (const f of list) {
        if (f.type === 'file') {
          initFile[f.name] = 'mockup';
          initUser[f.name] = null;
        } else if (f.type === 'select' && f.options?.length) {
          initStr[f.name] = f.options[0] ?? '';
        } else {
          initStr[f.name] = '';
        }
      }
      setStringValues(initStr);
      setFileMode(initFile);
      setUserFiles(initUser);
    } catch (e) {
      if (e instanceof ProjectPushHttpError) {
        setFieldsError(`HTTP ${e.status}: ${e.bodySnippet}`);
      } else {
        setFieldsError(e instanceof Error ? e.message : String(e));
      }
      setFields(null);
    } finally {
      setFieldsLoading(false);
    }
  }, [projectPushSettings, pushSessionBasicPassword]);

  const startPushFlow = () => {
    setPushStep(true);
    setFieldsError(null);
    const pwdOk =
      projectPushSettings.authMode !== 'basic' || !!pushSessionBasicPassword.trim();
    if (pwdOk) void loadFields();
  };

  const canLoadFields =
    projectPushSettings.authMode !== 'basic' || !!pushSessionBasicPassword.trim();

  const handleSubmitPush = async () => {
    if (!mockupId || fields === null) return;
    const stringOut: Record<string, string> = {};
    const fileBindings: Record<string, PushFileBinding> = {};

    for (const f of fields) {
      if (f.type === 'file') {
        const mode = fileMode[f.name] ?? 'mockup';
        if (mode === 'mockup') {
          fileBindings[f.name] = { kind: 'mockupPng' };
        } else {
          const file = userFiles[f.name];
          if (!file) {
            alert(`Datei für „${f.name}“ fehlt oder wurde nicht gewählt.`);
            return;
          }
          fileBindings[f.name] = { kind: 'user', file };
        }
      } else if (f.type === 'integer') {
        const raw = (stringValues[f.name] ?? '').trim();
        if (raw === '') {
          alert(`Feld „${f.name}“: gültige Ganzzahl eingeben.`);
          return;
        }
        const n = Number(raw);
        if (!Number.isFinite(n) || !Number.isInteger(n)) {
          alert(`Feld „${f.name}“: gültige Ganzzahl eingeben.`);
          return;
        }
        stringOut[f.name] = String(n);
      } else {
        stringOut[f.name] = stringValues[f.name] ?? '';
      }
    }

    setPushBusy(true);
    try {
      const res = await onPushToWebsite(mockupId, { stringValues: stringOut, fileBindings });
      const parts: string[] = ['Projekt wurde zur Webseite gepusht.'];
      if (res.missingScreenshot) {
        parts.push(
          'Hinweis: Der Export enthielt keinen Website-Screenshot (wie beim normalen Export).',
        );
      }
      if (res.webhookWarning) {
        parts.push(`Webhook: ${res.webhookWarning}`);
      }
      alert(parts.join('\n\n'));
      onCancel();
    } catch (e) {
      console.error('Push failed', e);
      if (e instanceof ProjectPushHttpError) {
        alert(`Push fehlgeschlagen (HTTP ${e.status}).\n${e.bodySnippet}`);
      } else {
        alert(e instanceof Error ? e.message : 'Push fehlgeschlagen.');
      }
    } finally {
      setPushBusy(false);
    }
  };

  if (!isOpen) return null;

  const basicNeedsPassword =
    projectPushSettings.authMode === 'basic' && !pushSessionBasicPassword.trim();

  const pushDisabledReason = (() => {
    if (!projectPushSettings.enabled) return null;
    if (!projectPushConfigured) {
      if (!projectPushSettings.baseUrl.trim()) return 'Basis-URL und Routen in den Einstellungen setzen.';
      if (projectPushSettings.authMode === 'apiKey' && !projectPushSettings.apiKey.trim()) {
        return 'API-Key in den Einstellungen setzen.';
      }
      if (projectPushSettings.authMode === 'basic' && !projectPushSettings.basicUsername.trim()) {
        return 'Benutzername in den Einstellungen setzen.';
      }
      return 'Push-Einstellungen vervollständigen.';
    }
    return null;
  })();

  const renderFieldInput = (f: ProjectFieldDef) => {
    const desc = f.description ? (
      <p className="text-[10px] text-slate-500 mb-1">{f.description}</p>
    ) : null;

    if (f.type === 'string') {
      return (
        <div key={f.name}>
          {desc}
          <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1">{f.name}</label>
          <input
            type="text"
            value={stringValues[f.name] ?? ''}
            onChange={(e) => setStringValues((p) => ({ ...p, [f.name]: e.target.value }))}
            className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-600 text-sm text-slate-100 focus:outline-none focus:border-sky-500/60"
          />
        </div>
      );
    }
    if (f.type === 'integer') {
      return (
        <div key={f.name}>
          {desc}
          <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1">{f.name}</label>
          <input
            type="number"
            step={1}
            value={stringValues[f.name] ?? ''}
            onChange={(e) => setStringValues((p) => ({ ...p, [f.name]: e.target.value }))}
            className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-600 text-sm text-slate-100 focus:outline-none focus:border-sky-500/60"
          />
        </div>
      );
    }
    if (f.type === 'select') {
      const opts = f.options ?? [];
      return (
        <div key={f.name}>
          {desc}
          <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1">{f.name}</label>
          <select
            value={stringValues[f.name] ?? opts[0] ?? ''}
            onChange={(e) => setStringValues((p) => ({ ...p, [f.name]: e.target.value }))}
            className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-600 text-sm text-slate-100 focus:outline-none focus:border-sky-500/60"
          >
            {opts.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </div>
      );
    }
    const mode = fileMode[f.name] ?? 'mockup';
    return (
      <div key={f.name}>
        {desc}
        <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1">{f.name}</label>
        <div className="flex flex-wrap gap-3 text-xs text-slate-300 mb-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name={`file-${f.name}`}
              checked={mode === 'mockup'}
              onChange={() => setFileMode((p) => ({ ...p, [f.name]: 'mockup' }))}
              className="text-sky-500"
            />
            Mockup-Bild (Export)
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name={`file-${f.name}`}
              checked={mode === 'user'}
              onChange={() => setFileMode((p) => ({ ...p, [f.name]: 'user' }))}
              className="text-sky-500"
            />
            Eigene Datei
          </label>
        </div>
        {mode === 'user' && (
          <input
            type="file"
            onChange={(e) => {
              const file = e.target.files?.[0] ?? null;
              setUserFiles((p) => ({ ...p, [f.name]: file }));
            }}
            className="text-xs text-slate-400 w-full"
          />
        )}
      </div>
    );
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="single-export-title"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        className="relative w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-600 bg-[#0F172A] shadow-2xl p-6"
      >
        <button
          type="button"
          onClick={onCancel}
          disabled={exporting || pushBusy}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 disabled:opacity-40"
          aria-label="Schließen"
        >
          <X className="w-5 h-5" />
        </button>

        {!pushStep ? (
          <>
            <h2 id="single-export-title" className="text-lg font-bold text-slate-100 pr-10">
              Export: {mockupName}
            </h2>
            <p className="text-xs text-slate-500 mt-1 mb-5">
              Format und Größe wählen, dann herunterladen. Die Website kommt aus dem Screenshot-Dienst
              (wie in der Vorschau oben).
            </p>

            <ExportSettingsForm value={draftSettings} onChange={onDraftChange} dense />

            {projectPushSettings.enabled && (
              <div className="mt-4 pt-4 border-t border-slate-700/80">
                <p className="text-[10px] uppercase font-bold tracking-widest text-slate-500 mb-2">
                  Webseite
                </p>
                {pushDisabledReason ? (
                  <div className="space-y-2">
                    <p className="text-[11px] text-amber-500/90">{pushDisabledReason}</p>
                    <button
                      type="button"
                      onClick={onOpenAppSettings}
                      className="text-xs font-medium text-sky-400 hover:text-sky-300 underline"
                    >
                      Einstellungen öffnen
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled={exporting}
                    onClick={startPushFlow}
                    className="w-full px-3 py-2 rounded-lg border border-sky-500/40 bg-sky-500/10 text-sm font-semibold text-sky-300 hover:bg-sky-500/20 disabled:opacity-40"
                  >
                    Zur Webseite pushen…
                  </button>
                )}
              </div>
            )}

            <div className="mt-6 flex gap-3 justify-end">
              <button
                type="button"
                onClick={onCancel}
                disabled={exporting}
                className="px-4 py-2 rounded-lg border border-slate-600 text-sm font-medium text-slate-300 hover:bg-slate-800 disabled:opacity-40"
              >
                Abbrechen
              </button>
              <button
                type="button"
                onClick={onConfirm}
                disabled={exporting}
                className="px-4 py-2 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-900 text-sm font-bold disabled:opacity-50"
              >
                {exporting ? 'Exportiere…' : 'Herunterladen'}
              </button>
            </div>
          </>
        ) : (
          <>
            <h2 id="single-export-title" className="text-lg font-bold text-slate-100 pr-10">
              Push: {mockupName}
            </h2>
            <p className="text-xs text-slate-500 mt-1 mb-4">
              Felder von der API; beim Absenden wird mit den Export-Einstellungen links gerendert und
              per multipart gesendet.
            </p>

            {projectPushSettings.authMode === 'basic' && (
              <div className="mb-4 p-3 rounded-lg bg-slate-900/80 border border-slate-600">
                <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1">
                  Passwort (Basic-Auth, Sitzung)
                </label>
                <input
                  type="password"
                  autoComplete="current-password"
                  value={pushSessionBasicPassword}
                  onChange={(e) => onPushSessionBasicPasswordChange(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-600 text-sm text-slate-100"
                  placeholder="Passwort"
                />
                {!fieldsLoading && fields === null && !fieldsError && basicNeedsPassword && (
                  <p className="text-[10px] text-slate-500 mt-2">
                    Passwort eingeben, dann „Felder laden“.
                  </p>
                )}
              </div>
            )}

            {!fieldsLoading && fields === null && !fieldsError && canLoadFields && (
              <button
                type="button"
                onClick={() => void loadFields()}
                className="mb-4 w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-sm font-medium text-slate-200 hover:bg-slate-700"
              >
                Felder laden
              </button>
            )}

            {fieldsLoading && <p className="text-sm text-slate-400">Felder werden geladen…</p>}
            {fieldsError && (
              <div className="mb-4 space-y-2">
                <p className="text-sm text-red-400/90">{fieldsError}</p>
                <button
                  type="button"
                  onClick={() => void loadFields()}
                  className="text-xs text-sky-400 underline"
                >
                  Erneut versuchen
                </button>
              </div>
            )}

            {fields !== null && !fieldsLoading && (
              <div className="space-y-4 mb-6">{fields.map((f) => renderFieldInput(f))}</div>
            )}

            <div className="flex flex-wrap gap-3 justify-between">
              <button
                type="button"
                disabled={pushBusy}
                onClick={() => {
                  setPushStep(false);
                  setFields(null);
                  setFieldsError(null);
                }}
                className="px-4 py-2 rounded-lg border border-slate-600 text-sm text-slate-300 hover:bg-slate-800 disabled:opacity-40"
              >
                Zurück
              </button>
              <button
                type="button"
                disabled={
                  pushBusy ||
                  fields === null ||
                  fieldsLoading ||
                  (projectPushSettings.authMode === 'basic' && basicNeedsPassword)
                }
                onClick={() => void handleSubmitPush()}
                className="px-4 py-2 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-900 text-sm font-bold disabled:opacity-50"
              >
                {pushBusy ? 'Pushe…' : 'Jetzt pushen'}
              </button>
            </div>
          </>
        )}
      </motion.div>
    </div>
  );
};
