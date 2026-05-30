import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Check, Maximize2, RefreshCcw, MousePointer2, X } from 'lucide-react';
import type { Corners, DeviceType } from '../types';
import { cn } from '../lib/utils';
import { getMatrix3d, cornersInPixels, cornersBBox } from '../lib/perspective';
import { buildIframeSrc } from '../lib/iframeUrl';
import { defaultContentViewportWidth } from '../lib/contentViewport';
import {
  MOCKUP_IFRAME_BASE_CLASS,
  MOCKUP_IFRAME_STYLE,
  MOCKUP_WARP_WRAPPER_STYLE,
} from '../lib/mockupIframeStyles';

export type CalibrationEditorVariant = 'fullscreen' | 'embedded';

export interface CalibrationEditorProps {
  active: boolean;
  imageUrl: string;
  previewUrl?: string;
  variant: CalibrationEditorVariant;
  onSave: (corners: Corners, name: string, type: DeviceType) => void;
  onCancel?: () => void;
  /** Zusätzliche Aktionen in der Kopfzeile (z. B. „Zurück“ im Wizard), links vom Titel */
  leadingHeaderActions?: React.ReactNode;
}

const DEFAULT_CALIBRATION_ASPECT = 1280 / 800;

const HANDLE_KEYS = ['tl', 'tr', 'br', 'bl'] as const;
type HandleKey = (typeof HANDLE_KEYS)[number];

const DEFAULT_CORNERS: Corners = {
  tl: { x: 20, y: 20 },
  tr: { x: 80, y: 20 },
  br: { x: 80, y: 80 },
  bl: { x: 20, y: 80 },
};

const HANDLE_LABEL: Record<HandleKey, string> = {
  tl: 'TL',
  tr: 'TR',
  br: 'BR',
  bl: 'BL',
};

export const CalibrationEditor: React.FC<CalibrationEditorProps> = ({
  active,
  imageUrl,
  previewUrl = 'https://react.dev',
  variant,
  onSave,
  onCancel,
  leadingHeaderActions,
}) => {
  const embedded = variant === 'embedded';
  const [name, setName] = useState('Mein Mockup');
  const [type, setType] = useState<DeviceType>('laptop');
  const [corners, setCorners] = useState<Corners>(DEFAULT_CORNERS);
  const [dragging, setDragging] = useState<HandleKey | null>(null);
  const [imgSize, setImgSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });

  const stageRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    if (active) {
      setCorners(DEFAULT_CORNERS);
      setName('Mein Mockup');
      setType('laptop');
    }
  }, [active, imageUrl]);

  useLayoutEffect(() => {
    if (!active) return;
    const img = imgRef.current;
    if (!img) return;

    const update = () => {
      const rect = img.getBoundingClientRect();
      setImgSize({ w: Math.round(rect.width), h: Math.round(rect.height) });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(img);
    window.addEventListener('resize', update);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [active, imageUrl]);

  const pointToPercent = useCallback(
    (clientX: number, clientY: number) => {
      const img = imgRef.current;
      if (!img) return { x: 0, y: 0 };
      const rect = img.getBoundingClientRect();
      const x = ((clientX - rect.left) / rect.width) * 100;
      const y = ((clientY - rect.top) / rect.height) * 100;
      return {
        x: Math.max(0, Math.min(100, x)),
        y: Math.max(0, Math.min(100, y)),
      };
    },
    [],
  );

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: PointerEvent) => {
      const pt = pointToPercent(e.clientX, e.clientY);
      setCorners((prev) => ({ ...prev, [dragging]: pt }));
    };
    const onUp = () => setDragging(null);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [dragging, pointToPercent]);

  const handleSave = () => {
    onSave(corners, name.trim() || 'Custom Mockup', type);
  };

  const resetRectangle = () => setCorners(DEFAULT_CORNERS);

  const previewLogicalW = useMemo(() => defaultContentViewportWidth(type), [type]);
  const previewContentAspect = useMemo(() => {
    const bb = cornersBBox(corners);
    if (bb.h < 1e-6) return DEFAULT_CALIBRATION_ASPECT;
    return bb.w / bb.h;
  }, [corners]);
  const previewContentH = Math.max(1, Math.round(previewLogicalW / previewContentAspect));

  const previewMatrix =
    imgSize.w > 0 && imgSize.h > 0
      ? getMatrix3d(
          previewLogicalW,
          previewContentH,
          cornersInPixels(corners, imgSize.w, imgSize.h),
        )
      : null;

  const polyPoints = `${corners.tl.x}% ${corners.tl.y}%, ${corners.tr.x}% ${corners.tr.y}%, ${corners.br.x}% ${corners.br.y}%, ${corners.bl.x}% ${corners.bl.y}%`;

  const iframePreviewSrc = useMemo(() => buildIframeSrc(previewUrl), [previewUrl]);

  return (
    <div className={cn('flex flex-col min-h-0 flex-1 overflow-hidden', embedded && 'min-h-[320px]')}>
      <div
        className={cn(
          'border-b border-slate-800 flex items-center justify-between bg-[#1E293B]/30 shrink-0',
          embedded ? 'px-3 py-3' : 'px-6 py-5',
        )}
      >
        <div className="flex items-center gap-2 min-w-0">
          {leadingHeaderActions}
          <div className="bg-sky-500 rounded-lg p-1.5 text-slate-900 shrink-0">
            <Maximize2 className={embedded ? 'w-4 h-4' : 'w-5 h-5'} />
          </div>
          <div className="min-w-0">
            <h2
              className={cn(
                'font-bold text-slate-100 tracking-tight truncate',
                embedded ? 'text-sm' : 'text-xl',
              )}
            >
              {embedded ? 'Iframe-Position' : 'Kalibrierung'}
            </h2>
            <p className="text-[10px] text-slate-500 uppercase font-bold tracking-widest mt-0.5 truncate">
              {embedded
                ? 'Vier Ecken auf die Displayfläche ziehen'
                : 'Ecken auf den Bildschirmrand ziehen'}
            </p>
          </div>
        </div>
        {!embedded && onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="p-2 hover:bg-slate-800 rounded-full transition-colors text-slate-400 shrink-0"
            aria-label="Schließen"
          >
            <X className="w-6 h-6" />
          </button>
        )}
      </div>

      <div
        className={cn(
          'flex-1 overflow-hidden flex flex-col md:flex-row min-h-0',
          embedded && 'max-h-[min(62vh,520px)]',
        )}
      >
        <div
          className={cn(
            'flex-[3] bg-slate-950 flex items-center justify-center relative overflow-auto min-h-0',
            embedded ? 'p-4' : 'p-10',
          )}
        >
          <div ref={stageRef} className="relative select-none">
            <img
              ref={imgRef}
              src={imageUrl}
              alt="Kalibrierung"
              className={cn(
                'relative z-[15] max-w-full object-contain block drop-shadow-2xl pointer-events-none',
                embedded ? 'max-h-[38vh]' : 'max-h-[68vh]',
              )}
              draggable={false}
            />

            {previewMatrix && imgSize.w > 0 && (
              <div
                className="absolute top-0 left-0 z-10 pointer-events-none"
                style={{ width: imgSize.w, height: imgSize.h }}
              >
                <div
                  className="absolute top-0 left-0 overflow-hidden"
                  style={{
                    width: previewLogicalW,
                    height: previewContentH,
                    transformOrigin: '0 0',
                    transform: previewMatrix,
                    opacity: 0.85,
                    ...MOCKUP_WARP_WRAPPER_STYLE,
                  }}
                >
                  <iframe
                    src={iframePreviewSrc}
                    title="Kalibrierungsvorschau"
                    className={cn(MOCKUP_IFRAME_BASE_CLASS, 'pointer-events-none')}
                    style={MOCKUP_IFRAME_STYLE}
                    sandbox="allow-scripts allow-same-origin"
                  />
                </div>
              </div>
            )}

            {imgSize.w > 0 && (
              <svg
                className="absolute top-0 left-0 z-20 pointer-events-none"
                width={imgSize.w}
                height={imgSize.h}
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
              >
                <polygon
                  points={polyPoints}
                  fill="rgba(56, 189, 248, 0.08)"
                  stroke="rgb(56, 189, 248)"
                  strokeWidth="0.4"
                  strokeDasharray="1.5 1"
                  vectorEffect="non-scaling-stroke"
                />
              </svg>
            )}

            {imgSize.w > 0 &&
              HANDLE_KEYS.map((k) => {
                const pt = corners[k];
                return (
                  <button
                    key={k}
                    type="button"
                    onPointerDown={(e) => {
                      (e.target as Element).setPointerCapture?.(e.pointerId);
                      setDragging(k);
                    }}
                    className={cn(
                      'absolute z-30 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 flex items-center justify-center font-black tracking-tighter cursor-grab active:cursor-grabbing transition-transform hover:scale-110',
                      embedded ? 'w-6 h-6 text-[8px]' : 'w-7 h-7 text-[9px]',
                      dragging === k
                        ? 'bg-sky-400 border-sky-200 text-slate-900 scale-110 shadow-lg shadow-sky-500/40'
                        : 'bg-slate-900 border-sky-400 text-sky-300',
                    )}
                    style={{
                      left: `${pt.x}%`,
                      top: `${pt.y}%`,
                      touchAction: 'none',
                    }}
                    aria-label={`Ecke ${HANDLE_LABEL[k]}`}
                  >
                    {HANDLE_LABEL[k]}
                  </button>
                );
              })}
          </div>

          <div
            className={cn(
              'absolute left-1/2 -translate-x-1/2 flex items-center gap-3 text-slate-400 bg-slate-900/80 backdrop-blur-xl border border-slate-700 rounded-full uppercase font-bold tracking-widest',
              embedded
                ? 'bottom-3 text-[9px] px-3 py-1.5 flex-wrap justify-center max-w-[95%]'
                : 'bottom-6 text-[10px] px-6 py-2.5',
            )}
          >
            <div className="flex items-center gap-1.5">
              <MousePointer2 className="w-3.5 h-3.5 text-sky-400 shrink-0" />
              Ecken ziehen
            </div>
            <div className="w-px h-3 bg-slate-700 shrink-0" />
            <button
              type="button"
              onClick={resetRectangle}
              className="flex items-center gap-1.5 hover:text-slate-100 transition-colors"
            >
              <RefreshCcw className="w-3.5 h-3.5 text-sky-400 shrink-0" />
              Rechteck
            </button>
          </div>
        </div>

        <div
          className={cn(
            'border-t md:border-t-0 md:border-l border-slate-800 flex flex-col bg-[#1E293B]/20 min-w-0 md:min-w-[260px] shrink-0 overflow-y-auto',
            embedded ? 'p-4 gap-4' : 'p-8 gap-8 flex-1',
          )}
        >
          <div className={cn('space-y-4', !embedded && 'space-y-6')}>
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">
                Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 bg-[#0F172A] border border-slate-700 rounded-lg outline-none focus:border-sky-500 text-sm text-slate-200"
                placeholder="z. B. Schreibtisch-Monitor"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">
                Gerätetyp
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                {(['laptop', 'phone', 'tablet', 'custom'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setType(t)}
                    className={cn(
                      'px-2 py-2 text-[10px] font-bold rounded-lg border transition-all uppercase tracking-wide',
                      type === t
                        ? 'bg-sky-500 border-sky-500 text-slate-900'
                        : 'bg-slate-900/50 border-slate-700 text-slate-400 hover:border-slate-500',
                    )}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                Ecken (%)
              </label>
              {HANDLE_KEYS.map((k) => (
                <div
                  key={k}
                  className="bg-slate-900/50 p-2 rounded border border-slate-700 flex items-center justify-between text-[11px] font-mono"
                >
                  <span className="text-slate-500 font-bold">{HANDLE_LABEL[k]}</span>
                  <span className="text-sky-400">
                    {corners[k].x.toFixed(1)}, {corners[k].y.toFixed(1)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className={cn('mt-auto pt-4 border-t border-slate-800 flex flex-col gap-3', embedded && 'pt-3')}>
            <button
              type="button"
              onClick={handleSave}
              className="w-full flex items-center justify-center gap-2 py-3 bg-sky-500 text-slate-900 rounded-xl font-black uppercase tracking-widest text-[11px] hover:bg-sky-400 transition-all"
            >
              <Check className="w-4 h-4" />
              Mockup speichern
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
