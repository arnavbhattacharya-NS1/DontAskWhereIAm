#!/usr/bin/env node
/**
 * postinstall.js
 *
 * Ensures the Electron binary is fully extracted after `npm install`.
 * The official electron postinstall script is sometimes blocked by
 * `npm --ignore-scripts` or CI environments. This script re-extracts
 * from the local cache when the binary is missing.
 *
 * Also writes the correct path.txt for electron-builder and our
 * dev launcher (scripts/launch-dev.js).
 *
 * NOTE: We no longer patch node_modules/electron/index.js.
 * The dev launcher invokes the Electron binary directly from path.txt,
 * so index.js is never called during development.
 */
const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const electronDir = path.join(__dirname, 'node_modules', 'electron');
const distDir = path.join(electronDir, 'dist');
const pathFile = path.join(electronDir, 'path.txt');

// Determine platform-specific binary path and cache zip name
const platform = os.platform();
const arch = os.arch();

function getPlatformInfo() {
  if (platform === 'darwin') {
    const archStr = arch === 'arm64' ? 'arm64' : 'x64';
    return {
      zipName: `electron-v28.3.3-darwin-${archStr}.zip`,
      frameworksCheck: path.join(distDir, 'Electron.app', 'Contents', 'Frameworks'),
      binRelPath: 'Electron.app/Contents/MacOS/Electron',
    };
  } else if (platform === 'win32') {
    return {
      zipName: `electron-v28.3.3-win32-${arch}.zip`,
      frameworksCheck: path.join(distDir, 'electron.exe'),
      binRelPath: 'electron.exe',
    };
  } else {
    // Linux
    return {
      zipName: `electron-v28.3.3-linux-${arch}.zip`,
      frameworksCheck: path.join(distDir, 'electron'),
      binRelPath: 'electron',
    };
  }
}

const { zipName, frameworksCheck, binRelPath } = getPlatformInfo();

// ── Step 1: Re-extract Electron binary if missing ─────────────────────────
if (!fs.existsSync(frameworksCheck)) {
  // Look in platform-specific cache locations
  const cacheDirs = [
    path.join(os.homedir(), 'Library', 'Caches', 'electron'),   // macOS
    path.join(os.homedir(), '.cache', 'electron'),               // Linux
    path.join(os.homedir(), 'AppData', 'Local', 'electron', 'Cache'), // Windows
    path.join(__dirname, 'node_modules', 'electron', '.cache'),  // fallback
  ];

  let zipPath = null;
  for (const cacheDir of cacheDirs) {
    if (!fs.existsSync(cacheDir)) continue;
    // Search one level deep (electron cache puts zips in version subdirs)
    for (const entry of fs.readdirSync(cacheDir)) {
      const candidate = path.join(cacheDir, entry, zipName);
      if (fs.existsSync(candidate)) { zipPath = candidate; break; }
      // Also check directly in the cache dir (some versions)
      const direct = path.join(cacheDir, zipName);
      if (fs.existsSync(direct)) { zipPath = direct; break; }
    }
    if (zipPath) break;
  }

  if (zipPath) {
    console.log('[postinstall] Re-extracting Electron from cache:', zipPath);
    if (fs.existsSync(distDir)) fs.rmSync(distDir, { recursive: true, force: true });
    fs.mkdirSync(distDir, { recursive: true });
    spawnSync('unzip', ['-q', zipPath, '-d', distDir], { stdio: 'inherit' });
    console.log('[postinstall] Electron binary extracted.');
  } else {
    console.warn(`[postinstall] Electron zip (${zipName}) not found in cache.`);
    console.warn('[postinstall] Try: node node_modules/electron/install.js');
  }
}

// ── Step 2: Write path.txt ────────────────────────────────────────────────
fs.writeFileSync(pathFile, binRelPath, 'utf-8');
console.log(`[postinstall] Wrote path.txt: ${binRelPath}`);

// ── Step 3: Patch index.js to work both inside and outside Electron ───────
// When running inside the Electron main process, process.type === 'browser'.
// Electron's Node integration registers 'electron' as a built-in module via
// process._linkedBinding('electron_common_v8') etc., but the cleanest way to
// access it from userland code is through the internal builtin loader, which
// Node exposes as Module._resolveFilename skipping node_modules lookup for
// built-in names.
//
// The trick: inside Electron, `require('electron')` on a parent whose
// filename is NOT this file will resolve to Electron's built-in — so we
// temporarily remove our own file from the cache, then re-require from a
// throwaway parent context, then restore.
//
// Outside Electron we return the binary path string as usual.
// In Electron 12+, the full electron API is accessible via sub-paths:
//   require('electron/main')    — main process APIs
//   require('electron/renderer')— renderer process APIs
//   require('electron/common')  — APIs available in both
//
// These sub-path requires bypass the node_modules/electron/index.js and go
// directly to Electron's C++ registered built-in modules. By checking
// process.type (set by Electron to 'browser' in main, 'renderer' in renderer)
// we can redirect to the correct sub-path module.
//
// Outside Electron (electron-builder CLI, etc.) we return the binary path.
const patchedIndex = `// Patched by postinstall.js — DO NOT EDIT MANUALLY
if (typeof process !== 'undefined' && process.versions && process.versions.electron) {
  // Inside Electron runtime — use sub-path exports that bypass this file.
  // 'electron/main' is the main-process API (Electron 12+).
  // 'electron/renderer' is the renderer-process API.
  if (process.type === 'renderer') {
    module.exports = require('electron/renderer');
  } else {
    module.exports = require('electron/main');
  }
} else {
  const path = require('path');
  const fs = require('fs');
  const pathFile = path.join(__dirname, 'path.txt');
  const executablePath = fs.readFileSync(pathFile, 'utf-8').trim();
  module.exports = path.join(__dirname, 'dist', executablePath);
}
`;
const indexPath = path.join(electronDir, 'index.js');
fs.writeFileSync(indexPath, patchedIndex, 'utf-8');
console.log('[postinstall] Patched electron/index.js for Electron runtime compatibility.');
