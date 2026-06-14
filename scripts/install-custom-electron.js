#!/usr/bin/env node

// Replaces stock Electron with Steve Seguin's patched build that enables
// NVENC hardware encoding for WebRTC (Windows x64 only).
// Reference: https://github.com/steveseguin/electroncapture

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pipeline } = require('stream/promises');
const { Readable } = require('stream');

const CUSTOM_VERSION = '39.2.16-qp20';
const RELEASE_TAG = 'v39.2.16-qp20';
const MIRROR_BASE = 'https://github.com/steveseguin/electron/releases/download/';
const ARTIFACT = 'electron-v39.2.16-qp20-win32-x64.zip';
const CHECKSUM = '01a45b4530ed32a79d82e45e6a1275f9146eeee4fedcfd13344184742bcd5047';

main().catch(err => {
  console.error('[custom-electron] Failed:', err.message);
  process.exitCode = 1;
});

async function main() {
  if (process.env.CUSTOM_ELECTRON_SKIP === '1') {
    console.log('[custom-electron] Skipped (CUSTOM_ELECTRON_SKIP=1).');
    return;
  }

  const platform = process.env.npm_config_platform || process.platform;
  const arch = process.env.npm_config_arch || process.arch;

  if (platform !== 'win32' || arch !== 'x64') {
    console.log(`[custom-electron] No custom build for ${platform}/${arch}; using stock Electron.`);
    return;
  }

  const electronPkgPath = resolveFromCwd('electron/package.json');
  if (!electronPkgPath) {
    console.warn('[custom-electron] electron package not installed; skipping.');
    return;
  }

  const electronDir = path.dirname(electronPkgPath);
  const distDir = path.join(electronDir, 'dist');
  const markerPath = path.join(distDir, '.custom-version');
  const markerValue = `${CUSTOM_VERSION}:${platform}:${arch}`;

  // Skip if already installed
  try {
    const existing = fs.readFileSync(markerPath, 'utf8').trim();
    if (existing === markerValue) {
      console.log(`[custom-electron] ${CUSTOM_VERSION} already installed; skipping.`);
      return;
    }
  } catch {}

  // Clean and recreate dist
  fs.rmSync(distDir, { recursive: true, force: true });
  fs.mkdirSync(distDir, { recursive: true });

  // Download
  const downloadUrl = `${MIRROR_BASE}${RELEASE_TAG}/${ARTIFACT}`;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'electron-custom-'));
  const zipPath = path.join(tmpDir, ARTIFACT);

  try {
    console.log(`[custom-electron] Downloading ${downloadUrl}`);
    const response = await fetch(downloadUrl, {
      redirect: 'follow',
      headers: { 'User-Agent': 'sharkord-desktop-installer' }
    });

    if (!response.ok || !response.body) {
      throw new Error(`Download failed: ${response.status} ${response.statusText}`);
    }

    await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(zipPath));

    // Verify checksum
    const actual = await sha256File(zipPath);
    if (actual !== CHECKSUM) {
      throw new Error(`Checksum mismatch: expected ${CHECKSUM} got ${actual}`);
    }

    // Extract
    const extractZip = require(require.resolve('extract-zip', { paths: [electronDir] }));
    await extractZip(zipPath, { dir: distDir });
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  // Relocate type definitions if present
  const dtsSrc = path.join(distDir, 'electron.d.ts');
  const dtsDest = path.join(electronDir, 'electron.d.ts');
  if (fs.existsSync(dtsSrc)) {
    if (fs.existsSync(dtsDest)) fs.rmSync(dtsDest);
    fs.renameSync(dtsSrc, dtsDest);
  }

  // Write markers
  fs.writeFileSync(path.join(distDir, 'version'), CUSTOM_VERSION);
  fs.writeFileSync(markerPath, markerValue + '\n');
  fs.writeFileSync(path.join(electronDir, 'path.txt'), 'electron.exe');

  console.log(`[custom-electron] Installed ${CUSTOM_VERSION} for ${platform}/${arch}.`);
}

function resolveFromCwd(id) {
  try {
    return require.resolve(id, { paths: [process.cwd()] });
  } catch {
    return null;
  }
}

function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', chunk => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}
