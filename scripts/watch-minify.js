#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const src = path.join(__dirname, '..', 'static', 'wrapper.js');
const runMinify = () => {
  try {
    execSync('npm run minify', { stdio: 'inherit', cwd: path.join(__dirname, '..') });
  } catch (e) {
    // ignore
  }
};

if (!fs.existsSync(src)) {
  console.error('Not found:', src);
  process.exit(1);
}

console.log('Watching', src, '- minify on change (Ctrl+C to stop)');
runMinify();

fs.watch(path.dirname(src), { persistent: true }, (event, filename) => {
  if (filename === 'wrapper.js') runMinify();
});
