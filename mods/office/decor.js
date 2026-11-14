// The room's fixtures: wall pieces, the door, weather in the windows, seasonal touches.
// Each function returns elements positioned in the scene's px.
import { div } from "gpui-kit";
import { run } from "herdr";
import * as A from "./art.js";

const TRIM = "#fffaf2";
const TRIM_SHADE = "#e6d2b8";
const INK = "#5b4a5e";
const PAPER = "#fffdf8";
const CURTAINS = [["#f9bfd0", "#ee9db5"], ["#bfe8d4", "#98d4b9"], ["#d3c4f5", "#b7a3e8"], ["#fbe3a0", "#f0cd72"]];
const SILL_POTS = ["pot-tulip", "pot-sunflower", "pot-succulent"];

// A window: sky and weather behind white trim, curtains tied back, a flower on the sill.
export function windowPane(x, y, w, h, sky, weather, k = 0) {
  const dayish = !sky.stars && (weather === "clear" || weather === "clouds" || !weather);
  const [cloth, fold] = CURTAINS[k % CURTAINS.length];
  const pot = SILL_POTS[k % SILL_POTS.length];
  const glass = div().absolute().left(4).top(4).w(w - 8).h(h - 8).rounded(3).bg(sky.bottom).overflow_hidden()
    .child(div().absolute().left(0).top(0).w_full().h(h * 0.55).bg(weather === "rain" || weather === "storm" ? "#8fa3b8" : sky.top))
    .when(Boolean(sky.stars) && weather !== "fog", (el) => el.children([[14, 10], [70, 18], [96, 6], [40, 26]].map(([sx, sy]) =>
      div().absolute().left(sx).top(sy).size(2).bg("#fff7d6").loop("opacity", { from: 0.3, to: 1, period: 1800 + sx * 20 }))))
    .when(Boolean(sky.stars) || dayish, (el) => el.child(div().absolute().left(w - 44).top(8).size(14).rounded_full().bg(sky.stars ? "#f6f0d2" : "#ffe58a")))
    .when(dayish && weather !== "clouds", (el) => el.children(cloud(18, 14, 0.9)))
    .children(weatherIn(weather, w, h))
    .child(div().absolute().left((w - 8) / 2 - 2).top(0).w(4).h_full().bg(TRIM))
    .child(div().absolute().left(0).top((h - 8) / 2 - 2).w_full().h(4).bg(TRIM));
  const drape = (left) => div().absolute().left(left ? 4 : w - 22).top(4).w(18).h(h - 14).bg(cloth)
    .rounded_b(9).child(div().absolute().left(left ? 11 : 4).top(0).w(3).h_full().bg(fold).opacity(0.7));
  const valance = div().absolute().left(0).top(0).w(w).h(12).rounded(4).bg(cloth)
    .children(Array.from({ length: Math.floor(w / 15) }, (_, i) => div().absolute().left(i * 15 + (w % 15) / 2).top(6).w(15).h(11).rounded_b(8).bg(cloth)));
  return div().absolute().left(x).top(y).w(w).h(h)
    .child(div().absolute().left(0).top(0).w(w).h(h).rounded(6).bg(TRIM).border_1().border_color(TRIM_SHADE))
    .child(glass).child(drape(true)).child(drape(false)).child(valance)
    .child(div().absolute().left(-6).top(h - 4).w(w + 12).h(7).rounded(3).bg(TRIM).border_1().border_color(TRIM_SHADE))
    .child(A.still(pot, w - A.w(pot) - 16, h - 3));
}

// A small puffy cloud at (x, y).
function cloud(x, y, opacity) {
  return [[0, 5, 30, 9], [6, 0, 12, 12], [15, 2, 10, 10]].map(([cx, cy, cw, ch]) =>
    div().absolute().left(x + cx).top(y + cy).w(cw).h(ch).rounded_full().bg("#ffffff").opacity(opacity));
}

function weatherIn(kind, w, h) {
  const n = (k, a, b) => a + ((k * 7919) % (b - a));
  if (kind === "rain" || kind === "storm") {
    const drops = Array.from({ length: 9 }, (_, k) => div().absolute().left(n(k, 4, w - 6)).w(1).h(7).bg("#e3eeff")
      .loop("top", { from: -10 - (k % 3) * 9, to: h, period: 520 + (k % 4) * 90, easing: "linear" }));
    if (kind === "storm") drops.push(div().absolute().left(0).top(0).w(w).h(h).bg("#ffffff")
      .loop("opacity", { from: 0, to: 0.45, period: 3800, easing: "ease-in" }));
    return drops;
  }
  if (kind === "snow") {
    return Array.from({ length: 11 }, (_, k) => {
      const x = n(k, 4, w - 6);
      return div().absolute().left(x).size(3).rounded_full().bg("#ffffff")
        .loop("top", { from: -6 - (k % 4) * 10, to: h, period: 3000 + (k % 5) * 400, easing: "linear" })
        .loop("left", { from: x - 3, to: x + 3, period: 1400 + (k % 3) * 300 });
    });
  }
  if (kind === "clouds") {
    return [0, 1].map((k) => div().absolute().top(8 + k * 16).w(38 - k * 8).h(12).rounded_full().bg(k ? "#eef2f6" : "#ffffff")
      .loop("left", { from: -40, to: w, period: 26000 + k * 9000, easing: "linear" }));
  }
  if (kind === "fog") return [div().absolute().left(0).top(0).w(w).h(h).bg("#e8eef2").opacity(0.6)];
  return [];
}

// A framed picture, with a brass plate under it when it has something to say.
export function picture(x, y, [name, caption]) {
  const w = A.w(name), h = A.h(name);
  return div().absolute().left(x).top(y).w(w).flex().flex_col().items_center()
    .child(div().relative().w(w).h(h).child(A.still(name, 0, h)))
    .when(Boolean(caption), (el) => el.child(div().mt(3).px(4).py(1).rounded(3).bg("#f6d98a").border_1().border_color("#d9b45a")
      .flex().flex_col().items_center().text_size(7).font_bold().text_color("#6b4a1e").whitespace_nowrap()
      .children(caption.split("\n").map((l) => div().child(l)))));
}

// Something tall, standing against the wall with its bottom-left corner at (x, base).
export const against = (name, x, base) => A.still(name, x, base);

// A plant hanging from the ceiling.
export const hanging = (name, x) => A.still(name, x, A.h(name));

// The cat clock: the time where its hands would be.
export function clock(x, y, text) {
  const S = A.S;
  return div().absolute().left(x).top(y).w(A.w("clock-cat")).h(A.h("clock-cat"))
    .child(A.still("clock-cat", 0, A.h("clock-cat")))
    .child(div().absolute().left(3 * S).top(9 * S).w(17 * S).h(11 * S).flex().items_center().justify_center()
      .text_size(S >= 3 ? 11 : 8).font_bold().text_color(INK).child(text));
}

export function whiteboard(x, y, rows) {
  return div().absolute().left(x).top(y).w(150)
    .child(div().w(150).p(6).pt(8).bg(PAPER).border_3().border_color("#c9d3e6").rounded(8)
      .flex().flex_col().text_size(10).font_bold()
      .children(rows.filter(([, , show]) => show !== false).map(([color, text]) => div().text_color(color).child(text))))
    .child(div().absolute().left(20).bottom(-4).w(110).h(5).rounded(2).bg("#b9c4da"))
    .child(div().absolute().left(34).bottom(-2).w(14).h(4).rounded(2).bg("#f08fa8"))
    .child(div().absolute().left(52).bottom(-2).w(14).h(4).rounded(2).bg("#7fb8f0"))
    .child(A.still("t-heart", 150 - A.w("t-heart") - 2, A.h("t-heart") - 5))
    .child(A.still("t-star", 150 - A.w("t-heart") - A.w("t-star") - 2, A.h("t-star") - 6));
}

// "DAYS SINCE LAST INCIDENT", flipped back to a blinking 0 while someone is blocked.
export function incidentSign(x, y, h, days, now) {
  return div().absolute().left(x).top(y).w(96).h(Math.min(h, 96)).p(5).bg("#ffe58a").border_3().border_color("#e9b949").rounded(10)
    .flex().flex_col().items_center().justify_between().text_color("#7a5a16")
    .child(div().text_size(8).font_bold().child("DAYS SINCE LAST"))
    .child(div().px(9).rounded(6).bg("#4a3f5c").text_size(24).font_bold().text_color(now ? "#ff8a8a" : "#9dffb4")
      .child(String(now ? 0 : days)).when(now, (el) => el.loop("opacity", { from: 0.35, to: 1, period: 600 })))
    .child(div().text_size(8).font_bold().child("INCIDENT"));
}

// A person's face in a box w wide: the top of their portrait sprite, `s` px per sprite pixel.
function face(who, w, s) {
  const name = `p-${who}`;
  return A.still(name, (w - A.w(name, s)) / 2, 2 * s + A.h(name, s), s);
}

// A gold-framed portrait of the busiest agent.
export function portrait(x, y, h, who) {
  const inner = Math.min(h - 30, 56);
  return div().absolute().left(x - 6).top(y).w(96).flex().flex_col().items_center().gap(2)
    .child(div().relative().w(72).h(inner + 8).rounded(6).bg("#f3cd6a").border_2().border_color("#cf9f3c")
      .child(div().absolute().left(4).top(4).w(60).h(inner - 4).rounded(3).overflow_hidden().bg("#bfe6f7")
        .child(who ? face(who.who, 60, 2) : div().size_full().flex().items_center().justify_center().text_size(18).text_color("#ffffff").child("?")))
      .child(A.still("t-star", 72 - A.w("t-star") + 5, A.h("t-star") - 6)))
    .child(div().w(96).py(1).rounded(4).bg("#f6d98a").border_1().border_color("#d9b45a").flex().flex_col().items_center().text_color("#6b4a1e")
      .child(div().text_size(7).font_bold().child("EMPLOYEE OF THE MONTH"))
      .child(div().max_w(90).truncate().text_size(8).child(who?.name ?? "vacant")));
}

// A call on the wall with everyone working from another machine: each tile shows how
// they're doing, and clicking one goes to their terminal.
export function videoWall(x, y, h, remotes) {
  const ring = { working: "#6aa9f0", blocked: "#f07a7a", done: "#7ad68f", idle: "#8a90a0" };
  const tile = (r) => {
    const st = r.status;
    return div().id(`call-${r.address}`).w(48).h(48).relative().overflow_hidden().rounded(6).bg("#cfe6f5")
      .border_2().border_color(ring[st] ?? ring.idle).cursor_pointer().tooltip(r.title)
      .on_click(() => run("pane.focus", { pane: r.pane }))
      .child(div().absolute().left(0).top(0).w(44).h(60).child(face(r.who, 44, 1.5))
        .when(st === "working", (el) => el.loop("top", { from: 0, to: -2, period: 320 })))
      .when(st === "idle", (el) => el.child(div().absolute().left(0).top(0).size_full().bg("#2a2440").opacity(0.45))
        .child(div().absolute().right(3).top(1).text_size(8).font_bold().text_color("#e4dcff").frames(["z", "zZ", "zZz"], 900)))
      .when(st === "blocked", (el) => el.child(div().absolute().right(2).top(1).px(3).rounded(3).bg("#e05252")
        .text_size(9).font_bold().text_color("#ffffff").child("!").loop("opacity", { from: 0.4, to: 1, period: 600 })))
      .when(st === "done", (el) => el.child(div().absolute().right(2).top(1).px(3).rounded(3).bg("#2f9a50")
        .text_size(9).font_bold().text_color("#ffffff").child("✓")))
      .child(div().absolute().left(0).bottom(0).w_full().h(10).bg("#3b3350cc").px(2).flex().items_center()
        .text_size(7).text_color("#ffffff").child(div().truncate().child(r.name)));
  };
  const machines = [...new Set(remotes.map((r) => r.machine))].join(", ");
  return div().absolute().left(x).top(y).p(4).bg("#4a3f5c").rounded(8).border_2().border_color("#6b5d80").flex().flex_col().gap(3)
    .child(div().flex().items_center().gap(4).max_w(48 * 3 + 6).text_size(8).font_bold()
      .child(div().size(5).flex_none().rounded_full().bg("#ff8a8a").loop("opacity", { from: 0.3, to: 1, period: 1200 }))
      .child(div().truncate().text_color("#efe8ff").child(`REMOTE · ${machines}`)))
    .child(div().flex().flex_wrap().gap(3).max_w(48 * 3 + 6).max_h(h - 22).overflow_hidden().children(remotes.slice(0, 6).map(tile)));
}

// The way in and out, on the back wall. Open while someone passes through.
export function door(x, base, open) {
  const S = A.S;
  const w = A.w("door"), h = A.h("door");
  return div().absolute().left(x).top(base - h).w(w).h(h)
    .child(div().absolute().left(w / 2 - 22).top(-24).w(44).h(18).rounded(5).bg("#4fb477").border_2().border_color("#e9fff0")
      .flex().items_center().justify_center().text_size(10).font_bold().text_color("#ffffff").child("EXIT"))
    .child(A.still("door", 0, h))
    .when(open, (el) => el
      .child(div().absolute().left(4 * S).top(4 * S).w(26 * S).h(54 * S).bg("#3a2c36"))
      .child(div().absolute().left(4 * S).top(50 * S).w(26 * S).h(8 * S).bg("#5a4650")));
}

export function stringLights(W, y) {
  const colors = ["#f07a7a", "#f6cf5a", "#7ad68f", "#6aa9f0"];
  const els = [div().absolute().left(0).top(y).w(W).h(1).bg("#5a7a5a")];
  for (let x = 14, k = 0; x < W; x += 28, k++)
    els.push(div().absolute().left(x).top(y + 1).w(5).h(7).rounded(3).bg(colors[k % 4])
      .loop("opacity", { from: k % 2 ? 0.35 : 1, to: k % 2 ? 1 : 0.35, period: 1600 }));
  return els;
}

export function banner(W, y, text, bg) {
  return div().absolute().left(W / 2 - 110).top(y).w(220).h(22).rounded(11).bg(bg).flex().items_center().justify_center()
    .text_size(12).font_bold().text_color("#fffaf0").child(text);
}

// A spinning red light over the desk, and the whole room washed red in time.
export function alarm(W, H, x) {
  return [
    div().absolute().left(0).top(0).w(W).h(H).bg("#ff2a2a").loop("opacity", { from: 0, to: 0.13, period: 900 }),
    div().absolute().left(x - 40).top(0).w(80).h(30).rounded_full().bg("#ff5a5a").loop("opacity", { from: 0, to: 0.35, period: 450 }),
    A.still("t-siren", x - A.w("t-siren") / 2, A.h("t-siren")).loop("opacity", { from: 0.55, to: 1, period: 450 }),
  ];
}
