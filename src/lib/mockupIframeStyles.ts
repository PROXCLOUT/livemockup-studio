import type { CSSProperties } from 'react';

/** Live mockup iframes — fill warp box; +2px overscan clipped by parent (no outline → no black hairlines). */
export const MOCKUP_IFRAME_BASE_CLASS =
  'block border-0 outline-none bg-white [-webkit-backface-visibility:hidden] [backface-visibility:hidden]';

export const MOCKUP_IFRAME_STYLE: CSSProperties = {
  width: 'calc(100% + 2px)',
  height: 'calc(100% + 2px)',
  marginLeft: -1,
  marginTop: -1,
  backfaceVisibility: 'hidden',
};

/** Bühnen-Hintergrund: Editor-Vorschau ohne Checkerboard (transparent = export alpha only). */
export const MOCKUP_STAGE_DEFAULT_CLASS =
  'bg-[#0F172A] bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-slate-800/20 to-transparent';

export const MOCKUP_STAGE_TRANSPARENT_CLASS = 'bg-[#0F172A]';

/** Inline styles for the perspective warp wrapper (preserve-3d stacking). */
export const MOCKUP_WARP_WRAPPER_STYLE: CSSProperties = {
  transformStyle: 'preserve-3d',
};
