import { zipSync } from 'fflate';
import { downloadBlob } from './export';

export interface ZipEntry {
  filename: string;
  blob: Blob;
}

/** Build a ZIP Blob from file entries (deduplicates names inside the archive). */
export async function buildZipBlob(entries: ZipEntry[]): Promise<Blob> {
  const used = new Map<string, number>();
  const files: Record<string, Uint8Array> = {};

  for (const e of entries) {
    const base =
      e.filename.replace(/\\/g, '/').split('/').pop()?.replace(/^\.+/, '') || 'file.bin';
    const seen = used.get(base) ?? 0;
    used.set(base, seen + 1);
    const name =
      seen === 0
        ? base
        : (() => {
            const dot = base.lastIndexOf('.');
            return dot > 0
              ? `${base.slice(0, dot)}-${seen}${base.slice(dot)}`
              : `${base}-${seen}`;
          })();

    const buf = new Uint8Array(await e.blob.arrayBuffer());
    files[name] = buf;
  }

  const zipped = zipSync(files, { level: 6 });
  return new Blob([zipped], { type: 'application/zip' });
}

export async function downloadZip(entries: ZipEntry[], zipBasename = 'mockups'): Promise<void> {
  const blob = await buildZipBlob(entries);
  const stamp = new Date().toISOString().slice(0, 10);
  downloadBlob(blob, `${zipBasename}-${stamp}.zip`);
}
