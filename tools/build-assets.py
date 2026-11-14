#!/usr/bin/env python3
"""Builds mods/office/assets/ and mods/office/sprites.js from the source pixel art in art/.

The art was generated with PixelLab at its native resolution (one sprite pixel per image
pixel). The office draws a sprite pixel as half an art unit, and GPUI smooths images it
has to enlarge, so every sprite is trimmed and scaled up here with hard edges.

    art/props/<name>.png                 a still, on any canvas; built if the mod's code names it
    art/interns/<name>.png               a still, facing right; built if art.js lists it
    art/people/<who>/south.png           the character facing the viewer
    art/people/<who>/<anim>/NNN.png      animation frames, the character centered
    art/cat/<anim>/NNN.png               the same, for the cat
    art/live/<name>/NNN.png              a prop that moves: replaces the still of that name

Needs ImageMagick 7 (`magick`). Run it from anywhere: `python3 tools/build-assets.py`.
"""
import colorsys
import os
import re
import shutil
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ART = os.path.join(ROOT, "art")
OUT = os.path.join(ROOT, "mods", "office", "assets")
SCALE = 4  # image px per sprite px
CANVAS = 96  # frames are centered on a square this big before cropping

# Loops: which frames play, in order, and how long each shows (ms). The custom animations
# start on the character's standing pose, so their loops skip into the motion.
PEOPLE = {
    "walk": {"frames": [0, 1, 2, 3, 4, 5, 6, 7], "ms": 90, "flip": True},
    "drink": {"frames": [2, 2, 2, 2, 2, 2, 3, 4, 5, 6, 7, 8], "ms": 170, "flip": True},
    # Sitting down takes the first frames; the loop is the seated part.
    "type": {"frames": [6, 7, 8, 9, 8, 7], "ms": 150, "flip": False},
    "cheer": {"frames": [2, 3, 4, 5, 6, 7, 8], "ms": 90, "flip": False},
    "help": {"frames": [2, 3, 4, 5, 6, 5, 4, 3], "ms": 120, "flip": False},
    "nap": {"frames": [4, 5, 6, 7, 8, 7, 6, 5], "ms": 320, "flip": False},
}
CAT = {
    "walk": {"frames": [0, 1, 2, 3, 4, 5], "ms": 90, "flip": True},
    "sit": {"frames": list(range(10)), "ms": 190, "flip": True},
    "sleep": {"frames": [6, 7, 8, 7], "ms": 480, "flip": True},
}
# Props that move. `window` is the part that does (x0, y0, x1, y1 on the source canvas):
# everything outside it is taken from the first frame, so a cabinet can't flicker.
LIVE = {
    "claw": {"frames": [1, 2, 3, 4, 5, 6, 7, 8], "ms": 180, "flip": False, "window": (14, 17, 49, 43)},
    "counter": {"frames": [1, 2, 3, 4, 5, 6, 7, 8], "ms": 180, "flip": False, "window": (11, 5, 39, 32)},
    # 16 frames that end where they began, so the fish never jump.
    "fishtank": {"frames": list(range(16)), "ms": 170, "flip": False, "window": (15, 15, 48, 35)},
}
# Drawn like the coworkers, but not one of them.
EXTRAS = {"courier"}
# Recolors made here rather than drawn: desks in more colors, and a mug per agent program.
DESK_HUES = {"mint": 0.42, "blue": 0.60, "lilac": 0.75, "butter": 0.13}
CHAIR_HUES = {"mint": 0.42, "sky": 0.58, "butter": 0.13}
# The chair's armrest, drawn again over whoever sits in it so they're in the chair and not
# in front of it: rows ARM_ROW to ARM_END right of ARM_X, in the trimmed chair's px.
ARM_ROW, ARM_END, ARM_X = 17, 22, 18
MUG_COLORS = {"claude": "#d97757", "codex": "#e8e8e8", "gemini": "#4f86f7", "cursor": "#4a4a55", "opencode": "#58b368", "amp": "#9b6bdc"}
# Per-character overrides, where a generated clip needs different frames.
OVERRIDES = {}


def magick(*args):
    r = subprocess.run(["magick", *args], capture_output=True, text=True)
    if r.returncode:
        sys.exit(f"magick {' '.join(args)}\n{r.stderr}")
    return r.stdout.strip()


def bbox(*inputs):
    """Trim box of the given images laid over each other: (w, h, x, y)."""
    out = magick(*inputs, "-background", "none", "-layers", "merge", "-format", "%@", "info:")
    w, h, x, y = map(int, re.match(r"(\d+)x(\d+)\+(-?\d+)\+(-?\d+)", out).groups())
    return w, h, x, y


def pixels(src):
    """A trimmed sprite as (w, h, bytearray of RGBA)."""
    w, h, x, y = bbox(src)
    raw = subprocess.run(["magick", src, "-crop", f"{w}x{h}+{x}+{y}", "+repage", "-depth", "8", "rgba:-"], capture_output=True).stdout
    return w, h, bytearray(raw)


def save(w, h, px, dst):
    subprocess.run(["magick", "-size", f"{w}x{h}", "-depth", "8", "rgba:-", f"PNG32:{dst}"], input=bytes(px), check=True)


def rehue(src, dst, hue):
    """The same sprite with its colored parts turned to another hue (grays stay)."""
    w, h, px = pixels(src)
    for i in range(0, len(px), 4):
        hh, l, sat = colorsys.rgb_to_hls(px[i] / 255, px[i + 1] / 255, px[i + 2] / 255)
        if sat > 0.18 and l > 0.3:
            px[i:i + 3] = bytes(round(c * 255) for c in colorsys.hls_to_rgb(hue, l, sat * 0.85))
    save(w, h, px, dst)


def tint(src, dst, color):
    """The same sprite with its white parts in a color."""
    w, h, px = pixels(src)
    rgb = [int(color[k:k + 2], 16) for k in (1, 3, 5)]
    for i in range(0, len(px), 4):
        _, l, sat = colorsys.rgb_to_hls(px[i] / 255, px[i + 1] / 255, px[i + 2] / 255)
        if sat < 0.3 and l > 0.55:
            px[i:i + 3] = bytes(min(255, round(c * l / 0.95)) for c in rgb)
    save(w, h, px, dst)


def wipe(src, dst, x0, y0, x1, y1, color=(255, 255, 255)):
    """The same sprite with a rectangle (in its trimmed px) painted over: a clock without hands."""
    w, h, px = pixels(src)
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            px[(y * w + x) * 4:(y * w + x) * 4 + 3] = bytes(color)
    save(w, h, px, dst)


def front(src, dst):
    """A chair's armrest alone, on the chair's own canvas so the two line up."""
    w, h, px = pixels(src)
    for y in range(h):
        for x in range(w):
            if not (ARM_ROW <= y <= ARM_END and x >= ARM_X):
                px[(y * w + x) * 4:(y * w + x) * 4 + 4] = b"\0\0\0\0"
    save(w, h, px, dst)


def steady(folder, spec, tmp):
    """A moving prop's frames with everything outside its window taken from the first frame."""
    files = sorted(f for f in os.listdir(folder) if f.endswith(".png"))
    size = magick(os.path.join(folder, files[0]), "-format", "%w %h", "info:").split()
    w, h = int(size[0]), int(size[1])
    raw = lambda f: bytearray(subprocess.run(["magick", os.path.join(folder, f), "-depth", "8", "rgba:-"], capture_output=True).stdout)
    base = raw(files[0])
    x0, y0, x1, y1 = spec["window"]
    out = os.path.join(tmp, os.path.basename(folder))
    os.makedirs(out)
    for f in files:
        px = raw(f)
        for y in range(h):
            for x in range(w):
                if not (x0 <= x <= x1 and y0 <= y <= y1):
                    i = (y * w + x) * 4
                    px[i:i + 4] = base[i:i + 4]
        save(w, h, px, os.path.join(out, f))
    return out


def biggest(src, dst):
    """The same sprite without stray specks: only its largest connected piece."""
    w, h, px = pixels(src)
    seen, best = set(), []
    for start in range(w * h):
        if start in seen or px[start * 4 + 3] == 0:
            continue
        piece, todo = [], [start]
        seen.add(start)
        while todo:
            n = todo.pop()
            piece.append(n)
            x, y = n % w, n // w
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1):
                    m = (y + dy) * w + x + dx
                    if 0 <= x + dx < w and 0 <= y + dy < h and m not in seen and px[m * 4 + 3]:
                        seen.add(m)
                        todo.append(m)
        if len(piece) > len(best):
            best = piece
    keep = set(best)
    for n in range(w * h):
        if n not in keep:
            px[n * 4:n * 4 + 4] = b"\0\0\0\0"
    save(w, h, px, dst)


def derived(tmp):
    """Sprites made from others: returns {name: path}."""
    props = os.path.join(ART, "props")
    out = {}
    for name, hue in DESK_HUES.items():
        out[f"desk-{name}-xl"] = os.path.join(tmp, f"desk-{name}-xl.png")
        rehue(os.path.join(props, "desk-pink-xl.png"), out[f"desk-{name}-xl"], hue)
    for name, color in MUG_COLORS.items():
        out[f"t-mug-{name}"] = os.path.join(tmp, f"t-mug-{name}.png")
        tint(os.path.join(props, "t-mug.png"), out[f"t-mug-{name}"], color)
    chairs = {"pink": os.path.join(props, "chair-side-pink.png")}
    for name, hue in CHAIR_HUES.items():
        chairs[name] = out[f"chair-side-{name}"] = os.path.join(tmp, f"chair-side-{name}.png")
        rehue(chairs["pink"], chairs[name], hue)
    for name, src in chairs.items():
        out[f"chair-side-{name}-front"] = os.path.join(tmp, f"chair-side-{name}-front.png")
        front(src, out[f"chair-side-{name}-front"])
    out["clock-cat"] = os.path.join(tmp, "clock-cat.png")
    wipe(os.path.join(props, "clock-cat.png"), out["clock-cat"], 7, 9, 15, 19)
    out["umbrellas"] = os.path.join(tmp, "umbrellas.png")
    biggest(os.path.join(props, "umbrellas.png"), out["umbrellas"])
    return out


def still(src, dst, flop=False, trim=True):
    if trim:
        w, h, x, y = bbox(src)
    else:
        w, h = map(int, magick(src, "-format", "%w %h", "info:").split())
        x = y = 0
    args = [src, "-crop", f"{w}x{h}+{x}+{y}", "+repage"]
    if flop:
        args.append("-flop")
    magick(*args, "-filter", "point", "-resize", f"{SCALE * 100}%", f"PNG32:{dst}")
    return w, h


def centered(frame):
    return ["(", frame, "-background", "none", "-gravity", "center", "-extent", f"{CANVAS}x{CANVAS}", ")"]


def clip(frames_dir, spec, dst, flop=False):
    """An animated WebP of one loop, cropped to the box all its frames share.

    Returns [w, h, dx, dy]: the box, and where its top-left sits from the point between
    the character's feet (the canvas center, at the standing sprite's bottom edge)."""
    files = sorted(f for f in os.listdir(frames_dir) if f.endswith(".png"))
    picks = [os.path.join(frames_dir, files[i]) for i in spec["frames"] if i < len(files)]
    w, h, x, y = bbox(*[a for f in set(picks) for a in centered(f)])
    args = ["-dispose", "Background", "-delay", str(spec["ms"] // 10), "-loop", "0"]
    for f in picks:
        args += centered(f)
    args += ["+gravity", "-crop", f"{w}x{h}+{x}+{y}", "+repage"]
    if flop:
        args.append("-flop")
    magick(*args, "-filter", "point", "-resize", f"{SCALE * 100}%", "-define", "webp:lossless=true", dst)
    return [w, h, x, y]


def feet(still_png):
    """The standing sprite's bottom edge on the shared canvas."""
    w, h, x, y = bbox(*centered(still_png))
    return y + h


def named():
    """Every quoted word in the mod's code: a sprite ships only if the mod names it."""
    words = set()
    mod = os.path.join(ROOT, "mods", "office")
    for f in ("main.js", "art.js", "decor.js"):
        words.update(re.findall(r'"([a-z0-9-]+)"', open(os.path.join(mod, f)).read()))
    return words


def main():
    shutil.rmtree(OUT, ignore_errors=True)
    os.makedirs(OUT)
    size, anim = {}, {}
    used = named()

    with tempfile.TemporaryDirectory() as tmp:
        sources = {name[:-4]: os.path.join(ART, "props", name) for name in sorted(os.listdir(os.path.join(ART, "props")))}
        sources.update(derived(tmp))
        for key in sorted(sources):
            if key in used:
                size[key] = still(sources[key], os.path.join(OUT, f"{key}.png"))
            elif key.endswith("-front") and key[:-6] in used:
                size[key] = still(sources[key], os.path.join(OUT, f"{key}.png"), trim=False)

        live = []
        for name in sorted(os.listdir(os.path.join(ART, "live"))):
            frames = steady(os.path.join(ART, "live", name), LIVE[name], tmp)
            w, h, _, _ = clip(frames, LIVE[name], os.path.join(OUT, f"{name}.webp"))
            size[name] = (w, h)
            live.append(name)
            os.remove(os.path.join(OUT, f"{name}.png"))

    for name in sorted(os.listdir(os.path.join(ART, "interns"))):
        if name[:-4] not in used:
            continue
        key = f"i-{name[:-4]}"
        src = os.path.join(ART, "interns", name)
        size[key] = still(src, os.path.join(OUT, f"{key}.png"))
        still(src, os.path.join(OUT, f"{key}-l.png"), flop=True)

    def actor(prefix, folder, loops, ground_png):
        ground = feet(ground_png) if ground_png else None
        for a, spec in loops.items():
            d = os.path.join(folder, a)
            if not os.path.isdir(d):
                continue
            spec = OVERRIDES.get(f"{prefix}-{a}", spec)
            w, h, x, y = clip(d, spec, os.path.join(OUT, f"{prefix}-{a}.webp"))
            if ground is None:
                y = -h
            else:
                y -= ground
            anim[f"{prefix}-{a}"] = [w, h, x - CANVAS // 2, y]
            if spec["flip"]:
                clip(d, spec, os.path.join(OUT, f"{prefix}-{a}-l.webp"), flop=True)
                anim[f"{prefix}-{a}-l"] = [w, h, CANVAS // 2 - x - w, y]

    people = sorted(os.listdir(os.path.join(ART, "people")))
    for who in people:
        folder = os.path.join(ART, "people", who)
        south = os.path.join(folder, "south.png")
        size[f"p-{who}"] = still(south, os.path.join(OUT, f"p-{who}.png"))
        actor(f"p-{who}", folder, PEOPLE, south)

    cat = os.path.join(ART, "cat")
    if os.path.isdir(cat):
        actor("cat", cat, CAT, None)  # each cat clip stands on its own lowest pixel

    with open(os.path.join(ROOT, "mods", "office", "sprites.js"), "w") as f:
        f.write("// Generated by tools/build-assets.py from art/. Sizes are in sprite pixels.\n")
        f.write("// SIZE: stills, [w, h]. ANIM: loops, [w, h, dx, dy] from the point between the feet.\n")
        f.write("// CAST: the coworkers. LIVE: props that are animations (.webp) rather than stills (.png).\n")
        f.write(f"export const CAST = {[p for p in people if p not in EXTRAS]!r};\n".replace("'", '"'))
        f.write(f"export const LIVE = {live!r};\n".replace("'", '"'))
        f.write("export const SIZE = {\n")
        for k in sorted(size):
            f.write(f'  "{k}": [{size[k][0]}, {size[k][1]}],\n')
        f.write("};\nexport const ANIM = {\n")
        for k in sorted(anim):
            f.write(f'  "{k}": [{", ".join(map(str, anim[k]))}],\n')
        f.write("};\n")
    print(f"{len(size)} stills, {len(anim)} loops -> {OUT}")


if __name__ == "__main__":
    main()
