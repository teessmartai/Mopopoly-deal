'use strict';

// Lightweight test runner (no deps) so it works inside the bundled binary too.
const assert = require('assert');
const { buildDeck, COLORS, cardValue } = require('../src/game/cards');
const { Game } = require('../src/game/engine');

let passed = 0;
let failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`  ok  ${name}`); }
  catch (e) { failed++; console.error(`FAIL  ${name}\n      ${e.message}`); }
}

// --- helpers ---------------------------------------------------------------
function findInHand(game, seat, predicate) {
  return game.state.players[seat].hand.find(predicate);
}
// Force a card into a player's hand for deterministic testing.
function giveToHand(game, seat, card) {
  game.state.players[seat].hand.push(card);
  return card;
}
function makeProperty(game, color, name) {
  return { uid: game._spawnUid(), type: 'property', name: name || color, color, value: COLORS[color].value };
}

// --- deck composition ------------------------------------------------------
test('deck has 110 cards', () => {
  const deck = buildDeck();
  assert.strictEqual(deck.length, 110, `got ${deck.length}`);
});

test('deck has unique uids', () => {
  const deck = buildDeck();
  assert.strictEqual(new Set(deck.map((c) => c.uid)).size, 110);
});

test('property card counts per color are correct', () => {
  const deck = buildDeck();
  const counts = {};
  for (const c of deck) if (c.type === 'property') counts[c.color] = (counts[c.color] || 0) + 1;
  assert.deepStrictEqual(counts, {
    brown: 2, lightblue: 3, pink: 3, orange: 3, red: 3,
    yellow: 3, green: 3, blue: 2, railroad: 4, utility: 2,
  });
});

test('28 properties, 11 wilds, 20 money, 13 rent, 38 action', () => {
  const deck = buildDeck();
  const by = (t) => deck.filter((c) => c.type === t).length;
  assert.strictEqual(by('property'), 28, 'property');
  assert.strictEqual(by('wild'), 11, 'wild');
  assert.strictEqual(by('money'), 20, 'money');
  assert.strictEqual(by('rent'), 13, 'rent');
  assert.strictEqual(by('action'), 38, 'action');
});

test('money denominations sum correctly', () => {
  const deck = buildDeck();
  const total = deck.filter((c) => c.type === 'money').reduce((s, c) => s + c.value, 0);
  assert.strictEqual(total, 6 * 1 + 5 * 2 + 3 * 3 + 3 * 4 + 2 * 5 + 1 * 10);
});

// --- lobby / start ---------------------------------------------------------
test('cannot start with fewer than 2 players', () => {
  const g = new Game();
  g.addPlayer('A', 't1');
  assert.throws(() => g.start());
});

test('start deals 5 + draws 2 for first player (7 in hand)', () => {
  const g = new Game();
  g.addPlayer('A', 't1');
  g.addPlayer('B', 't2');
  g.start();
  assert.strictEqual(g.state.phase, 'playing');
  assert.strictEqual(g.state.players[0].hand.length, 7); // 5 dealt + 2 drawn
  assert.strictEqual(g.state.players[1].hand.length, 5);
  assert.strictEqual(g.state.turn.playsRemaining, 3);
});

// --- basic plays -----------------------------------------------------------
test('banking money works and costs a play', () => {
  const g = new Game();
  g.addPlayer('A', 't1'); g.addPlayer('B', 't2'); g.start();
  const money = giveToHand(g, 0, { uid: 9001, type: 'money', name: '$5M', value: 5 });
  g.playMoney(0, money.uid);
  assert.strictEqual(g.state.players[0].bank.length, 1);
  assert.strictEqual(g.state.turn.playsRemaining, 2);
});

test('cannot bank a property card as money', () => {
  const g = new Game();
  g.addPlayer('A', 't1'); g.addPlayer('B', 't2'); g.start();
  const prop = giveToHand(g, 0, makeProperty(g, 'red'));
  assert.throws(() => g.playMoney(0, prop.uid));
});

test('playing a property places it into the right set', () => {
  const g = new Game();
  g.addPlayer('A', 't1'); g.addPlayer('B', 't2'); g.start();
  const prop = giveToHand(g, 0, makeProperty(g, 'green'));
  g.playProperty(0, prop.uid, 'green');
  assert.strictEqual(g.state.players[0].sets.green.cards.length, 1);
});

test('only 3 plays per turn', () => {
  const g = new Game();
  g.addPlayer('A', 't1'); g.addPlayer('B', 't2'); g.start();
  const c1 = giveToHand(g, 0, { uid: 9101, type: 'money', value: 1, name: '$1M' });
  const c2 = giveToHand(g, 0, { uid: 9102, type: 'money', value: 1, name: '$1M' });
  const c3 = giveToHand(g, 0, { uid: 9103, type: 'money', value: 1, name: '$1M' });
  const c4 = giveToHand(g, 0, { uid: 9104, type: 'money', value: 1, name: '$1M' });
  g.playMoney(0, c1.uid); g.playMoney(0, c2.uid); g.playMoney(0, c3.uid);
  assert.throws(() => g.playMoney(0, c4.uid));
});

// --- rent + payment --------------------------------------------------------
test('rent calculation includes house/hotel on a complete set', () => {
  const g = new Game();
  g.addPlayer('A', 't1'); g.addPlayer('B', 't2'); g.start();
  const p = g.state.players[0];
  p.sets.brown = { cards: [makeProperty(g, 'brown'), makeProperty(g, 'brown')], house: true, hotel: false };
  // brown full-set rent = 2, +3 house = 5
  assert.strictEqual(g.rentFor(p, 'brown'), 5);
  p.sets.brown.hotel = true; // +4
  assert.strictEqual(g.rentFor(p, 'brown'), 9);
});

test('debt collector forces a payment that transfers money', () => {
  const g = new Game();
  g.addPlayer('A', 't1'); g.addPlayer('B', 't2'); g.start();
  // give B some bank money
  g.state.players[1].bank = [{ uid: 9201, type: 'money', value: 5, name: '$5M' }];
  const dc = giveToHand(g, 0, { uid: 9202, type: 'action', action: 'debt_collector', name: 'Debt Collector', value: 3 });
  g.playDebtCollector(0, dc.uid, 1);
  // B is the responder for JSN; B declines (no JSN)
  g.respondJustSayNo(1, false);
  // now B owes 5; B pays the $5M
  assert.strictEqual(g.state.pending.kind, 'payment');
  g.submitPayment(1, [9201]);
  assert.strictEqual(g.state.players[0].bank.length, 1);
  assert.strictEqual(g.state.players[1].bank.length, 0);
});

test('cannot pay less than owed when assets are sufficient', () => {
  const g = new Game();
  g.addPlayer('A', 't1'); g.addPlayer('B', 't2'); g.start();
  g.state.players[1].bank = [
    { uid: 9301, type: 'money', value: 5, name: '$5M' },
    { uid: 9302, type: 'money', value: 2, name: '$2M' },
  ];
  const dc = giveToHand(g, 0, { uid: 9303, type: 'action', action: 'debt_collector', name: 'Debt Collector', value: 3 });
  g.playDebtCollector(0, dc.uid, 1);
  g.respondJustSayNo(1, false);
  assert.throws(() => g.submitPayment(1, [9302])); // $2 < $5 owed
  g.submitPayment(1, [9301]); // $5 covers it (overpay allowed, no change)
});

test('player with no assets owes nothing and game continues', () => {
  const g = new Game();
  g.addPlayer('A', 't1'); g.addPlayer('B', 't2'); g.start();
  const dc = giveToHand(g, 0, { uid: 9401, type: 'action', action: 'debt_collector', name: 'Debt Collector', value: 3 });
  g.playDebtCollector(0, dc.uid, 1);
  g.respondJustSayNo(1, false);
  assert.strictEqual(g.state.pending, null); // nothing to pay -> resolved
});

// --- Just Say No duel ------------------------------------------------------
test('Just Say No cancels an action; counter-JSN re-enables it', () => {
  const g = new Game();
  g.addPlayer('A', 't1'); g.addPlayer('B', 't2'); g.start();
  g.state.players[1].bank = [{ uid: 9501, type: 'money', value: 5, name: '$5M' }];
  const dc = giveToHand(g, 0, { uid: 9502, type: 'action', action: 'debt_collector', name: 'Debt Collector', value: 3 });
  // both have a JSN
  giveToHand(g, 1, { uid: 9503, type: 'action', action: 'just_say_no', name: 'Just Say No', value: 4 });
  giveToHand(g, 0, { uid: 9504, type: 'action', action: 'just_say_no', name: 'Just Say No', value: 4 });
  g.playDebtCollector(0, dc.uid, 1);
  g.respondJustSayNo(1, true);  // B says no (jsnCount=1, cancelled)
  g.respondJustSayNo(0, true);  // A counters (jsnCount=2, applies)
  g.respondJustSayNo(1, false); // B has no more JSN, declines -> applies
  assert.strictEqual(g.state.pending.kind, 'payment');
  g.submitPayment(1, [9501]);
  assert.strictEqual(g.state.players[0].bank.length, 1);
});

// --- steals ----------------------------------------------------------------
test('Sly Deal cannot take from a complete set', () => {
  const g = new Game();
  g.addPlayer('A', 't1'); g.addPlayer('B', 't2'); g.start();
  const b = g.state.players[1];
  b.sets.brown = { cards: [makeProperty(g, 'brown'), makeProperty(g, 'brown')], house: false, hotel: false };
  const sly = giveToHand(g, 0, { uid: 9601, type: 'action', action: 'sly_deal', name: 'Sly Deal', value: 3 });
  assert.throws(() => g.playSlyDeal(0, sly.uid, 1, b.sets.brown.cards[0].uid));
});

test('Sly Deal steals a single incomplete property', () => {
  const g = new Game();
  g.addPlayer('A', 't1'); g.addPlayer('B', 't2'); g.start();
  const b = g.state.players[1];
  const target = makeProperty(g, 'green');
  b.sets.green = { cards: [target], house: false, hotel: false };
  const sly = giveToHand(g, 0, { uid: 9701, type: 'action', action: 'sly_deal', name: 'Sly Deal', value: 3 });
  g.playSlyDeal(0, sly.uid, 1, target.uid);
  g.respondJustSayNo(1, false);
  assert.ok(g.state.players[0].sets.green);
  assert.strictEqual(g.state.players[0].sets.green.cards.length, 1);
  assert.strictEqual(g.state.players[1].sets.green, undefined);
});

// --- Double the Rent -------------------------------------------------------
test('Double the Rent doubles and consumes an extra play', () => {
  const g = new Game();
  g.addPlayer('A', 't1'); g.addPlayer('B', 't2'); g.start();
  const a = g.state.players[0];
  a.sets.brown = { cards: [makeProperty(g, 'brown'), makeProperty(g, 'brown')], house: false, hotel: false };
  g.state.players[1].bank = [{ uid: 9801, type: 'money', value: 10, name: '$10M' }];
  const rent = giveToHand(g, 0, { uid: 9802, type: 'rent', name: 'Rent', colors: ['brown', 'lightblue'], value: 1, wild: false });
  const dbl = giveToHand(g, 0, { uid: 9803, type: 'action', action: 'double_rent', name: 'Double The Rent', value: 1 });
  g.playRent(0, rent.uid, 'brown', null, [dbl.uid]);
  assert.strictEqual(g.state.turn.playsRemaining, 1); // 3 - 2
  // both opponents (only B) owe 2*2 = 4
  g.respondJustSayNo(1, false);
  assert.strictEqual(g.state.pending.amount, 4);
});

// --- win -------------------------------------------------------------------
test('winning needs 3 complete sets of different colors', () => {
  const g = new Game();
  g.addPlayer('A', 't1'); g.addPlayer('B', 't2'); g.start();
  const a = g.state.players[0];
  a.sets.brown = { cards: [makeProperty(g, 'brown'), makeProperty(g, 'brown')], house: false, hotel: false };
  a.sets.blue = { cards: [makeProperty(g, 'blue'), makeProperty(g, 'blue')], house: false, hotel: false };
  a.sets.utility = { cards: [makeProperty(g, 'utility')], house: false, hotel: false };
  assert.strictEqual(g.completeSetCount(a), 2);
  a.sets.utility.cards.push(makeProperty(g, 'utility'));
  assert.strictEqual(g.completeSetCount(a), 3);
  assert.ok(g._checkWin());
  assert.strictEqual(g.state.phase, 'finished');
  assert.strictEqual(g.state.winnerSeat, 0);
});

test('a set of only rainbow wilds does not count toward winning', () => {
  const g = new Game();
  g.addPlayer('A', 't1'); g.addPlayer('B', 't2'); g.start();
  const a = g.state.players[0];
  a.sets.brown = {
    cards: [
      { uid: 9901, type: 'wild', name: 'Wild', colors: 'any', value: 0, assignedColor: 'brown' },
      { uid: 9902, type: 'wild', name: 'Wild', colors: 'any', value: 0, assignedColor: 'brown' },
    ], house: false, hotel: false,
  };
  assert.strictEqual(g.completeSetCount(a), 0);
});

// --- moving wild cards -----------------------------------------------------
test('moveWild relocates a wild to another color without spending a play', () => {
  const g = new Game();
  g.addPlayer('A', 't1'); g.addPlayer('B', 't2'); g.start();
  const a = g.state.players[0];
  a.sets.red = {
    cards: [{ uid: 9950, type: 'wild', name: 'Red/Yellow Wild', colors: ['red', 'yellow'], value: 3, assignedColor: 'red' }],
    house: false, hotel: false,
  };
  const playsBefore = g.state.turn.playsRemaining;
  g.moveWild(0, 9950, 'yellow');
  assert.strictEqual(g.state.players[0].sets.red, undefined); // emptied set is pruned
  assert.ok(g.state.players[0].sets.yellow);
  assert.strictEqual(g.state.players[0].sets.yellow.cards[0].assignedColor, 'yellow');
  assert.strictEqual(g.state.turn.playsRemaining, playsBefore); // free action
});

test('moveWild rejects an invalid color and non-wild cards', () => {
  const g = new Game();
  g.addPlayer('A', 't1'); g.addPlayer('B', 't2'); g.start();
  const a = g.state.players[0];
  a.sets.red = {
    cards: [{ uid: 9951, type: 'wild', name: 'Red/Yellow Wild', colors: ['red', 'yellow'], value: 3, assignedColor: 'red' }],
    house: false, hotel: false,
  };
  assert.throws(() => g.moveWild(0, 9951, 'green')); // green is not on this wild
  const prop = makeProperty(g, 'green');
  a.sets.green = { cards: [prop], house: false, hotel: false };
  assert.throws(() => g.moveWild(0, prop.uid, 'brown')); // not a wild at all
});

test('moveWild can complete a set and win the game', () => {
  const g = new Game();
  g.addPlayer('A', 't1'); g.addPlayer('B', 't2'); g.start();
  const a = g.state.players[0];
  a.sets.brown = { cards: [makeProperty(g, 'brown'), makeProperty(g, 'brown')], house: false, hotel: false };
  a.sets.blue = { cards: [makeProperty(g, 'blue'), makeProperty(g, 'blue')], house: false, hotel: false };
  // Two greens already; the green/blue wild is parked in blue.
  a.sets.green = { cards: [makeProperty(g, 'green'), makeProperty(g, 'green')], house: false, hotel: false };
  a.sets.blue.cards.push({ uid: 9952, type: 'wild', name: 'Green/Railroad Wild', colors: ['green', 'blue'], value: 4, assignedColor: 'blue' });
  assert.strictEqual(g.completeSetCount(a), 2);
  g.moveWild(0, 9952, 'green'); // completes the third set
  assert.strictEqual(g.state.phase, 'finished');
  assert.strictEqual(g.state.winnerSeat, 0);
});

// --- end of turn / hand limit ---------------------------------------------
test('hand over 7 forces a discard at end of turn', () => {
  const g = new Game();
  g.addPlayer('A', 't1'); g.addPlayer('B', 't2'); g.start();
  const a = g.state.players[0];
  while (a.hand.length < 9) a.hand.push({ uid: g._spawnUid(), type: 'money', value: 1, name: '$1M' });
  g.endTurn(0);
  assert.strictEqual(g.state.pending.kind, 'discard');
  assert.strictEqual(g.state.pending.count, a.hand.length - 7);
  const toDiscard = a.hand.slice(0, g.state.pending.count).map((c) => c.uid);
  g.discard(0, toDiscard);
  assert.strictEqual(g.state.turn.seat, 1); // advanced
});

// --- disconnect handling ---------------------------------------------------
test('disconnected target auto-allows JSN and auto-pays', () => {
  const g = new Game();
  g.addPlayer('A', 't1'); g.addPlayer('B', 't2'); g.start();
  g.state.players[1].bank = [{ uid: 9951, type: 'money', value: 5, name: '$5M' }];
  g.setConnected(1, false);
  const dc = giveToHand(g, 0, { uid: 9952, type: 'action', action: 'debt_collector', name: 'Debt Collector', value: 3 });
  g.playDebtCollector(0, dc.uid, 1);
  // No manual response needed; the disconnected player auto-resolves.
  assert.strictEqual(g.state.pending, null);
  assert.strictEqual(g.state.players[0].bank.length, 1);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
