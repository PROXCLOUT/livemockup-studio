import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Header } from './components/Header';
import { MockupCell } from './components/MockupCell';
import { MockupCellThree } from './components/MockupCellThree';
import { SingleExportModal } from './components/SingleExportModal';
import { AddDeviceModal } from './components/AddDeviceModal';
import { BulkImportModal } from './components/BulkImportModal';
import { DEFAULT_MOCKUPS, STORAGE_KEY, LEGACY_STORAGE_KEY } from './constants';
import type { Corners, DeviceType, LegacyMockupConfig, MockupConfig } from './types';
import { migrateMockup } from './types';
import { cornersBBox } from './lib/perspective';
import {
  defaultContentViewportWidth,
  getSlotLogicalContentWidth,
  resolveScreenshotFetchWidth,
} from './lib/contentViewport';
import { getScreenshotDevicePixelRatio, TRANSPARENT_PIXEL_GIF } from './lib/deviceFrames';
import { LayoutGrid, Info, Plus } from 'lucide-react';
import { motion } from 'motion/react';
import {
  DEFAULT_EXPORT_UI_SETTINGS,
  exportFormatShortLabel,
  exportMockup as runExport,
  renderMockup,
  toExportOptions,
  type ExportOptions,
  type ExportUiSettings,
} from './lib/export';
import { downloadZip } from './lib/downloadZip';
import { mergeThreeSettings } from './lib/threeMockupDefaults';
import { useScreenshot } from './lib/useScreenshot';
import { isIframeProxyEnabled } from './lib/iframeUrl';
import { screenshotViewportHeightPx } from './lib/screenshot';
import { putGltf, deleteGltf } from './lib/threeGltfStore';
import { deleteContentMedia } from './lib/contentMediaStore';
import { collectContentMediaAssetIds } from './lib/contentSlots';
import { isSinglePrimaryUrlSlot, getEffectiveContentSlots } from './lib/contentSlots';
import { DEFAULT_GLTF_SCREEN_MESH_NAME, MAX_GLB_BYTES } from './lib/gltfConstants';
import { AppSettingsModal } from './components/AppSettingsModal';
import {
  isProjectPushConfigured,
  loadProjectPushSettings,
  persistProjectPushSettings,
  type ProjectPushSettings,
} from './lib/projectPushSettings';
import {
  notifySuccessWebhook,
  ProjectPushHttpError,
  pushProjectMultipart,
} from './lib/projectPushApi';

const X_FRAME_BLOCKED_DOMAINS = [
  'google.com',
  'facebook.com',
  'twitter.com',
  'x.com',
  'linkedin.com',
  'amazon.com',
  'stripe.com',
  'youtube.com',
  'instagram.com',
];

function loadCustomMockups(): MockupConfig[] {
  // Try new key first.
  const fresh = localStorage.getItem(STORAGE_KEY);
  if (fresh) {
    try {
      const parsed = JSON.parse(fresh) as MockupConfig[];
      return parsed.map(migrateMockup);
    } catch (err) {
      console.warn('Failed to parse v2 storage', err);
    }
  }
  // Migrate from legacy key.
  const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
  if (legacy) {
    try {
      const parsed = JSON.parse(legacy) as (MockupConfig | LegacyMockupConfig)[];
      const migrated = parsed.map(migrateMockup);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
      localStorage.removeItem(LEGACY_STORAGE_KEY);
      return migrated;
    } catch (err) {
      console.warn('Failed to migrate legacy storage', err);
    }
  }
  return [];
}

function persistCustomMockups(mockups: MockupConfig[]) {
  const customs = mockups.filter((m) => !m.isDefault);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(customs));
}

function cornersBboxAspectRatio(corners: Corners): number {
  const bb = cornersBBox(corners);
  return bb.h > 1e-6 ? bb.w / bb.h : 1280 / 720;
}

/** Reuse preview screenshot when viewport matches what the header preview fetched. */
function getExportOptionsWithPrefetch(
  ui: ExportUiSettings,
  previewFetchW: number,
  shot: { status: string; url: string | null },
  previewAspect: number,
  mockup: MockupConfig,
  exportScroll?: { x: number; y: number } | null,
): ExportOptions {
  const base = toExportOptions(ui);
  if (shot.status !== 'ready' || !shot.url) return base;
  if (exportScroll && (exportScroll.x !== 0 || exportScroll.y !== 0)) return base;
  if (getScreenshotDevicePixelRatio(mockup, ui.maxOutputWidth) !== 1) return base;
  if (!isSinglePrimaryUrlSlot(mockup)) return base;
  const slots = getEffectiveContentSlots(mockup);
  const slot0 = slots[0]!;
  const logicalW = getSlotLogicalContentWidth(mockup, slot0);
  const expectedFetch = resolveScreenshotFetchWidth(logicalW);
  if (Math.round(previewFetchW) !== Math.round(expectedFetch)) return base;
  const w = previewFetchW;
  const aspectForExport = slot0.contentAspect ?? mockup.contentAspect ?? previewAspect;
  const hPreview = screenshotViewportHeightPx(w, previewAspect);
  const hExport = screenshotViewportHeightPx(w, aspectForExport);
  if (hPreview !== hExport) return base;
  return { ...base, prefetchedScreenshotDataUrl: shot.url };
}

export default function App() {
  const [url, setUrl] = useState('https://react.dev');
  const [mockups, setMockups] = useState<MockupConfig[]>(DEFAULT_MOCKUPS);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [exportingIds, setExportingIds] = useState<Set<string>>(new Set());
  const [bulkExporting, setBulkExporting] = useState(false);
  const [exportSettings, setExportSettings] = useState<ExportUiSettings>(
    DEFAULT_EXPORT_UI_SETTINGS,
  );
  const [singleExportMockupId, setSingleExportMockupId] = useState<string | null>(null);
  const [singleExportDraft, setSingleExportDraft] = useState<ExportUiSettings>(
    DEFAULT_EXPORT_UI_SETTINGS,
  );
  const [bulkImportOpen, setBulkImportOpen] = useState(false);
  const [addDeviceOpen, setAddDeviceOpen] = useState(false);
  const [appSettingsOpen, setAppSettingsOpen] = useState(false);
  const [projectPushSettings, setProjectPushSettings] = useState<ProjectPushSettings>(() =>
    loadProjectPushSettings(),
  );
  const [pushSessionBasicPassword, setPushSessionBasicPassword] = useState('');

  useEffect(() => {
    const customs = loadCustomMockups();
    if (customs.length) {
      setMockups([...DEFAULT_MOCKUPS, ...customs]);
    }
  }, []);

  useEffect(() => {
    persistProjectPushSettings(projectPushSettings);
  }, [projectPushSettings]);

  const hasXFrameError =
    !isIframeProxyEnabled() &&
    X_FRAME_BLOCKED_DOMAINS.some((d) => url.toLowerCase().includes(d));

  const screenshotRefMockup = useMemo(
    () => mockups.find((m) => m.renderMode !== 'three'),
    [mockups],
  );

  const screenshotPreviewAspect = useMemo(() => {
    const m = screenshotRefMockup;
    if (!m) return 1280 / 720;
    const s0 = getEffectiveContentSlots(m)[0]!;
    return s0.contentAspect ?? m.contentAspect ?? 1280 / 720;
  }, [screenshotRefMockup]);

  const previewScreenshotFetchWidth = useMemo(() => {
    const m = screenshotRefMockup;
    if (!m) return resolveScreenshotFetchWidth(1280);
    const slot0 = getEffectiveContentSlots(m)[0]!;
    return resolveScreenshotFetchWidth(getSlotLogicalContentWidth(m, slot0));
  }, [screenshotRefMockup]);

  const screenshot = useScreenshot(url, {
    width: previewScreenshotFetchWidth,
    contentAspect: screenshotPreviewAspect,
  });

  const updateMockup = useCallback((id: string, patch: Partial<MockupConfig>) => {
    setMockups((prev) => {
      const next = prev.map((m) => {
        if (m.id !== id) return m;
        const { threeSettings: tsPatch, flatAppearance: faPatch, ...rest } = patch;
        let updated: MockupConfig = { ...m, ...rest };
        if (tsPatch !== undefined) {
          updated.threeSettings = { ...mergeThreeSettings(m.threeSettings), ...tsPatch };
        }
        if (faPatch !== undefined) {
          updated.flatAppearance = { ...m.flatAppearance, ...faPatch };
        }
        return updated;
      });
      const target = next.find((x) => x.id === id);
      if (target && !target.isDefault) persistCustomMockups(next);
      return next;
    });
  }, []);

  const appendImportedMockups = useCallback((imported: MockupConfig[]) => {
    if (imported.length === 0) return;
    setMockups((prev) => {
      const next = [...prev, ...imported];
      persistCustomMockups(next);
      return next;
    });
  }, []);

  const addFlatMockup = useCallback(
    (payload: {
      imageUrl: string;
      corners: Corners;
      name: string;
      deviceType: DeviceType;
    }) => {
      const newMockup: MockupConfig = {
        id: uuidv4(),
        name: payload.name,
        imageUrl: payload.imageUrl,
        corners: payload.corners,
        deviceType: payload.deviceType,
        contentAspect: cornersBboxAspectRatio(payload.corners),
        contentViewportWidth: defaultContentViewportWidth(payload.deviceType),
        isDefault: false,
      };
      setMockups((prev) => {
        const next = [...prev, newMockup];
        persistCustomMockups(next);
        return next;
      });
    },
    [],
  );

  const saveGltfMockup = useCallback(
    async (payload: {
      blob: Blob;
      name: string;
      screenMeshName: string;
      deviceType: DeviceType;
    }) => {
      if (payload.blob.size > MAX_GLB_BYTES) {
        throw new Error('Datei zu groß');
      }
      const assetId = uuidv4();
      try {
        await putGltf(assetId, payload.blob);
        const template = DEFAULT_MOCKUPS.find((m) => m.id === 'default-3d-laptop');
        if (!template) throw new Error('Internal: 3D template missing');
        const newMockup: MockupConfig = {
          id: uuidv4(),
          name: payload.name,
          imageUrl: TRANSPARENT_PIXEL_GIF,
          renderMode: 'three',
          threeGltfAssetId: assetId,
          threeScreenMeshName: payload.screenMeshName || DEFAULT_GLTF_SCREEN_MESH_NAME,
          deviceType: payload.deviceType,
          corners: { ...template.corners },
          contentAspect: template.contentAspect,
          isDefault: false,
        };
        setMockups((prev) => {
          const next = [...prev, newMockup];
          persistCustomMockups(next);
          return next;
        });
      } catch (err) {
        void deleteGltf(assetId);
        throw err;
      }
    },
    [],
  );

  const handleDeleteMockup = (id: string) => {
    setMockups((prev) => {
      const victim = prev.find((m) => m.id === id);
      if (victim?.threeGltfAssetId) {
        void deleteGltf(victim.threeGltfAssetId);
      }
      if (victim) {
        for (const aid of collectContentMediaAssetIds(victim)) {
          void deleteContentMedia(aid);
        }
      }
      const next = prev.filter((m) => m.id !== id);
      persistCustomMockups(next);
      return next;
    });
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const openSingleExport = (id: string) => {
    setSingleExportDraft(exportSettings);
    setSingleExportMockupId(id);
  };

  const exportOne = async (id: string) => {
    const mockup = mockups.find((m) => m.id === id);
    if (!mockup) return;
    const opts = getExportOptionsWithPrefetch(
      exportSettings,
      previewScreenshotFetchWidth,
      screenshot,
      screenshotPreviewAspect,
      mockup,
    );
    setExportingIds((prev) => new Set(prev).add(id));
    try {
      const result = await runExport(mockup, url, opts);
      if (result.screenshotAttempted && !result.screenshotIncluded) {
        alert(
          `Export für „${mockup.name}“ ohne Website-Inhalt (Screenshot nicht verfügbar). Prüfe URL und Screenshot-Provider (.env).`,
        );
      }
    } catch (err) {
      console.error('Export failed', err);
      alert(`Export failed for "${mockup.name}". See console for details.`);
    } finally {
      setExportingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const handlePushToWebsite = useCallback(
    async (
      mockupId: string,
      input: {
        stringValues: Record<string, string>;
        fileBindings: Record<string, { kind: 'user'; file: File } | { kind: 'mockupPng' }>;
      },
    ) => {
      const mockup = mockups.find((m) => m.id === mockupId);
      if (!mockup) throw new Error('Mockup nicht gefunden');
      const ui = singleExportDraft;
      const opts = getExportOptionsWithPrefetch(
        ui,
        previewScreenshotFetchWidth,
        screenshot,
        screenshotPreviewAspect,
        mockup,
      );
      const rendered = await renderMockup(mockup, url, opts);

      const stringValues = { ...input.stringValues };
      const blobs: Record<string, Blob> = {};
      const filenames: Record<string, string> = {};

      for (const [fieldName, binding] of Object.entries(input.fileBindings)) {
        if (binding.kind === 'user') {
          blobs[fieldName] = binding.file;
          filenames[fieldName] = binding.file.name;
        } else {
          blobs[fieldName] = rendered.blob;
          filenames[fieldName] = rendered.filename;
        }
      }

      const pass =
        projectPushSettings.authMode === 'basic' ? pushSessionBasicPassword : undefined;
      const pushResult = await pushProjectMultipart(
        projectPushSettings,
        pass,
        stringValues,
        blobs,
        filenames,
      );

      if (!pushResult.ok) {
        throw new ProjectPushHttpError(
          pushResult.status,
          pushResult.rawBody.slice(0, 500),
          `Push fehlgeschlagen (HTTP ${pushResult.status})`,
        );
      }

      let webhookWarning: string | undefined;
      const hook = projectPushSettings.successWebhookUrl.trim();
      if (hook) {
        const wh = await notifySuccessWebhook(hook, {
          mockupId: mockup.id,
          mockupName: mockup.name,
          websiteUrl: url,
          remoteId: pushResult.remoteId,
          pushStatus: pushResult.status,
        });
        if (!wh.ok) {
          webhookWarning =
            wh.error ?? `Webhook antwortete mit HTTP ${wh.status} (Push war trotzdem erfolgreich).`;
        }
      }

      return {
        webhookWarning,
        missingScreenshot: rendered.screenshotAttempted && !rendered.screenshotIncluded,
      };
    },
    [
      mockups,
      singleExportDraft,
      previewScreenshotFetchWidth,
      screenshot,
      screenshotPreviewAspect,
      url,
      projectPushSettings,
      pushSessionBasicPassword,
    ],
  );

  const confirmSingleExport = async () => {
    if (!singleExportMockupId) return;
    const id = singleExportMockupId;
    const ui = singleExportDraft;
    const mockup = mockups.find((m) => m.id === id);
    if (!mockup) {
      setSingleExportMockupId(null);
      return;
    }
    const opts = getExportOptionsWithPrefetch(
      ui,
      previewScreenshotFetchWidth,
      screenshot,
      screenshotPreviewAspect,
      mockup,
    );
    setExportSettings(ui);
    setExportingIds((prev) => new Set(prev).add(id));
    try {
      const result = await runExport(mockup, url, opts);
      if (result.screenshotAttempted && !result.screenshotIncluded) {
        alert(
          `Export für „${mockup.name}“ ohne Website-Inhalt (Screenshot nicht verfügbar). Prüfe URL und Screenshot-Provider (.env).`,
        );
      }
    } catch (err) {
      console.error('Export failed', err);
      alert(`Export failed for "${mockup.name}". See console for details.`);
    } finally {
      setExportingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      setSingleExportMockupId(null);
    }
  };

  const exportSelected = async () => {
    if (selectedIds.size === 0) return;
    const ids = [...selectedIds];
    if (ids.length === 1) {
      await exportOne(ids[0]!);
      return;
    }

    setBulkExporting(true);
    try {
      const entries: { filename: string; blob: Blob }[] = [];
      const missingSite: string[] = [];

      for (const id of ids) {
        const mockup = mockups.find((m) => m.id === id);
        if (!mockup) continue;
        const opts = getExportOptionsWithPrefetch(
          exportSettings,
          previewScreenshotFetchWidth,
          screenshot,
          screenshotPreviewAspect,
          mockup,
        );
        const result = await renderMockup(mockup, url, opts);
        entries.push({ filename: result.filename, blob: result.blob });
        if (result.screenshotAttempted && !result.screenshotIncluded) {
          missingSite.push(mockup.name);
        }
      }

      if (entries.length > 0) {
        await downloadZip(entries);
      }

      if (missingSite.length > 0) {
        alert(
          `Website-Screenshot fehlte bei: ${missingSite.join(', ')}. ` +
            'Diese Mockups wurden ohne Seiteninhalt exportiert. Prüfe die Screenshot-Provider-Einstellung (.env).',
        );
      }
    } catch (err) {
      console.error('Bulk export failed', err);
      alert('Mehrfach-Export fehlgeschlagen. Siehe Konsole für Details.');
    } finally {
      setBulkExporting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0F172A] text-slate-100 flex flex-col font-sans selection:bg-sky-500/30">
      <Header
        url={url}
        setUrl={setUrl}
        onAddMockup={() => setAddDeviceOpen(true)}
        onBulkImport={() => setBulkImportOpen(true)}
        onOpenSettings={() => setAppSettingsOpen(true)}
        onExportSelected={exportSelected}
        selectedCount={selectedIds.size}
        hasXFrameError={hasXFrameError}
        screenshotStatus={screenshot.status}
        exporting={bulkExporting}
        exportSettings={exportSettings}
        onExportSettingsChange={setExportSettings}
      />

      <main className="flex-1 max-w-7xl mx-auto w-full px-6 py-8">
        <div className="mb-10 p-8 bg-[#1E293B]/50 rounded-3xl border border-slate-700 backdrop-blur-sm flex items-center justify-between relative overflow-hidden shadow-2xl">
          <div className="relative z-10">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-sky-500/10 border border-sky-500/20 text-sky-400 text-[10px] font-bold uppercase tracking-widest mb-4">
              Engine Version 3.0.0
            </div>
            <h2 className="text-3xl font-bold flex items-center gap-3 tracking-tight">
              Professional <span className="text-sky-400 italic">Showcase</span>
            </h2>
            <p className="text-sm text-slate-400 mt-3 max-w-xl leading-relaxed">
              Drop any URL into the bar above and watch it render perspective-correct
              across every device frame. Drag the four corner handles on your own
              photos to map any display surface in seconds.
            </p>
          </div>
          <motion.div
            initial={{ rotate: -20, scale: 0.8 }}
            animate={{ rotate: 10, scale: 1.1 }}
            transition={{ duration: 10, repeat: Infinity, repeatType: 'reverse' }}
            className="absolute -right-20 -bottom-20 opacity-20 pointer-events-none"
          >
            <LayoutGrid className="w-80 h-80 text-sky-500" />
          </motion.div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {mockups.map((mockup) =>
            mockup.renderMode === 'three' ? (
              <MockupCellThree
                key={mockup.id}
                config={mockup}
                screenshotUrl={screenshot.url}
                isSelected={selectedIds.has(mockup.id)}
                onToggleSelect={() => toggleSelect(mockup.id)}
                onDelete={() => handleDeleteMockup(mockup.id)}
                onRequestExport={() => openSingleExport(mockup.id)}
                exporting={exportingIds.has(mockup.id)}
                exportFormatLabel={exportFormatShortLabel(exportSettings.format)}
                onUpdateMockup={(patch) => updateMockup(mockup.id, patch)}
              />
            ) : (
              <MockupCell
                key={mockup.id}
                config={mockup}
                websiteUrl={url}
                isSelected={selectedIds.has(mockup.id)}
                onToggleSelect={() => toggleSelect(mockup.id)}
                onDelete={() => handleDeleteMockup(mockup.id)}
                onRequestExport={() => openSingleExport(mockup.id)}
                exporting={exportingIds.has(mockup.id)}
                exportFormatLabel={exportFormatShortLabel(exportSettings.format)}
                onUpdateMockup={(patch) => updateMockup(mockup.id, patch)}
              />
            ),
          )}

          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setAddDeviceOpen(true)}
            className="group relative flex flex-col items-center justify-center bg-[#1E293B]/30 rounded-2xl border-2 border-dashed border-slate-700 aspect-[4/3] hover:border-sky-500 hover:bg-sky-500/5 transition-all cursor-pointer overflow-hidden"
          >
            <div className="w-12 h-12 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center mb-4 group-hover:scale-110 group-hover:border-sky-500/50 transition-all">
              <Plus className="w-6 h-6 text-slate-400 group-hover:text-sky-400" />
            </div>
            <span className="text-sm font-bold text-slate-400 group-hover:text-sky-400">
              Add Device Frame
            </span>
            <p className="text-center text-[10px] text-slate-500 mt-2">
              SVG, Foto oder 3D-Modell (glTF)
            </p>
          </motion.button>
        </div>

        <div className="mt-16 p-6 bg-[#1E293B]/40 rounded-2xl border border-slate-700/50 flex gap-4 max-w-3xl mx-auto backdrop-blur-sm">
          <div className="bg-sky-500/10 p-3 rounded-xl text-sky-400 shrink-0">
            <Info className="w-6 h-6" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-slate-100 mb-1">How exporting works</h4>
            <p className="text-[11px] text-slate-400 leading-relaxed font-medium">
              The live preview uses a real iframe — interactive, scrollable. Because
              browsers refuse to rasterize cross-origin iframes, image export
              requests a screenshot of your URL from the configured provider
              (microlink by default — no API key required) and warps it
              perspective-correct onto the mockup. Format, screenshot width and
              output size are set next to Export Selected; multiple selections
              download as one ZIP. Configure providers via
              <span className="font-mono text-sky-400"> .env</span>.
            </p>
          </div>
        </div>
      </main>

      <footer className="h-10 bg-[#0F172A] border-t border-slate-800 px-6 flex items-center justify-between text-[10px] uppercase font-bold tracking-widest text-slate-500">
        <div className="flex gap-6">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 bg-sky-500 rounded-full animate-pulse" /> Service
            Active
          </div>
          <div className="flex items-center gap-2 underline underline-offset-4 decoration-slate-700">
            © 2026 LiveMockup Studio
          </div>
        </div>
        <div className="flex gap-4">
          <span className="text-sky-500">
            {mockups.length} {mockups.length === 1 ? 'Frame' : 'Frames'}
          </span>
          <span className="text-slate-600">Build 3.0</span>
        </div>
      </footer>

      <BulkImportModal
        isOpen={bulkImportOpen}
        onClose={() => setBulkImportOpen(false)}
        onImported={appendImportedMockups}
      />

      <AddDeviceModal
        isOpen={addDeviceOpen}
        onClose={() => setAddDeviceOpen(false)}
        previewUrl={url}
        onSaveFlatMockup={addFlatMockup}
        onSubmitGltf={saveGltfMockup}
      />

      <SingleExportModal
        isOpen={singleExportMockupId !== null}
        mockupId={singleExportMockupId ?? ''}
        mockupName={mockups.find((m) => m.id === singleExportMockupId)?.name ?? ''}
        draftSettings={singleExportDraft}
        onDraftChange={setSingleExportDraft}
        onCancel={() => setSingleExportMockupId(null)}
        onConfirm={() => void confirmSingleExport()}
        exporting={singleExportMockupId !== null && exportingIds.has(singleExportMockupId)}
        projectPushConfigured={isProjectPushConfigured(projectPushSettings)}
        projectPushSettings={projectPushSettings}
        pushSessionBasicPassword={pushSessionBasicPassword}
        onPushSessionBasicPasswordChange={setPushSessionBasicPassword}
        onOpenAppSettings={() => {
          setSingleExportMockupId(null);
          setAppSettingsOpen(true);
        }}
        onPushToWebsite={(mockupId, input) => handlePushToWebsite(mockupId, input)}
      />

      <AppSettingsModal
        isOpen={appSettingsOpen}
        onClose={() => setAppSettingsOpen(false)}
        projectPushSettings={projectPushSettings}
        onProjectPushSettingsChange={setProjectPushSettings}
        pushSessionBasicPassword={pushSessionBasicPassword}
        onPushSessionBasicPasswordChange={setPushSessionBasicPassword}
      />

    </div>
  );
}
