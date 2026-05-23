'use strict';

const fs = require('fs');
const path = require('path');

// Where the save file lives, in priority order:
//   1. MOPOPOLY_DATA_DIR — an explicit app-writable directory. The Android
//      (nodejs-mobile) wrapper sets this to the app's files directory, which is
//      the only place the embedded runtime is allowed to write.
//   2. Beside the executable, when packaged as a single .exe via pkg.
//   3. The current working directory, when run via `node`.
function savePath() {
  const base = process.env.MOPOPOLY_DATA_DIR
    || (process.pkg ? path.dirname(process.execPath) : process.cwd());
  return path.join(base, 'mopopoly-save.json');
}

function save(state) {
  try {
    fs.writeFileSync(savePath(), JSON.stringify(state), 'utf8');
  } catch (e) {
    // Persistence is best-effort; never crash the game over a failed write.
    console.warn('Could not write save file:', e.message);
  }
}

function load() {
  try {
    const raw = fs.readFileSync(savePath(), 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

function clear() {
  try { fs.unlinkSync(savePath()); } catch (e) { /* ignore */ }
}

module.exports = { save, load, clear, savePath };
