/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_IFRAME_PROXY_BASE?: string;
  readonly VITE_SCREENSHOT_PROVIDER?: string;
  readonly VITE_SCREENSHOT_API_KEY?: string;
  readonly VITE_SCREENSHOT_CUSTOM_URL?: string;
}
