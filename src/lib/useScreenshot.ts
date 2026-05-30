import { useEffect, useRef, useState } from 'react';
import { fetchScreenshot, ScreenshotOptions } from './screenshot';

export type ScreenshotStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface ScreenshotState {
  status: ScreenshotStatus;
  url: string | null;
  error: string | null;
}

/**
 * React hook around `fetchScreenshot` with debouncing and stale-response
 * protection. Use this for any UI that wants to mirror screenshot availability
 * (status badge, export button state, etc.).
 */
export function useScreenshot(
  pageUrl: string,
  opts: ScreenshotOptions & { debounceMs?: number } = {},
): ScreenshotState {
  const { debounceMs = 500, width, height, contentAspect } = opts;
  const [state, setState] = useState<ScreenshotState>({
    status: 'idle',
    url: null,
    error: null,
  });
  const requestId = useRef(0);

  useEffect(() => {
    if (!pageUrl || !/^https?:\/\//i.test(pageUrl)) {
      setState({ status: 'idle', url: null, error: null });
      return;
    }
    const myId = ++requestId.current;
    setState({ status: 'loading', url: null, error: null });

    const timer = window.setTimeout(() => {
      fetchScreenshot(pageUrl, { width, height, contentAspect })
        .then((url) => {
          if (requestId.current !== myId) return;
          setState({ status: 'ready', url, error: null });
        })
        .catch((err: unknown) => {
          if (requestId.current !== myId) return;
          setState({
            status: 'error',
            url: null,
            error: err instanceof Error ? err.message : String(err),
          });
        });
    }, debounceMs);

    return () => {
      window.clearTimeout(timer);
    };
  }, [pageUrl, debounceMs, width, height, contentAspect]);

  return state;
}
