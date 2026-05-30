import type { ProjectFieldDef, ProjectFieldType, ProjectPushSettings } from './projectPushSettings';

export function resolveEndpoint(baseUrl: string, path: string): string {
  const base = baseUrl.trim().replace(/\/+$/, '');
  const p = path.trim();
  if (!base) throw new Error('Basis-URL fehlt');
  if (!p) throw new Error('Route fehlt');
  if (/^https?:\/\//i.test(p)) return p;
  const slash = p.startsWith('/') ? p : `/${p}`;
  return new URL(slash, `${base}/`).toString();
}

export function buildAuthHeaders(
  settings: ProjectPushSettings,
  sessionBasicPassword?: string,
): HeadersInit {
  if (settings.authMode === 'apiKey') {
    const key = settings.apiKey.trim();
    if (!key) throw new Error('API-Key fehlt');
    return { Authorization: `Bearer ${key}` };
  }
  const user = settings.basicUsername.trim();
  const pass = sessionBasicPassword ?? '';
  if (!user) throw new Error('Benutzername fehlt');
  if (!pass) throw new Error('Passwort fehlt (nur für diese Sitzung)');
  const token = btoa(`${user}:${pass}`);
  return { Authorization: `Basic ${token}` };
}

export function getAtJsonPath(root: unknown, dotPath: string): unknown {
  if (!dotPath.trim()) return root;
  let cur: unknown = root;
  for (const part of dotPath.split('.')) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

const FIELD_TYPES: ProjectFieldType[] = ['string', 'integer', 'file', 'select'];

function isFieldType(t: unknown): t is ProjectFieldType {
  return typeof t === 'string' && (FIELD_TYPES as string[]).includes(t);
}

function parseFieldDef(raw: unknown, index: number): ProjectFieldDef {
  if (raw == null || typeof raw !== 'object') {
    throw new Error(`Feld #${index + 1}: kein Objekt`);
  }
  const o = raw as Record<string, unknown>;
  const name = o.name;
  if (typeof name !== 'string' || !name.trim()) {
    throw new Error(`Feld #${index + 1}: "name" fehlt oder ist leer`);
  }
  const type = o.type;
  if (!isFieldType(type)) {
    throw new Error(`Feld „${name}“: ungültiger type (erwartet: ${FIELD_TYPES.join(', ')})`);
  }
  let description: string | null = null;
  if (o.description != null) {
    if (typeof o.description !== 'string') {
      throw new Error(`Feld „${name}“: description muss string oder null sein`);
    }
    description = o.description;
  }
  if (type === 'select') {
    const opts = o.options;
    if (!Array.isArray(opts) || !opts.every((x) => typeof x === 'string')) {
      throw new Error(`Feld „${name}“: bei type "select" ist options (string[]) erforderlich`);
    }
    return { name: name.trim(), type, description, options: opts as string[] };
  }
  return { name: name.trim(), type, description };
}

export function parseProjectFieldDefinitionsArray(data: unknown): ProjectFieldDef[] {
  if (!Array.isArray(data)) {
    throw new Error('Erwartet: Array von Felddefinitionen');
  }
  return data.map((item, i) => parseFieldDef(item, i));
}

export class ProjectPushHttpError extends Error {
  readonly status: number;
  readonly bodySnippet: string;

  constructor(status: number, bodySnippet: string, message?: string) {
    super(message ?? `HTTP ${status}`);
    this.status = status;
    this.bodySnippet = bodySnippet;
  }
}

export async function fetchProjectFieldDefinitions(
  settings: ProjectPushSettings,
  sessionBasicPassword?: string,
): Promise<ProjectFieldDef[]> {
  const url = resolveEndpoint(settings.baseUrl, settings.fieldsPath);
  const headers = new Headers(buildAuthHeaders(settings, sessionBasicPassword));
  headers.set('Accept', 'application/json');
  const res = await fetch(url, { method: 'GET', headers });
  const text = await res.text();
  if (!res.ok) {
    throw new ProjectPushHttpError(res.status, text.slice(0, 500));
  }
  let json: unknown;
  try {
    json = JSON.parse(text) as unknown;
  } catch {
    throw new Error('Antwort ist kein gültiges JSON');
  }
  const key = settings.fieldsResponseKey.trim() || 'fields';
  const slice = getAtJsonPath(json, key);
  return parseProjectFieldDefinitionsArray(slice);
}

export interface PushProjectResult {
  ok: boolean;
  status: number;
  remoteId?: string;
  rawBody: string;
}

function tryParseRemoteId(body: string): string | undefined {
  try {
    const j = JSON.parse(body) as unknown;
    if (j && typeof j === 'object') {
      const o = j as Record<string, unknown>;
      for (const k of ['id', 'remoteId', 'projectId', 'uuid']) {
        const v = o[k];
        if (typeof v === 'string' && v) return v;
        if (typeof v === 'number') return String(v);
      }
    }
  } catch {
    /* ignore */
  }
  return undefined;
}

export async function pushProjectMultipart(
  settings: ProjectPushSettings,
  sessionBasicPassword: string | undefined,
  stringValues: Record<string, string>,
  blobs: Record<string, Blob>,
  filenames: Record<string, string>,
): Promise<PushProjectResult> {
  const url = resolveEndpoint(settings.baseUrl, settings.pushPath);
  const headers = new Headers(buildAuthHeaders(settings, sessionBasicPassword));
  const form = new FormData();
  for (const [k, v] of Object.entries(stringValues)) {
    form.append(k, v);
  }
  for (const [k, blob] of Object.entries(blobs)) {
    const name = filenames[k] ?? 'upload.bin';
    const file =
      blob instanceof File
        ? blob
        : new File([blob], name, { type: blob.type || 'application/octet-stream' });
    form.append(k, file);
  }
  const res = await fetch(url, { method: 'POST', headers, body: form });
  const rawBody = await res.text();
  const ok = res.ok;
  const remoteId = ok ? tryParseRemoteId(rawBody) : undefined;
  return { ok, status: res.status, remoteId, rawBody };
}

export interface SuccessWebhookPayload {
  mockupId: string;
  mockupName: string;
  websiteUrl: string;
  remoteId?: string;
  pushStatus: number;
}

export async function notifySuccessWebhook(
  webhookUrl: string,
  payload: SuccessWebhookPayload,
): Promise<{ ok: boolean; status: number; error?: string }> {
  try {
    const res = await fetch(webhookUrl.trim(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      return { ok: false, status: res.status, error: await res.text().then((t) => t.slice(0, 300)) };
    }
    return { ok: true, status: res.status };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, status: 0, error: msg };
  }
}
