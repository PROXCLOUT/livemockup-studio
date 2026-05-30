import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Image as ImageIcon,
  MousePointer2,
  PanelLeftClose,
  Plus,
  RefreshCcw,
  Sparkles,
  Trash2,
  Video,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { v4 as uuidv4 } from 'uuid';
import type { ContentSlot, ContentSlotSource, Corners, DeviceType, FlatAppearance, MockupConfig } from '../types';
import { cn } from '../lib/utils';
import { getMatrix3d, cornersInPixels } from '../lib/perspective';
import { getBuiltinFrameIntrinsicSize, resolveMockupFrameDataUrl } from '../lib/deviceFrames';
import { getFactoryCornersForConfig } from '../lib/defaultMockupCorners';
import {
  getSlotLogicalContentHeight,
  getSlotLogicalContentWidth,
} from '../lib/contentViewport';
import {
  MOCKUP_STAGE_DEFAULT_CLASS,
  MOCKUP_STAGE_TRANSPARENT_CLASS,
  MOCKUP_WARP_WRAPPER_STYLE,
} from '../lib/mockupIframeStyles';
import {
  FlatAppearanceForm,
  flatAppearanceFromConfig,
  sanitizeFlatAppearanceForConfig,
} from './FlatAppearanceForm';
import {
  cornersFromFirstSlot,
  createAdditionalSlot,
  getEffectiveContentSlots,
  MAX_CONTENT_SLOTS,
  mockupPatchForContentSlots,
  resolveSlotSiteUrl,
} from '../lib/contentSlots';
import { CONTENT_ASPECT_PRESETS, formatAspectRatio } from '../lib/contentFramePresets';
import { SlotSurfaceMedia } from './SlotSurfaceMedia';
import { putContentMedia, deleteContentMedia } from '../lib/contentMediaStore';
import { MAX_CONTENT_MEDIA_BYTES } from '../lib/contentMediaConstants';
import { bboxAspectRatio, fitCornersPreserveBBoxAspect, type CornerHandleKey } from '../lib/cornerBBoxAspect';

const FALLBACK_CONTENT_H = 800;

const HANDLE_KEYS = ['tl', 'tr', 'br', 'bl'] as const;
type HandleKey = CornerHandleKey;

const HANDLE_LABEL: Record<HandleKey, string> = {
  tl: 'TL',
  tr: 'TR',
  br: 'BR',
  bl: 'BL',
};

function cloneCorners(c: Corners): Corners {
  return {
    tl: { ...c.tl },
    tr: { ...c.tr },
    br: { ...c.br },
    bl: { ...c.bl },
  };
}

function cloneSlots(slots: ContentSlot[]): ContentSlot[] {
  return slots.map((s) => ({
    ...s,
    corners: cloneCorners(s.corners),
  }));
}

async function deleteMediaForSlot(slot: ContentSlot): Promise<void> {
  const src = slot.source;
  if (src.kind === 'imageAsset') await deleteContentMedia(src.assetId);
  if (src.kind === 'videoAsset') {
    await deleteContentMedia(src.assetId);
    if (src.posterAssetId) await deleteContentMedia(src.posterAssetId);
  }
}

interface FlatWysiwygEditorProps {
  open: boolean;
  config: MockupConfig;
  websiteUrl: string;
  onClose: () => void;
  onCommit: (patch: Partial<MockupConfig>) => void;
}

export function FlatWysiwygEditor({
  open,
  config,
  websiteUrl,
  onClose,
  onCommit,
}: FlatWysiwygEditorProps) {
  const [slots, setSlots] = useState<ContentSlot[]>(() => getEffectiveContentSlots(config));
  const [activeSlotId, setActiveSlotId] = useState<string>(() => getEffectiveContentSlots(config)[0]!.id);
  const [corners, setCorners] = useState<Corners>(() =>
    cloneCorners(getEffectiveContentSlots(config)[0]!.corners),
  );
  const [flatDraft, setFlatDraft] = useState<FlatAppearance>(() => flatAppearanceFromConfig(config));
  const [dragging, setDragging] = useState<HandleKey | null>(null);
  /** Layout-Größe des Mockup-Bildes (CSS-Box, ohne Transform-Skala) — für Homographie & Overlays. */
  const [imgLayout, setImgLayout] = useState({ w: 0, h: 0 });
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [bboxLockCorners, setBboxLockCorners] = useState(false);
  const [panning, setPanning] = useState<{
    pointerId: number;
    startClientX: number;
    startClientY: number;
    startPanX: number;
    startPanY: number;
  } | null>(null);
  const snapshotRef = useRef<{
    corners: Corners;
    flat: FlatAppearance;
    slots: ContentSlot[] | null;
  } | null>(null);

  const imgRef = useRef<HTMLImageElement>(null);
  const stageWheelRef = useRef<HTMLDivElement>(null);
  const cornersRef = useRef(corners);
  cornersRef.current = corners;
  const bboxLockCornersRef = useRef(bboxLockCorners);
  bboxLockCornersRef.current = bboxLockCorners;
  const cornersDragStartRef = useRef<Corners | null>(null);
  const bboxTargetRatioRef = useRef(1);
  const dragLiveCornersRef = useRef<Corners>(corners);
  dragLiveCornersRef.current = corners;
  const activeSlotIdRef = useRef(activeSlotId);
  activeSlotIdRef.current = activeSlotId;
  const slotsRef = useRef(slots);
  slotsRef.current = slots;

  useEffect(() => {
    if (!open) return;
    const eff = getEffectiveContentSlots(config);
    const list = cloneSlots(eff);
    const prevId = activeSlotIdRef.current;
    const nextActive = list.some((s) => s.id === prevId) ? prevId : list[0]!.id;
    const active = list.find((s) => s.id === nextActive) ?? list[0]!;
    setSlots(list);
    setActiveSlotId(nextActive);
    setCorners(cloneCorners(active.corners));
    setFlatDraft(flatAppearanceFromConfig(config));
    setZoom(1);
    setPan({ x: 0, y: 0 });
    snapshotRef.current = {
      corners: cloneCorners(config.corners),
      flat: flatAppearanceFromConfig(config),
      slots: config.contentSlots ? cloneSlots(config.contentSlots) : null,
    };
  }, [open, config.id]);

  useEffect(() => {
    if (!open) return;
    const s = slotsRef.current.find((x) => x.id === activeSlotId);
    if (s) setCorners(cloneCorners(s.corners));
  }, [activeSlotId, open]);

  const activeSlot = useMemo(
    () => slots.find((s) => s.id === activeSlotId) ?? slots[0]!,
    [slots, activeSlotId],
  );

  const previewConfig = useMemo(
    () => ({
      ...config,
      corners: cornersFromFirstSlot(slots),
      flatAppearance: { ...config.flatAppearance, ...flatDraft },
      contentSlots: slots,
    }),
    [config, slots, flatDraft],
  );

  const frameUrl = useMemo(() => resolveMockupFrameDataUrl(previewConfig), [previewConfig]);
  const builtinIntrinsic = useMemo(
    () => getBuiltinFrameIntrinsicSize(previewConfig),
    [previewConfig],
  );

  const logicalW = getSlotLogicalContentWidth(previewConfig, activeSlot);
  const contentH = getSlotLogicalContentHeight(
    previewConfig,
    activeSlot,
    logicalW,
    FALLBACK_CONTENT_H,
  );

  const effectiveAspect = activeSlot.contentAspect ?? config.contentAspect;
  const slotAspectOverride =
    activeSlot.contentAspect != null && activeSlot.contentAspect > 0
      ? activeSlot.contentAspect
      : undefined;
  const insetPxUi = Math.min(
    120,
    Math.max(
      0,
      Math.round(
        activeSlot.contentInsetPx ??
          (slots.length === 1 ? (config.contentInsetPx ?? 0) : 0),
      ),
    ),
  );

  useLayoutEffect(() => {
    if (!open) return;
    const img = imgRef.current;
    if (!img) return;
    const update = () => {
      setImgLayout({
        w: Math.max(1, Math.round(img.offsetWidth)),
        h: Math.max(1, Math.round(img.offsetHeight)),
      });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(img);
    window.addEventListener('resize', update);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [open, frameUrl, zoom, pan]);

  const panRef = useRef(pan);
  panRef.current = pan;

  useLayoutEffect(() => {
    const el = stageWheelRef.current;
    if (!open || !el) return;
    const onWheel = (ev: WheelEvent) => {
      ev.preventDefault();
      const factor = ev.deltaY > 0 ? 0.92 : 1.08;
      setZoom((z) => Math.min(4, Math.max(0.25, z * factor)));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [open, config.id]);

  useEffect(() => {
    if (!panning) return;
    const onMove = (e: PointerEvent) => {
      if (e.pointerId !== panning.pointerId) return;
      setPan({
        x: panning.startPanX + (e.clientX - panning.startClientX),
        y: panning.startPanY + (e.clientY - panning.startClientY),
      });
    };
    const onUp = (e: PointerEvent) => {
      if (e.pointerId !== panning.pointerId) return;
      setPanning(null);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [panning]);

  const pointToPercent = useCallback((clientX: number, clientY: number) => {
    const img = imgRef.current;
    if (!img) return { x: 0, y: 0 };
    const rect = img.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * 100;
    const y = ((clientY - rect.top) / rect.height) * 100;
    return {
      x: Math.max(0, Math.min(100, x)),
      y: Math.max(0, Math.min(100, y)),
    };
  }, []);

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: PointerEvent) => {
      const pt = pointToPercent(e.clientX, e.clientY);
      const k = dragging;
      setCorners((prev) => {
        const next =
          bboxLockCornersRef.current && cornersDragStartRef.current
            ? fitCornersPreserveBBoxAspect(
                cornersDragStartRef.current,
                k,
                pt,
                bboxTargetRatioRef.current,
              )
            : { ...prev, [k]: pt };
        dragLiveCornersRef.current = next;
        return next;
      });
    };
    const onUp = () => {
      cornersDragStartRef.current = null;
      setDragging(null);
      const c = dragLiveCornersRef.current;
      const id = activeSlotIdRef.current;
      setSlots((prev) => {
        const next = prev.map((x) => (x.id === id ? { ...x, corners: { ...c } } : x));
        onCommit(mockupPatchForContentSlots(next));
        return next;
      });
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [dragging, pointToPercent, onCommit]);

  const iframeRadius = Math.max(
    0,
    Math.min(
      activeSlot.iframeBorderRadius ?? flatDraft.iframeBorderRadius ?? 0,
      Math.min(logicalW, contentH) / 2,
    ),
  );

  const onFlatChange = useCallback(
    (next: FlatAppearance) => {
      setFlatDraft(next);
      onCommit({ flatAppearance: sanitizeFlatAppearanceForConfig(config, next) });
    },
    [config, onCommit],
  );

  const resetSession = () => {
    const s = snapshotRef.current;
    if (!s) return;
    setFlatDraft({ ...s.flat });
    if (s.slots) {
      const restored = cloneSlots(s.slots);
      setSlots(restored);
      setActiveSlotId(restored[0]!.id);
      setCorners(cloneCorners(restored[0]!.corners));
      onCommit({
        ...mockupPatchForContentSlots(restored),
        flatAppearance: sanitizeFlatAppearanceForConfig(config, s.flat),
      });
    } else {
      setCorners({ ...s.corners });
      const eff = getEffectiveContentSlots({ ...config, corners: s.corners, contentSlots: undefined });
      setSlots(cloneSlots(eff));
      setActiveSlotId(eff[0]!.id);
      onCommit({
        contentSlots: undefined,
        corners: { ...s.corners },
        flatAppearance: sanitizeFlatAppearanceForConfig(config, s.flat),
      });
    }
  };

  const resetFactoryCorners = () => {
    const d = getFactoryCornersForConfig(config);
    if (!d) return;
    setCorners({ ...d });
    const id = activeSlotIdRef.current;
    setSlots((prev) => {
      const next = prev.map((x) => (x.id === id ? { ...x, corners: { ...d } } : x));
      onCommit(mockupPatchForContentSlots(next));
      return next;
    });
  };

  const factoryCorners = getFactoryCornersForConfig(config);

  const addSlot = useCallback(() => {
    if (slots.length >= MAX_CONTENT_SLOTS) return;
    let base = slots;
    if (slots.length === 1 && slots[0]!.id === 'primary') {
      base = [{ ...slots[0]!, id: uuidv4() }];
    }
    const anchor = base.find((s) => s.id === activeSlotId) ?? base[0]!;
    const extra = createAdditionalSlot(anchor.corners);
    const next = [...base, extra];
    setSlots(next);
    setActiveSlotId(extra.id);
    setCorners(cloneCorners(extra.corners));
    onCommit(mockupPatchForContentSlots(next));
  }, [slots, activeSlotId, onCommit]);

  const removeSlot = useCallback(
    (id: string) => {
      if (slots.length <= 1) return;
      const victim = slots.find((s) => s.id === id);
      if (victim) void deleteMediaForSlot(victim);
      const next = slots.filter((s) => s.id !== id);
      setSlots(next);
      const newActive = next[0]!;
      if (activeSlotId === id) {
        setActiveSlotId(newActive.id);
        setCorners(cloneCorners(newActive.corners));
      }
      onCommit(mockupPatchForContentSlots(next));
    },
    [slots, activeSlotId, onCommit],
  );

  const updateActiveSource = useCallback(
    (source: ContentSlotSource) => {
      const id = activeSlotIdRef.current;
      setSlots((prev) => {
        const next = prev.map((x) => (x.id === id ? { ...x, source } : x));
        onCommit(mockupPatchForContentSlots(next));
        return next;
      });
    },
    [onCommit],
  );

  const updateActiveSlotPatch = useCallback(
    (patch: Partial<ContentSlot>) => {
      const id = activeSlotIdRef.current;
      setSlots((prev) => {
        const next = prev.map((x) => {
          if (x.id !== id) return x;
          const u: ContentSlot = { ...x, ...patch };
          if (Object.prototype.hasOwnProperty.call(patch, 'deviceType') && patch.deviceType === undefined) {
            delete u.deviceType;
          }
          return u;
        });
        onCommit(mockupPatchForContentSlots(next));
        return next;
      });
    },
    [onCommit],
  );

  const onPickImage = async (file: File | null) => {
    if (!file) return;
    if (file.size > MAX_CONTENT_MEDIA_BYTES) {
      alert(`Datei zu groß (max. ${Math.round(MAX_CONTENT_MEDIA_BYTES / (1024 * 1024))} MB).`);
      return;
    }
    const assetId = uuidv4();
    try {
      await putContentMedia(assetId, file);
      updateActiveSource({ kind: 'imageAsset', assetId });
    } catch {
      alert('Bild konnte nicht gespeichert werden.');
    }
  };

  const onPickVideo = async (file: File | null) => {
    if (!file) return;
    if (file.size > MAX_CONTENT_MEDIA_BYTES) {
      alert(`Datei zu groß (max. ${Math.round(MAX_CONTENT_MEDIA_BYTES / (1024 * 1024))} MB).`);
      return;
    }
    const assetId = uuidv4();
    try {
      await putContentMedia(assetId, file);
      updateActiveSource({ kind: 'videoAsset', assetId });
    } catch {
      alert('Video konnte nicht gespeichert werden.');
    }
  };

  const onPickPoster = async (file: File | null) => {
    if (!file || activeSlot.source.kind !== 'videoAsset') return;
    if (file.size > MAX_CONTENT_MEDIA_BYTES) {
      alert(`Datei zu groß (max. ${Math.round(MAX_CONTENT_MEDIA_BYTES / (1024 * 1024))} MB).`);
      return;
    }
    const posterAssetId = uuidv4();
    try {
      await putContentMedia(posterAssetId, file);
      updateActiveSource({
        kind: 'videoAsset',
        assetId: activeSlot.source.assetId,
        posterAssetId,
      });
    } catch {
      alert('Poster konnte nicht gespeichert werden.');
    }
  };

  const stageBg = flatDraft.stageBackground;
  const stageTransparent = stageBg === null || stageBg === 'transparent';
  const stageSolid =
    typeof stageBg === 'string' && stageBg !== '' && stageBg !== 'transparent';
  const stageDefault = stageBg === undefined;

  const mount = typeof document !== 'undefined' ? document.body : null;
  if (!mount) return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          role="dialog"
          aria-modal
          aria-label="2D-Studio"
          className="fixed inset-0 z-[480] flex flex-col bg-[#0b1020] text-slate-100"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <header className="flex h-12 shrink-0 items-center justify-between border-b border-slate-800 px-3 gap-2 bg-[#0f172a]/95 backdrop-blur-md">
            <div className="flex items-center gap-2 min-w-0">
              <Sparkles className="w-4 h-4 text-sky-400 shrink-0" />
              <span className="text-sm font-bold truncate">{config.name}</span>
              <span className="text-[10px] uppercase tracking-widest text-slate-500 shrink-0">
                2D-Studio
              </span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
              <button
                type="button"
                onClick={resetSession}
                className="hidden sm:flex items-center gap-1.5 rounded-lg border border-slate-700 px-2.5 py-1.5 text-[11px] font-semibold text-slate-300 hover:bg-slate-800"
              >
                <RefreshCcw className="w-3.5 h-3.5" />
                Seitenstand
              </button>
              {factoryCorners && (
                <button
                  type="button"
                  onClick={resetFactoryCorners}
                  className="hidden md:flex items-center gap-1.5 rounded-lg border border-slate-700 px-2.5 py-1.5 text-[11px] font-semibold text-slate-300 hover:bg-slate-800"
                >
                  Werkzeug-Standard
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setZoom(1);
                  setPan({ x: 0, y: 0 });
                }}
                className="hidden sm:inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-2.5 py-1.5 text-[11px] font-semibold text-slate-300 hover:bg-slate-800"
                title="Zoom und Verschiebung zurücksetzen"
              >
                Ansicht 100 %
              </button>
              <button
                type="button"
                onClick={onClose}
                className="flex items-center gap-1 rounded-lg bg-slate-800 px-2.5 py-1.5 text-[11px] font-bold text-slate-200 hover:bg-slate-700 border border-slate-600"
              >
                <PanelLeftClose className="w-4 h-4" />
                Fertig
              </button>
            </div>
          </header>

          <div className="flex flex-1 min-h-0">
            <div
              className={cn(
                'relative flex flex-[2] min-w-0 flex-col items-center justify-center p-4 md:p-8',
                stageDefault && MOCKUP_STAGE_DEFAULT_CLASS,
                stageTransparent && MOCKUP_STAGE_TRANSPARENT_CLASS,
              )}
              style={stageSolid ? { background: stageBg } : undefined}
            >
              <div
                ref={stageWheelRef}
                className="relative flex h-[min(78vh,900px)] min-h-[200px] w-full max-w-5xl flex-1 items-center justify-center overflow-hidden select-none touch-none"
                onPointerDown={(e) => {
                  if (e.button !== 1) return;
                  e.preventDefault();
                  const p = panRef.current;
                  setPanning({
                    pointerId: e.pointerId,
                    startClientX: e.clientX,
                    startClientY: e.clientY,
                    startPanX: p.x,
                    startPanY: p.y,
                  });
                  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                }}
              >
                <div
                  className="relative"
                  style={{
                    transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                    transformOrigin: 'center center',
                  }}
                >
                  <div className="relative max-h-[min(78vh,900px)] w-full max-w-5xl select-none">
                <img
                  ref={imgRef}
                  src={frameUrl}
                  alt={config.name}
                  width={builtinIntrinsic?.w}
                  height={builtinIntrinsic?.h}
                  className="mx-auto block max-h-[min(78vh,900px)] w-auto max-w-full object-contain drop-shadow-2xl pointer-events-none"
                  draggable={false}
                />

                {imgLayout.w > 0 &&
                  slots.map((slot, idx) => {
                    const lw = getSlotLogicalContentWidth(previewConfig, slot);
                    const ch = getSlotLogicalContentHeight(previewConfig, slot, lw, FALLBACK_CONTENT_H);
                    const m =
                      imgLayout.w > 0 && imgLayout.h > 0
                        ? getMatrix3d(
                            lw,
                            ch,
                            cornersInPixels(slot.corners, imgLayout.w, imgLayout.h),
                          )
                        : null;
                    const rad = Math.max(
                      0,
                      Math.min(
                        slot.iframeBorderRadius ?? flatDraft.iframeBorderRadius ?? 0,
                        Math.min(lw, ch) / 2,
                      ),
                    );
                    const inset = Math.min(
                      120,
                      Math.max(
                        0,
                        Math.round(
                          slot.contentInsetPx ??
                            (slots.length === 1 ? (config.contentInsetPx ?? 0) : 0),
                        ),
                      ),
                    );
                    const resolved = resolveSlotSiteUrl(slot.source, websiteUrl);
                    const pointerOn =
                      resolved ||
                      slot.source.kind === 'imageAsset' ||
                      slot.source.kind === 'videoAsset';
                    return (
                      <div
                        key={slot.id}
                        className="absolute top-0 left-1/2 -translate-x-1/2"
                        style={{
                          width: imgLayout.w,
                          height: imgLayout.h,
                          zIndex: 10 + idx,
                        }}
                      >
                        {m && (
                          <div
                            className="absolute top-0 left-0 overflow-hidden"
                            style={{
                              width: lw,
                              height: ch,
                              transformOrigin: '0 0',
                              transform: m,
                              pointerEvents: pointerOn ? 'auto' : 'none',
                              borderRadius: rad > 0 ? `${rad}px` : undefined,
                              boxSizing: 'border-box',
                              padding: inset > 0 ? `${inset}px` : undefined,
                              backgroundColor: inset > 0 ? '#020617' : undefined,
                              ...MOCKUP_WARP_WRAPPER_STYLE,
                            }}
                          >
                            <SlotSurfaceMedia
                              slot={slot}
                              websiteUrl={websiteUrl}
                              iframeClassName="transition-opacity duration-500 opacity-100"
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}

                {imgLayout.w > 0 && (
                  <svg
                    className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2"
                    width={imgLayout.w}
                    height={imgLayout.h}
                    viewBox="0 0 100 100"
                    preserveAspectRatio="none"
                    style={{ zIndex: 200 }}
                  >
                    {slots.map((slot, i) => {
                      const poly = `${slot.corners.tl.x}% ${slot.corners.tl.y}%, ${slot.corners.tr.x}% ${slot.corners.tr.y}%, ${slot.corners.br.x}% ${slot.corners.br.y}%, ${slot.corners.bl.x}% ${slot.corners.bl.y}%`;
                      const isAct = slot.id === activeSlotId;
                      return (
                        <polygon
                          key={slot.id}
                          points={poly}
                          fill={
                            isAct
                              ? 'rgba(56, 189, 248, 0.12)'
                              : 'rgba(148, 163, 184, 0.06)'
                          }
                          stroke={isAct ? 'rgb(56, 189, 248)' : 'rgba(148, 163, 184, 0.5)'}
                          strokeWidth="0.35"
                          strokeDasharray={isAct ? '1.5 1' : '1 2'}
                          vectorEffect="non-scaling-stroke"
                        />
                      );
                    })}
                  </svg>
                )}

                {imgLayout.w > 0 &&
                  activeSlot &&
                  HANDLE_KEYS.map((k) => {
                    const pt = corners[k];
                    return (
                      <button
                        key={k}
                        type="button"
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          (e.target as Element).setPointerCapture?.(e.pointerId);
                          cornersDragStartRef.current = cloneCorners(cornersRef.current);
                          bboxTargetRatioRef.current = bboxAspectRatio(cornersDragStartRef.current);
                          dragLiveCornersRef.current = cornersDragStartRef.current;
                          setDragging(k);
                        }}
                        className={cn(
                          'absolute z-[210] flex h-5 w-5 -translate-x-1/2 -translate-y-1/2 cursor-grab items-center justify-center rounded-full border border-slate-600/90 bg-slate-900/95 text-[7px] font-bold tracking-tighter text-slate-500 shadow-sm active:cursor-grabbing',
                          dragging === k
                            ? 'border-sky-500/80 bg-slate-800 text-sky-300 ring-1 ring-sky-500/40'
                            : 'hover:border-slate-500 hover:text-slate-400',
                        )}
                        style={{
                          left: `calc(50% - ${imgLayout.w / 2}px + ${(pt.x / 100) * imgLayout.w}px)`,
                          top: `${(pt.y / 100) * imgLayout.h}px`,
                          touchAction: 'none',
                        }}
                        aria-label={`Ecke ${HANDLE_LABEL[k]} ziehen`}
                      >
                        <span className="sr-only">{HANDLE_LABEL[k]}</span>
                        <span
                          className="pointer-events-none h-1 w-1 rounded-full bg-current opacity-90"
                          aria-hidden
                        />
                      </button>
                    );
                  })}
                  </div>
                </div>

              <div className="pointer-events-none absolute bottom-4 left-1/2 flex max-w-[min(100%,520px)] -translate-x-1/2 flex-col items-center gap-1 rounded-full border border-slate-700 bg-slate-900/85 px-4 py-2 text-center text-[9px] font-bold uppercase tracking-widest text-slate-400 backdrop-blur-xl sm:flex-row sm:gap-3 sm:px-5 sm:text-[10px]">
                <span className="inline-flex items-center gap-2">
                  <MousePointer2 className="h-3.5 w-3.5 shrink-0 text-sky-400" />
                  Fläche wählen · Ecken ziehen
                </span>
                <span className="font-mono font-normal normal-case tracking-normal text-slate-500">
                  Mausrad zoom · Mittlere Taste schieben
                </span>
              </div>
            </div>
            </div>

            <aside className="w-[min(100%,340px)] shrink-0 overflow-y-auto border-l border-slate-800 bg-[#0f172a] p-4 space-y-5">
              <div>
                <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">
                  Inhaltsflächen
                </h3>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {slots.map((s, i) => (
                    <div key={s.id} className="flex items-center gap-0.5">
                      <button
                        type="button"
                        onClick={() => setActiveSlotId(s.id)}
                        className={cn(
                          'rounded-lg border px-2 py-1 text-[11px] font-bold',
                          s.id === activeSlotId
                            ? 'border-sky-500 bg-sky-500/20 text-sky-200'
                            : 'border-slate-700 bg-slate-900 text-slate-400',
                        )}
                      >
                        {i + 1}
                      </button>
                      {slots.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeSlot(s.id)}
                          className="p-1 text-slate-500 hover:text-red-400"
                          aria-label="Fläche entfernen"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={addSlot}
                    disabled={slots.length >= MAX_CONTENT_SLOTS}
                    className="inline-flex items-center gap-1 rounded-lg border border-dashed border-slate-600 px-2 py-1 text-[11px] font-bold text-slate-400 hover:border-sky-500 hover:text-sky-300 disabled:opacity-40"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Fläche
                  </button>
                </div>
              </div>

              <div>
                <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">
                  Quelle (aktive Fläche)
                </h3>
                {(activeSlot.source.kind === 'usePrimarySiteUrl' ||
                  activeSlot.source.kind === 'iframeUrl') && (
                  <select
                    className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-2 text-[12px] text-slate-200"
                    value={activeSlot.source.kind === 'iframeUrl' ? 'iframe' : 'primary'}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === 'primary') updateActiveSource({ kind: 'usePrimarySiteUrl' });
                      if (v === 'iframe') updateActiveSource({ kind: 'iframeUrl', url: '' });
                    }}
                  >
                    <option value="primary">Globale URL (Header)</option>
                    <option value="iframe">Eigene URL (https …)</option>
                  </select>
                )}
                {activeSlot.source.kind !== 'usePrimarySiteUrl' &&
                  activeSlot.source.kind !== 'iframeUrl' && (
                    <p className="rounded-lg border border-slate-700 bg-slate-900/80 px-2 py-2 text-[11px] text-slate-400">
                      Aktive Quelle:{' '}
                      {activeSlot.source.kind === 'imageAsset' ? 'Bild (IndexedDB)' : 'Video (IndexedDB)'}
                      <button
                        type="button"
                        className="ml-2 text-sky-400 underline"
                        onClick={() => updateActiveSource({ kind: 'usePrimarySiteUrl' })}
                      >
                        Zurück zu URL
                      </button>
                    </p>
                  )}
                {activeSlot.source.kind === 'iframeUrl' && (
                  <input
                    type="url"
                    className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-2 text-[12px] text-slate-200"
                    placeholder="https://…"
                    value={activeSlot.source.url}
                    onChange={(e) =>
                      updateActiveSource({ kind: 'iframeUrl', url: e.target.value })
                    }
                  />
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  <label className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-[11px] text-slate-300 hover:bg-slate-800">
                    <ImageIcon className="w-3.5 h-3.5 shrink-0" />
                    Bild
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => void onPickImage(e.target.files?.[0] ?? null)}
                    />
                  </label>
                  <label className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-[11px] text-slate-300 hover:bg-slate-800">
                    <Video className="w-3.5 h-3.5 shrink-0" />
                    Video
                    <input
                      type="file"
                      accept="video/*"
                      className="hidden"
                      onChange={(e) => void onPickVideo(e.target.files?.[0] ?? null)}
                    />
                  </label>
                </div>
                {activeSlot.source.kind === 'videoAsset' && (
                  <label className="mt-2 flex cursor-pointer items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-2 py-2 text-[11px] text-slate-400 hover:bg-slate-800">
                    Poster (optional, Export-Standbild)
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => void onPickPoster(e.target.files?.[0] ?? null)}
                    />
                  </label>
                )}
                <p className="mt-2 text-[10px] leading-relaxed text-slate-500">
                  Export: Videos werden als Standbild (Poster oder Videoframe) verzerrt; in der
                  Vorschau abspielbar.
                </p>
              </div>

              <div>
                <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">
                  Rahmen & Format (aktive Fläche)
                </h3>
                <p className="mb-2 text-[10px] text-slate-500 leading-relaxed">
                  Seitenverhältnis der Inhaltsbox (Breite ÷ Höhe). Ohne Auswahl gilt die
                  Mockup-Vorgabe bzw. Standardhöhe.
                  {effectiveAspect != null && effectiveAspect > 0 && (
                    <span className="ml-1 font-mono text-sky-400/90">
                      Aktuell: {formatAspectRatio(effectiveAspect)}
                    </span>
                  )}
                </p>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  <button
                    type="button"
                    onClick={() => updateActiveSlotPatch({ contentAspect: undefined })}
                    className={cn(
                      'rounded-lg border px-2 py-1 text-[10px] font-bold',
                      slotAspectOverride == null
                        ? 'border-sky-500 bg-sky-500/20 text-sky-200'
                        : 'border-slate-700 bg-slate-900 text-slate-400 hover:border-slate-600',
                    )}
                  >
                    Auto
                  </button>
                  {CONTENT_ASPECT_PRESETS.map((p) => {
                    const on =
                      slotAspectOverride != null && Math.abs(slotAspectOverride - p.aspect) < 0.02;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        title={p.label}
                        onClick={() => updateActiveSlotPatch({ contentAspect: p.aspect })}
                        className={cn(
                          'rounded-lg border px-2 py-1 text-[10px] font-bold',
                          on
                            ? 'border-sky-500 bg-sky-500/20 text-sky-200'
                            : 'border-slate-700 bg-slate-900 text-slate-400 hover:border-slate-600',
                        )}
                      >
                        {p.label.split(' ')[0]}
                      </button>
                    );
                  })}
                </div>
                <label className="flex items-center justify-between gap-2 text-[11px] text-slate-400">
                  <span>Innenabstand (px)</span>
                  <span className="font-mono text-sky-400">{insetPxUi}</span>
                </label>
                <input
                  type="range"
                  min={0}
                  max={120}
                  step={1}
                  value={insetPxUi}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    updateActiveSlotPatch({
                      contentInsetPx: v <= 0 ? undefined : Math.round(Math.min(120, Math.max(0, v))),
                    });
                  }}
                  className="mt-1 w-full accent-sky-500"
                />
              </div>

              <div>
                <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">
                  Viewport (optional)
                </h3>
                <input
                  type="number"
                  min={200}
                  max={4096}
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-2 font-mono text-[12px] text-sky-300"
                  placeholder="CSS-Breite"
                  value={activeSlot.contentViewportWidth ?? ''}
                  onChange={(e) => {
                    const v = e.target.value;
                    updateActiveSlotPatch({
                      contentViewportWidth: v === '' ? undefined : Math.max(1, Number(v)),
                    });
                  }}
                />
              </div>

              <div>
                <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">
                  Gerät (Viewport)
                </h3>
                <p className="mb-2 text-[10px] leading-relaxed text-slate-500">
                  Breakpoints und Default-Breite für diese Fläche — nicht der sichtbare
                  Mockup-Rahmen.
                </p>
                <select
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-2 text-[12px] text-slate-200"
                  value={activeSlot.deviceType ?? ''}
                  onChange={(e) => {
                    const v = e.target.value;
                    updateActiveSlotPatch({
                      deviceType: v === '' ? undefined : (v as DeviceType),
                    });
                  }}
                >
                  <option value="">Wie Mockup ({config.deviceType})</option>
                  <option value="laptop">Laptop</option>
                  <option value="phone">Phone</option>
                  <option value="tablet">Tablet</option>
                  <option value="print">Druck / Print</option>
                  <option value="custom">Custom</option>
                </select>
              </div>

              <div>
                <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">
                  Darstellung
                </h3>
                <FlatAppearanceForm config={config} value={flatDraft} onChange={onFlatChange} />
              </div>

              <div>
                <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-800 bg-slate-900/40 px-2 py-2 text-[11px] text-slate-400">
                  <input
                    type="checkbox"
                    className="mt-0.5 accent-sky-500"
                    checked={bboxLockCorners}
                    onChange={(e) => setBboxLockCorners(e.target.checked)}
                  />
                  <span>
                    <span className="font-semibold text-slate-300">BBox-Verhältnis</span> beim Ziehen
                    annähernd halten (Bounding-Box der vier Ecken)
                  </span>
                </label>
              </div>

              <div>
                <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">
                  Ecken aktive Fläche (%)
                </h3>
                <div className="space-y-1.5">
                  {HANDLE_KEYS.map((k) => (
                    <div
                      key={k}
                      className="flex items-center justify-between rounded-lg border border-slate-700/80 bg-slate-900/50 px-2 py-1.5 font-mono text-[11px]"
                    >
                      <span className="font-bold text-slate-500">{HANDLE_LABEL[k]}</span>
                      <span className="text-sky-400">
                        {corners[k].x.toFixed(1)} · {corners[k].y.toFixed(1)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </aside>
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    mount,
  );
}
