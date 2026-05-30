import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';

const IFRAME_PROXY_PREFIX = '/__iframe-proxy';
const IFRAME_PROXY_DEV_PORT = 8787;

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  /** Dev default: same-origin path so previews work via LAN IP (not 127.0.0.1). */
  const iframeProxyBase =
    env.VITE_IFRAME_PROXY_BASE?.trim() ||
    (mode === 'development' ? IFRAME_PROXY_PREFIX : '');

  const iframeProxyRewrite = (p: string) =>
    p.startsWith(IFRAME_PROXY_PREFIX) ? p.slice(IFRAME_PROXY_PREFIX.length) || '/' : p;

  const iframeProxyTarget = {
    target: `http://127.0.0.1:${IFRAME_PROXY_DEV_PORT}`,
    changeOrigin: true,
    rewrite: iframeProxyRewrite,
  } as const;

  return {
    plugins: [react(), tailwindcss()],
    define: {
      'import.meta.env.VITE_IFRAME_PROXY_BASE': JSON.stringify(iframeProxyBase),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      proxy: {
        [IFRAME_PROXY_PREFIX]: iframeProxyTarget,
      },
    },
    preview: {
      proxy: {
        [IFRAME_PROXY_PREFIX]: iframeProxyTarget,
      },
    },
  };
});
