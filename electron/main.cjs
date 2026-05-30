/**
 * Electron main: dev loads Vite (ELECTRON_START_URL); packaged serves dist/ + iframe proxy.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { app, BrowserWindow } = require('electron');

const PROXY_PORT = Number(process.env.LIVEMOCKUP_PROXY_PORT) || 8787;
const STATIC_PORT = Number(process.env.LIVEMOCKUP_STATIC_PORT) || 47342;
const DEV_URL = process.env.ELECTRON_START_URL?.trim();

let mainWindow;
let proxyChild;
let staticServer;

function contentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const map = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.mjs': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.woff2': 'font/woff2',
    '.woff': 'font/woff',
    '.ttf': 'font/ttf',
    '.map': 'application/json',
    '.webp': 'image/webp',
    '.wasm': 'application/wasm',
  };
  return map[ext] || 'application/octet-stream';
}

function resolveUnderRoot(rootDir, urlPath) {
  let rel = decodeURIComponent((urlPath || '/').split('?')[0]);
  if (rel === '/' || rel === '') rel = 'index.html';
  if (rel.startsWith('/')) rel = rel.slice(1);
  const candidate = path.resolve(path.join(rootDir, rel));
  const rootResolved = path.resolve(rootDir);
  if (candidate !== rootResolved && !candidate.startsWith(rootResolved + path.sep)) return null;
  return candidate;
}

function createStaticServer(rootDir, port) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const fsPath = resolveUnderRoot(rootDir, req.url);
      if (!fsPath) {
        res.writeHead(403);
        res.end();
        return;
      }
      fs.readFile(fsPath, (err, data) => {
        if (err) {
          res.writeHead(err.code === 'ENOENT' ? 404 : 500);
          res.end();
          return;
        }
        res.writeHead(200, { 'Content-Type': contentType(fsPath) });
        res.end(data);
      });
    });
    server.listen(port, '127.0.0.1', () => resolve(server));
    server.on('error', reject);
  });
}

function httpGetOnce(url) {
  return new Promise((resolve, reject) => {
    http
      .get(url, (r) => {
        r.resume();
        resolve(r.statusCode);
      })
      .on('error', reject);
  });
}

async function waitForOk(url, timeoutMs = 45000, intervalMs = 150) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      const code = await httpGetOnce(url);
      if (code === 200) return;
    } catch {
      /* retry */
    }
    if (Date.now() > deadline) throw new Error(`Timeout waiting for ${url}`);
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

function getDistDir() {
  if (app.isPackaged) return path.join(app.getAppPath(), 'dist');
  return path.resolve(__dirname, '..', 'dist');
}

function getProxyScriptPath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'proxy-server', 'iframe-proxy.mjs');
  }
  return path.resolve(__dirname, '..', 'proxy-server', 'iframe-proxy.mjs');
}

function startProxy() {
  const script = getProxyScriptPath();
  proxyChild = spawn(process.execPath, [script], {
    cwd: path.dirname(script),
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      PORT: String(PROXY_PORT),
    },
    stdio: 'ignore',
  });
  proxyChild.on('error', (e) => console.error('iframe-proxy spawn error', e));
}

function stopProxy() {
  if (proxyChild && !proxyChild.killed) {
    try {
      proxyChild.kill('SIGTERM');
    } catch {
      /* ignore */
    }
  }
  proxyChild = undefined;
}

function stopStatic() {
  if (staticServer) {
    try {
      staticServer.close();
    } catch {
      /* ignore */
    }
  }
  staticServer = undefined;
}

async function createWindow() {
  let loadUrl;
  if (DEV_URL) {
    loadUrl = DEV_URL;
  } else {
    startProxy();
    await waitForOk(`http://127.0.0.1:${PROXY_PORT}/health`);
    const distDir = getDistDir();
    staticServer = await createStaticServer(distDir, STATIC_PORT);
    await waitForOk(`http://127.0.0.1:${STATIC_PORT}/`);
    loadUrl = `http://127.0.0.1:${STATIC_PORT}/`;
  }

  const win = new BrowserWindow({
    width: 1280,
    height: 900,
    minWidth: 800,
    minHeight: 640,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
    title: 'LiveMockup Studio',
  });
  mainWindow = win;

  await win.loadURL(loadUrl);
  win.on('closed', () => {
    mainWindow = undefined;
  });
}

app.whenReady().then(() => {
  createWindow().catch((err) => {
    console.error(err);
    app.exit(1);
  });
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow().catch((err) => {
      console.error(err);
      app.exit(1);
    });
  }
});

app.on('window-all-closed', () => {
  stopStatic();
  stopProxy();
  app.quit();
});

app.on('before-quit', () => {
  stopStatic();
  stopProxy();
});
