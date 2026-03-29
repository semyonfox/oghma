#!/usr/bin/env node
/**
 * Canvas Import Worker Launcher
 * Spawns the SQS poll loop (worker-entry.js) using tsx for TypeScript support
 */

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const worker = spawn(path.join(__dirname, 'node_modules/.bin/tsx'), [
  path.join(__dirname, 'src/lib/canvas/worker-entry.js'),
], {
  stdio: 'inherit',
  cwd: __dirname,
});

worker.on('error', (err) => {
  console.error('Worker error:', err);
  process.exit(1);
});

worker.on('exit', (code) => {
  console.log(`Worker exited with code ${code}`);
  process.exit(code);
});
