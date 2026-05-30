import { useEffect, useState } from 'react';
import { getContentMedia } from '../lib/contentMediaStore';

/** Erzeugt eine Object-URL für ein IndexedDB-Medium; revoked beim Unmount / Wechsel. */
export function useContentMediaObjectUrl(assetId: string | undefined): string | undefined {
  const [url, setUrl] = useState<string | undefined>();

  useEffect(() => {
    if (!assetId) {
      setUrl(undefined);
      return;
    }
    let objectUrl: string | undefined;
    let cancelled = false;
    void getContentMedia(assetId).then((blob) => {
      if (cancelled || !blob) {
        setUrl(undefined);
        return;
      }
      objectUrl = URL.createObjectURL(blob);
      setUrl(objectUrl);
    });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [assetId]);

  return url;
}
