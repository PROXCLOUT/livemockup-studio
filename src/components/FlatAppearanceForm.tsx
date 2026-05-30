import React from 'react';
import type { FlatAppearance, MockupConfig } from '../types';
import { cn } from '../lib/utils';

function hexFromMaybe(hex: string | undefined, fallback: string): string {
  if (!hex || !/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(hex)) return fallback;
  return hex;
}

export interface FlatAppearanceFormProps {
  config: MockupConfig;
  value: FlatAppearance;
  onChange: (next: FlatAppearance) => void;
  /** Zusätzliche Tailwind-Klassen um den Formular-Block. */
  className?: string;
}

/**
 * Darstellung: Farben, Bühne, Iframe-Radius — für Modal und 2D-Studio.
 */
export function FlatAppearanceForm({ config, value, onChange, className }: FlatAppearanceFormProps) {
  const hasBuiltinSvg = Boolean(config.builtinFrame);
  const isPrintBuiltin =
    config.builtinFrame === 'printBusinessCard' ||
    config.builtinFrame === 'printPoster' ||
    config.builtinFrame === 'printFlyer' ||
    config.builtinFrame === 'printGeneric';
  const showLaptopExtras =
    !isPrintBuiltin &&
    (config.builtinFrame === 'laptop' ||
      config.builtinFrame === 'studioLaptop' ||
      config.builtinFrame === 'studioDeskLaptopPhone');

  const bezel = value.bezel ?? '#1f2937';
  const hinge = value.hinge ?? '#334155';
  const base = value.base ?? '#475569';
  const stageTransparent =
    value.stageBackground === null || value.stageBackground === 'transparent';
  const stageColor =
    typeof value.stageBackground === 'string' && value.stageBackground !== 'transparent'
      ? hexFromMaybe(value.stageBackground, '#0f172a')
      : '#0f172a';
  const iframeRadius = value.iframeBorderRadius ?? 0;

  const patch = (p: Partial<FlatAppearance>) => onChange({ ...value, ...p });

  return (
    <div className={cn('space-y-3 text-[11px]', className)}>
      <div className="space-y-2 pb-2 border-b border-slate-700/80">
        <label className="flex flex-col gap-1.5">
          <span className="text-slate-400 font-semibold uppercase tracking-wider">
            Iframe / Inhalt — Eckenradius (px)
          </span>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={0}
              max={80}
              step={1}
              value={iframeRadius}
              onChange={(e) => patch({ iframeBorderRadius: Number(e.target.value) })}
              className="flex-1 accent-sky-500"
            />
            <input
              type="number"
              min={0}
              max={80}
              step={1}
              value={iframeRadius}
              onChange={(e) =>
                patch({
                  iframeBorderRadius: Math.max(0, Math.min(80, Math.round(Number(e.target.value) || 0))),
                })
              }
              className="w-14 px-1.5 py-1 rounded-md border border-slate-600 bg-[#0f172a] text-sky-300 text-xs font-mono text-center"
            />
          </div>
          <p className="text-[10px] text-slate-500 leading-snug">
            Gilt für die Live-Vorschau und den Bild-Export (CSS Pixel der logischen Content-Box).
          </p>
        </label>
      </div>

      {hasBuiltinSvg && (
        <>
          <label className="flex items-center justify-between gap-3">
            <span className="text-slate-400 font-semibold uppercase tracking-wider">
              {isPrintBuiltin ? 'Papier / Karton' : 'Gehäuse / Bezel'}
            </span>
            <input
              type="color"
              value={hexFromMaybe(bezel, '#1f2937')}
              onChange={(e) => patch({ bezel: e.target.value })}
              className="h-8 w-14 cursor-pointer rounded border border-slate-600 bg-slate-800"
            />
          </label>

          {showLaptopExtras && (
            <>
              <label className="flex items-center justify-between gap-3">
                <span className="text-slate-400 font-semibold uppercase tracking-wider">Scharnier</span>
                <input
                  type="color"
                  value={hexFromMaybe(hinge, '#334155')}
                  onChange={(e) => patch({ hinge: e.target.value })}
                  className="h-8 w-14 cursor-pointer rounded border border-slate-600 bg-slate-800"
                />
              </label>
              <label className="flex items-center justify-between gap-3">
                <span className="text-slate-400 font-semibold uppercase tracking-wider">Unterteil</span>
                <input
                  type="color"
                  value={hexFromMaybe(base, '#475569')}
                  onChange={(e) => patch({ base: e.target.value })}
                  className="h-8 w-14 cursor-pointer rounded border border-slate-600 bg-slate-800"
                />
              </label>
            </>
          )}
        </>
      )}

      <div className={cn('space-y-2', hasBuiltinSvg && 'pt-2 border-t border-slate-700/80')}>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={stageTransparent}
            onChange={(e) =>
              patch({ stageBackground: e.target.checked ? null : stageColor })
            }
            className="rounded border-slate-500"
          />
          <span className="text-slate-300 font-medium">Bühne transparent</span>
        </label>
        {!stageTransparent && (
          <label className="flex items-center justify-between gap-3">
            <span className="text-slate-400 font-semibold uppercase tracking-wider">Bühnenfarbe</span>
            <input
              type="color"
              value={hexFromMaybe(stageColor, '#0f172a')}
              onChange={(e) => patch({ stageBackground: e.target.value })}
              className="h-8 w-14 cursor-pointer rounded border border-slate-600 bg-slate-800"
            />
          </label>
        )}
      </div>
    </div>
  );
}

/** Flache Defaults für fehlende Keys (ohne SVG-Farben zu erzwingen). */
export function flatAppearanceFromConfig(config: MockupConfig): FlatAppearance {
  return { ...(config.flatAppearance ?? {}) };
}

/** Nur relevante Keys für Persistenz (Custom ohne SVG-Farben). */
export function sanitizeFlatAppearanceForConfig(
  config: MockupConfig,
  appearance: FlatAppearance,
): FlatAppearance {
  const hasBuiltinSvg = Boolean(config.builtinFrame);
  const isPrintBuiltin =
    config.builtinFrame === 'printBusinessCard' ||
    config.builtinFrame === 'printPoster' ||
    config.builtinFrame === 'printFlyer' ||
    config.builtinFrame === 'printGeneric';
  const showLaptopExtras =
    !isPrintBuiltin &&
    (config.builtinFrame === 'laptop' ||
      config.builtinFrame === 'studioLaptop' ||
      config.builtinFrame === 'studioDeskLaptopPhone');
  const iframeBorderRadius = Math.round(
    Math.max(0, Math.min(appearance.iframeBorderRadius ?? 0, 80)),
  );
  const stage =
    appearance.stageBackground === null || appearance.stageBackground === 'transparent'
      ? null
      : appearance.stageBackground;

  const out: FlatAppearance = {
    iframeBorderRadius,
    stageBackground: stage,
  };

  if (hasBuiltinSvg) {
    if (appearance.bezel) out.bezel = appearance.bezel;
    if (showLaptopExtras) {
      if (appearance.hinge) out.hinge = appearance.hinge;
      if (appearance.base) out.base = appearance.base;
    }
  }
  return out;
}
