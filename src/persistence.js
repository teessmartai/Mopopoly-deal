'use strict';

const fs = require('fs');
const path = require('path');

// The save file lives *beside the executable* (or in the working directory
// when run via `node`), so an accidental restart can recover the game.
function savePath() {
  const base = process.pkg ? path.dirname(process.execPath) : process.cwd();
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
