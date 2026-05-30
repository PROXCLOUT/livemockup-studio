import { unzipSync } from 'fflate';
import {
  MAX_BULK_IMPORT_ZIP_BYTES,
  type VirtualPackageFile,
} from './types';

export type { VirtualPackageFile } from './types';

/** Relativer Pfad: Slash, trim, `./` und leere Segmente entfernen; keine `..`. */
export function normalizePackagePath(rel: string): string {
  const s = rel.replace(/\\/g, '/').replace(/^\.\/+/, '');
  const segs = s.split('/').filter((seg) => seg !== '' && seg !== '.');
  if (segs.some((x) => x === '..')) {
    throw new Error('Pfad enthält "..", nicht erlaubt');
  }
  return segs.join('/');
}

export function normalizePathKey(rel: string): string {
  return normalizePackagePath(rel).toLowerCase();
}

/** Dateiliste vom Ordner-Dialog (`webkitRelativePath`). */
export function virtualFilesFromDirectoryInput(files: FileList): VirtualPackageFile[] {
  const out: VirtualPackageFile[] = [];
  for (let i = 0; i < files.length; i++) {
    const f = files.item(i)!;
    const relRaw =
      typeof (f as File & { webkitRelativePath?: string }).webkitRelativePath === 'string'
        ? (f as File & { webkitRelativePath: string }).webkitRelativePath
        : f.name;
    const path = normalizePackagePath(relRaw);
    out.push({ path, blob: f });
  }
  return out;
}

/** Findet das Manifest: bevorzugt `config.json` in Paket-Wurzel, sonst kürzeste `…/config.json`. */
export function pickConfigBlob(files: VirtualPackageFile[]): VirtualPackageFile | undefined {
  if (!files.length) return undefined;
  const root = files.find((f) => f.path.toLowerCase() === 'config.json');
  if (root) return root;
  const ends = files.filter((f) => normalizePackagePath(f.path).match(/(^|\/)config\.json$/i));
  if (!ends.length) return undefined;
  ends.sort((a, b) => {
    const da = normalizePackagePath(a.path).split('/').length;
    const db = normalizePackagePath(b.path).split('/').length;
    if (da !== db) return da - db;
    return normalizePackagePath(a.path).localeCompare(normalizePackagePath(b.path));
  });
  return ends[0];
}

function shouldSkipZipPath(path: string): boolean {
  const p = path.replace(/\\/g, '/');
  if (!p.length || p.endsWith('/')) return true;
  if (p.startsWith('.')) return true;
  const segs = p.split('/');
  if (segs.some((x) => x === '__MACOSX' || x.startsWith('.'))) return true;
  return false;
}

/** Entpackt eine ZIP zu virtuellen Paketdateien. */
export async function unpackZipToVirtualFiles(zipFile: File): Promise<VirtualPackageFile[]> {
  if (zipFile.size > MAX_BULK_IMPORT_ZIP_BYTES) {
    throw new Error(
      `ZIP zu groß (max. ${Math.round(MAX_BULK_IMPORT_ZIP_BYTES / (1024 * 1024))} MB).`,
    );
  }
  const ab = await zipFile.arrayBuffer();
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(new Uint8Array(ab));
  } catch {
    throw new Error('ZIP konnte nicht entpackt werden.');
  }

  /**
   * Wenn alle ZIP-Einträge mit demselben Top-Level-Ordner beginnen („PaketOrdner/config.json“),
   * wird dieser eine Ordner vom relativen Pfad abgezogen, damit im Manifest weiter „config.json“ gilt.
   */
  function relativizeZipPath(rawZipPath: string, rootSegment: string | null): string {
    try {
      const norm = normalizePackagePath(rawZipPath);
      if (rootSegment) {
        const prefix = normalizePackagePath(rootSegment) + '/';
        if (norm === normalizePackagePath(rootSegment)) return '';
        if (norm.startsWith(prefix)) {
          return normalizePackagePath(norm.slice(prefix.length));
        }
      }
      return norm;
    } catch {
      return normalizePackagePath(rawZipPath);
    }
  }

  const rawPaths = Object.keys(entries).filter((k) => !shouldSkipZipPath(k));
  if (!rawPaths.length) {
    throw new Error('ZIP enthält keine nutzbaren Dateien.');
  }

  const normalizedZipPaths = rawPaths.map((p) => ({
    raw: p,
    norm: (() => {
      try {
        return normalizePackagePath(p.replace(/\\/g, '/'));
      } catch {
        return '';
      }
    })(),
  }));
  let singleRootSegment: string | null = null;
  if (normalizedZipPaths.every((x) => x.norm && x.norm.includes('/'))) {
    const firstSeg = normalizedZipPaths[0]!.norm.split('/').filter(Boolean)[0];
    if (
      firstSeg &&
      normalizedZipPaths.every((x) => x.norm.startsWith(`${firstSeg}/`))
    ) {
      singleRootSegment = firstSeg;
    }
  }

  const out: VirtualPackageFile[] = [];
  for (const { raw: rawPath, norm } of normalizedZipPaths) {
    if (!norm) continue;
    const data = entries[rawPath]!;
    if (!data.byteLength && !norm.toLowerCase().endsWith('.json')) {
      continue;
    }
    const logical = relativizeZipPath(rawPath, singleRootSegment);
    if (!logical) continue;
    out.push({ path: logical, blob: new Blob([data]) });
  }
  return out;
}

/** Index: lower-case relativer Pfad → Datei (letztes gewinnt bei Duplikaten). */
export function buildVirtualFileIndex(files: VirtualPackageFile[]): Map<string, VirtualPackageFile> {
  const idx = new Map<string, VirtualPackageFile>();
  for (const vf of files) {
    idx.set(normalizePathKey(vf.path), vf);
  }
  return idx;
}
