import { describe, expect, test } from 'vitest';
import {
  normalizePackagePath,
  normalizePathKey,
  pickConfigBlob,
  type VirtualPackageFile,
} from './sources';
import { MAX_BULK_IMPORT_MOCKUPS } from './types';
import {
  parseBulkImportManifestJson,
  parseAndValidateBulkImportManifest,
} from './manifest';

describe('bulkImport manifest', () => {
  test('accepts builtin flat mockup without imagePath', () => {
    const m = parseAndValidateBulkImportManifest({
      version: 1,
      mockups: [
        {
          name: 'Builtin',
          deviceType: 'laptop',
          corners: validCorners(),
          builtinFrame: 'studioLaptop',
        },
      ],
    });
    expect(m.mockups).toHaveLength(1);
  });

  test('rejects duplicate builtinFrame and imagePath', () => {
    expect(() =>
      parseAndValidateBulkImportManifest({
        version: 1,
        mockups: [
          {
            name: 'Bad',
            deviceType: 'laptop',
            corners: validCorners(),
            builtinFrame: 'studioLaptop',
            imagePath: 'x.png',
          },
        ],
      }),
    ).toThrow(/Entweder builtinFrame oder imagePath/);
  });

  test('respects MAX_BULK_IMPORT_MOCKUPS', () => {
    const mockups = Array.from({ length: MAX_BULK_IMPORT_MOCKUPS + 1 }, (_, i) => ({
      name: `M${i}`,
      deviceType: 'laptop' as const,
      corners: validCorners(),
      builtinFrame: 'studioLaptop' as const,
    }));
    expect(() =>
      parseAndValidateBulkImportManifest({
        version: 1,
        mockups,
      }),
    ).toThrow(/höchstens/);
  });

  test('parses minimal JSON via parseBulkImportManifestJson', () => {
    const j = JSON.stringify({
      version: 1,
      mockups: [
        { name: 'A', deviceType: 'tablet', builtinFrame: 'studioTablet', corners: validCorners() },
      ],
    });
    parseBulkImportManifestJson(j); // ok
    expect(() => parseBulkImportManifestJson('')).toThrow(/kein gültiges JSON/);
  });
});

describe('bulkImport sources', () => {
  test('normalizePackagePath strips and rejects traversal', () => {
    expect(normalizePackagePath('./foo/bar')).toBe('foo/bar');
    expect(() => normalizePackagePath('../x')).toThrow(/\.\./);
    expect(normalizePathKey('./Foo/bar.png')).toBe('foo/bar.png');
  });

  test('pickConfigBlob prefers package root', async () => {
    const files: VirtualPackageFile[] = [
      { path: 'sub/config.json', blob: blobOf('wrong') },
      { path: 'config.json', blob: blobOf('right') },
    ];
    const picked = pickConfigBlob(files)!;
    expect(await readBlobAsText(picked.blob)).toBe('right');
  });

  test('runBulkMockupImportPipeline imports flat raster', async () => {
    const stores = {
      putGltf: async () => {},
      putContentMedia: async () => {},
    };
    const { runBulkMockupImportPipeline } = await import('./importer');
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const manifest = {
      version: 1,
      mockups: [
        {
          name: 'Tiny',
          deviceType: 'phone',
          corners: validCorners(),
          imagePath: 'x.png',
        },
      ],
    };
    const txt = JSON.stringify(manifest);
    let n = 0;
    const { imported, errors } = await runBulkMockupImportPipeline(
      [
        { path: 'config.json', blob: blobOf(txt) },
        { path: 'x.png', blob: new Blob([png], { type: 'image/png' }) },
      ],
      txt,
      stores,
      () => `test-id-${++n}`,
    );
    expect(errors).toHaveLength(0);
    expect(imported).toHaveLength(1);
    expect(imported[0]!.name).toBe('Tiny');
    expect(imported[0]!.imageUrl.startsWith('data:')).toBe(true);
  });
});

function utf8Blob(content: string): Blob {
  return new Blob([content], { type: 'application/json; charset=utf-8' });
}

async function readBlobAsText(blob: Blob): Promise<string> {
  if (typeof blob.text === 'function') {
    return blob.text();
  }
  if (typeof (blob as Blob & { arrayBuffer?: () => Promise<ArrayBuffer> }).arrayBuffer === 'function') {
    return new TextDecoder().decode(await (blob as Blob).arrayBuffer());
  }
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(typeof r.result === 'string' ? r.result : '');
    r.onerror = () => reject(r.error);
    r.readAsText(blob);
  });
}

function blobOf(s: string): Blob {
  return utf8Blob(s);
}

function validCorners() {
  return {
    tl: { x: 10, y: 10 },
    tr: { x: 90, y: 10 },
    br: { x: 90, y: 90 },
    bl: { x: 10, y: 90 },
  };
}
