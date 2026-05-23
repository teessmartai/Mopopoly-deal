'use strict';

// ---------------------------------------------------------------------------
// Mopopoly Deal — browser client. Renders server-pushed state and sends
// player intents. Holds no authoritative game logic.
// ---------------------------------------------------------------------------

const COLORS = {
  brown:     { label: 'Brown',      hex: '#8B5A2B', size: 2 },
  lightblue: { label: 'Light Blue', hex: '#7fc7e6', size: 3 },
  pink:      { label: 'Pink',       hex: '#D6479B', size: 3 },
  orange:    { label: 'Orange',     hex: '#E8861E', size: 3 },
  red:       { label: 'Red',        hex: '#D62B2B', size: 3 },
  yellow:    { label: 'Yellow',     hex: '#E0B400', size: 3 },
  green:     { label: 'Green',      hex: '#1FA855', size: 3 },
  blue:      { label: 'Dark Blue',  hex: '#2453B5', size: 2 },
  railroad:  { label: 'Railroad',   hex: '#333333', size: 4 },
  utility:   { label: 'Utility',    hex: '#8a9111', size: 2 },
};
const COLOR_ORDER = ['brown', 'lightblue', 'pink', 'orange', 'red', 'yellow', 'green', 'blue', 'railroad', 'utility'];

const $ = (id) => document.getElementById(id);
const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };

let ws = null;
let state = null;
let mySeat = null;
let token = localStorage.getItem('mopopoly_token') || null;
let watching = false; // chose to spectate instead of taking/reclaiming a seat
let reconnectDelay = 500;
let paymentSel = new Set(); // transient selection for payment/discard prompts
let lastPendingKey = null;

// ---------------------------------------------------------------------------
// Connection
// ---------------------------------------------------------------------------
function connect() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}`);
  ws.onopen = () => {
    reconnectDelay = 500;
    $('conn-status').textContent = 'Connected';
    if (token) sendRaw({ type: 'resume', token });
  };
  ws.onmessage = (ev) => {
    let msg; try { msg = JSON.parse(ev.data); } catch (e) { return; }
    handleMessage(msg);
  };
  ws.onclose = () => {
    $('conn-status').textContent = 'Reconnecting…';
    setTimeout(connect, reconnectDelay);
    reconnectDelay = Math.min(reconnectDelay * 1.6, 5000);
  };
  ws.onerror = () => { try { ws.close(); } catch (e) {} };
}

function sendRaw(obj) { if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj)); }
function act(action, params) { sendRaw(Object.assign({ type: 'action', action }, params || {})); }

function handleMessage(msg) {
  if (msg.type === 'welcome') {
    token = msg.token; mySeat = msg.seat; watching = false;
    localStorage.setItem('mopopoly_token', token);
    showGame();
  } else if (msg.type === 'need_join') {
    // Our stored token doesn't match a seat in this game — either a brand new
    // game, or we returned on a different address (so this origin's localStorage
    // has no/old token). Drop the dead token so a reconnecting socket stops
    // re-sending it and bouncing us back here, then show the join/rejoin gate.
    localStorage.removeItem('mopopoly_token');
    token = null; mySeat = null;
    showJoin(msg.reason);
  } else if (msg.type === 'state') {
    state = msg.state;
    if (state.yourSeat != null && state.yourSeat >= 0) mySeat = state.yourSeat;
    render();
    maybeGate();
  } else if (msg.type === 'error') {
    toast(msg.message);
  }
}

function showGame() {
  $('join').classList.add('hidden');
  $('game').classList.remove('hidden');
}

// When we have no token (so no `resume` is pending) and a game is already
// underway, show the rejoin/watch gate instead of the useless name-entry form.
// While a token is in flight we let `welcome`/`need_join` drive the screen, so
// reconnecting players don't flicker through the gate.
function maybeGate() {
  if (token || mySeat != null || watching) return;
  if (!state || state.phase === 'lobby') return;
  const reason = state.players.length >= state.maxPlayers ? 'full' : 'in_progress';
  showJoin(reason);
}

function showJoin(reason) {
  $('game').classList.add('hidden');
  $('join').classList.remove('hidden');
  const sub = $('join-sub'); const btn = $('join-btn');
  clearReclaimList();
  if (reason === 'in_progress' || reason === 'full') {
    sub.textContent = reason === 'full'
      ? 'The table is full (5 players).'
      : 'A game is already in progress.';
    $('name-input').classList.add('hidden');
    renderReclaimList();
    btn.textContent = 'Watch Game';
    btn.onclick = startWatching;
  } else {
    sub.textContent = 'Enter your name to join the table.';
    btn.textContent = 'Join Game';
    $('name-input').classList.remove('hidden');
    btn.onclick = doJoin;
  }
}

function startWatching() {
  watching = true;
  showGame();
}

// Returning players whose token was lost (e.g. the host's IP changed, so they
// scanned a new address) can tap their seat to reclaim it. The server hands the
// seat's token back, so this origin can resume normally afterwards.
function renderReclaimList() {
  const players = (state && state.players) || [];
  if (!players.length) return;
  const card = document.querySelector('#join .join-card');
  const box = el('div'); box.id = 'reclaim-list';
  box.appendChild(el('p', 'reclaim-head', 'Already in this game? Tap your name to rejoin your seat:'));
  for (const p of players) {
    const b = el('button', 'reclaim');
    b.appendChild(el('span', 'dot' + (p.connected ? '' : ' off')));
    b.appendChild(el('span', 'reclaim-name', p.name + (p.isHost ? ' (host)' : '')));
    if (p.connected) b.appendChild(el('span', 'reclaim-tag', 'online'));
    b.onclick = () => sendRaw({ type: 'reclaim', seat: p.seat });
    box.appendChild(b);
  }
  card.insertBefore(box, $('join-btn'));
}

function clearReclaimList() {
  const ex = $('reclaim-list');
  if (ex) ex.remove();
}

function doJoin() {
  const name = $('name-input').value.trim();
  if (!name) { $('join-msg').textContent = 'Please enter a name.'; return; }
  sendRaw({ type: 'join', name });
}

$('join-btn').onclick = doJoin;
$('name-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') doJoin(); });

// ---------------------------------------------------------------------------
// Toast
// ---------------------------------------------------------------------------
let toastTimer = null;
function toast(text) {
  const t = $('toast'); t.textContent = text; t.classList.remove('hidden');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.add('hidden'), 2600);
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------
function render() {
  if (!state) return;
  // Reset transient selections when the pending prompt changes identity.
  const key = pendingKey();
  if (key !== lastPendingKey) { paymentSel = new Set(); lastPendingKey = key; }
  if (state.phase === 'lobby') return renderLobby();
  renderTopbar();
  renderPrompt();
  renderOpponents();
  renderMe();
  renderControls();
  renderLog();
}

function me() { return state.players.find((p) => p.seat === mySeat) || null; }
function isMyTurn() { return state.phase === 'playing' && state.turn.seat === mySeat && !state.pending; }

function renderTopbar() {
  const cur = state.players[state.turn.seat];
  if (state.phase === 'finished') {
    const w = state.players[state.winnerSeat];
    $('turn-name').textContent = w ? `🎉 ${w.name} wins!` : 'Game over';
    $('plays-left').textContent = '';
  } else {
    $('turn-name').textContent = cur ? `${cur.name}'s turn` : '';
    $('plays-left').textContent = `${state.turn.playsRemaining} play${state.turn.playsRemaining === 1 ? '' : 's'} left`;
  }
  $('deck-count').textContent = state.deckCount;
  $('discard-count').textContent = state.discardCount;
}

// ----- Lobby ---------------------------------------------------------------
function renderLobby() {
  renderTopbar();
  $('prompt').innerHTML = '';
  $('opponents').innerHTML = '';
  const meArea = $('me-area'); meArea.innerHTML = '';
  $('turn-name').textContent = 'Waiting in the lobby';
  $('plays-left').textContent = `${state.players.length}/${state.maxPlayers}`;

  const box = el('div', 'player');
  box.appendChild(el('div', 'hand-label', 'Players seated')).style.fontSize = '14px';
  for (const p of state.players) {
    const row = el('div', 'player-head');
    const dot = el('span', 'dot' + (p.connected ? '' : ' off')); row.appendChild(dot);
    row.appendChild(el('span', 'nm', p.name));
    if (p.isHost) row.appendChild(el('span', 'badge host', 'Host'));
    if (p.seat === mySeat) row.appendChild(el('span', 'badge', 'You'));
    box.appendChild(row);
  }
  meArea.appendChild(box);

  const ctrl = $('controls'); ctrl.innerHTML = '';
  const wrap = el('div', 'lobby-controls');
  const amHost = me() && me().isHost;
  if (amHost) {
    const canStart = state.players.length >= state.minPlayers && state.players.length <= state.maxPlayers;
    const btn = el('button', 'primary big', canStart ? `Start Game (${state.players.length} players)` : `Need ${state.minPlayers}+ players`);
    btn.disabled = !canStart;
    btn.onclick = () => act('start_game');
    wrap.appendChild(btn);
    wrap.appendChild(el('div', 'lobby-hint', 'Players join from their phones. Start when everyone is in (2–5 players).'));
  } else if (mySeat == null) {
    wrap.appendChild(el('div', 'lobby-hint', 'Watching the lobby. Reload and enter a name to join while seats are open.'));
  } else {
    wrap.appendChild(el('div', 'lobby-hint', 'Waiting for the host to start the game…'));
  }
  ctrl.appendChild(wrap);
  renderLog();
}

// ----- Opponents -----------------------------------------------------------
function renderOpponents() {
  const root = $('opponents'); root.innerHTML = '';
  const others = state.players.filter((p) => p.seat !== mySeat);
  // keep seating order starting after me
  others.sort((a, b) => a.seat - b.seat);
  for (const p of others) root.appendChild(playerPanel(p, false));
}

function renderMe() {
  const root = $('me-area'); root.innerHTML = '';
  const m = me();
  if (m) root.appendChild(playerPanel(m, true));
  if (m && state.phase !== 'finished') root.appendChild(handPanel(m));
}

function playerPanel(p, isMe) {
  const panel = el('div', 'player' + (isMe ? ' me' : '') + (state.turn.seat === p.seat && state.phase === 'playing' ? ' is-turn' : ''));
  const head = el('div', 'player-head');
  head.appendChild(el('span', 'dot' + (p.connected ? '' : ' off')));
  head.appendChild(el('span', 'nm', p.name + (isMe ? ' (you)' : '')));
  if (p.isHost) head.appendChild(el('span', 'badge host', 'Host'));
  if (p.isWinner) head.appendChild(el('span', 'badge win', 'WINNER'));
  const stat = el('span', 'stat');
  stat.innerHTML = `sets <b>${p.completeSets}/3</b> · cards ${p.handCount} · bank <b>$${p.bankValue}M</b>`;
  head.appendChild(stat);
  panel.appendChild(head);

  // property sets
  const sets = el('div', 'sets');
  for (const color of COLOR_ORDER) {
    const set = p.sets[color];
    if (!set) continue;
    sets.appendChild(setColumn(color, set));
  }
  if (Object.keys(p.sets).length === 0) sets.appendChild(el('div', 'set-count', 'no properties yet'));
  panel.appendChild(sets);

  // bank chips (compact)
  if (p.bank && p.bank.length) {
    const bl = el('div', 'bank-line');
    bl.innerHTML = `Bank: <b>$${p.bankValue}M</b> (${p.bank.length} card${p.bank.length === 1 ? '' : 's'})`;
    panel.appendChild(bl);
  }
  return panel;
}

function setColumn(color, set) {
  const def = COLORS[color];
  const col = el('div', 'setcol' + (set.complete ? ' complete' : ''));
  const bar = el('div', 'set-bar'); bar.style.background = def.hex; col.appendChild(bar);
  for (const c of set.cards) col.appendChild(miniCard(c, color));
  const cnt = el('div', 'set-count', `${set.cards.length}/${def.size}`); col.appendChild(cnt);
  if (set.rent > 0) col.appendChild(el('div', 'set-rent', `$${set.rent}M`));
  if (set.house) col.appendChild(el('div', 'bldg', '🏠'));
  if (set.hotel) col.appendChild(el('div', 'bldg', '🏨'));
  return col;
}

function miniCard(card, color) {
  const m = el('div', 'mini' + ((card.type === 'wild') ? ' wild' : ''));
  if (card.type === 'wild') {
    m.textContent = card.colors === 'any' ? '★' : 'W';
  } else {
    m.style.background = COLORS[color] ? COLORS[color].hex : '#555';
    m.textContent = shortName(card);
  }
  return m;
}

function shortName(card) {
  return (card.name || '').replace(/ (Avenue|Place|Railroad|Gardens|Company|Works|Line)$/,'').slice(0, 10);
}

// ----- Hand ----------------------------------------------------------------
function handPanel(m) {
  const wrap = el('div', 'hand-wrap');
  const label = el('div', 'hand-label');
  label.appendChild(el('span', null, `Your hand (${state.yourHand.length})`));
  if (state.yourHand.length > 7) label.appendChild(el('span', null, '⚠ over 7 — discard at end of turn'));
  wrap.appendChild(label);
  const hand = el('div', 'hand');
  for (const c of state.yourHand) hand.appendChild(handCard(c));
  if (state.yourHand.length === 0) hand.appendChild(el('div', 'set-count', 'no cards'));
  wrap.appendChild(hand);
  return wrap;
}

function handCard(card) {
  const playable = isMyTurn();
  const c = cardFace(card);
  if (!playable) c.classList.add('disabled');
  c.onclick = () => { if (playable) openCardMenu(card); else toast(isMyTurn() ? '' : 'Not your turn'); };
  return c;
}

// Build a visual card face from a card object.
function cardFace(card) {
  const c = el('div', 'card');
  if (card.type === 'money') {
    c.classList.add('money');
    const body = el('div', 'body'); body.innerHTML = `<span class="bigamt">$${card.value}</span>M`;
    c.appendChild(body);
  } else if (card.type === 'property') {
    const def = COLORS[card.color];
    const top = el('div', 'top'); top.style.background = def.hex; top.textContent = def.label;
    const body = el('div', 'body', card.name);
    c.appendChild(top); c.appendChild(body);
    c.appendChild(corner(card.value, isLight(def.hex)));
  } else if (card.type === 'wild') {
    c.classList.add('wild');
    const top = el('div', 'top', 'WILD');
    const body = el('div', 'body');
    if (card.colors === 'any') { body.textContent = 'Any color'; }
    else {
      const bars = el('div', 'colorbars');
      for (const col of card.colors) { const i = el('i'); i.style.background = COLORS[col].hex; bars.appendChild(i); }
      body.appendChild(bars);
      body.appendChild(el('div', null, card.colors.map((x) => COLORS[x].label).join(' / ')));
    }
    c.appendChild(top); c.appendChild(body);
    if (card.value) c.appendChild(corner(card.value, false));
  } else if (card.type === 'rent') {
    c.classList.add('rent');
    const top = el('div', 'top', 'RENT');
    const body = el('div', 'body');
    if (card.colors === 'any') body.textContent = 'Any one color';
    else {
      const bars = el('div', 'colorbars');
      for (const col of card.colors) { const i = el('i'); i.style.background = COLORS[col].hex; bars.appendChild(i); }
      body.appendChild(bars);
      body.appendChild(el('div', null, card.colors.map((x) => COLORS[x].label).join(' / ')));
    }
    c.appendChild(top); c.appendChild(body);
    c.appendChild(corner(card.value, false));
  } else { // action
    c.classList.add('action');
    const top = el('div', 'top', 'ACTION');
    const body = el('div', 'body', card.name);
    c.appendChild(top); c.appendChild(body);
    c.appendChild(corner(card.value, false));
  }
  return c;
}

function corner(value, dark) {
  const v = el('div', 'val' + (dark ? ' dark' : ''), `$${value}M`);
  return v;
}
function isLight(hex) {
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 150;
}

// ----- Controls (footer) ---------------------------------------------------
function renderControls() {
  const ctrl = $('controls'); ctrl.innerHTML = '';
  if (state.phase === 'finished') {
    if (me() && me().isHost) {
      const b = el('button', 'primary', 'Play Again (same players)');
      b.onclick = () => act('play_again');
      ctrl.appendChild(b);
    } else {
      const span = el('div', 'lobby-hint', 'Waiting for the host to start a new round…');
      ctrl.appendChild(span);
    }
    return;
  }
  // Host skip control if the current player is stuck disconnected.
  if (state.paused && me() && me().isHost) {
    const b = el('button', 'danger', `Skip ${state.players[state.turn.seat].name} (disconnected)`);
    b.onclick = () => act('skip_player');
    ctrl.appendChild(b);
  }
  if (isMyTurn()) {
    const end = el('button', 'endturn', 'End Turn');
    end.onclick = () => act('end_turn');
    ctrl.appendChild(end);
  } else if (!state.pending) {
    const cur = state.players[state.turn.seat];
    ctrl.appendChild(el('div', 'lobby-hint', cur && !cur.connected ? `Waiting for ${cur.name} to reconnect…` : `Waiting for ${cur ? cur.name : 'next player'}…`));
  }
}

// ----- Log -----------------------------------------------------------------
function renderLog() {
  const list = $('log-list'); list.innerHTML = '';
  for (const entry of (state.log || []).slice().reverse()) {
    list.appendChild(el('li', null, entry.text));
  }
}
$('log-toggle').onclick = () => $('log-panel').classList.toggle('hidden');
$('log-close').onclick = () => $('log-panel').classList.add('hidden');

// ---------------------------------------------------------------------------
// Response prompts (Just Say No / payment / discard) — reactive from state.
// ---------------------------------------------------------------------------
function renderPrompt() {
  const root = $('prompt'); root.innerHTML = '';
  const p = state.pending;
  if (!p) return;

  if (!p.yourMove) {
    // Someone else must respond; show a passive note.
    const who = state.players[p.responder != null ? p.responder : (p.debtor != null ? p.debtor : p.seat)];
    let txt = 'Waiting…';
    if (p.kind === 'jsn') txt = `${p.description}. Waiting for ${who ? who.name : '...'} to respond.`;
    else if (p.kind === 'payment') txt = `Waiting for ${who ? who.name : '...'} to pay $${p.amount}M.`;
    else if (p.kind === 'discard') txt = `Waiting for ${who ? who.name : '...'} to discard.`;
    root.appendChild(el('div', 'prompt-note', txt));
    return;
  }

  if (p.kind === 'jsn') return promptJSN(root, p);
  if (p.kind === 'payment') return promptPayment(root, p);
  if (p.kind === 'discard') return promptDiscard(root, p);
}

function promptJSN(root, p) {
  root.appendChild(el('h3', null, p.description));
  root.appendChild(el('div', 'prompt-note', 'You can cancel this with a Just Say No card, or allow it.'));
  const row = el('div', 'row');
  const hasJSN = state.yourHand.some((c) => c.action === 'just_say_no');
  const no = el('button', 'danger', 'Just Say No!');
  no.disabled = !hasJSN;
  if (!hasJSN) no.textContent = 'No "Just Say No" card';
  no.onclick = () => act('respond_jsn', { useJSN: true });
  const allow = el('button', 'primary', 'Allow it');
  allow.onclick = () => act('respond_jsn', { useJSN: false });
  row.appendChild(no); row.appendChild(allow);
  root.appendChild(row);
}

function promptPayment(root, p) {
  const m = me();
  const creditor = state.players[p.creditor];
  root.appendChild(el('h3', null, `Pay ${creditor ? creditor.name : ''} $${p.amount}M`));
  const note = p.mustPayAll
    ? "You can't cover it — hand over everything you have."
    : 'Select cards to pay with. No change is given, so you may overpay.';
  root.appendChild(el('div', 'prompt-note', note));

  const assets = [];
  for (const c of m.bank) assets.push({ card: c, from: 'bank', color: null });
  for (const color of COLOR_ORDER) {
    const set = m.sets[color]; if (!set) continue;
    for (const c of set.cards) assets.push({ card: c, from: 'set', color });
  }
  if (p.mustPayAll) { paymentSel = new Set(assets.map((a) => a.card.uid)); }

  const grid = el('div', 'pay-grid');
  for (const a of assets) {
    const chip = el('button', 'pick' + (paymentSel.has(a.card.uid) ? ' sel' : ''));
    const label = a.from === 'bank' ? `$${a.card.value}M` : `${shortName(a.card)}`;
    chip.innerHTML = `${label}<br><span class="v">$${a.card.value || 0}M</span>`;
    if (a.from === 'set') chip.style.borderLeft = `4px solid ${COLORS[a.color].hex}`;
    chip.onclick = () => {
      if (p.mustPayAll) return;
      if (paymentSel.has(a.card.uid)) paymentSel.delete(a.card.uid); else paymentSel.add(a.card.uid);
      renderPrompt();
    };
    grid.appendChild(chip);
  }
  if (assets.length === 0) grid.appendChild(el('div', 'set-count', 'You have nothing to pay with.'));
  root.appendChild(grid);

  const sum = assets.filter((a) => paymentSel.has(a.card.uid)).reduce((s, a) => s + (a.card.value || 0), 0);
  const total = el('div', 'pay-total'); total.innerHTML = `Selected: <b>$${sum}M</b> of $${p.amount}M`;
  root.appendChild(total);

  const row = el('div', 'row');
  const pay = el('button', 'primary', 'Pay');
  const enough = p.mustPayAll || sum >= p.amount || assets.length === 0;
  pay.disabled = !enough;
  pay.onclick = () => { act('submit_payment', { uids: Array.from(paymentSel) }); paymentSel = new Set(); };
  row.appendChild(pay);
  root.appendChild(row);
}

function promptDiscard(root, p) {
  root.appendChild(el('h3', null, `Discard ${p.count} card${p.count === 1 ? '' : 's'}`));
  root.appendChild(el('div', 'prompt-note', 'Your hand is over 7. Tap cards to discard, then confirm.'));
  const grid = el('div', 'pay-grid');
  for (const c of state.yourHand) {
    const chip = el('button', 'pick' + (paymentSel.has(c.uid) ? ' sel' : ''), c.name);
    chip.onclick = () => {
      if (paymentSel.has(c.uid)) paymentSel.delete(c.uid);
      else if (paymentSel.size < p.count) paymentSel.add(c.uid);
      else toast(`Only ${p.count} to discard`);
      renderPrompt();
    };
    grid.appendChild(chip);
  }
  root.appendChild(grid);
  const row = el('div', 'row');
  const btn = el('button', 'primary', `Discard (${paymentSel.size}/${p.count})`);
  btn.disabled = paymentSel.size !== p.count;
  btn.onclick = () => { act('discard', { uids: Array.from(paymentSel) }); paymentSel = new Set(); };
  row.appendChild(btn);
  root.appendChild(row);
}

function pendingKey() {
  const p = state ? state.pending : null;
  if (!p) return null;
  return p.kind + ':' + (p.responder ?? '') + ':' + (p.debtor ?? '') + ':' + (p.amount ?? '') + ':' + (p.seat ?? '');
}

// ---------------------------------------------------------------------------
// Card play menu + multi-step action flows (modal-driven)
// ---------------------------------------------------------------------------
function overlayOpen(node) {
  const modal = $('modal'); modal.innerHTML = ''; modal.appendChild(node);
  $('overlay').classList.remove('hidden');
}
function overlayClose() { $('overlay').classList.add('hidden'); $('modal').innerHTML = ''; }
$('overlay').addEventListener('click', (e) => { if (e.target.id === 'overlay') overlayClose(); });

// Promise-based chooser. options: [{label, value, swatch?, hint?}]
function choose(title, hint, options) {
  return new Promise((resolve) => {
    const box = el('div');
    box.appendChild(el('h3', null, title));
    if (hint) box.appendChild(el('p', 'hint', hint));
    const list = el('div', 'opt-list');
    for (const o of options) {
      const b = el('button', 'opt');
      if (o.swatch) { const s = el('span', 'swatch'); s.style.background = o.swatch; b.appendChild(s); }
      b.appendChild(el('span', null, o.label));
      if (o.hint) { const h = el('span', 'stat', o.hint); b.appendChild(h); }
      b.onclick = () => { overlayClose(); resolve(o.value); };
      list.appendChild(b);
    }
    box.appendChild(list);
    const actions = el('div', 'modal-actions');
    const cancel = el('button', 'cancel', 'Cancel');
    cancel.onclick = () => { overlayClose(); resolve(undefined); };
    actions.appendChild(cancel);
    box.appendChild(actions);
    overlayOpen(box);
  });
}

function openCardMenu(card) {
  const opts = [];
  const bankable = card.type !== 'property' && card.type !== 'wild';
  if (card.type === 'property') {
    opts.push({ label: `Play to ${COLORS[card.color].label}`, value: () => act('play_property', { uid: card.uid, color: card.color }), swatch: COLORS[card.color].hex });
  } else if (card.type === 'wild') {
    const colors = card.colors === 'any' ? COLOR_ORDER : card.colors;
    for (const col of colors) opts.push({ label: `Play to ${COLORS[col].label}`, value: () => act('play_property', { uid: card.uid, color: col }), swatch: COLORS[col].hex });
  } else if (card.type === 'rent') {
    opts.push({ label: 'Play rent', value: () => flowRent(card) });
  } else if (card.type === 'action') {
    switch (card.action) {
      case 'pass_go': opts.push({ label: 'Play Pass Go (draw 2)', value: () => act('play_pass_go', { uid: card.uid }) }); break;
      case 'sly_deal': opts.push({ label: 'Play Sly Deal', value: () => flowSlyDeal(card) }); break;
      case 'forced_deal': opts.push({ label: 'Play Forced Deal', value: () => flowForcedDeal(card) }); break;
      case 'deal_breaker': opts.push({ label: 'Play Deal Breaker', value: () => flowDealBreaker(card) }); break;
      case 'debt_collector': opts.push({ label: 'Play Debt Collector ($5M)', value: () => flowDebtCollector(card) }); break;
      case 'birthday': opts.push({ label: "Play It's My Birthday (all pay $2M)", value: () => act('play_birthday', { uid: card.uid }) }); break;
      case 'house': opts.push({ label: 'Add House to a set', value: () => flowBuilding(card) }); break;
      case 'hotel': opts.push({ label: 'Add Hotel to a set', value: () => flowBuilding(card) }); break;
      case 'double_rent': /* only usable with a rent card */ break;
      case 'just_say_no': /* normally auto-used during prompts */ break;
    }
  }
  if (bankable) opts.push({ label: `Bank as money ($${card.value}M)`, value: () => act('play_money', { uid: card.uid }) });

  if (card.action === 'double_rent') {
    toast('Play a Rent card and attach Double The Rent there, or bank it.');
  }
  if (card.action === 'just_say_no' && opts.length === 1) {
    // only bank option; that's fine
  }
  if (opts.length === 0) { toast('Nothing to do with this card right now.'); return; }

  // Render as a chooser; values are functions to run.
  choose(`${card.name}`, cardHint(card), opts.map((o) => ({ label: o.label, value: o.value, swatch: o.swatch })))
    .then((fn) => { if (typeof fn === 'function') fn(); });
}

function cardHint(card) {
  if (card.type === 'money') return `Bank value $${card.value}M.`;
  if (card.type === 'action') return `Action card · bank value $${card.value}M.`;
  if (card.type === 'rent') return `Charge rent · bank value $${card.value}M.`;
  return '';
}

// ----- target & property pickers ------------------------------------------
function opponentOptions() {
  return state.players.filter((p) => p.seat !== mySeat).map((p) => ({
    label: p.name, value: p.seat, hint: `${p.completeSets} sets · $${p.bankValue}M`,
  }));
}

// list a player's stealable single properties (not in complete sets)
function stealablePropertyOptions(seat) {
  const p = state.players[seat];
  const out = [];
  for (const color of COLOR_ORDER) {
    const set = p.sets[color]; if (!set || set.complete) continue;
    for (const c of set.cards) out.push({ label: `${c.name === undefined ? 'Wild' : c.name} (${COLORS[color].label})`, value: c.uid, swatch: COLORS[color].hex });
  }
  return out;
}

async function flowSlyDeal(card) {
  const targetSeat = await choose('Sly Deal — pick a player', 'Steal one property (not from a complete set).', opponentOptions());
  if (targetSeat === undefined) return;
  const props = stealablePropertyOptions(targetSeat);
  if (props.length === 0) { toast('That player has no stealable single properties.'); return; }
  const cardUid = await choose('Pick a property to steal', null, props);
  if (cardUid === undefined) return;
  act('play_sly_deal', { uid: card.uid, targetSeat, targetCardUid: cardUid });
}

async function flowForcedDeal(card) {
  const myProps = stealablePropertyOptions(mySeat);
  if (myProps.length === 0) { toast('You have no single properties to trade.'); return; }
  const myCardUid = await choose('Forced Deal — your card to give', 'Pick one of your properties (not in a complete set).', myProps);
  if (myCardUid === undefined) return;
  const targetSeat = await choose('Pick a player to trade with', null, opponentOptions());
  if (targetSeat === undefined) return;
  const props = stealablePropertyOptions(targetSeat);
  if (props.length === 0) { toast('That player has no stealable single properties.'); return; }
  const targetCardUid = await choose('Pick the property you want', null, props);
  if (targetCardUid === undefined) return;
  act('play_forced_deal', { uid: card.uid, targetSeat, targetCardUid, myCardUid });
}

async function flowDealBreaker(card) {
  const targets = state.players.filter((p) => p.seat !== mySeat && Object.values(p.sets).some((s) => s.complete));
  if (targets.length === 0) { toast('Nobody has a complete set to steal.'); return; }
  const targetSeat = await choose('Deal Breaker — pick a player', 'Steal an entire complete set (with buildings).', targets.map((p) => ({ label: p.name, value: p.seat, hint: `${p.completeSets} sets` })));
  if (targetSeat === undefined) return;
  const p = state.players[targetSeat];
  const setOpts = COLOR_ORDER.filter((c) => p.sets[c] && p.sets[c].complete).map((c) => ({ label: `${COLORS[c].label} set`, value: c, swatch: COLORS[c].hex }));
  const color = await choose('Pick the set to steal', null, setOpts);
  if (color === undefined) return;
  act('play_deal_breaker', { uid: card.uid, targetSeat, color });
}

async function flowDebtCollector(card) {
  const targetSeat = await choose('Debt Collector — pick a player', 'They owe you $5M.', opponentOptions());
  if (targetSeat === undefined) return;
  act('play_debt_collector', { uid: card.uid, targetSeat });
}

async function flowBuilding(card) {
  const m = me();
  const opts = COLOR_ORDER.filter((c) => {
    const s = m.sets[c]; return s && s.complete && c !== 'railroad' && c !== 'utility';
  }).map((c) => ({ label: `${COLORS[c].label} set`, value: c, swatch: COLORS[c].hex }));
  if (opts.length === 0) { toast('You need a complete set (not Railroad/Utility) first.'); return; }
  const color = await choose(`Add ${card.name}`, 'Buildings go on a complete set.', opts);
  if (color === undefined) return;
  act('play_building', { uid: card.uid, color });
}

async function flowRent(card) {
  const m = me();
  // Which colors can this rent charge for AND I own?
  const allowed = card.colors === 'any' ? COLOR_ORDER : card.colors;
  const owned = allowed.filter((c) => m.sets[c] && m.sets[c].rent > 0);
  if (owned.length === 0) { toast('You have no properties of that rent card’s color(s).'); return; }
  let color = owned[0];
  if (owned.length > 1) {
    color = await choose('Charge rent for which color?', null, owned.map((c) => ({ label: `${COLORS[c].label} — $${m.sets[c].rent}M`, value: c, swatch: COLORS[c].hex })));
    if (color === undefined) return;
  }
  // optional double the rent
  const doubles = state.yourHand.filter((c) => c.action === 'double_rent');
  let doubleUids = [];
  if (doubles.length > 0) {
    const maxByPlays = Math.max(0, state.turn.playsRemaining - 1);
    const canUse = Math.min(doubles.length, maxByPlays);
    if (canUse > 0) {
      const opts = [{ label: 'No — single rent', value: 0 }];
      for (let i = 1; i <= canUse; i++) opts.push({ label: `Yes — x${Math.pow(2, i)} (uses ${i} extra play${i > 1 ? 's' : ''})`, value: i });
      const n = await choose('Double The Rent?', `Base rent $${m.sets[color].rent}M.`, opts);
      if (n === undefined) return;
      doubleUids = doubles.slice(0, n).map((c) => c.uid);
    }
  }
  // wild rent targets ONE player; colored rent hits everyone
  if (card.colors === 'any') {
    const targetSeat = await choose('Charge which player?', 'The any-color rent hits one player.', opponentOptions());
    if (targetSeat === undefined) return;
    act('play_rent', { uid: card.uid, color, targetSeat, doubleUids });
  } else {
    act('play_rent', { uid: card.uid, color, doubleUids });
  }
}

// ---------------------------------------------------------------------------
connect();
