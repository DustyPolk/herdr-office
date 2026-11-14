// The office: every agent is a coworker with a desk of their own. Working: typing.
// Idle: they walk to the water cooler and chat; idle long enough, they nap on the couch.
// Blocked: hand up at their desk (five minutes and the fire alarm goes). Done: cheering in
// confetti until you look. New agents come in the door; closed ones leave with a box.
// Sub-agents sit by their parent's desk as interns and graduate when they finish.
// Three finishes in five minutes and pizza arrives. A cat lives here. Lights go down after
// dark, the windows show the real weather, and the office decorates for the season.
// Hover anyone to see what they're working on; click them to go to their terminal.
import { View, div, svg } from "gpui-kit";
import { agents, terminals, spaces, panes, shared, run, setAgentOrder } from "herdr";
import * as A from "./art.js";
import * as D from "./decor.js";

// Real weather in the windows. Off by default: it sends your IP address to ipapi.co for a
// rough location, then asks Open-Meteo for the current conditions there.
const WEATHER = false;
const WALK_SPEED = 0.16; // px per ms
const CAT_SPEED = 0.12;
const NAP_AFTER = 10 * 60 * 1000;
const ALARM_AFTER = 5 * 60 * 1000;
const SWEAT_AFTER = 30 * 60 * 1000;
const MUGS_AFTER = 60 * 60 * 1000;
const PARTY_FINISHES = 3, PARTY_WINDOW = 5 * 60 * 1000, PARTY_LENGTH = 8 * 60 * 1000;
const GRAD_BOW = 2500;
const COUCH_SEATS = 2;
const MIN_DESKS = 3;
const FRONT_ROW = 6;
const DAY = 86400000;
const CHAT = ["…", "☕", "lgtm", "standup?", "🍩", "ship it", "nice", "brb", "tabs > spaces", "🎉", "coffee?", "hmm"];
const PIZZA_CHAT = ["🍕", "nom", "pizza!", "🍕", "best day", "nom nom"];
const CODE = ["#7fd1b9", "#f2b866", "#9aa8ff", "#e88fb0"];
const CONFETTI = ["#e05252", "#e0b43d", "#58b368", "#3d8be0", "#9b6bdc", "#e05c8c"];
// Pictures on the wall; some have something to say.
const PICTURES = [["pic-boat", "SHIP IT"], ["pic-cat"], ["pic-rocket", "LGTM"], ["pic-rainbow"], ["pic-heart", "BE KIND TO\nYOUR AGENTS"], ["pic-sun"], ["pic-duck", "push --force?\nno."], ["pic-pizza"]];
// What fills the wall either side of the room when the strip is wide, in this order.
const WALL_FURNITURE = ["bookshelf", "fishtank", "claw", "vending", "fridge", "arcade", "lemontree", "printer", "snackcart", "coatrack", "armchair", "globe", "bonsai", "teatable", "catbox", "palm"];
const HANGING = ["hang-ivy", "hang-pink"];
const COURIER = "courier";
// Boxes, in sprite px: how far above the floor a desk's box reaches, and an intern's box.
const DESK_TOP = 96;
const INTERN_W = 30, INTERN_H = 44;
const STATUS = { working: "#3d8be0", blocked: "#e05252", done: "#58c26b", idle: "#9aa0aa" };
// The sidebar's space colors (mods/my-spaces), by stored name.
const MARK = { ansi6: "#22a99a", ansi3: "#e3814f", ansi4: "#5b8def", ansi5: "#8b7cf6", ansi2: "#3fae6a", ansi1: "#d9649a" };

function sky(hour) {
  if (hour < 5 || hour >= 21) return { top: "#141c38", bottom: "#2a3766", stars: true };
  if (hour < 7) return { top: "#9cc3e6", bottom: "#f4b98a" };
  if (hour < 17) return { top: "#7fc4f0", bottom: "#c4e6f8" };
  if (hour < 19) return { top: "#f7c98b", bottom: "#f29a6b" };
  return { top: "#3a3a6e", bottom: "#e07a5f" };
}
const lightsDown = (hour) => hour >= 20 || hour < 6;

// WMO weather codes (Open-Meteo) to what the windows show.
function weatherKind(code) {
  if (code >= 95) return "storm";
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "snow";
  if (code >= 51) return "rain";
  if (code === 45 || code === 48) return "fog";
  if (code >= 2) return "clouds";
  return "clear";
}

function season(d) {
  const m = d.getMonth(), day = d.getDate();
  if ((m === 11 && day === 31) || (m === 0 && day <= 2)) return "newyear";
  if (m === 11) return "winter";
  if (m === 9 || (m === 10 && day <= 7)) return "halloween";
  if (m === 1 && day === 14) return "valentine";
  return null;
}

const rotate = (list, n) => list.map((_, i) => list[(i + n) % list.length]);
const clock = (d) => `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
const remote = (address) => address.includes("/");
// At a desk you sit and type unless there's news: done and blocked stand up.
const sits = (status) => status !== "done" && status !== "blocked";
const mugOf = (a) => {
  const names = `${a?.program?.key ?? ""} ${a?.app ?? ""}`;
  return Object.entries(A.MUGS).find(([k]) => names.includes(k))?.[1] ?? "t-mug";
};
// Live sub-agents under `addr`, however deep.
const descendants = (all, addr) =>
  all.filter((k) => k.parent === addr && k.state === "live").flatMap((k) => [k, ...descendants(all, k.address)]);

function loadNumber(key) {
  try { return Number(localStorage.getItem(key)) || null; } catch { return null; }
}
function saveNumber(key, n) {
  try { localStorage.setItem(key, String(n)); } catch {}
}

export default class Office extends View {
  init(_props, cx) {
    this.size = { width: 1400, height: 250 };
    this.desk = {}; // address -> desk index, kept while the agent lives
    this.who = {}; // address -> which coworker they are, kept while the agent lives
    this.at = {}; // walker -> { spot, x, y, fromX, until, dur, face }
    this.seen = {}; // address -> what we knew last render: { status, who }
    this.idleSince = {};
    this.blockedSince = {};
    this.finishes = []; // when agents finished, for the pizza
    this.party = null; // { start }
    this.leaving = {}; // address -> who: closed agents on their way out
    this.kids = {}; // intern address -> { x, y, name } where it sat last render
    this.grads = {}; // intern address -> { x, y, name, start }
    this.away = [];
    this.hovered = null;
    this.weather = null;
    this.started = false;
    this.cat = { goal: "sit", desk: null, since: Date.now() };
    this.now = new Date();
    this.incident = loadNumber("office.incident") ?? Date.now();
    saveNumber("office.incident", this.incident);
    cx.timer.every(30000, (cx) => { this.now = new Date(); cx.notify(); });
    cx.timer.every(9000, (cx) => { if (this.wanderCat()) cx.notify(); });
    if (WEATHER) {
      this.refreshWeather(cx);
      cx.timer.every(30 * 60 * 1000, (cx) => this.refreshWeather(cx));
    }
  }

  refreshWeather(cx) {
    cx.spawn(async (cx) => {
      try {
        if (!this.where) {
          const r = await fetch("https://ipapi.co/json/");
          const j = await r.json();
          if (typeof j.latitude === "number") this.where = { lat: j.latitude.toFixed(1), lon: j.longitude.toFixed(1) };
        }
        if (!this.where) return;
        const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${this.where.lat}&longitude=${this.where.lon}&current=weather_code`);
        const j = await r.json();
        this.weather = weatherKind(j.current?.weather_code ?? 0);
        cx.notify();
      } catch {}
    });
  }

  // Desks are handed out once, lowest free first, so nobody swaps seats. Agents that
  // closed head for the door with a box.
  seat(list, door, cx) {
    const live = new Set(list.map((a) => a.address));
    for (const k of Object.keys(this.desk)) {
      if (live.has(k)) continue;
      const at = this.at[k];
      if (this.started && at && this.seen[k]) {
        this.leaving[k] = this.seen[k].who;
        this.walk(`leave:${k}`, "door", door.x, door.y, WALK_SPEED, cx, at);
      }
      delete this.desk[k]; delete this.at[k]; delete this.idleSince[k]; delete this.blockedSince[k]; delete this.seen[k];
    }
    const taken = new Set(Object.values(this.desk));
    for (const a of list) {
      if (a.address in this.desk) continue;
      let i = 0;
      while (taken.has(i)) i++;
      this.desk[a.address] = i;
      taken.add(i);
    }
  }

  // Who each agent is: picked from the cast by their terminal address, moving on to the
  // next coworker when that one is already in today.
  cast(list) {
    const live = new Set(list.map((a) => a.address));
    for (const k of Object.keys(this.who)) if (!live.has(k)) delete this.who[k];
    const taken = new Set(Object.values(this.who));
    for (const a of list) {
      if (this.who[a.address]) continue;
      let i = A.hashOf(a.address) % A.CAST.length;
      for (let n = 0; n < A.CAST.length && taken.has(A.CAST[i]); n++) i = (i + 1) % A.CAST.length;
      this.who[a.address] = A.CAST[i];
      taken.add(A.CAST[i]);
    }
  }

  // Since-when for idle and blocked, finishes for the pizza, and the incident sign.
  track(list, now, cx) {
    const changed = {};
    for (const s of spaces()) for (const t of s.tabs ?? []) changed[t.id] = t.changed_at;
    for (const a of list) {
      const was = this.seen[a.address]?.status;
      if (a.status !== "idle") delete this.idleSince[a.address];
      else this.idleSince[a.address] ??= changed[a.tab] ?? now;
      if (a.status !== "blocked") delete this.blockedSince[a.address];
      else this.blockedSince[a.address] ??= was === "blocked" || !was ? (changed[a.tab] ?? now) : now;
      if (this.started && a.status === "done" && was && was !== "done") this.finishes.push(now);
      this.seen[a.address] = { status: a.status, who: this.who[a.address] };
    }
    this.finishes = this.finishes.filter((t) => now - t < PARTY_WINDOW);
    if (!this.party && this.finishes.length >= PARTY_FINISHES) {
      this.party = { start: now };
      this.finishes = [];
      cx.timer.after(PARTY_LENGTH + 50, (cx) => { this.party = null; cx.notify(); });
    }
    if (list.some((a) => a.status === "blocked") && now - this.incident > 60000) {
      this.incident = now;
      saveNumber("office.incident", now);
    }
  }

  // Starts a walk when a walker's spot changes; returns where it is (or is heading).
  // `start`: where a new walker appears (the door), instead of at its spot.
  walk(key, spot, x, y, speed, cx, start) {
    const now = Date.now();
    const fresh = !this.at[key] && Boolean(start);
    const at = this.at[key] ?? (start ? { ...start, spot: null } : null);
    if (!at) return (this.at[key] = { spot, x, y, fromX: x, until: 0, dur: 1 });
    if (at.spot === spot && at.x === x && at.y === y) return at;
    const dur = Math.max(400, Math.hypot(x - at.x, y - at.y) / speed);
    this.at[key] = { spot, x, y, fromX: at.x, until: now + dur, dur, face: at.face };
    if (spot === "door" || fresh) this.doorUntil = Math.max(this.doorUntil ?? 0, now + dur);
    cx.timer.after(dur + 30, (cx) => cx.notify());
    return this.at[key];
  }

  // Where everything stands. The room is laid out left to right and centered; when the
  // strip is too narrow for all of it, the extras by the door and the couch go first.
  geometry(W, H, deskCount) {
    const P = A.P, S = A.S;
    const floorY = H - 30;
    const wallBottom = floorY - 14 * P;
    const slot = A.SLOT * P;
    const front = Math.min(deskCount, FRONT_ROW);
    const back = Math.max(0, deskCount - FRONT_ROW);
    const desksW = Math.max(front, back ? back + 0.5 : 0) * slot;
    const row = [
      ["door", A.w("door"), 6], ["umbrellas", A.w("umbrellas"), 6, 3], ["plantL", A.w("fig"), 4],
      ["desks", desksW, 10], ["counter", A.w("counter"), 30], ["cooler", A.w("cooler"), 30],
      ["couch", A.w("couch-lavender"), 6], ["lamp", A.w("floorlamp"), 6, 2], ["tree", A.w("cattree"), 8, 1],
      ["plantR", A.w("monstera"), 0],
    ].map(([key, w, gap, drop = 0]) => ({ key, w, gap: gap * S, drop }));
    const total = () => row.reduce((n, p) => n + p.w + p.gap, 0);
    for (let d = 3; d > 0 && total() > W - 24; d--) row.splice(row.findIndex((p) => p.drop === d), 1);
    const at = {};
    let x = Math.max(12, Math.round((W - total()) / 2));
    for (const p of row) { at[p.key] = x; x += p.w + p.gap; }
    const x0 = at.desks;
    const deskPos = (i) => i < FRONT_ROW
      ? { x: x0 + i * slot, y: floorY, back: false }
      : { x: x0 + (i - FRONT_ROW) * slot + slot / 2, y: floorY - 10 * P, back: true };
    const wallBase = wallBottom + 2 * P; // where things against the back wall stand
    return {
      P, S, floorY, wallBottom, wallBase, slot, x0, deskPos, at,
      zoneX: at.counter, coolerX: at.cooler, couchX: at.couch, doorX: at.door, start: at.door, end: x,
      door: { x: at.door + A.w("door") / 2, y: wallBase + 2 * S },
    };
  }

  // Picks the cat's next stop: a nap on an empty desk, or a sit somewhere on the floor.
  wanderCat() {
    const g = this.g;
    if (!g) return false;
    const c = this.cat;
    if (c.goal === "sleep" && this.away.includes(c.desk) && Date.now() - c.since < 60000) return false;
    if (this.away.length && Math.random() < 0.45) {
      this.cat = { goal: "sleep", desk: this.away[Math.floor(Math.random() * this.away.length)], since: Date.now() };
    } else {
      const span = g.couchX + A.w("couch-lavender") - g.x0;
      this.cat = { goal: "sit", desk: null, x: Math.round(g.x0 + Math.random() * span), since: Date.now() };
    }
    return true;
  }

  render(cx) {
    const { width: W, height: H } = this.size;
    const list = agents();
    // Agents on other machines are working from home: they're on the video call, not in a chair.
    const here = list.filter((a) => !remote(a.address));
    const all = terminals();
    const now = Date.now();
    setAgentOrder(list.map((a) => a.address));

    // Whole sprite pixels where the strip allows: 2px each by default, 3px when it's tall.
    A.setScale(H < 210 ? 3 : H < 330 ? 4 : 6);
    const deskCount = Math.max(MIN_DESKS, here.length, ...Object.values(this.desk).map((i) => i + 1));
    const g = (this.g = this.geometry(W, H, deskCount));
    this.seat(here, g.door, cx);
    this.cast(list);
    this.track(list, now, cx);
    const S = g.S;
    const byDesk = {};
    for (const a of here) byDesk[this.desk[a.address]] = a;
    const tabs = {};
    for (const s of spaces()) for (const t of s.tabs ?? []) tabs[t.id] = t;
    const branches = {};
    for (const p of panes()) branches[p.pane] = p.branch;

    // The pizza: the courier walks in, leaves it on the counter, and walks out.
    const party = this.party;
    const counter = { x: g.zoneX - 10 * S, y: g.floorY };
    const courierTrip = party ? Math.max(400, Math.hypot(counter.x - g.door.x, counter.y - g.door.y) / WALK_SPEED) : 0;
    const pizzaHere = party && now >= party.start + courierTrip;

    // Where everyone goes. Long idlers take the couch while there's room; the rest
    // gather around the cooler (or the pizza), alternating sides, further out each pair.
    const idle = here.filter((a) => a.status === "idle").sort((a, b) => this.idleSince[a.address] - this.idleSince[b.address]);
    const nappers = pizzaHere ? [] : idle.filter((a) => now - this.idleSince[a.address] > NAP_AFTER).slice(0, COUCH_SEATS);
    const chatters = idle.filter((a) => !nappers.includes(a));
    const place = {};
    nappers.forEach((a, k) => { place[a.address] = { spot: "couch", x: g.couchX + (17 + k * 26) * S, y: g.floorY - 8 * S, face: 1 }; });
    const hub = pizzaHere ? { left: g.zoneX - 12 * S, right: g.zoneX + A.w("counter") + 12 * S }
      : { left: g.coolerX - 13 * S, right: g.coolerX + A.w("cooler") + 13 * S };
    chatters.forEach((a, k) => {
      const left = k % 2 === 0;
      const ring = Math.floor(k / 2) * 20 * S;
      place[a.address] = { spot: pizzaHere ? "pizza" : "cooler", x: left ? hub.left - ring : hub.right + ring, y: g.floorY, face: left ? 1 : -1 };
    });
    // At a desk you're in the chair beside it.
    for (const a of here) {
      const d = g.deskPos(this.desk[a.address]);
      place[a.address] ??= { spot: "desk", x: d.x + A.CHAIR.seat * S, y: d.y, face: 1 };
    }
    this.away = here.filter((a) => place[a.address].spot !== "desk").map((a) => this.desk[a.address]);
    if (this.cat.goal === "sleep" && !this.away.includes(this.cat.desk)) this.wanderCat();

    const alarmed = here.filter((a) => a.status === "blocked" && now - (this.blockedSince[a.address] ?? now) > ALARM_AFTER);
    const people = here.map((a) => {
      const p = place[a.address];
      const start = this.started ? g.door : null;
      const at = this.walk(a.address, p.spot, p.x, p.y, WALK_SPEED, cx, start);
      const seated = at.spot === "desk" && now >= at.until;
      return {
        y: at.y, back: g.deskPos(this.desk[a.address]).back, seated, desk: this.desk[a.address],
        sitting: seated && sits(a.status),
        el: this.person(a, at, g, p.face, tabs[a.tab], alarmed.includes(a)),
      };
    });
    const sitting = new Set(people.filter((p) => p.sitting).map((p) => p.desk));
    const desks = Array.from({ length: deskCount }, (_, i) => {
      const pos = g.deskPos(i);
      const a = byDesk[i];
      return { back: pos.back, chair: this.chair(i, pos, g), el: this.deskAt(i, pos, g, a, a && tabs[a.tab], a && branches[a.pane], sitting.has(i)) };
    });
    // A row of desks, back to front: chairs, whoever is at them, then the desks themselves.
    const row = (back) => [
      ...desks.filter((d) => d.back === back).map((d) => d.chair),
      ...people.filter((p) => p.seated && p.back === back).map((p) => p.el),
      ...desks.filter((d) => d.back === back).map((d) => d.el),
    ];

    const hour = this.now.getHours();
    const dark = lightsDown(hour);
    const when = season(this.now);
    const hovered = here.find((a) => a.address === this.hovered);
    this.started = true;

    return div().id("office").size_full().relative().overflow_hidden().bg("#f8ecdb")
      .on_size_change((size, cx) => { this.size = size; cx.notify(); })
      .children([
        ...this.room(W, H, g, sky(hour), list, all, now, when),
        ...row(true),
        ...row(false),
        ...this.lounge(g, pizzaHere, when),
        ...here.flatMap((a) => this.interns(a, descendants(all, a.address), g)),
        ...this.graduates(g, now, cx),
        ...people.filter((p) => !p.seated).sort((a, b) => a.y - b.y).map((p) => p.el),
        ...this.leavers(g, now),
        ...(party ? [this.courier(party, counter, courierTrip, g, now, cx)] : []),
        this.kitty(g, cx),
        ...(dark ? this.night(W, H, g, byDesk, deskCount, when) : []),
        ...(alarmed.length ? D.alarm(W, H, g.deskPos(this.desk[alarmed[0].address]).x + (A.DESK.x + 30) * S) : []),
        ...(hovered && this.at[hovered.address] ? [this.thought(hovered, this.at[hovered.address], g)] : []),
        ...(list.length ? [] : [this.sign(W, g)]),
      ]);
  }

  room(W, H, g, s, list, all, now, when) {
    const { P, S, wallBottom, zoneX } = g;
    const rail = wallBottom - 9 * P;
    const els = [
      div().absolute().left(0).top(rail).w(W).h(9 * P).bg("#f0dcc2"),
      div().absolute().left(0).top(rail - 3).w(W).h(3).bg("#e0c7a6"),
      div().absolute().left(0).top(wallBottom - 4).w(W).h(4).bg("#b8906e"),
      div().absolute().left(0).top(wallBottom).w(W).h(H - wallBottom).bg("#dcae7e"),
    ];
    for (let x = 14; x < W; x += 28) els.push(div().absolute().left(x).top(rail + 4).w(1).h(9 * P - 10).bg("#e6cfb0"));
    for (let y = wallBottom + 12; y < H; y += 14) els.push(div().absolute().left(0).top(y).w(W).h(1).bg("#cb9c6c"));
    for (let i = 0, y = wallBottom; y < H; i++, y += 14)
      for (let x = (i % 2) * 60 + 20; x < W; x += 120) els.push(div().absolute().left(x).top(y).w(1).h(13).bg("#cb9c6c"));

    // Along the wall. Over the room: windows and pictures, with the incident sign,
    // Employee of the Month and the remote call in the first odd spots, and plants hanging
    // between. Either side of the room, where the strip is wide: furniture and more windows.
    const winH = Math.max(36, Math.min(96, rail - 44));
    const weather = this.weather ?? (when === "winter" ? "snow" : null);
    const turns = new Map(all.map((t) => [t.address, t.turn ?? 0]));
    const star = [...list].sort((a, b) => (turns.get(b.address) ?? 0) - (turns.get(a.address) ?? 0))[0];
    const remotes = list.filter((a) => remote(a.address)).map((a) => ({
      address: a.address, pane: a.pane, who: this.who[a.address], machine: a.address.split("/")[0],
      name: a.space_name, status: a.status, title: a.title || a.tab_name || a.space_name,
    }));
    const blockedNow = list.some((a) => a.status === "blocked");
    const specials = [
      (x) => D.incidentSign(x + 12, 16, winH, Math.floor((now - this.incident) / DAY), blockedNow),
      (x) => D.portrait(x + 18, 10, winH + 6, star && (turns.get(star.address) ?? 0) > 0
        ? { who: this.who[star.address], name: star.space_name } : null),
      ...(remotes.length ? [(x) => D.videoWall(x + 4, 12, winH + 4, remotes)] : []),
    ];
    const clockX = zoneX - A.w("clock-cat") - 16;
    const busy = [[g.doorX - 14, g.doorX + A.w("door") + (g.at.umbrellas == null ? 14 : A.w("umbrellas") + 6 * S + 14)], [clockX - 14, zoneX + 164]];
    const furniture = [...WALL_FURNITURE];
    const base = g.wallBase + 2 * S;
    let pictures = 0, windows = 0;
    for (let x = 16, k = 0, side = 0; x < W - 40;) {
      const hit = busy.find(([a, b]) => x + 120 > a && x < b);
      if (hit) { x = hit[1]; continue; }
      const outside = x + 120 < g.start - 8 || x > g.end + 8;
      if (outside) {
        // furniture, window, furniture, window…
        const name = side++ % 2 === 0 ? furniture[0] : null;
        if (name && (x + A.w(name) < g.start - 8 || x > g.end + 8) && x + A.w(name) < W - 8) {
          els.push(D.against(furniture.shift(), x, base));
          x += A.w(name) + 16;
        } else if (x + 120 < W - 8) {
          els.push(D.windowPane(x, 18, 120, winH, s, weather, windows++));
          x += 136;
        } else break;
        continue;
      }
      if (x + 120 > W - 8) break;
      if (k % 2 === 1 && specials.length) els.push(specials.shift()(x));
      else if (k % 5 === 4) {
        const pic = PICTURES[pictures++ % PICTURES.length];
        els.push(D.picture(x + 60 - A.w(pic[0]) / 2, 22, pic));
      } else els.push(D.windowPane(x, 18, 120, winH, s, weather, windows++));
      const gap = x + 170;
      if (!busy.some(([a, b]) => gap + 30 > a && gap - 30 < b) && gap + 30 < g.end)
        els.push(D.hanging(HANGING[k % HANGING.length], gap - A.w(HANGING[k % HANGING.length]) / 2));
      k++;
      // Past the room's right edge the wall packs tight again.
      x = x + 220 > g.end - 60 ? Math.max(x + 136, g.end + 12) : x + 220;
    }
    els.push(D.door(g.doorX, g.wallBase, now < (this.doorUntil ?? 0)));
    if (g.at.umbrellas != null) els.push(D.against("umbrellas", g.at.umbrellas, base));
    els.push(D.clock(clockX, 16, clock(this.now)));
    const count = (st) => list.filter((a) => a.status === st).length;
    const napping = list.filter((a) => this.at[a.address]?.spot === "couch").length;
    const interns = list.reduce((n, a) => n + descendants(all, a.address).length, 0);
    els.push(D.whiteboard(zoneX, 14, [
      ["#4a90e0", `WORKING  ${count("working")}`],
      ["#4faa68", `DONE     ${count("done")}`],
      ["#e86a6a", `BLOCKED  ${count("blocked")}`],
      ["#9a93a8", `ON BREAK ${count("idle") - napping}`],
      ["#8b78d6", `NAPPING  ${napping}`, napping > 0],
      ["#e08a4f", `INTERNS  ${interns}`, interns > 0],
      ["#e8604f", "PIZZA!!", Boolean(this.party)],
    ]));
    // A robot vacuum doing laps along the baseboard.
    const lapA = g.x0, lapB = Math.max(g.x0 + 60, g.zoneX - A.w("t-roomba") - 8);
    els.push(A.still("t-roomba", lapA, wallBottom + 8 * S).loop("left", { from: lapA, to: lapB, period: Math.max(20000, (lapB - lapA) * 90), easing: "linear" }));
    if (when === "winter" || when === "newyear") els.push(...D.stringLights(W, 2));
    if (when === "newyear") els.push(D.banner(W, rail - 30, "HAPPY NEW YEAR", "#a98be8"));
    if (when === "valentine") els.push(D.banner(W, rail - 30, "♥  HAPPY VALENTINE'S  ♥", "#f08fa8"));
    return els;
  }

  // The kitchen and the couch corner, the plants, and whatever the season brought.
  lounge(g, pizzaHere, when) {
    const { S, at } = g;
    const f = g.floorY;
    const els = [
      A.still("rug", g.coolerX + A.w("cooler") / 2 - A.w("rug") / 2, f + 10 * S),
      A.still("counter", at.counter, f),
      ...(pizzaHere ? [A.still("pizza-open", at.counter + 15 * S, f - 26 * S)] : []),
      A.still("cooler", at.cooler, f),
      A.still("couch-lavender", at.couch, f),
      ...(at.lamp == null ? [] : [A.still("floorlamp", at.lamp, f)]),
      ...(at.tree == null ? [] : [A.still("cattree", at.tree, f), A.still("t-catbowl", at.tree - 6 * S, f + 5 * S), A.still("t-yarn", at.tree + 30 * S, f + 6 * S)]),
      A.still("monstera", at.plantR, f),
      when === "winter" ? A.still("xmastree", at.plantL - 5 * S, f) : A.still("fig", at.plantL, f),
    ];
    if (when === "halloween") els.push(
      A.still("pumpkin", at.plantL + 14 * S, f + 4 * S), A.still("pumpkin", at.plantR - 16 * S, f + 4 * S),
      A.still("pumpkin", at.couch - 22 * S, f + 4 * S));
    return els;
  }

  sign(W, g) {
    return div().absolute().left(W / 2 - 140).top(g.wallBottom - 34).w(280).py(4).rounded(8).bg("#5b4a5e99")
      .text_size(11).text_color("#fffaf0").flex().justify_center().child("Nobody's in yet. Start an agent and they'll show up.");
  }

  // The chair at a desk.
  chair(i, pos) {
    return A.still(A.CHAIRS[i % A.CHAIRS.length], pos.x, pos.y);
  }

  // A desk with its monitor, the bell and a toy on top of it, a keyboard and a mug, the
  // branch on a sticky note, and the nameplate of whoever sits there. When they're sitting,
  // the chair's armrest is drawn again here, over them.
  deskAt(i, pos, g, a, tab, branch, sitting) {
    const S = g.S;
    const st = a?.status;
    const away = Boolean(a) && this.at[a.address]?.spot !== "desk";
    const done = st === "done" && !away;
    const overtime = st === "working" && tab?.working_since && Date.now() - tab.working_since > MUGS_AFTER;
    const plate = a ? this.plate(a) : null;
    const floor = DESK_TOP * S; // the floor line inside this box
    const dx = A.DESK.x * S;
    const surf = floor - A.surface(i);
    const mx = dx + A.DESK.monitor * S;
    const top = surf - A.h(A.MONITORS[0]) + S; // just into the monitor's top edge
    const bellX = mx + S;
    const mug = mugOf(a);
    return div().id(`desk-${i}`).absolute().left(pos.x).top(pos.y - floor).w(A.SLOT * g.P).h(floor + 28)
      .when(Boolean(a), (el) => el.cursor_pointer().on_click(() => run("pane.focus", { pane: a.pane })))
      .children([
        ...(sitting ? [A.still(`${A.CHAIRS[i % A.CHAIRS.length]}-front`, 0, floor)] : []),
        A.still(A.deskOf(i), dx, floor),
        A.still(A.MONITORS[i % A.MONITORS.length], mx, surf),
        this.screen(away ? "idle" : st, away, mx, surf),
        A.still(A.TOYS[(i * 5 + 2) % A.TOYS.length], mx + 15 * S, top),
        A.still("t-bell", bellX, top).when(done, (el) => el.loop("left", { from: bellX - 1.5, to: bellX + 1.5, period: 160 })),
        A.still("t-keyboard", dx + 2 * S, surf + S),
        A.still(mug, dx + 19 * S, surf + 2 * S),
        ...(overtime ? [A.still("t-mug", dx + 27 * S, surf + 3 * S), A.still(mug, dx + 23 * S, surf - 6 * S)] : []),
        ...(branch ? [this.sticky(branch, dx + 8 * S, surf + 13 * S)] : []),
        ...(done ? [this.ding(bellX - 6 * S, top - 24 * S), ...this.confetti(a.address, floor)] : []),
        ...(plate ? [plate.absolute().left(dx).top(pos.back ? top - 16 * S - 18 : floor + 6)] : []),
      ]);
  }

  // What's on the monitor at (mx, surf): its foot's left edge and the desk surface.
  screen(st, screensaver, mx, surf) {
    const S = A.S;
    const [sx, sy, sw, sh] = A.DESK.screen;
    const el = div().absolute().left(mx + sx * S).top(surf - sy * S).w(sw * S).h(sh * S).overflow_hidden();
    if (st === "working") return el.children(CODE.map((c, k) =>
      div().absolute().left(S * (k % 2 === 0 ? 2 : 4)).top(S * (1.5 + 3 * k)).h(S * 1.5).rounded(S).bg(c)
        .loop("width", { from: 2 * S, to: S * (17 - (k % 2) * 4), period: 700 + k * 260, easing: "linear" })));
    if (st === "blocked") return el.bg("#5a2233").flex().items_center().justify_center().text_size(7 * S).font_bold().text_color("#ff8a8a")
      .child("!").loop("opacity", { from: 0.4, to: 1, period: 700 });
    if (st === "done") return el.bg("#1f4a36").flex().items_center().justify_center().text_size(6.5 * S).font_bold().text_color("#8af0a8").child("✓");
    return el.when(screensaver, (e) => e.child(div().absolute().top(S * 6).size(S * 2).rounded_full().bg("#7fb8f0")
      .loop("left", { from: S * 2, to: S * 19, period: 5000 })));
  }

  sticky(branch, left, top) {
    const S = A.S;
    return div().absolute().left(left).top(top).w(24 * S).h(8 * S).px(2).bg("#fff3a8").rounded(2)
      .border_1().border_color("#ecd36a").flex().items_center().overflow_hidden()
      .text_size(7).text_color("#6b5a1e").child(div().truncate().child(branch));
  }

  ding(left, top) {
    return div().absolute().left(left).top(top).text_size(10).font_bold().text_color("#d99a1e")
      .child("ding!").loop("opacity", { from: 0, to: 1, period: 640 });
  }

  // Paper falling over the desk, for as long as the news is unread.
  confetti(seed, floor) {
    const S = A.S;
    let h = 0;
    for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return Array.from({ length: 16 }, (_, k) => {
      const r = ((h >>> (k % 24)) ^ Math.imul(k + 1, 2654435761)) >>> 0;
      const x = (10 + (r % 70)) * S;
      return div().absolute().left(x).w(2 * S).h(k % 3 === 0 ? 4 * S : 2 * S).rounded(S / 2).bg(CONFETTI[k % CONFETTI.length])
        .loop("top", { from: floor - 76 * S - (k % 5) * 8, to: floor - 2 * S, period: 1100 + ((r >>> 3) % 900), easing: "linear" })
        .loop("left", { from: x - 4, to: x + 4, period: 500 + ((r >>> 5) % 400) });
    });
  }

  spaceTile(id) {
    const icon = (shared("space.icons") ?? {})[id];
    const c = (shared("space.colors") ?? {})[id] ?? "ansi6";
    const fill = c.startsWith("#") ? c : MARK[c] ?? "#22a99a";
    return div().size(12).flex_none().rounded(3).bg(fill).flex().items_center().justify_center().text_size(8).text_color("#ffffff")
      .when(Boolean(icon?.svg), (el) => el.child(svg(icon.svg).size(8)))
      .when(Boolean(icon?.text), (el) => el.child(icon.text));
  }

  plate(a) {
    const focused = a.focused;
    return div().max_w((A.SLOT - 8) * A.P).h(16).px(5).gap(4).rounded(8).flex().items_center()
      .bg(focused ? "#fff6dd" : "#5b4a5e99").text_size(10).text_color(focused ? "#5b4a5e" : "#fffaf0")
      .child(div().size(6).flex_none().rounded_full().bg(STATUS[a.status] ?? STATUS.idle))
      .child(this.spaceTile(a.space))
      .when(remote(a.address), (el) => el.child(div().flex_none().text_size(9).text_color("#fffaf0").child("🎧")))
      .child(div().truncate().child(a.space_name + (a.tab_name ? ` · ${a.tab_name}` : "")));
  }

  // One intern in its box: an animal in a necktie, with whatever it's wearing or holding.
  intern(name, face, extra = []) {
    const S = A.S;
    const key = face < 0 ? `${name}-l` : name;
    return [A.still(key, (INTERN_W * S - A.w(name)) / 2, INTERN_H * S), ...extra];
  }

  // Sub-agents: small animals on stools in front of their parent's desk, laptops out.
  interns(a, kids, g) {
    if (!kids.length) return [];
    const S = g.S;
    const pos = g.deskPos(this.desk[a.address]);
    const x0 = pos.x + (A.DESK.x + 8) * S;
    const seat = (INTERN_H - 9) * S; // sitting on the stool
    const shown = kids.slice(0, 3);
    const els = shown.map((k, i) => {
      const name = A.internOf(k.address);
      const x = x0 + i * 13 * S;
      this.kids[k.address] = { x, y: pos.y, name };
      const busy = k.status === "working";
      const stuck = k.status === "blocked" || k.status === "error";
      const top = seat - A.h(name);
      return div().id(`intern-${k.address}`).absolute().left(x).top(pos.y + 3 * S - INTERN_H * S).w(INTERN_W * S).h(INTERN_H * S)
        .cursor_pointer().on_click(() => run("terminal.peek", { terminal: k.address }))
        .children([
          A.still("t-stool", (INTERN_W * S - A.w("t-stool")) / 2, INTERN_H * S),
          A.still(`${name}-l`, (INTERN_W * S - A.w(name)) / 2, seat)
            .when(busy, (el) => el.loop("top", { from: top, to: top - 1.5, period: 260 + i * 40 })),
          ...(busy ? [A.still("t-laptop", -2 * S, seat + S)] : []),
          ...(stuck ? [this.bubble(top - 18, "#e05252", INTERN_W).child("!").loop("opacity", { from: 0.5, to: 1, period: 700 })] : []),
        ]);
    });
    if (kids.length > shown.length)
      els.push(div().absolute().left(x0 + 3 * 13 * S + 6 * S).top(pos.y - 14 * g.P).px(4).rounded(6).bg("#5b4a5e99")
        .text_size(10).text_color("#fffaf0").child(`+${kids.length - shown.length}`));
    return els;
  }

  // Interns that finished: a bow in a graduation cap where they sat, then a hop out the door.
  graduates(g, now, cx) {
    const S = g.S;
    const live = new Set(terminals().filter((t) => t.state === "live").map((t) => t.address));
    for (const [k, info] of Object.entries(this.kids)) {
      if (live.has(k)) continue;
      delete this.kids[k];
      if (!this.started) continue;
      this.grads[k] = { ...info, start: now };
      cx.timer.after(GRAD_BOW + 20, (cx) => cx.notify());
    }
    return Object.entries(this.grads).flatMap(([k, gr]) => {
      const box = (x, y) => div().id(`grad-${k}`).absolute().left(x).top(y - INTERN_H * S).w(INTERN_W * S).h(INTERN_H * S);
      const cap = A.still("t-gradcap", (INTERN_W * S - A.w("t-gradcap")) / 2, INTERN_H * S - A.h(gr.name) + 5 * S);
      if (now < gr.start + GRAD_BOW) {
        return [box(gr.x, gr.y + 3 * S)
          .child(div().absolute().size_full().children(this.intern(gr.name, -1, [cap])).loop("top", { from: 0, to: 2 * S, period: 900 }))
          .child(this.bubble(INTERN_H * S - A.h(gr.name) - 26, "#5b4a5e", INTERN_W).child("🎓 thx!"))];
      }
      const at = this.walk(`grad:${k}`, "door", g.door.x - (INTERN_W / 2) * S, g.door.y, WALK_SPEED, cx, { x: gr.x, y: gr.y });
      if (now >= at.until && at.until > 0) { delete this.grads[k]; delete this.at[`grad:${k}`]; return []; }
      return [box(at.x, at.y)
        .transition("left", { duration: at.dur, easing: "ease-in-out" }).transition("top", { duration: at.dur, easing: "ease-in-out" })
        .child(div().absolute().size_full().children(this.intern(gr.name, Math.sign(at.x - at.fromX) || -1, [cap]))
          .loop("top", { from: 0, to: -3 * S, period: 240 }))];
    });
  }

  // A person-sized box with its feet at (x, y), for anyone who walks.
  walkerBox(id, at) {
    const S = A.S;
    return div().id(id).absolute().left(at.x - (A.BOX_W / 2) * S).top(at.y - A.BOX_H * S).w(A.BOX_W * S).h(A.BOX_H * S)
      .transition("left", { duration: at.dur, easing: "ease-in-out" })
      .transition("top", { duration: at.dur, easing: "ease-in-out" });
  }

  // Something carried in front of the chest, on the side they're facing.
  carried(name, face) {
    const S = A.S;
    const mid = (A.BOX_W / 2) * S;
    return A.still(name, face > 0 ? mid + 3 * S : mid - 3 * S - A.w(name), (A.BOX_H - 10) * S);
  }

  // Closed agents carrying their box out.
  leavers(g, now) {
    return Object.entries(this.leaving).flatMap(([k, who]) => {
      const at = this.at[`leave:${k}`];
      if (!at || now >= at.until) { delete this.leaving[k]; delete this.at[`leave:${k}`]; return []; }
      const face = Math.sign(at.x - at.fromX) || -1;
      return [this.walkerBox(`leave-${k}`, at).children([A.actor(who, face < 0 ? "walk-l" : "walk"), this.carried("t-plantbox", face)])];
    });
  }

  courier(party, counter, trip, g, now, cx) {
    const stay = 2500;
    const leaving = now >= party.start + trip + stay;
    if (now >= party.start + 2 * trip + stay + 100) return div();
    if (!leaving) cx.timer.after(party.start + trip + stay - now + 20, (cx) => cx.notify());
    const goal = leaving ? g.door : counter;
    const at = this.walk("courier", leaving ? "door" : "counter", goal.x, goal.y, WALK_SPEED, cx, g.door);
    const walking = now < at.until;
    const face = walking ? Math.sign(at.x - at.fromX) || 1 : 1;
    return this.walkerBox("courier", at)
      .child(A.actor(A.SIZE[`p-${COURIER}`] ? COURIER : A.CAST[0], walking ? (face < 0 ? "walk-l" : "walk") : "stand"))
      .when(!leaving, (el) => el.child(this.carried("t-pizzabox", face)))
      .when(!walking, (el) => el.child(this.bubble((A.BOX_H - A.HEAD) * A.S - 20, "#e8604f").child("pizza! 🍕")));
  }

  person(a, at, g, placeFace, tab, alarmed) {
    const S = g.S;
    const who = this.who[a.address];
    const napping = at.spot === "couch";
    const walking = Date.now() < at.until;
    const face = walking ? Math.sign(at.x - at.fromX) || 1 : placeFace;
    at.face = face;
    const st = a.status;
    const side = face < 0 ? "-l" : "";
    const chatting = at.spot === "cooler" || at.spot === "pizza";
    const doing = walking ? `walk${side}` : chatting ? `drink${side}` : napping ? "nap"
      : st === "done" ? "cheer" : st === "blocked" ? "help" : sits(st) ? "type" : "help";
    // Typing is a seated pose: up on the chair's seat, feet dangling.
    const lift = doing === "type" ? A.CHAIR.rise * S : 0;
    let body = A.actor(who, doing);
    if (lift) body = div().absolute().left(0).top(-lift).size_full().child(body);
    if (alarmed && !walking) body = div().absolute().size_full().child(body).loop("top", { from: 0, to: -2 * S, period: 300 });
    const sweaty = doing === "type" && tab?.working_since && Date.now() - tab.working_since > SWEAT_AFTER;
    const sweat = sweaty ? [0, 1].map((k) => div().absolute().left((A.BOX_W / 2 + (k ? 9 : -12)) * S).w(2 * S).h(3 * S).rounded(2 * S).bg("#8fd0f5")
      .loop("top", { from: (A.BOX_H - 46 + k * 2) * S - lift, to: (A.BOX_H - 36 + k * 2) * S - lift, period: 900 + k * 300, easing: "ease-in" })) : [];

    const pal = A.hashOf(a.address);
    const top = (A.BOX_H - A.HEAD) * S - 20 - lift;
    at.lift = lift;
    let bubble = null;
    if (walking) bubble = null;
    else if (at.spot === "pizza") bubble = this.bubble(top, "#e8604f").frames(rotate(PIZZA_CHAT, pal % PIZZA_CHAT.length), 1800 + (pal % 900));
    else if (at.spot === "cooler") bubble = this.bubble(top, "#5b4a5e").frames(rotate(CHAT, pal % CHAT.length), 2200 + (pal % 1500));
    else if (napping) bubble = this.bubble(top, "#8b78d6").frames(["z", "zZ", "zZz", "zZ"], 900);
    else if (alarmed) bubble = this.bubble(top, "#e05252").child("HELP!!").loop("opacity", { from: 0.5, to: 1, period: 400 });
    else if (st === "blocked") bubble = this.bubble(top, "#e05252").child("!").loop("opacity", { from: 0.5, to: 1, period: 700 });
    else if (st === "done") bubble = this.bubble(top - 4 * S, "#2f9a50").child("✓");

    return this.walkerBox(`person-${a.address}`, at)
      .cursor_pointer().on_click(() => run("pane.focus", { pane: a.pane }))
      .on_hover((h, cx) => {
        if (h) this.hovered = a.address;
        else if (this.hovered === a.address) this.hovered = null;
        cx.notify();
      })
      .children([body, ...sweat, ...(bubble ? [bubble] : [])]);
  }

  // What they're working on, in a thought cloud over their head.
  thought(a, at, g) {
    const text = (a.title || a.tab_name || a.program?.name || "thinking…").replace(/\s+/g, " ").trim();
    const x = at.x;
    const y = at.y - A.HEAD * g.S - (at.lift ?? 0);
    return div().absolute().left(Math.max(4, x - 20)).top(Math.max(2, y - 46))
      .child(div().max_w(260).px(8).py(4).rounded(10).bg("#ffffff").border_1().border_color("#5b4a5e")
        .text_size(10).text_color("#5b4a5e").child(div().truncate().child(`💭 ${text}`)))
      .child(div().absolute().left(16).top(26).size(7).rounded_full().bg("#ffffff").border_1().border_color("#5b4a5e"))
      .child(div().absolute().left(22).top(35).size(4).rounded_full().bg("#ffffff").border_1().border_color("#5b4a5e"));
  }

  kitty(g, cx) {
    const S = g.S;
    const c = this.cat;
    const onDesk = c.goal === "sleep";
    const pos = onDesk ? g.deskPos(c.desk) : null;
    const x = onDesk ? pos.x + (A.DESK.x + 16) * S : (c.x ?? g.couchX - 20 * S);
    const y = onDesk ? pos.y - A.surface(c.desk) + 4 * S : g.floorY + 2 * S;
    const at = this.walk("cat", `${c.goal}-${c.desk}-${c.since}`, x, y, CAT_SPEED, cx);
    const walking = Date.now() < at.until;
    if (walking) at.face = Math.sign(at.x - at.fromX) || 1;
    const side = (at.face ?? 1) < 0 ? "-l" : "";
    return div().id("cat").absolute().left(at.x - (A.CAT_W / 2) * S).top(at.y - A.CAT_H * S).w(A.CAT_W * S).h(A.CAT_H * S)
      .transition("left", { duration: at.dur, easing: "ease-in-out" })
      .transition("top", { duration: at.dur, easing: "ease-in-out" })
      .child(A.kitty((walking ? "walk" : onDesk ? "sleep" : "sit") + side))
      .when(onDesk && !walking, (el) => el.child(div().absolute().left((A.CAT_W / 2 + 12) * S).top(0).text_size(9).font_bold()
        .text_color("#8b78d6").frames(["z", "zz", "zzz", ""], 800)));
  }

  // After dark: the room dims, the floor lamp is on, and busy screens glow.
  night(W, H, g, byDesk, deskCount, when) {
    const S = g.S;
    const [sx, sy, sw, sh] = A.DESK.screen;
    const els = [div().absolute().left(0).top(0).w(W).h(H).bg("#1c1440").opacity(0.42)];
    if (when === "winter" || when === "newyear") els.push(...D.stringLights(W, 2));
    if (g.at.lamp != null) {
      const lx = g.at.lamp + A.w("floorlamp") / 2, ly = g.floorY - A.h("floorlamp") + 8 * S;
      els.push(div().absolute().left(lx - 34 * S).top(ly - 26 * S).size(68 * S).rounded_full().bg("#ffd98a").opacity(0.16));
      els.push(div().absolute().left(lx - 18 * S).top(ly - 12 * S).size(36 * S).rounded_full().bg("#ffe2a0").opacity(0.2));
    }
    for (let i = 0; i < deskCount; i++) {
      const a = byDesk[i];
      if (!a || this.at[a.address]?.spot !== "desk" || a.status === "idle") continue;
      const pos = g.deskPos(i);
      const mx = pos.x + (A.DESK.x + A.DESK.monitor) * S;
      const surf = pos.y - A.surface(i);
      // Only a glow: anything solid here would sit on top of whoever walks past the desk.
      els.push(div().absolute().left(mx + (sx - 8) * S).top(surf - (sy + 8) * S).w((sw + 16) * S).h((sh + 16) * S).rounded(12 * S)
        .bg({ working: "#8fc0ff", blocked: "#ff8a8a", done: "#8af0a8" }[a.status] ?? "#8fc0ff").opacity(0.26));
    }
    return els;
  }

  // A speech bubble over the middle of a box `boxW` sprite px wide.
  bubble(top, color, boxW = A.BOX_W) {
    return div().absolute().left((boxW * A.S) / 2 - 4).top(top).px(5).h(16).flex().items_center().rounded(8)
      .bg("#fffdf7").border_1().border_color("#5b4a5e").text_size(10).font_bold().text_color(color).whitespace_nowrap();
  }
}
