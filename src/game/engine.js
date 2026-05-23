'use strict';

const {
  COLORS, HOUSE_BONUS, HOTEL_BONUS, buildDeck, cardValue, cardColors,
} = require('./cards');

const MAX_PLAYERS = 5;
const MIN_PLAYERS = 2;
const HAND_LIMIT = 7;
const PLAYS_PER_TURN = 3;
const WIN_SETS = 3;
const LOG_LIMIT = 200;

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ---------------------------------------------------------------------------
// The authoritative game. All rules live here; clients only send intents.
// State is plain-data (JSON-serializable) so it can be persisted and restored.
// ---------------------------------------------------------------------------
class Game {
  constructor(state) {
    this.state = state || Game.freshLobby();
  }

  static freshLobby() {
    return {
      phase: 'lobby', // 'lobby' | 'playing' | 'finished'
      players: [],
      deck: [],
      discard: [],
      turn: { seat: 0, playsRemaining: PLAYS_PER_TURN },
      pending: null,
      queue: [],
      log: [],
      winnerSeat: null,
      version: 0, // bumped on every mutation so clients/persistence can dedupe
    };
  }

  // ---- logging -----------------------------------------------------------
  log(text) {
    this.state.log.push({ text, ts: Date.now() });
    if (this.state.log.length > LOG_LIMIT) this.state.log.shift();
  }

  touch() { this.state.version++; }

  // ---- lobby -------------------------------------------------------------
  addPlayer(name, token) {
    const s = this.state;
    if (s.phase !== 'lobby') throw new Error('Game already started');
    if (s.players.length >= MAX_PLAYERS) throw new Error('Game is full (5 players max)');
    const seat = s.players.length;
    const player = {
      seat,
      token,
      name: (name || `Player ${seat + 1}`).slice(0, 20),
      connected: true,
      isHost: seat === 0,
      hand: [],
      bank: [],
      sets: {}, // color -> { cards: [card], house: bool, hotel: bool }
    };
    s.players.push(player);
    this.log(`${player.name} joined.`);
    this.touch();
    return player;
  }

  playerByToken(token) {
    return this.state.players.find((p) => p.token === token) || null;
  }

  setConnected(seat, connected) {
    const p = this.state.players[seat];
    if (!p) return;
    if (p.connected !== connected) {
      p.connected = connected;
      this.log(`${p.name} ${connected ? 'reconnected' : 'disconnected'}.`);
      this.touch();
    }
    // A disconnected player must never deadlock the game: auto-resolve any
    // pending input that was waiting on them.
    if (!connected) this._autoResolveIfWaitingOn(seat);
  }

  // ---- start -------------------------------------------------------------
  start() {
    const s = this.state;
    if (s.phase !== 'lobby') throw new Error('Already started');
    if (s.players.length < MIN_PLAYERS) throw new Error('Need at least 2 players');
    s.deck = shuffle(buildDeck());
    for (const p of s.players) { p.hand = []; p.bank = []; p.sets = {}; }
    // Deal 5 to each player.
    for (let i = 0; i < 5; i++) {
      for (const p of s.players) p.hand.push(s.deck.pop());
    }
    s.phase = 'playing';
    s.turn = { seat: 0, playsRemaining: PLAYS_PER_TURN };
    s.winnerSeat = null;
    this.log('Game started! ' + s.players[0].name + " goes first.");
    this._beginTurnDraw();
    this.touch();
  }

  // Reset to a fresh lobby but keep the seated players (and their tokens),
  // so nobody has to re-join for the next round.
  playAgain() {
    const s = this.state;
    for (const p of s.players) { p.hand = []; p.bank = []; p.sets = {}; }
    s.phase = 'lobby';
    s.deck = [];
    s.discard = [];
    s.turn = { seat: 0, playsRemaining: PLAYS_PER_TURN };
    s.pending = null;
    s.queue = [];
    s.winnerSeat = null;
    this.log('Starting a new round — same players. Host can deal when ready.');
    this.touch();
  }

  // Wipe the game back to a brand-new, empty lobby. Unlike playAgain (which
  // keeps the seated players for a quick rematch), this drops every player so
  // a fresh group can join from scratch. Lets the host clear out a stale or
  // abandoned game from any phase.
  reset() {
    const version = this.state.version; // keep monotonic so clients accept it
    this.state = Game.freshLobby();
    this.state.version = version;
    this.log('Host ended the game. The lobby is empty — join to start a new game.');
    this.touch();
  }

  // ---- deck helpers ------------------------------------------------------
  _draw(n) {
    const s = this.state;
    const out = [];
    for (let i = 0; i < n; i++) {
      if (s.deck.length === 0) {
        if (s.discard.length === 0) break; // nothing left anywhere
        s.deck = shuffle(s.discard);
        s.discard = [];
        this.log('Reshuffled the discard pile into a new draw pile.');
      }
      out.push(s.deck.pop());
    }
    return out;
  }

  _beginTurnDraw() {
    const s = this.state;
    const p = s.players[s.turn.seat];
    const count = p.hand.length === 0 ? 5 : 2;
    const drawn = this._draw(count);
    p.hand.push(...drawn);
    this.log(`${p.name} drew ${drawn.length} card${drawn.length === 1 ? '' : 's'}.`);
  }

  // ---- turn control ------------------------------------------------------
  get current() { return this.state.players[this.state.turn.seat]; }

  _assertTurn(seat) {
    if (this.state.phase !== 'playing') throw new Error('Game is not in play');
    if (this.state.pending) throw new Error('Resolve the current prompt first');
    if (seat !== this.state.turn.seat) throw new Error('It is not your turn');
  }

  _spendPlay(n = 1) {
    this.state.turn.playsRemaining -= n;
  }

  _findInHand(seat, uid) {
    const p = this.state.players[seat];
    const idx = p.hand.findIndex((c) => c.uid === uid);
    if (idx === -1) throw new Error('Card not in your hand');
    return idx;
  }

  // ---- plays -------------------------------------------------------------
  playMoney(seat, uid) {
    this._assertTurn(seat);
    if (this.state.turn.playsRemaining <= 0) throw new Error('No plays left this turn');
    const p = this.current;
    const idx = this._findInHand(seat, uid);
    const card = p.hand[idx];
    if (card.type === 'property' || card.type === 'wild') {
      throw new Error('Property cards cannot be banked as money');
    }
    p.hand.splice(idx, 1);
    p.bank.push(card);
    this._spendPlay();
    this.log(`${p.name} banked ${card.name} ($${cardValue(card)}M).`);
    this._afterPlay();
  }

  playProperty(seat, uid, color) {
    this._assertTurn(seat);
    if (this.state.turn.playsRemaining <= 0) throw new Error('No plays left this turn');
    const p = this.current;
    const idx = this._findInHand(seat, uid);
    const card = p.hand[idx];
    if (card.type !== 'property' && card.type !== 'wild') {
      throw new Error('That card is not a property');
    }
    const allowed = cardColors(card);
    const target = card.type === 'property' ? card.color : color;
    if (!target || !allowed.includes(target)) throw new Error('Invalid color for this property');
    p.hand.splice(idx, 1);
    this._placeProperty(p, card, target);
    this._spendPlay();
    this.log(`${p.name} played ${card.name} into ${COLORS[target].label}.`);
    this._afterPlay();
  }

  _placeProperty(player, card, color) {
    if (!player.sets[color]) player.sets[color] = { cards: [], house: false, hotel: false };
    card.assignedColor = (card.type === 'wild') ? color : undefined;
    player.sets[color].cards.push(card);
  }

  // Free action: move a wild between colors on your own turn.
  moveWild(seat, uid, toColor) {
    this._assertTurn(seat);
    const p = this.current;
    let found = null; let fromColor = null;
    for (const [color, set] of Object.entries(p.sets)) {
      const i = set.cards.findIndex((c) => c.uid === uid);
      if (i !== -1) { found = set.cards[i]; fromColor = color; break; }
    }
    if (!found || found.type !== 'wild') throw new Error('That is not one of your wild cards');
    if (!cardColors(found).includes(toColor)) throw new Error('That wild cannot be that color');
    // remove from old set
    const fromSet = p.sets[fromColor];
    fromSet.cards = fromSet.cards.filter((c) => c.uid !== uid);
    this._pruneSet(p, fromColor);
    this._placeProperty(p, found, toColor);
    this.log(`${p.name} moved a wild card to ${COLORS[toColor].label}.`);
    this._afterPlay(true);
  }

  // Remove an empty/now-invalid set container; detach buildings that no
  // longer sit on a complete set is handled at rent time, not here.
  _pruneSet(player, color) {
    const set = player.sets[color];
    if (!set) return;
    if (set.cards.length === 0) {
      // Buildings on an emptied set fall back to the bank as money.
      if (set.house) player.bank.push({ uid: this._spawnUid(), type: 'action', action: 'house', name: 'House', value: HOUSE_BONUS });
      if (set.hotel) player.bank.push({ uid: this._spawnUid(), type: 'action', action: 'hotel', name: 'Hotel', value: HOTEL_BONUS });
      delete player.sets[color];
    }
  }

  _spawnUid() {
    // Buildings that fall off a set need a fresh uid; keep it out of card-uid range.
    this._uidSeed = (this._uidSeed || 100000) + 1;
    return this._uidSeed;
  }

  playPassGo(seat, uid) {
    this._assertTurn(seat);
    if (this.state.turn.playsRemaining <= 0) throw new Error('No plays left this turn');
    const p = this.current;
    const idx = this._findInHand(seat, uid);
    const card = p.hand[idx];
    if (card.action !== 'pass_go') throw new Error('Not a Pass Go card');
    p.hand.splice(idx, 1);
    this.state.discard.push(card);
    const drawn = this._draw(2);
    p.hand.push(...drawn);
    this._spendPlay();
    this.log(`${p.name} played Pass Go and drew ${drawn.length} cards.`);
    this._afterPlay();
  }

  playBuilding(seat, uid, color) {
    this._assertTurn(seat);
    if (this.state.turn.playsRemaining <= 0) throw new Error('No plays left this turn');
    const p = this.current;
    const idx = this._findInHand(seat, uid);
    const card = p.hand[idx];
    if (card.action !== 'house' && card.action !== 'hotel') throw new Error('Not a building card');
    const set = p.sets[color];
    if (!set || !this._isComplete(color, set)) throw new Error('Buildings can only be added to a complete set');
    if (color === 'railroad' || color === 'utility') throw new Error('Houses/Hotels cannot be built on Railroad or Utility sets');
    if (card.action === 'house' && set.house) throw new Error('That set already has a house');
    if (card.action === 'hotel') {
      if (!set.house) throw new Error('A hotel needs a house first');
      if (set.hotel) throw new Error('That set already has a hotel');
    }
    p.hand.splice(idx, 1);
    if (card.action === 'house') set.house = true; else set.hotel = true;
    this._spendPlay();
    this.log(`${p.name} added a ${card.name} to their ${COLORS[color].label} set.`);
    this._afterPlay();
  }

  // ---- set / rent math ---------------------------------------------------
  _isComplete(color, set) {
    return set.cards.length >= COLORS[color].size;
  }

  // A set counts toward winning only if complete AND not made purely of
  // rainbow ("any") wilds.
  _countsForWin(color, set) {
    if (!this._isComplete(color, set)) return false;
    return set.cards.some((c) => !(c.type === 'wild' && c.colors === 'any'));
  }

  completeSetCount(player) {
    let n = 0;
    for (const [color, set] of Object.entries(player.sets)) {
      if (this._countsForWin(color, set)) n++;
    }
    return n;
  }

  rentFor(player, color) {
    const set = player.sets[color];
    if (!set || set.cards.length === 0) return 0;
    const def = COLORS[color];
    const count = Math.min(set.cards.length, def.size);
    let rent = def.rent[count - 1];
    if (this._isComplete(color, set)) {
      if (set.house) rent += HOUSE_BONUS;
      if (set.hotel) rent += HOTEL_BONUS;
    }
    return rent;
  }

  // ---- action cards that may be "Just Say No"-ed -------------------------
  playSlyDeal(seat, uid, targetSeat, targetCardUid) {
    this._assertTurn(seat);
    if (this.state.turn.playsRemaining <= 0) throw new Error('No plays left this turn');
    this._validateTarget(targetSeat, seat);
    const stolen = this._locateStealableProperty(targetSeat, targetCardUid, { allowFromComplete: false });
    const card = this._takeFromHand(seat, uid, 'sly_deal');
    this.state.discard.push(card);
    this._spendPlay();
    this.log(`${this.current.name} plays Sly Deal on ${this.state.players[targetSeat].name}.`);
    this._beginEffect({
      type: 'steal_property', initiator: seat, target: targetSeat, cardUid: targetCardUid,
    });
  }

  playForcedDeal(seat, uid, targetSeat, targetCardUid, myCardUid) {
    this._assertTurn(seat);
    if (this.state.turn.playsRemaining <= 0) throw new Error('No plays left this turn');
    this._validateTarget(targetSeat, seat);
    this._locateStealableProperty(targetSeat, targetCardUid, { allowFromComplete: false });
    this._locateStealableProperty(seat, myCardUid, { allowFromComplete: false });
    const card = this._takeFromHand(seat, uid, 'forced_deal');
    this.state.discard.push(card);
    this._spendPlay();
    this.log(`${this.current.name} plays Forced Deal on ${this.state.players[targetSeat].name}.`);
    this._beginEffect({
      type: 'swap_property', initiator: seat, target: targetSeat,
      theirCardUid: targetCardUid, myCardUid,
    });
  }

  playDealBreaker(seat, uid, targetSeat, color) {
    this._assertTurn(seat);
    if (this.state.turn.playsRemaining <= 0) throw new Error('No plays left this turn');
    this._validateTarget(targetSeat, seat);
    const set = this.state.players[targetSeat].sets[color];
    if (!set || !this._isComplete(color, set)) throw new Error('Deal Breaker needs a complete set to steal');
    const card = this._takeFromHand(seat, uid, 'deal_breaker');
    this.state.discard.push(card);
    this._spendPlay();
    this.log(`${this.current.name} plays Deal Breaker on ${this.state.players[targetSeat].name}'s ${COLORS[color].label} set!`);
    this._beginEffect({ type: 'steal_set', initiator: seat, target: targetSeat, color });
  }

  playDebtCollector(seat, uid, targetSeat) {
    this._assertTurn(seat);
    if (this.state.turn.playsRemaining <= 0) throw new Error('No plays left this turn');
    this._validateTarget(targetSeat, seat);
    const card = this._takeFromHand(seat, uid, 'debt_collector');
    this.state.discard.push(card);
    this._spendPlay();
    this.log(`${this.current.name} plays Debt Collector on ${this.state.players[targetSeat].name} ($5M).`);
    this._beginEffect({ type: 'collect', initiator: seat, target: targetSeat, amount: 5 });
  }

  playBirthday(seat, uid) {
    this._assertTurn(seat);
    if (this.state.turn.playsRemaining <= 0) throw new Error('No plays left this turn');
    const card = this._takeFromHand(seat, uid, 'birthday');
    this.state.discard.push(card);
    this._spendPlay();
    this.log(`${this.current.name} plays It's My Birthday — everyone pays $2M!`);
    const effects = [];
    for (const p of this.state.players) {
      if (p.seat !== seat) effects.push({ type: 'collect', initiator: seat, target: p.seat, amount: 2 });
    }
    this._beginEffects(effects);
  }

  playRent(seat, uid, color, targetSeat, doubleUids = []) {
    this._assertTurn(seat);
    const p = this.current;
    const idx = this._findInHand(seat, uid);
    const card = p.hand[idx];
    if (card.type !== 'rent') throw new Error('Not a rent card');
    const allowedColors = card.wild ? Object.keys(COLORS) : card.colors;
    if (!allowedColors.includes(color)) throw new Error('That color is not on this rent card');
    const rent = this.rentFor(p, color);
    if (rent <= 0) throw new Error('You have no properties of that color to charge rent for');
    // Double the Rent stacking.
    const doubles = [];
    for (const dUid of doubleUids) {
      const di = p.hand.findIndex((c) => c.uid === dUid && c.action === 'double_rent');
      if (di === -1) throw new Error('Double The Rent card not in hand');
      doubles.push(p.hand[di]);
    }
    const playsNeeded = 1 + doubles.length;
    if (this.state.turn.playsRemaining < playsNeeded) {
      throw new Error(`Need ${playsNeeded} plays for this rent; only ${this.state.turn.playsRemaining} left`);
    }
    const amount = rent * Math.pow(2, doubles.length);

    // remove cards
    p.hand.splice(idx, 1);
    this.state.discard.push(card);
    for (const d of doubles) {
      p.hand = p.hand.filter((c) => c.uid !== d.uid);
      this.state.discard.push(d);
    }
    this._spendPlay(playsNeeded);

    const multiplierNote = doubles.length ? ` (x${Math.pow(2, doubles.length)} from Double The Rent)` : '';
    if (card.wild) {
      this._validateTarget(targetSeat, seat);
      this.log(`${p.name} charges ${this.state.players[targetSeat].name} $${amount}M rent on ${COLORS[color].label}${multiplierNote}.`);
      this._beginEffect({ type: 'collect', initiator: seat, target: targetSeat, amount });
    } else {
      this.log(`${p.name} charges everyone $${amount}M rent on ${COLORS[color].label}${multiplierNote}.`);
      const effects = [];
      for (const other of this.state.players) {
        if (other.seat !== seat) effects.push({ type: 'collect', initiator: seat, target: other.seat, amount });
      }
      this._beginEffects(effects);
    }
  }

  _validateTarget(targetSeat, seat) {
    const t = this.state.players[targetSeat];
    if (!t) throw new Error('No such player');
    if (targetSeat === seat) throw new Error('You cannot target yourself');
  }

  _takeFromHand(seat, uid, expectedAction) {
    const p = this.state.players[seat];
    const idx = p.hand.findIndex((c) => c.uid === uid);
    if (idx === -1) throw new Error('Card not in your hand');
    if (expectedAction && p.hand[idx].action !== expectedAction) throw new Error('Unexpected card');
    return p.hand.splice(idx, 1)[0];
  }

  // Validate a property can be stolen (Sly/Forced cannot pull from a complete set).
  _locateStealableProperty(seat, cardUid, { allowFromComplete }) {
    const player = this.state.players[seat];
    for (const [color, set] of Object.entries(player.sets)) {
      const card = set.cards.find((c) => c.uid === cardUid);
      if (card) {
        if (!allowFromComplete && this._isComplete(color, set)) {
          throw new Error('That property is part of a complete set and cannot be taken this way');
        }
        return { color, set, card };
      }
    }
    throw new Error('Target does not have that property');
  }

  // ---- Just-Say-No duel & effect resolution ------------------------------
  _beginEffect(effect) { this._beginEffects([effect]); }

  _beginEffects(effects) {
    this.state.queue = effects;
    this._startNextEffect();
  }

  _startNextEffect() {
    const s = this.state;
    if (s.queue.length === 0) { this._afterPlay(); return; }
    const effect = s.queue.shift();
    // Set up a JSN duel: the target may respond first.
    s.pending = {
      kind: 'jsn',
      initiator: effect.initiator,
      target: effect.target,
      responder: effect.target,
      jsnCount: 0,
      effect,
    };
    this.touch();
    // If the responder is disconnected, auto-allow immediately.
    this._autoResolveIfWaitingOn(effect.target);
  }

  respondJustSayNo(seat, useJSN) {
    const s = this.state;
    const pending = s.pending;
    if (!pending || pending.kind !== 'jsn') throw new Error('Nothing to respond to');
    if (seat !== pending.responder) throw new Error('It is not your response');
    const p = s.players[seat];
    if (useJSN) {
      const idx = p.hand.findIndex((c) => c.action === 'just_say_no');
      if (idx === -1) throw new Error('You have no Just Say No card');
      const card = p.hand.splice(idx, 1)[0];
      s.discard.push(card);
      pending.jsnCount++;
      this.log(`${p.name} plays Just Say No!`);
      // Switch responder to the other party so they may counter.
      pending.responder = (seat === pending.initiator) ? pending.target : pending.initiator;
      this.touch();
      this._autoResolveIfWaitingOn(pending.responder);
    } else {
      // Duel ends. Even count => effect applies; odd => cancelled.
      const applies = pending.jsnCount % 2 === 0;
      const effect = pending.effect;
      s.pending = null;
      if (applies) {
        this._applyEffect(effect);
      } else {
        this.log('The action was cancelled by Just Say No.');
        this._startNextEffect();
      }
    }
  }

  _applyEffect(effect) {
    const s = this.state;
    const initiator = s.players[effect.initiator];
    const target = s.players[effect.target];
    if (effect.type === 'steal_property') {
      const { color, set, card } = this._locateStealableProperty(effect.target, effect.cardUid, { allowFromComplete: false });
      set.cards = set.cards.filter((c) => c.uid !== card.uid);
      this._pruneSet(target, color);
      this._giveProperty(initiator, card);
      this.log(`${initiator.name} stole ${card.name} from ${target.name}.`);
      this._afterApply();
    } else if (effect.type === 'swap_property') {
      const mine = this._locateStealableProperty(effect.initiator, effect.myCardUid, { allowFromComplete: false });
      const theirs = this._locateStealableProperty(effect.target, effect.theirCardUid, { allowFromComplete: false });
      mine.set.cards = mine.set.cards.filter((c) => c.uid !== mine.card.uid);
      theirs.set.cards = theirs.set.cards.filter((c) => c.uid !== theirs.card.uid);
      this._pruneSet(initiator, mine.color);
      this._pruneSet(target, theirs.color);
      this._giveProperty(initiator, theirs.card);
      this._giveProperty(target, mine.card);
      this.log(`${initiator.name} swapped ${mine.card.name} for ${target.name}'s ${theirs.card.name}.`);
      this._afterApply();
    } else if (effect.type === 'steal_set') {
      const set = target.sets[effect.color];
      if (set) {
        const cards = set.cards.slice();
        const hadHouse = set.house; const hadHotel = set.hotel;
        delete target.sets[effect.color];
        if (!initiator.sets[effect.color]) initiator.sets[effect.color] = { cards: [], house: false, hotel: false };
        for (const c of cards) {
          if (c.type === 'wild') c.assignedColor = effect.color;
          initiator.sets[effect.color].cards.push(c);
        }
        if (hadHouse) initiator.sets[effect.color].house = initiator.sets[effect.color].house || true;
        if (hadHotel) initiator.sets[effect.color].hotel = initiator.sets[effect.color].hotel || true;
        this.log(`${initiator.name} stole ${target.name}'s entire ${COLORS[effect.color].label} set!`);
      }
      this._afterApply();
    } else if (effect.type === 'collect') {
      this._beginPayment(effect.target, effect.initiator, effect.amount);
    }
  }

  // After a steal/swap apply, check win then continue queue.
  _afterApply() {
    if (this._checkWin()) return;
    this._startNextEffect();
  }

  _giveProperty(player, card) {
    // Auto-place into the best color; wilds can be re-assigned by the owner.
    let color;
    if (card.type === 'property') {
      color = card.color;
    } else if (card.type === 'wild') {
      const options = cardColors(card);
      // Prefer a color the player already has, choosing the most-progressed.
      color = options
        .map((c) => ({ c, n: player.sets[c] ? player.sets[c].cards.length : 0 }))
        .sort((a, b) => b.n - a.n)[0].c;
    } else {
      player.bank.push(card);
      return;
    }
    this._placeProperty(player, card, color);
  }

  // ---- payments ----------------------------------------------------------
  _beginPayment(debtorSeat, creditorSeat, amount) {
    const debtor = this.state.players[debtorSeat];
    const totalAssets = this._assetValue(debtor);
    if (amount <= 0 || totalAssets === 0) {
      // Nothing to pay or nothing to pay with.
      if (totalAssets === 0 && amount > 0) {
        this.log(`${debtor.name} has nothing to pay with.`);
      }
      this._startNextEffect();
      return;
    }
    this.state.pending = {
      kind: 'payment',
      debtor: debtorSeat,
      creditor: creditorSeat,
      amount,
      mustPayAll: totalAssets <= amount, // can't reach the debt: hand over everything
    };
    this.touch();
    this._autoResolveIfWaitingOn(debtorSeat);
  }

  _assetValue(player) {
    let v = 0;
    for (const c of player.bank) v += cardValue(c);
    for (const set of Object.values(player.sets)) {
      for (const c of set.cards) v += cardValue(c);
    }
    return v;
  }

  // List every payable asset (bank + property cards). Buildings stay put.
  _payableAssets(player) {
    const assets = [];
    for (const c of player.bank) assets.push({ card: c, from: 'bank' });
    for (const [color, set] of Object.entries(player.sets)) {
      for (const c of set.cards) assets.push({ card: c, from: 'set', color });
    }
    return assets;
  }

  submitPayment(seat, uids) {
    const s = this.state;
    const pending = s.pending;
    if (!pending || pending.kind !== 'payment') throw new Error('No payment is due');
    if (seat !== pending.debtor) throw new Error('This payment is not yours to make');
    const debtor = s.players[seat];
    const creditor = s.players[pending.creditor];
    const assets = this._payableAssets(debtor);
    const chosen = [];
    for (const uid of uids) {
      const a = assets.find((x) => x.card.uid === uid);
      if (!a) throw new Error('You do not own one of those cards');
      chosen.push(a);
    }
    const chosenValue = chosen.reduce((sum, a) => sum + cardValue(a.card), 0);
    if (pending.mustPayAll) {
      if (chosen.length !== assets.length) throw new Error('You must hand over everything you have');
    } else if (chosenValue < pending.amount) {
      throw new Error(`That only adds up to $${chosenValue}M; you owe $${pending.amount}M`);
    }
    // Transfer.
    for (const a of chosen) {
      if (a.from === 'bank') {
        debtor.bank = debtor.bank.filter((c) => c.uid !== a.card.uid);
      } else {
        const set = debtor.sets[a.color];
        set.cards = set.cards.filter((c) => c.uid !== a.card.uid);
      }
      this._receivePayment(creditor, a.card);
    }
    for (const color of Object.keys(debtor.sets)) this._pruneSet(debtor, color);
    this.log(`${debtor.name} paid ${creditor.name} $${chosenValue}M.`);
    s.pending = null;
    if (this._checkWin()) return;
    this._startNextEffect();
  }

  _receivePayment(creditor, card) {
    if (card.type === 'property' || card.type === 'wild') {
      this._giveProperty(creditor, card);
    } else {
      creditor.bank.push(card);
    }
  }

  // ---- auto-resolution for disconnected players --------------------------
  _autoResolveIfWaitingOn(seat) {
    const s = this.state;
    if (!s.pending) return;
    const p = s.players[seat];
    if (!p || p.connected) return;
    if (s.pending.kind === 'jsn' && s.pending.responder === seat) {
      // Disconnected players never play Just Say No.
      this.respondJustSayNo(seat, false);
    } else if (s.pending.kind === 'payment' && s.pending.debtor === seat) {
      // Auto-pay greedily so the game never deadlocks.
      const uids = this._autoSelectPayment(p, s.pending.amount, s.pending.mustPayAll);
      this.submitPayment(seat, uids);
    } else if (s.pending.kind === 'discard' && s.pending.seat === seat) {
      const uids = p.hand.slice(0, s.pending.count).map((c) => c.uid);
      this.discard(seat, uids);
    }
  }

  _autoSelectPayment(player, amount, mustPayAll) {
    const assets = this._payableAssets(player);
    if (mustPayAll) return assets.map((a) => a.card.uid);
    // Greedy: pay with bank money first (largest first), then properties,
    // preferring to keep the player from over-paying too wildly.
    assets.sort((a, b) => cardValue(b.card) - cardValue(a.card));
    const chosen = [];
    let total = 0;
    for (const a of assets) {
      if (total >= amount) break;
      chosen.push(a.card.uid);
      total += cardValue(a.card);
    }
    return chosen;
  }

  // ---- end of turn -------------------------------------------------------
  endTurn(seat) {
    const s = this.state;
    if (s.phase !== 'playing') throw new Error('Game is not in play');
    if (s.pending) throw new Error('Resolve the current prompt first');
    if (seat !== s.turn.seat) throw new Error('It is not your turn');
    const p = this.current;
    if (p.hand.length > HAND_LIMIT) {
      s.pending = { kind: 'discard', seat, count: p.hand.length - HAND_LIMIT };
      this.log(`${p.name} must discard down to ${HAND_LIMIT} cards.`);
      this.touch();
      return;
    }
    this._advanceTurn();
  }

  discard(seat, uids) {
    const s = this.state;
    const pending = s.pending;
    if (!pending || pending.kind !== 'discard') throw new Error('No discard is required');
    if (seat !== pending.seat) throw new Error('Not your discard');
    if (uids.length !== pending.count) throw new Error(`You must discard exactly ${pending.count} card(s)`);
    const p = s.players[seat];
    for (const uid of uids) {
      const idx = p.hand.findIndex((c) => c.uid === uid);
      if (idx === -1) throw new Error('Card not in hand');
      s.discard.push(p.hand.splice(idx, 1)[0]);
    }
    this.log(`${p.name} discarded ${uids.length} card(s).`);
    s.pending = null;
    this._advanceTurn();
  }

  _advanceTurn() {
    const s = this.state;
    const n = s.players.length;
    let next = (s.turn.seat + 1) % n;
    s.turn = { seat: next, playsRemaining: PLAYS_PER_TURN };
    this._beginTurnDraw();
    this.touch();
  }

  // ---- win ---------------------------------------------------------------
  _checkWin() {
    for (const p of this.state.players) {
      if (this.completeSetCount(p) >= WIN_SETS) {
        this.state.phase = 'finished';
        this.state.winnerSeat = p.seat;
        this.state.pending = null;
        this.state.queue = [];
        this.log(`🎉 ${p.name} wins with ${WIN_SETS} complete sets!`);
        this.touch();
        return true;
      }
    }
    return false;
  }

  // Called after a normal play; checks win and (if no plays/cards) nothing else.
  _afterPlay(free = false) {
    if (this._checkWin()) return;
    this.touch();
  }

  // ---- host controls -----------------------------------------------------
  skipDisconnected(bySeat) {
    const s = this.state;
    if (s.phase !== 'playing') throw new Error('Not in play');
    const requester = s.players[bySeat];
    if (!requester || !requester.isHost) throw new Error('Only the host can skip');
    const cur = this.current;
    if (cur.connected) throw new Error('The current player is connected');
    if (s.pending) { this._autoResolveIfWaitingOn(cur.seat); return; }
    this.log(`Host skipped ${cur.name}'s turn (disconnected).`);
    this._advanceTurn();
  }

  // Is the game stalled waiting on a disconnected player's whole turn?
  isPausedForDisconnect() {
    const s = this.state;
    if (s.phase !== 'playing' || s.pending) return false;
    return !this.current.connected;
  }

  // ---- client-facing view (hides hidden info) ----------------------------
  publicState(forSeat) {
    const s = this.state;
    const players = s.players.map((p) => ({
      seat: p.seat,
      name: p.name,
      connected: p.connected,
      isHost: p.isHost,
      handCount: p.hand.length,
      bank: p.bank,
      bankValue: p.bank.reduce((sum, c) => sum + cardValue(c), 0),
      sets: this._publicSets(p),
      completeSets: this.completeSetCount(p),
      isWinner: s.winnerSeat === p.seat,
    }));
    const me = s.players[forSeat];
    return {
      phase: s.phase,
      version: s.version,
      yourSeat: forSeat,
      yourHand: me ? me.hand : [],
      players,
      turn: s.turn,
      deckCount: s.deck.length,
      discardCount: s.discard.length,
      discardTop: s.discard.length ? s.discard[s.discard.length - 1] : null,
      pending: this._publicPending(forSeat),
      paused: this.isPausedForDisconnect(),
      winnerSeat: s.winnerSeat,
      log: s.log.slice(-40),
      maxPlayers: MAX_PLAYERS,
      minPlayers: MIN_PLAYERS,
    };
  }

  _publicSets(player) {
    const out = {};
    for (const [color, set] of Object.entries(player.sets)) {
      out[color] = {
        cards: set.cards,
        house: set.house,
        hotel: set.hotel,
        complete: this._isComplete(color, set),
        size: COLORS[color].size,
        rent: this.rentFor(player, color),
      };
    }
    return out;
  }

  _publicPending(forSeat) {
    const s = this.state;
    if (!s.pending) return null;
    const pending = s.pending;
    if (pending.kind === 'jsn') {
      return {
        kind: 'jsn',
        initiator: pending.initiator,
        target: pending.target,
        responder: pending.responder,
        jsnCount: pending.jsnCount,
        // describe the action so everyone can follow along
        description: this._describeEffect(pending.effect),
        yourMove: pending.responder === forSeat,
      };
    }
    if (pending.kind === 'payment') {
      return {
        kind: 'payment',
        debtor: pending.debtor,
        creditor: pending.creditor,
        amount: pending.amount,
        mustPayAll: pending.mustPayAll,
        yourMove: pending.debtor === forSeat,
      };
    }
    if (pending.kind === 'discard') {
      return { kind: 'discard', seat: pending.seat, count: pending.count, yourMove: pending.seat === forSeat };
    }
    return null;
  }

  _describeEffect(effect) {
    const t = this.state.players[effect.target] ? this.state.players[effect.target].name : '?';
    const i = this.state.players[effect.initiator] ? this.state.players[effect.initiator].name : '?';
    switch (effect.type) {
      case 'steal_property': return `${i} is trying to Sly Deal a property from ${t}`;
      case 'swap_property': return `${i} is trying to Forced Deal a property swap with ${t}`;
      case 'steal_set': return `${i} is trying to Deal Breaker ${t}'s ${COLORS[effect.color].label} set`;
      case 'collect': return `${i} is charging ${t} $${effect.amount}M`;
      default: return 'An action is being resolved';
    }
  }
}

module.exports = { Game, MAX_PLAYERS, MIN_PLAYERS, HAND_LIMIT, PLAYS_PER_TURN, WIN_SETS };
