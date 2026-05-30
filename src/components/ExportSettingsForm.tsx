import React from 'react';
import type { ExportImageFormat, ExportUiSettings } from '../lib/export';

/** Final export width in pixels (up- or downscaled). `null` = native mockup resolution. */
export const OUTPUT_WIDTH_OPTIONS: { label: string; value: number | null }[] = [
  { label: 'Nativ (Rahmen-Original)', value: null },
  { label: '640 px — Thumbnail', value: 640 },
  { label: '800 px', value: 800 },
  { label: '1024 px', value: 1024 },
  { label: '1280 px', value: 1280 },
  { label: '1600 px', value: 1600 },
  { label: '1920 px', value: 1920 },
  { label: '2400 px', value: 2400 },
  { label: '2560 px', value: 2560 },
  { label: '3200 px', value: 3200 },
  { label: '3840 px', value: 3840 },
];

interface ExportSettingsFormProps {
  value: ExportUiSettings;
  onChange: (next: ExportUiSettings) => void;
  /** Extra spacing / labels for modal vs compact header */
  dense?: boolean;
}

export const ExportSettingsForm: React.FC<ExportSettingsFormProps> = ({
  value,
  onChange,
  dense,
}) => {
  const patch = (partial: Partial<ExportUiSettings>) => {
    onChange({ ...value, ...partial });
  };

  const labelClass = dense ? 'text-[10px] text-slate-400 font-semibold' : 'text-[10px] text-slate-400 font-semibold';
  const selectClass =
    'mt-1 w-full rounded-lg bg-slate-900 border border-slate-600 text-sm text-slate-100 py-2 px-2';

  return (
    <div className={dense ? 'space-y-4' : 'space-y-3'}>
      <label className="block">
        <span className={labelClass}>Dateiformat</span>
        <select
          value={value.format}
          onChange={(e) => patch({ format: e.target.value as ExportImageFormat })}
          className={selectClass}
        >
          <option value="png">PNG (verlustfrei)</option>
          <option value="jpeg">JPEG</option>
          <option value="webp">WebP</option>
        </select>
      </label>

      {value.format !== 'png' && (
        <label className="block">
          <span className={labelClass}>Qualität ({Math.round(value.quality * 100)} %)</span>
          <input
            type="range"
            min={0.5}
            max={1}
            step={0.02}
            value={value.quality}
            onChange={(e) => patch({ quality: Number(e.target.value) })}
            className="mt-1 w-full accent-sky-500"
          />
        </label>
      )}

      <label className="block">
        <span className={labelClass}>Ausgabe-Breite (fertiges Bild)</span>
        {!dense && (
          <span className="text-[9px] text-slate-500 block mt-0.5 leading-snug">
            Exakte Datei-Breite (Höhe proportional). „Nativ“ = Rahmen-Original. Der Screenshot nutzt
            immer den gleichen CSS-Viewport wie die Vorschau (logische Gerätebreite); größere
            Ausgaben skalieren nur Rahmen und Inhalt — mit iframe-Proxy optional schärfer (DPR).
          </span>
        )}
        <select
          value={value.maxOutputWidth ?? 'native'}
          onChange={(e) => {
            const v = e.target.value;
            patch({
              maxOutputWidth: v === 'native' ? null : Number(v),
            });
          }}
          className={selectClass}
        >
          {OUTPUT_WIDTH_OPTIONS.map((o) => (
            <option key={o.label} value={o.value ?? 'native'}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
};
