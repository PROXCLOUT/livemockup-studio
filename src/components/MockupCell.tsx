import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Camera, RefreshCw, Trash2, CheckCircle2, Loader2, Settings, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import type { MockupConfig } from '../types';
import { cn } from '../lib/utils';
import { getMatrix3d, cornersInPixels } from '../lib/perspective';
import { getBuiltinFrameIntrinsicSize, resolveMockupFrameDataUrl } from '../lib/deviceFrames';
import { buildIframeSrc } from '../lib/iframeUrl';
import {
  getSlotLogicalContentHeight,
  getSlotLogicalContentWidth,
} from '../lib/contentViewport';
import {
  MOCKUP_IFRAME_BASE_CLASS,
  MOCKUP_IFRAME_STYLE,
  MOCKUP_STAGE_DEFAULT_CLASS,
  MOCKUP_STAGE_TRANSPARENT_CLASS,
  MOCKUP_WARP_WRAPPER_STYLE,
} from '../lib/mockupIframeStyles';
import { MockupFlatSettingsModal } from './MockupFlatSettingsModal';
import { FlatWysiwygEditor } from './FlatWysiwygEditor';
import { getEffectiveContentSlots, resolveSlotSiteUrl } from '../lib/contentSlots';
import { SlotSurfaceMedia } from './SlotSurfaceMedia';

interface MockupCellProps {
  config: MockupConfig;
  websiteUrl: string;
  isSelected: boolean;
  onToggleSelect: () => void;
  onDelete?: () => void;
  onRequestExport: () => void;
  exporting?: boolean;
  /** Short label for current global export format, e.g. "PNG". */
  exportFormatLabel: string;
  onUpdateMockup: (patch: Partial<MockupConfig>) => void;
}

const FALLBACK_CONTENT_H = 800;

export const MockupCell: React.FC<MockupCellProps> = ({
  config,
  websiteUrl,
  isSelected,
  onToggleSelect,
  onDelete,
  onRequestExport,
  exporting = false,
  exportFormatLabel,
  onUpdateMockup,
}) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [flatSettingsOpen, setFlatSettingsOpen] = useState(false);
  const [studioOpen, setStudioOpen] = useState(false);
  const [containerSize, setContainerSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const imgRef = useRef<HTMLImageElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  const slots = useMemo(() => getEffectiveContentSlots(config), [config]);

  const frameUrl = useMemo(() => resolveMockupFrameDataUrl(config), [config]);
  const builtinIntrinsic = useMemo(() => getBuiltinFrameIntrinsicSize(config), [config]);
  const iframeSrc = useMemo(() => buildIframeSrc(websiteUrl), [websiteUrl]);

  const stageBg = config.flatAppearance?.stageBackground;
  const stageTransparent = stageBg === null || stageBg === 'transparent';
  const stageSolid =
    typeof stageBg === 'string' && stageBg !== '' && stageBg !== 'transparent';
  const stageDefault = stageBg === undefined;

  const anyWebSlot = useMemo(
    () => slots.some((s) => resolveSlotSiteUrl(s.source, websiteUrl)),
    [slots, websiteUrl],
  );

  useEffect(() => {
    setIsLoaded(false);
  }, [websiteUrl, slots]);

  useLayoutEffect(() => {
    const img = imgRef.current;
    if (!img) return;

    const update = () => {
      const rect = img.getBoundingClientRect();
      setContainerSize({ w: Math.round(rect.width), h: Math.round(rect.height) });
    };

    update();

    const ro = new ResizeObserver(update);
    ro.observe(img);
    window.addEventListener('resize', update);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [frameUrl]);

  const singleSlotLegacy = slots.length === 1 && slots[0]!.source.kind === 'usePrimarySiteUrl';

  return (
    <motion.div
      layout
      data-mockup-id={config.id}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        'group relative flex flex-col bg-[#1E293B] rounded-2xl border transition-all duration-300 overflow-hidden',
        isSelected
          ? 'ring-2 ring-sky-500/50 border-slate-600 shadow-2xl'
          : 'border-slate-700 hover:border-slate-600 hover:shadow-xl shadow-sm',
      )}
    >
      <div className="absolute top-4 left-4 z-30">
        <button
          onClick={onToggleSelect}
          className={cn(
            'w-5 h-5 rounded flex items-center justify-center transition-all border',
            isSelected
              ? 'bg-sky-500 border-sky-500 text-slate-900'
              : 'bg-slate-800/80 backdrop-blur-sm border-slate-600 text-transparent',
          )}
          aria-label="Select for batch export"
        >
          <CheckCircle2 className="w-4 h-4" />
        </button>
      </div>

      <div
        className={cn(
          'relative aspect-[4/3] w-full flex items-center justify-center p-6',
          stageDefault && MOCKUP_STAGE_DEFAULT_CLASS,
          stageTransparent && MOCKUP_STAGE_TRANSPARENT_CLASS,
        )}
        style={stageSolid ? { background: stageBg } : undefined}
      >
        <div
          ref={stageRef}
          className="relative w-full h-full flex items-center justify-center"
        >
          <img
            ref={imgRef}
            src={frameUrl}
            alt={config.name}
            width={builtinIntrinsic?.w}
            height={builtinIntrinsic?.h}
            className="max-w-full max-h-full w-auto h-auto object-contain drop-shadow-2xl pointer-events-none select-none"
            draggable={false}
          />

          {containerSize.w > 0 && containerSize.h > 0 && (
            <div
              className="absolute pointer-events-none"
              style={{
                width: containerSize.w,
                height: containerSize.h,
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
              }}
            >
              {slots.map((slot, idx) => {
                const logicalW = getSlotLogicalContentWidth(config, slot);
                const contentH = getSlotLogicalContentHeight(
                  config,
                  slot,
                  logicalW,
                  FALLBACK_CONTENT_H,
                );
                const matrix =
                  containerSize.w > 0 && containerSize.h > 0
                    ? getMatrix3d(
                        logicalW,
                        contentH,
                        cornersInPixels(slot.corners, containerSize.w, containerSize.h),
                      )
                    : null;
                const iframeRadius = Math.max(
                  0,
                  Math.min(
                    slot.iframeBorderRadius ?? config.flatAppearance?.iframeBorderRadius ?? 0,
                    Math.min(logicalW, contentH) / 2,
                  ),
                );
                const inset = Math.min(
                  120,
                  Math.max(0, Math.round(slot.contentInsetPx ?? 0)),
                );
                const resolved = resolveSlotSiteUrl(slot.source, websiteUrl);
                const pointerOn =
                  resolved || slot.source.kind === 'imageAsset' || slot.source.kind === 'videoAsset';
                return (
                  <div
                    key={slot.id}
                    className="absolute top-0 left-0"
                    style={{ zIndex: 10 + idx, width: containerSize.w, height: containerSize.h }}
                  >
                    {matrix && (
                      <div
                        className="absolute top-0 left-0 overflow-hidden"
                        style={{
                          width: logicalW,
                          height: contentH,
                          transformOrigin: '0 0',
                          transform: matrix,
                          pointerEvents: pointerOn ? 'auto' : 'none',
                          borderRadius: iframeRadius > 0 ? `${iframeRadius}px` : undefined,
                          boxSizing: 'border-box',
                          padding: inset > 0 ? `${inset}px` : undefined,
                          backgroundColor: inset > 0 ? '#020617' : undefined,
                          ...MOCKUP_WARP_WRAPPER_STYLE,
                        }}
                      >
                        {singleSlotLegacy ? (
                          websiteUrl ? (
                            <iframe
                              src={iframeSrc}
                              className={cn(
                                MOCKUP_IFRAME_BASE_CLASS,
                                'transition-opacity duration-700',
                                isLoaded ? 'opacity-100' : 'opacity-0',
                              )}
                              style={MOCKUP_IFRAME_STYLE}
                              onLoad={() => setIsLoaded(true)}
                              title={config.name}
                              sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                            />
                          ) : (
                            <div className="w-full h-full bg-slate-900 flex items-center justify-center">
                              <span className="text-slate-600 text-xs font-bold uppercase tracking-widest">
                                No Signal
                              </span>
                            </div>
                          )
                        ) : (
                          <SlotSurfaceMedia
                            slot={slot}
                            websiteUrl={websiteUrl}
                            iframeClassName="transition-opacity duration-500 opacity-100"
                          />
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {!isLoaded && anyWebSlot && singleSlotLegacy && websiteUrl && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="bg-slate-950/70 backdrop-blur-sm border border-slate-700 rounded-full p-2.5">
                <RefreshCw className="w-4 h-4 text-sky-400 animate-spin" />
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="p-4 border-t border-slate-700/50 flex items-center justify-between bg-[#1E293B]/80 backdrop-blur-sm">
        <div>
          <h3 className="text-xs font-bold text-slate-100 tracking-tight">{config.name}</h3>
          <p className="text-[9px] text-slate-500 uppercase font-bold tracking-widest mt-0.5">
            {config.deviceType}
            {slots.length > 1 ? ` · ${slots.length} Flächen` : ''}
          </p>
        </div>

        <div className="flex items-center gap-1.5">
          {onDelete && !config.isDefault && (
            <button
              onClick={onDelete}
              className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-400/10 rounded transition-all"
              title="Delete mockup"
              aria-label="Delete mockup"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={() => setStudioOpen(true)}
            className="flex items-center gap-1 rounded-md px-2 py-1.5 text-[10px] font-bold uppercase tracking-wide text-sky-200 bg-sky-500/15 border border-sky-500/40 hover:bg-sky-500/25 transition-all"
            title="2D-Studio (WYSIWYG)"
            aria-label="2D-Studio öffnen"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Studio
          </button>
          <button
            type="button"
            onClick={() => setFlatSettingsOpen(true)}
            className="p-1.5 text-slate-400 hover:text-sky-400 hover:bg-sky-400/10 rounded transition-all"
            title="Farben & Hintergrund"
            aria-label="Farben & Hintergrund"
          >
            <Settings className="w-4 h-4" />
          </button>
          <button
            onClick={onRequestExport}
            disabled={exporting}
            className="p-1.5 text-slate-400 hover:text-sky-400 hover:bg-sky-400/10 rounded transition-all disabled:opacity-50 disabled:cursor-wait"
            title={`Export (${exportFormatLabel}) — Format und Größe im Dialog`}
            aria-label={`Export, Format und Größe wählen: ${exportFormatLabel}`}
          >
            {exporting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Camera className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {isSelected && (
          <motion.div
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            exit={{ scaleX: 0 }}
            className="absolute inset-x-0 bottom-0 h-0.5 bg-sky-500 z-20 origin-left"
          />
        )}
      </AnimatePresence>

      <FlatWysiwygEditor
        open={studioOpen}
        config={config}
        websiteUrl={websiteUrl}
        onClose={() => setStudioOpen(false)}
        onCommit={onUpdateMockup}
      />

      <MockupFlatSettingsModal
        open={flatSettingsOpen}
        config={config}
        onClose={() => setFlatSettingsOpen(false)}
        onApply={({ flatAppearance }) => {
          onUpdateMockup({ flatAppearance });
        }}
      />
    </motion.div>
  );
};
