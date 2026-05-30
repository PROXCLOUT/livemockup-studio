import React from 'react';
import type { ContentSlot } from '../types';
import { buildIframeSrc } from '../lib/iframeUrl';
import { resolveSlotSiteUrl } from '../lib/contentSlots';
import { MOCKUP_IFRAME_BASE_CLASS, MOCKUP_IFRAME_STYLE } from '../lib/mockupIframeStyles';
import { cn } from '../lib/utils';
import { useContentMediaObjectUrl } from '../hooks/useContentMediaObjectUrl';

/** Iframe, Bild oder Video innerhalb einer warpbaren Fläche (Vorschau). */
export function SlotSurfaceMedia({
  slot,
  websiteUrl,
  iframeClassName,
}: {
  slot: ContentSlot;
  websiteUrl: string;
  iframeClassName?: string;
}) {
  const imgId = slot.source.kind === 'imageAsset' ? slot.source.assetId : undefined;
  const vidId = slot.source.kind === 'videoAsset' ? slot.source.assetId : undefined;
  const posterId = slot.source.kind === 'videoAsset' ? slot.source.posterAssetId : undefined;
  const blobUrlImage = useContentMediaObjectUrl(imgId);
  const blobUrlVideo = useContentMediaObjectUrl(vidId);
  const posterUrl = useContentMediaObjectUrl(posterId);
  const resolved = resolveSlotSiteUrl(slot.source, websiteUrl);
  const iframeSrc = resolved ? buildIframeSrc(resolved) : '';

  if (slot.source.kind === 'imageAsset') {
    if (!blobUrlImage) {
      return (
        <div className="flex h-full w-full items-center justify-center bg-slate-900">
          <span className="text-[9px] font-bold uppercase tracking-widest text-slate-600">…</span>
        </div>
      );
    }
    return (
      <img
        src={blobUrlImage}
        alt=""
        className="h-full w-full object-cover"
        draggable={false}
      />
    );
  }
  if (slot.source.kind === 'videoAsset') {
    if (!blobUrlVideo) {
      return (
        <div className="flex h-full w-full items-center justify-center bg-slate-900">
          <span className="text-[9px] font-bold uppercase tracking-widest text-slate-600">…</span>
        </div>
      );
    }
    return (
      <video
        src={blobUrlVideo}
        poster={posterUrl}
        controls
        muted
        playsInline
        className="h-full w-full object-cover"
      />
    );
  }
  if (resolved) {
    return (
      <iframe
        src={iframeSrc}
        title={slot.id}
        className={cn(MOCKUP_IFRAME_BASE_CLASS, iframeClassName)}
        style={MOCKUP_IFRAME_STYLE}
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
      />
    );
  }
  return (
    <div className="flex h-full w-full items-center justify-center bg-slate-900">
      <span className="text-[9px] font-bold uppercase tracking-widest text-slate-600">—</span>
    </div>
  );
}
