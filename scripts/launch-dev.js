#!/usr/bin/env node
/**
 * scripts/launch-dev.js
 *
 * Launches Electron for development.
 * Reads the binary path from node_modules/electron/path.txt and spawns
 * the Electron binary with the project root as the app entry point.
 *
 * node_modules/electron/index.js is patched by postinstall.js to return
 * the real Electron API when running inside the Electron runtime.
 */
const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const projectRoot = path.join(__dirname, '..');
const electronDir = path.join(projectRoot, 'node_modules', 'electron');
const pathFile = path.join(electronDir, 'path.txt');

if (!fs.existsSync(pathFile)) {
  console.error('[launch-dev] ERROR: node_modules/electron/path.txt not found.');
  console.error('[launch-dev] Run: npm install');
  process.exit(1);
}

const relBin = fs.readFileSync(pathFile, 'utf-8').trim();
const electronBin = path.join(electronDir, 'dist', relBin);

if (!fs.existsSync(electronBin)) {
  console.error(`[launch-dev] ERROR: Electron binary not found at: ${electronBin}`);
  console.error('[launch-dev] Run: npm install');
  process.exit(1);
}

console.log(`[launch-dev] Launching: ${electronBin} ${projectRoot}`);

// node_modules/electron/index.js is patched by postinstall.js to return
// the real Electron API when process.versions.electron is set — no rename needed.
const result = spawnSync(electronBin, [projectRoot], {
  stdio: 'inherit',
  env: { ...process.env, NODE_ENV: 'development' },
});
process.exit(result.status ?? 0);
