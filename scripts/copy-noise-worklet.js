'use strict';
const fs = require('fs');
const path = require('path');

const outPath = path.join(__dirname, '..', 'static', 'noiseGateWorklet.js');

let workletPath;
try {
  const pkgMain = require.resolve('@sapphi-red/web-noise-suppressor');
  const distDir = path.dirname(pkgMain);
  workletPath = path.join(distDir, 'noiseGate', 'workletProcessor.js');
} catch (_) {
  workletPath = path.join(__dirname, '..', 'node_modules', '@sapphi-red', 'web-noise-suppressor', 'dist', 'noiseGate', 'workletProcessor.js');
}

if (!fs.existsSync(workletPath)) {
  console.warn('copy-noise-worklet: worklet not found at', workletPath);
  console.warn('Run "npm install" from apps/desktop to install @sapphi-red/web-noise-suppressor.');
  process.exit(0);
}
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.copyFileSync(workletPath, outPath);
console.log('copy-noise-worklet: copied to static/noiseGateWorklet.js');
