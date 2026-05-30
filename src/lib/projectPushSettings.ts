export const PROJECT_PUSH_STORAGE_KEY = 'live-mockup-studio-project-push-v1';

export type ProjectPushAuthMode = 'apiKey' | 'basic';

export type ProjectFieldType = 'string' | 'integer' | 'file' | 'select';

export interface ProjectFieldDef {
  name: string;
  type: ProjectFieldType;
  description: string | null;
  options?: string[];
}

export interface ProjectPushSettings {
  enabled: boolean;
  baseUrl: string;
  authMode: ProjectPushAuthMode;
  apiKey: string;
  basicUsername: string;
  fieldsPath: string;
  pushPath: string;
  /** Dot path from JSON root to the array of field definitions, e.g. `fields` or `data.fields`. */
  fieldsResponseKey: string;
  successWebhookUrl: string;
}

export const DEFAULT_PROJECT_PUSH_SETTINGS: ProjectPushSettings = {
  enabled: false,
  baseUrl: '',
  authMode: 'apiKey',
  apiKey: '',
  basicUsername: '',
  fieldsPath: '/api/project-fields',
  pushPath: '/api/projects',
  fieldsResponseKey: 'fields',
  successWebhookUrl: '',
};

function stripTrailingSlash(u: string): string {
  const t = u.trim();
  if (t.endsWith('/')) return t.slice(0, -1);
  return t;
}

export function normalizeProjectPushSettings(raw: Partial<ProjectPushSettings>): ProjectPushSettings {
  const base = { ...DEFAULT_PROJECT_PUSH_SETTINGS, ...raw };
  return {
    ...base,
    baseUrl: stripTrailingSlash(base.baseUrl),
    fieldsPath: base.fieldsPath.trim() || DEFAULT_PROJECT_PUSH_SETTINGS.fieldsPath,
    pushPath: base.pushPath.trim() || DEFAULT_PROJECT_PUSH_SETTINGS.pushPath,
    fieldsResponseKey: base.fieldsResponseKey.trim() || DEFAULT_PROJECT_PUSH_SETTINGS.fieldsResponseKey,
    successWebhookUrl: base.successWebhookUrl.trim(),
  };
}

export function loadProjectPushSettings(): ProjectPushSettings {
  const raw = localStorage.getItem(PROJECT_PUSH_STORAGE_KEY);
  if (!raw) return { ...DEFAULT_PROJECT_PUSH_SETTINGS };
  try {
    const parsed = JSON.parse(raw) as Partial<ProjectPushSettings>;
    return normalizeProjectPushSettings(parsed);
  } catch {
    return { ...DEFAULT_PROJECT_PUSH_SETTINGS };
  }
}

export function persistProjectPushSettings(settings: ProjectPushSettings): void {
  localStorage.setItem(PROJECT_PUSH_STORAGE_KEY, JSON.stringify(settings));
}

/** True when the feature flag is on and URLs are filled so API calls can run (Passwort für Basic separat zur Laufzeit). */
export function isProjectPushConfigured(settings: ProjectPushSettings): boolean {
  if (!settings.enabled) return false;
  const base = settings.baseUrl.trim();
  const fp = settings.fieldsPath.trim();
  const pp = settings.pushPath.trim();
  if (!base || !fp || !pp) return false;
  if (settings.authMode === 'apiKey' && !settings.apiKey.trim()) return false;
  if (settings.authMode === 'basic') {
    if (!settings.basicUsername.trim()) return false;
  }
  return true;
}
