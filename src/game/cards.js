'use strict';

// ---------------------------------------------------------------------------
// Monopoly Deal card data.
//
// All counts, colors, rent tables and money values are defined here so the
// deck composition is auditable in one place. See NOTES.md for the exact
// composition we ship and the (well-documented) places where published
// sources disagree.
// ---------------------------------------------------------------------------

// The ten property colors. `size` is how many cards complete the set.
// `rent` is the rent charged for owning 1, 2, 3, ... cards of that color.
// `value` is the card's bank/payment value (used when given as payment).
const COLORS = {
  brown:     { label: 'Brown',      size: 2, rent: [1, 2],          value: 1, hex: '#8B5A2B' },
  lightblue: { label: 'Light Blue', size: 3, rent: [1, 2, 3],       value: 1, hex: '#AEE4F4' },
  pink:      { label: 'Pink',       size: 3, rent: [1, 2, 4],       value: 2, hex: '#D6479B' },
  orange:    { label: 'Orange',     size: 3, rent: [1, 3, 5],       value: 2, hex: '#E8861E' },
  red:       { label: 'Red',        size: 3, rent: [2, 3, 6],       value: 3, hex: '#D62B2B' },
  yellow:    { label: 'Yellow',     size: 3, rent: [2, 4, 6],       value: 3, hex: '#F2C600' },
  green:     { label: 'Green',      size: 3, rent: [2, 4, 7],       value: 4, hex: '#1FA855' },
  blue:      { label: 'Dark Blue',  size: 2, rent: [3, 8],          value: 4, hex: '#2453B5' },
  railroad:  { label: 'Railroad',   size: 4, rent: [1, 2, 3, 4],    value: 2, hex: '#222222' },
  utility:   { label: 'Utility',    size: 2, rent: [1, 2],          value: 2, hex: '#9AA017' },
};

// The 28 standard property cards (name -> color).
const PROPERTIES = [
  // Brown (2)
  ['Mediterranean Avenue', 'brown'],
  ['Baltic Avenue', 'brown'],
  // Light Blue (3)
  ['Oriental Avenue', 'lightblue'],
  ['Vermont Avenue', 'lightblue'],
  ['Connecticut Avenue', 'lightblue'],
  // Pink (3)
  ['St. Charles Place', 'pink'],
  ['States Avenue', 'pink'],
  ['Virginia Avenue', 'pink'],
  // Orange (3)
  ['St. James Place', 'orange'],
  ['Tennessee Avenue', 'orange'],
  ['New York Avenue', 'orange'],
  // Red (3)
  ['Kentucky Avenue', 'red'],
  ['Indiana Avenue', 'red'],
  ['Illinois Avenue', 'red'],
  // Yellow (3)
  ['Atlantic Avenue', 'yellow'],
  ['Ventnor Avenue', 'yellow'],
  ['Marvin Gardens', 'yellow'],
  // Green (3)
  ['Pacific Avenue', 'green'],
  ['North Carolina Avenue', 'green'],
  ['Pennsylvania Avenue', 'green'],
  // Dark Blue (2)
  ['Park Place', 'blue'],
  ['Boardwalk', 'blue'],
  // Railroad (4)
  ['Reading Railroad', 'railroad'],
  ['Pennsylvania Railroad', 'railroad'],
  ['B. & O. Railroad', 'railroad'],
  ['Short Line', 'railroad'],
  // Utility (2)
  ['Electric Company', 'utility'],
  ['Water Works', 'utility'],
];

// 11 property wildcards. Two-color wilds carry a bank value; the two
// "rainbow" (any-color) wilds have no rent of their own and no bank value.
const WILD_PROPERTIES = [
  { colors: ['pink', 'orange'], count: 2 },
  { colors: ['red', 'yellow'], count: 2 },
  { colors: ['lightblue', 'brown'], count: 1 },
  { colors: ['lightblue', 'railroad'], count: 1 },
  { colors: ['blue', 'green'], count: 1 },
  { colors: ['green', 'railroad'], count: 1 },
  { colors: ['railroad', 'utility'], count: 1 },
  { colors: 'any', count: 2 }, // rainbow wilds
];

// Money cards: denomination -> count. 20 cards total.
const MONEY = [
  { value: 1, count: 6 },
  { value: 2, count: 5 },
  { value: 3, count: 3 },
  { value: 4, count: 3 },
  { value: 5, count: 2 },
  { value: 10, count: 1 },
];

// Rent cards: 13 total. Two-color rents hit every opponent; the "any" wild
// rent hits a single opponent of the player's choosing.
const RENTS = [
  { colors: ['brown', 'lightblue'], value: 1, count: 2 },
  { colors: ['pink', 'orange'], value: 1, count: 2 },
  { colors: ['red', 'yellow'], value: 1, count: 2 },
  { colors: ['green', 'blue'], value: 1, count: 2 },
  { colors: ['railroad', 'utility'], value: 1, count: 2 },
  { colors: 'any', value: 3, count: 3 },
];

// Action cards: type -> { value (bank value), count }.
// Pass Go is the generic filler; see NOTES.md for the deck-total reconciliation.
const ACTIONS = {
  pass_go:       { label: 'Pass Go',        value: 1, count: 12 },
  deal_breaker:  { label: 'Deal Breaker',   value: 5, count: 2 },
  just_say_no:   { label: 'Just Say No',    value: 4, count: 3 },
  sly_deal:      { label: 'Sly Deal',       value: 3, count: 3 },
  forced_deal:   { label: 'Forced Deal',    value: 3, count: 4 },
  debt_collector:{ label: 'Debt Collector', value: 3, count: 3 },
  birthday:      { label: "It's My Birthday",value: 2, count: 3 },
  double_rent:   { label: 'Double The Rent',value: 1, count: 2 },
  house:         { label: 'House',          value: 3, count: 3 },
  hotel:         { label: 'Hotel',          value: 4, count: 3 },
};

// Bonus added to a *complete* set's rent.
const HOUSE_BONUS = 3;
const HOTEL_BONUS = 4;

// Build the full deck as an array of card objects, each with a unique `uid`.
function buildDeck() {
  const cards = [];
  let uid = 0;
  const add = (card) => { cards.push({ uid: uid++, ...card }); };

  for (const [name, color] of PROPERTIES) {
    add({ type: 'property', name, color, value: COLORS[color].value });
  }

  for (const w of WILD_PROPERTIES) {
    for (let i = 0; i < w.count; i++) {
      const isRainbow = w.colors === 'any';
      add({
        type: 'wild',
        name: isRainbow ? 'Property Wild (any color)' : `${COLORS[w.colors[0]].label}/${COLORS[w.colors[1]].label} Wild`,
        colors: w.colors,
        value: isRainbow ? 0 : Math.max(...w.colors.map((c) => COLORS[c].value)),
      });
    }
  }

  for (const m of MONEY) {
    for (let i = 0; i < m.count; i++) {
      add({ type: 'money', name: `$${m.value}M`, value: m.value });
    }
  }

  for (const r of RENTS) {
    for (let i = 0; i < r.count; i++) {
      const isWild = r.colors === 'any';
      add({
        type: 'rent',
        name: isWild ? 'Rent (any color)' : `Rent: ${r.colors.map((c) => COLORS[c].label).join(' / ')}`,
        colors: r.colors,
        value: r.value,
        wild: isWild,
      });
    }
  }

  for (const [action, def] of Object.entries(ACTIONS)) {
    for (let i = 0; i < def.count; i++) {
      add({ type: 'action', action, name: def.label, value: def.value });
    }
  }

  return cards;
}

// The bank/payment value of any card (properties included).
function cardValue(card) {
  return typeof card.value === 'number' ? card.value : 0;
}

// Which colors a property-like card can occupy.
function cardColors(card) {
  if (card.type === 'property') return [card.color];
  if (card.type === 'wild') return card.colors === 'any' ? Object.keys(COLORS) : card.colors;
  return [];
}

module.exports = {
  COLORS,
  PROPERTIES,
  WILD_PROPERTIES,
  MONEY,
  RENTS,
  ACTIONS,
  HOUSE_BONUS,
  HOTEL_BONUS,
  buildDeck,
  cardValue,
  cardColors,
};
