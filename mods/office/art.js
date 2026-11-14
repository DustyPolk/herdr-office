// The office's pixel art: sprites drawn with PixelLab, kept in assets/ and listed in
// sprites.js (both built from art/ by tools/build-assets.py). This file knows where the
// pictures are, how big they are, and how the pieces of a desk fit together.
import { div, image } from "gpui-kit";
import { SIZE, ANIM, CAST, LIVE } from "./sprites.js";

export { SIZE, CAST };

// px per art unit, and per sprite pixel (half a unit). The scene sets them from its height.
export let P = 4;
export let S = 2;
export const setScale = (p) => { P = p; S = p / 2; };

const file = (name, ext) => `mods/office/assets/${name}.${ext}`;

// Size of a still in px.
export const w = (name, s = S) => SIZE[name][0] * s;
export const h = (name, s = S) => SIZE[name][1] * s;

// A still with its bottom-left corner at (x, bottom). "<name>-l" is the same sprite facing left.
export function still(name, x, bottom, s = S) {
  const [sw, sh] = SIZE[name] ?? SIZE[name.slice(0, -2)];
  return image(file(name, LIVE.includes(name) ? "webp" : "png")).absolute().left(x).top(bottom - sh * s).w(sw * s).h(sh * s);
}

// A looping animation, the point between its feet at (x, y).
export function clip(name, x, y, s = S) {
  const [cw, ch, dx, dy] = ANIM[name];
  return image(file(name, "webp")).absolute().left(x + dx * s).top(y + dy * s).w(cw * s).h(ch * s);
}

// Everyone is drawn in a box this big (sprite px), standing on the middle of its bottom edge.
export const BOX_W = 48;
export const BOX_H = 60;
export const HEAD = 48; // how tall a person stands

// A person doing something: "walk", "walk-l", "drink", "drink-l", "type", "cheer", "help", "nap".
export function actor(who, doing, s = S) {
  const name = `p-${who}-${doing}`;
  if (ANIM[name]) return clip(name, (BOX_W / 2) * s, BOX_H * s, s);
  return still(`p-${who}`, ((BOX_W - SIZE[`p-${who}`][0]) / 2) * s, BOX_H * s, s);
}

// The office cat, drawn a little smaller than it was painted so it's cat-sized next to
// people, in a box CAT_W wide with its feet on the bottom edge.
export const CAT_SCALE = 0.75;
export const CAT_W = 38;
export const CAT_H = 36;
export const kitty = (doing) => clip(`cat-${doing}`, (CAT_W / 2) * S, CAT_H * S, S * CAT_SCALE);

export const SLOT = 48; // units per desk

// A desk, in sprite px from its slot's left edge and the floor. The chair stands at the
// slot's left edge with the desk beside it, the way the old office had it.
export const DESK = {
  x: 26, // the desk's left edge
  monitor: 30, // the monitor's left edge, from the desk's left edge
  screen: [3, 23, 23, 14], // x, y up from the monitor's foot, w, h
  lip: 5, // the desk surface, below the sprite's top edge
};
export const CHAIR = {
  seat: 14, // the middle of the seat, where its person is
  rise: 12, // how far up they are when sitting in it, feet off the floor
};
export const DESKS = ["desk-wood-xl", "desk-pink-xl", "desk-mint-xl", "desk-blue-xl", "desk-lilac-xl", "desk-butter-xl"];
export const CHAIRS = ["chair-side-pink", "chair-side-sky", "chair-side-mint", "chair-side-butter"];
export const MONITORS = ["monitor-white", "monitor-pink"];
// Something small on top of every monitor.
export const TOYS = [
  "t-duck", "t-succulent", "t-bunny", "t-dino", "t-cactus", "t-snowglobe", "t-bear", "t-robot", "t-fishbowl",
  "t-sprout", "t-gumball", "t-apple", "t-alarmclock", "t-cupcake", "t-piggy", "t-globe", "t-boba", "t-candle",
];
export const deskOf = (i) => DESKS[i % DESKS.length];
// The desk's surface, in px above the floor.
export const surface = (i) => (SIZE[deskOf(i)][1] - DESK.lip) * S;

// Mugs by agent program: who drinks from what.
export const MUGS = { claude: "t-mug-claude", codex: "t-mug-codex", gemini: "t-mug-gemini", cursor: "t-mug-cursor", opencode: "t-mug-opencode", amp: "t-mug-amp" };

// Sub-agents are small animals in neckties.
export const INTERNS = [
  "chick", "duck", "bunny", "hamster", "frog", "penguin", "hedgehog", "redpanda", "shiba", "piglet", "bear", "mouse",
  "owl", "otter", "fox", "raccoon", "sheep", "monkey", "squirrel", "lion", "elephant", "giraffe", "deer", "cow",
  "panda", "tiger", "koala", "sloth", "kangaroo", "beaver", "wolf", "goat", "axolotl", "dino", "unicorn", "turtle",
  "dragon", "bluebird", "meerkat", "capybara", "dalmatian", "pug", "husky", "croc", "donkey", "camel", "chipmunk",
  "rockhopper", "alpaca",
];

export function hashOf(address) {
  let n = 2166136261;
  for (const ch of address) n = Math.imul(n ^ ch.charCodeAt(0), 16777619) >>> 0;
  return n;
}
export const internOf = (address) => `i-${INTERNS[hashOf(address) % INTERNS.length]}`;

// An empty box the size of a person, for the scene to fill.
export const box = () => div().absolute().w(BOX_W * S).h(BOX_H * S);
