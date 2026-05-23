'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const WebSocket = require('ws');
const qrcode = require('qrcode-terminal');

const { Game } = require('./game/engine');
const persistence = require('./persistence');

const PORT = Number(process.env.PORT) || 47800;
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

// ---------------------------------------------------------------------------
// Game instance (restored from disk if a save exists).
// ---------------------------------------------------------------------------
let game;
const saved = persistence.load();
if (saved && saved.players && saved.players.length) {
  game = new Game(saved);
  // Everyone starts disconnected after a restart; they reconnect with tokens.
  for (const p of game.state.players) p.connected = false;
  console.log(`Recovered a saved game with ${game.state.players.length} player(s).`);
} else {
  game = new Game();
}

function persist() { persistence.save(game.state); }

// ---------------------------------------------------------------------------
// Static file server.
// ---------------------------------------------------------------------------
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
};

const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';
  // Prevent path traversal.
  const safe = path.normalize(urlPath).replace(/^(\.\.[/\\])+/, '');
  const filePath = path.join(PUBLIC_DIR, safe);
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
});

// ---------------------------------------------------------------------------
// WebSocket layer.
// ---------------------------------------------------------------------------
const wss = new WebSocket.Server({ server });

// token -> Set<ws> (a player may have several tabs open)
const connectionsByToken = new Map();
// all live sockets (including spectators)
const sockets = new Set();

function send(ws, msg) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

function stateFor(seat) { return game.publicState(seat); }

function broadcast() {
  for (const ws of sockets) {
    const seat = ws.seat != null ? ws.seat : -1;
    send(ws, { type: 'state', state: stateFor(seat) });
  }
  persist();
}

function trackConnection(token, ws) {
  if (!connectionsByToken.has(token)) connectionsByToken.set(token, new Set());
  connectionsByToken.get(token).add(ws);
}

function untrackConnection(token, ws) {
  const set = connectionsByToken.get(token);
  if (!set) return;
  set.delete(ws);
  if (set.size === 0) connectionsByToken.delete(token);
}

function isTokenConnected(token) {
  const set = connectionsByToken.get(token);
  return !!(set && set.size > 0);
}

// Map a client "action" message to an engine call. Seat is taken from the
// authenticated connection — never from the client payload.
function dispatchAction(ws, msg) {
  const seat = ws.seat;
  if (seat == null) throw new Error('Join the game first');
  const a = msg.action;
  switch (a) {
    case 'play_money': game.playMoney(seat, msg.uid); break;
    case 'play_property': game.playProperty(seat, msg.uid, msg.color); break;
    case 'play_building': game.playBuilding(seat, msg.uid, msg.color); break;
    case 'play_pass_go': game.playPassGo(seat, msg.uid); break;
    case 'play_sly_deal': game.playSlyDeal(seat, msg.uid, msg.targetSeat, msg.targetCardUid); break;
    case 'play_forced_deal': game.playForcedDeal(seat, msg.uid, msg.targetSeat, msg.targetCardUid, msg.myCardUid); break;
    case 'play_deal_breaker': game.playDealBreaker(seat, msg.uid, msg.targetSeat, msg.color); break;
    case 'play_debt_collector': game.playDebtCollector(seat, msg.uid, msg.targetSeat); break;
    case 'play_birthday': game.playBirthday(seat, msg.uid); break;
    case 'play_rent': game.playRent(seat, msg.uid, msg.color, msg.targetSeat, msg.doubleUids || []); break;
    case 'move_wild': game.moveWild(seat, msg.uid, msg.toColor); break;
    case 'respond_jsn': game.respondJustSayNo(seat, !!msg.useJSN); break;
    case 'submit_payment': game.submitPayment(seat, msg.uids || []); break;
    case 'discard': game.discard(seat, msg.uids || []); break;
    case 'end_turn': game.endTurn(seat); break;
    case 'skip_player': game.skipDisconnected(seat); break;
    case 'start_game':
      requireHost(seat); game.start(); break;
    case 'play_again':
      requireHost(seat);
      if (game.state.phase !== 'finished') throw new Error('You can only restart after a game ends');
      game.playAgain(); break;
    default:
      throw new Error('Unknown action: ' + a);
  }
}

function requireHost(seat) {
  const p = game.state.players[seat];
  if (!p || !p.isHost) throw new Error('Only the host can do that');
}

wss.on('connection', (ws) => {
  ws.seat = null;
  ws.token = null;
  sockets.add(ws);
  // Spectator view until they join/resume.
  send(ws, { type: 'state', state: stateFor(-1) });

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch (e) { return; }
    try {
      if (msg.type === 'resume') {
        const player = game.playerByToken(msg.token);
        if (!player) { send(ws, { type: 'need_join', reason: gateReason() }); return; }
        ws.token = player.token; ws.seat = player.seat;
        trackConnection(player.token, ws);
        game.setConnected(player.seat, true);
        send(ws, { type: 'welcome', token: player.token, seat: player.seat });
        broadcast();
        return;
      }
      if (msg.type === 'join') {
        if (game.state.phase !== 'lobby') throw new Error('A game is already in progress — you can watch, or wait for the next round.');
        const token = crypto.randomUUID();
        const player = game.addPlayer(msg.name, token);
        ws.token = token; ws.seat = player.seat;
        trackConnection(token, ws);
        send(ws, { type: 'welcome', token, seat: player.seat });
        broadcast();
        return;
      }
      if (msg.type === 'action') {
        dispatchAction(ws, msg);
        broadcast();
        return;
      }
      if (msg.type === 'ping') { send(ws, { type: 'pong' }); return; }
    } catch (err) {
      send(ws, { type: 'error', message: err.message });
    }
  });

  ws.on('close', () => {
    sockets.delete(ws);
    if (ws.token) {
      untrackConnection(ws.token, ws);
      if (ws.seat != null && !isTokenConnected(ws.token)) {
        game.setConnected(ws.seat, false);
        broadcast();
      }
    }
  });

  ws.on('error', () => { /* ignore socket errors; close handler cleans up */ });
});

function gateReason() {
  if (game.state.phase !== 'lobby') return 'in_progress';
  if (game.state.players.length >= 5) return 'full';
  return null;
}

// ---------------------------------------------------------------------------
// Networking info + console host display.
// ---------------------------------------------------------------------------
function lanAddresses() {
  const nets = os.networkInterfaces();
  const results = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) results.push(net.address);
    }
  }
  // Prefer typical private LAN ranges first.
  const score = (ip) => (
    ip.startsWith('192.168.') ? 0 :
    ip.startsWith('10.') ? 1 :
    /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ? 2 : 3
  );
  return results.sort((a, b) => score(a) - score(b));
}

function printHostScreen() {
  const ips = lanAddresses();
  const best = ips[0] || 'localhost';
  const url = `http://${best}:${PORT}`;
  const line = '='.repeat(58);
  console.log('\n' + line);
  console.log('   MOPOPOLY DEAL  —  game server is running');
  console.log(line);
  console.log('\n  Players: open this address in your phone browser:\n');
  console.log('      >>>  ' + url + '  <<<\n');
  if (ips.length > 1) {
    console.log('  (If that address does not work, try one of these:)');
    for (const ip of ips.slice(1)) console.log('      http://' + ip + ':' + PORT);
    console.log('');
  }
  console.log('  Or scan this QR code with a phone camera:\n');
  qrcode.generate(url, { small: true }, (qr) => {
    console.log(qr.split('\n').map((l) => '   ' + l).join('\n'));
    console.log('\n' + line);
    console.log('  Port: ' + PORT + '   |   Players join, then the first');
    console.log('  player (the host) taps "Start Game".');
    console.log('  Keep this window OPEN while you play.');
    console.log('  Save file: ' + persistence.savePath());
    console.log(line + '\n');
  });
}

server.listen(PORT, '0.0.0.0', () => {
  printHostScreen();
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\nPort ${PORT} is already in use. Is the game already running?`);
    console.error('Close the other window and try again.\n');
  } else {
    console.error('Server error:', err.message);
  }
  // Keep the window open so a double-click user can read the message.
  setTimeout(() => process.exit(1), 60000);
});

// Keep the console window open on unexpected crashes so the host can read it.
process.on('uncaughtException', (e) => {
  console.error('\nUnexpected error:', e && e.stack ? e.stack : e);
  console.error('The game will keep running if possible. You can close this window to stop it.');
});
