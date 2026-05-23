'use strict';

// Boots the real server and drives it over WebSocket like a browser would.
const { spawn } = require('child_process');
const WebSocket = require('ws');
const assert = require('assert');

const PORT = 47999;
let serverProc;

function startServer() {
  return new Promise((resolve, reject) => {
    serverProc = spawn(process.execPath, ['src/server.js'], {
      env: Object.assign({}, process.env, { PORT: String(PORT) }),
      cwd: process.cwd(),
    });
    let out = '';
    serverProc.stdout.on('data', (d) => { out += d.toString(); if (out.includes('game server is running')) resolve(); });
    serverProc.stderr.on('data', (d) => process.stderr.write('[server] ' + d));
    serverProc.on('error', reject);
    setTimeout(() => reject(new Error('server did not start')), 5000);
  });
}

class Client {
  constructor() {
    this.ws = new WebSocket(`ws://127.0.0.1:${PORT}`);
    this.state = null; this.token = null; this.seat = null;
    this.ws.on('message', (raw) => {
      const m = JSON.parse(raw.toString());
      if (m.type === 'welcome') { this.token = m.token; this.seat = m.seat; }
      if (m.type === 'state') this.state = m.state;
      if (m.type === 'error') this.lastError = m.message;
    });
  }
  open() { return new Promise((res) => this.ws.on('open', res)); }
  send(o) { this.ws.send(JSON.stringify(o)); }
  act(action, params) { this.send(Object.assign({ type: 'action', action }, params || {})); }
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 2000) {
  const start = Date.now();
  while (Date.now() - start < ms) { if (fn()) return true; await wait(20); }
  throw new Error('timeout waiting for condition');
}

let passed = 0, failed = 0;
async function run() {
  await startServer();

  const a = new Client(); await a.open();
  const b = new Client(); await b.open();

  a.send({ type: 'join', name: 'Alice' });
  b.send({ type: 'join', name: 'Bob' });
  await until(() => a.seat === 0 && b.seat === 1);
  await until(() => a.state && a.state.players.length === 2);

  // Bob (non-host) cannot start.
  b.act('start_game');
  await wait(100);
  assert.strictEqual(b.state.phase, 'lobby');

  // Host starts.
  a.act('start_game');
  await until(() => a.state.phase === 'playing');
  assert.strictEqual(a.state.yourHand.length, 7, 'host hand 7');
  assert.strictEqual(b.state.players[0].handCount, 7);

  // Hidden info: Bob must not see Alice's hand.
  assert.strictEqual(b.state.yourSeat, 1);
  assert.ok(!('hand' in b.state.players[0]), 'no raw hands leaked');

  // Alice banks the first bankable card she has.
  const bankable = a.state.yourHand.find((c) => c.type === 'money' || c.type === 'action' || c.type === 'rent');
  if (bankable) {
    const before = a.state.turn.playsRemaining;
    a.act('play_money', { uid: bankable.uid });
    await until(() => a.state.turn.playsRemaining === before - 1);
  }

  // Alice ends turn -> goes to Bob.
  a.act('end_turn');
  await until(() => a.state.turn.seat === 1, 3000);

  console.log('  ok  full WS lobby+start+play+turn flow');
  passed++;

  // Reconnect test: Bob drops and resumes with his token, same seat & hand.
  const bobToken = b.token; const bobSeat = b.seat;
  const bobHandLen = b.state.yourHand.length;
  b.ws.close();
  await wait(150);
  await until(() => a.state.players[1].connected === false, 2000);
  const b2 = new Client(); await b2.open();
  b2.send({ type: 'resume', token: bobToken });
  await until(() => b2.seat === bobSeat && b2.state && b2.state.yourHand.length === bobHandLen, 2000);
  assert.strictEqual(b2.state.yourSeat, bobSeat);
  console.log('  ok  reconnect restores seat and hand');
  passed++;

  serverProc.kill();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

run().catch((e) => {
  console.error('FAIL', e.message);
  if (serverProc) serverProc.kill();
  process.exit(1);
});
