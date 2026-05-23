'use strict';

// Entry point for the embedded nodejs-mobile runtime on Android.
//
// The native layer launches Node with:
//   ["node", "<.../mobile-main.js>", "<writable data dir>"]
// We copy argv[2] into MOPOPOLY_DATA_DIR so the shared server writes its save
// file into app-private storage (the only place the runtime may write). The
// server itself is unchanged from the Windows/.exe path; PORT defaults to 47800.

const dataDir = process.argv[2];
if (dataDir) {
  process.env.MOPOPOLY_DATA_DIR = dataDir;
}

require('./src/server.js');
