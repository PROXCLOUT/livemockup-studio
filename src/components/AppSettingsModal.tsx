import React, { useId, useState } from 'react';
import { motion } from 'motion/react';
import { X } from 'lucide-react';
import type { ProjectPushAuthMode, ProjectPushSettings } from '../lib/projectPushSettings';
import { fetchProjectFieldDefinitions, ProjectPushHttpError } from '../lib/projectPushApi';

const SCHEMA_EXAMPLE = `{
  "fields": [
    {
      "name": "title",
      "type": "string",
      "description": "Anzeigename"
    },
    {
      "name": "sortOrder",
      "type": "integer",
      "description": null
    },
    {
      "name": "cover",
      "type": "file",
      "description": "Vorschaubild"
    },
    {
      "name": "status",
      "type": "select",
      "description": null,
      "options": ["draft", "published"]
    }
  ]
}`;

interface AppSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectPushSettings: ProjectPushSettings;
  onProjectPushSettingsChange: React.Dispatch<React.SetStateAction<ProjectPushSettings>>;
  pushSessionBasicPassword: string;
  onPushSessionBasicPasswordChange: (value: string) => void;
}

export const AppSettingsModal: React.FC<AppSettingsModalProps> = ({
  isOpen,
  onClose,
  projectPushSettings: s,
  onProjectPushSettingsChange,
  pushSessionBasicPassword,
  onPushSessionBasicPasswordChange,
}) => {
  const titleId = useId();
  const [testBusy, setTestBusy] = useState(false);
  const [testMsg, setTestMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const patch = (p: Partial<ProjectPushSettings>) => {
    onProjectPushSettingsChange((prev) => ({ ...prev, ...p }));
  };

  const runTestFields = async () => {
    setTestMsg(null);
    setTestBusy(true);
    try {
      const fields = await fetchProjectFieldDefinitions(s, pushSessionBasicPassword);
      setTestMsg(`${fields.length} Feld(er) geladen: ${fields.map((f) => f.name).join(', ')}`);
    } catch (e) {
      if (e instanceof ProjectPushHttpError) {
        setTestMsg(`Fehler HTTP ${e.status}: ${e.bodySnippet}`);
      } else {
        setTestMsg(e instanceof Error ? e.message : String(e));
      }
    } finally {
      setTestBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        className="relative w-full max-w-lg rounded-2xl border border-slate-600 bg-[#0F172A] shadow-2xl p-6 my-8 max-h-[90vh] overflow-y-auto"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800"
          aria-label="Schließen"
        >
          <X className="w-5 h-5" />
        </button>

        <h2 id={titleId} className="text-lg font-bold text-slate-100 pr-10">
          Einstellungen
        </h2>
        <p className="text-xs text-slate-500 mt-1 mb-6">
          Push as Project to Webseite — Verbindung zu deiner eigenen API.
        </p>

        <section className="space-y-4 border-t border-slate-700/80 pt-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-200">Push as Project to Webseite</p>
              <p className="text-[10px] text-slate-500 mt-0.5">
                Aktiviert den Push-Flow im Export-Dialog. Die Ziel-API muss CORS für diese App
                erlauben.
              </p>
            </div>
            <label className="flex items-center gap-2 shrink-0 cursor-pointer">
              <input
                type="checkbox"
                checked={s.enabled}
                onChange={(e) => patch({ enabled: e.target.checked })}
                className="rounded border-slate-600 bg-slate-900 text-sky-500 focus:ring-sky-500/40"
              />
              <span className="text-xs text-slate-400">An</span>
            </label>
          </div>

          <div className={s.enabled ? 'space-y-4 opacity-100' : 'space-y-4 opacity-40 pointer-events-none'}>
            <div>
              <label className="block text-[10px] uppercase font-bold tracking-widest text-slate-500 mb-1">
                Basis-URL
              </label>
              <input
                type="url"
                value={s.baseUrl}
                onChange={(e) => patch({ baseUrl: e.target.value })}
                placeholder="https://api.example.com"
                className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-600 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-sky-500/60"
              />
            </div>

            <div>
              <p className="text-[10px] uppercase font-bold tracking-widest text-slate-500 mb-2">
                Authentifizierung
              </p>
              <div className="flex gap-4 mb-2">
                {(
                  [
                    ['apiKey', 'API-Key (Bearer)'],
                    ['basic', 'Benutzer / Passwort'],
                  ] as const
                ).map(([mode, label]) => (
                  <label key={mode} className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
                    <input
                      type="radio"
                      name="push-auth"
                      checked={s.authMode === mode}
                      onChange={() => patch({ authMode: mode as ProjectPushAuthMode })}
                      className="text-sky-500 focus:ring-sky-500/40"
                    />
                    {label}
                  </label>
                ))}
              </div>
              {s.authMode === 'apiKey' ? (
                <div>
                  <input
                    type="password"
                    autoComplete="off"
                    value={s.apiKey}
                    onChange={(e) => patch({ apiKey: e.target.value })}
                    placeholder="API-Key"
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-600 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-sky-500/60"
                  />
                  <p className="text-[10px] text-amber-500/90 mt-1.5 leading-snug">
                    Wird im Browser in localStorage gespeichert — auf geteilten Rechnern unsicher.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <input
                    type="text"
                    autoComplete="username"
                    value={s.basicUsername}
                    onChange={(e) => patch({ basicUsername: e.target.value })}
                    placeholder="Benutzername"
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-600 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-sky-500/60"
                  />
                  <input
                    type="password"
                    autoComplete="current-password"
                    value={pushSessionBasicPassword}
                    onChange={(e) => onPushSessionBasicPasswordChange(e.target.value)}
                    placeholder="Passwort (nur diese Sitzung, nicht gespeichert)"
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-600 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-sky-500/60"
                  />
                  <p className="text-[10px] text-slate-500 leading-snug">
                    Benutzername wird mit den Push-Einstellungen gespeichert; das Passwort bleibt nur
                    im Arbeitsspeicher, bis du die Seite neu lädst.
                  </p>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 gap-3">
              <div>
                <label className="block text-[10px] uppercase font-bold tracking-widest text-slate-500 mb-1">
                  Route: Projekt-Felder (GET)
                </label>
                <input
                  type="text"
                  value={s.fieldsPath}
                  onChange={(e) => patch({ fieldsPath: e.target.value })}
                  placeholder="/api/project-fields"
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-600 text-sm font-mono text-slate-100 placeholder-slate-600 focus:outline-none focus:border-sky-500/60"
                />
              </div>
              <div>
                <label className="block text-[10px] uppercase font-bold tracking-widest text-slate-500 mb-1">
                  Route: Projekt pushen (POST multipart)
                </label>
                <input
                  type="text"
                  value={s.pushPath}
                  onChange={(e) => patch({ pushPath: e.target.value })}
                  placeholder="/api/projects"
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-600 text-sm font-mono text-slate-100 placeholder-slate-600 focus:outline-none focus:border-sky-500/60"
                />
              </div>
              <div>
                <label className="block text-[10px] uppercase font-bold tracking-widest text-slate-500 mb-1">
                  JSON-Pfad zur Feldliste
                </label>
                <input
                  type="text"
                  value={s.fieldsResponseKey}
                  onChange={(e) => patch({ fieldsResponseKey: e.target.value })}
                  placeholder="fields oder data.fields"
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-600 text-sm font-mono text-slate-100 placeholder-slate-600 focus:outline-none focus:border-sky-500/60"
                />
              </div>
            </div>

            <div>
              <p className="text-[10px] uppercase font-bold tracking-widest text-slate-500 mb-1">
                Erwartetes Antwortformat (Felder-Route)
              </p>
              <p className="text-[11px] text-slate-400 leading-relaxed mb-2">
                JSON mit einem Array von Objekten (Pfad siehe oben). Jedes Objekt:{' '}
                <code className="text-sky-400/90">name</code> (string),{' '}
                <code className="text-sky-400/90">type</code> — einer von{' '}
                <code className="text-sky-400/90">string</code>,{' '}
                <code className="text-sky-400/90">integer</code>,{' '}
                <code className="text-sky-400/90">file</code>,{' '}
                <code className="text-sky-400/90">select</code> (dann Pflicht:{' '}
                <code className="text-sky-400/90">options</code>: string[]),{' '}
                <code className="text-sky-400/90">description</code> string oder{' '}
                <code className="text-sky-400/90">null</code>.
              </p>
              <pre className="text-[10px] leading-relaxed p-3 rounded-lg bg-slate-950 border border-slate-700 text-slate-400 overflow-x-auto">
                {SCHEMA_EXAMPLE}
              </pre>
            </div>

            <div>
              <label className="block text-[10px] uppercase font-bold tracking-widest text-slate-500 mb-1">
                Webhook bei Erfolg (optional)
              </label>
              <input
                type="url"
                value={s.successWebhookUrl}
                onChange={(e) => patch({ successWebhookUrl: e.target.value })}
                placeholder="https://hooks.example.com/…"
                className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-600 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-sky-500/60"
              />
              <p className="text-[10px] text-slate-500 mt-1.5 leading-snug">
                Nach erfolgreichem Push (HTTP 2xx) ruft diese App diese URL per POST mit JSON-Body
                auf (mockupId, mockupName, websiteUrl, remoteId?, pushStatus). Fehler beim Webhook
                brechen den Push nicht ab.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                type="button"
                disabled={testBusy || !s.baseUrl.trim() || !s.fieldsPath.trim()}
                onClick={() => void runTestFields()}
                className="px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-600 text-xs font-medium text-slate-200 hover:bg-slate-700 disabled:opacity-40"
              >
                {testBusy ? 'Teste…' : 'Felder laden (Test)'}
              </button>
              {testMsg && (
                <p className="text-[11px] text-slate-400 flex-1 min-w-[12rem]">{testMsg}</p>
              )}
            </div>
          </div>
        </section>

        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-900 text-sm font-bold"
          >
            Fertig
          </button>
        </div>
      </motion.div>
    </div>
  );
};
