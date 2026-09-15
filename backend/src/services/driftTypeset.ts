import fs from "node:fs";
import path from "node:path";
import * as opentype from "opentype.js";

/**
 * Brand type for images the server draws (share cards, icons): Bai Jamjuree — the drift.li
 * font — bundled in backend/assets/fonts (SIL Open Font License) and drawn as SVG paths, so
 * text looks the same on every machine whatever fonts the server has installed.
 */

export type Weight = "bold" | "semibold" | "medium";
const FILES: Record<Weight, string> = {
  bold: "BaiJamjuree-Bold.ttf",
  semibold: "BaiJamjuree-SemiBold.ttf",
  medium: "BaiJamjuree-Medium.ttf",
};
// src/services and dist/services both sit two levels below backend/.
const FONT_DIRS = [path.resolve(__dirname, "../../assets/fonts"), path.resolve(process.cwd(), "assets/fonts")];
const fonts = new Map<Weight, opentype.Font>();

export function font(weight: Weight): opentype.Font {
  let f = fonts.get(weight);
  if (!f) {
    const dir = FONT_DIRS.find((d) => fs.existsSync(path.join(d, FILES[weight])));
    if (!dir) throw new Error(`Font ${FILES[weight]} not found in ${FONT_DIRS.join(" or ")}`);
    const buf = fs.readFileSync(path.join(dir, FILES[weight]));
    f = opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
    fonts.set(weight, f);
  }
  return f;
}

/** Only what the font can draw: curly quotes straightened, whitespace collapsed, unknown symbols
 *  and emoji dropped (they'd print as empty boxes). Keeps leading/trailing spaces. */
function glyphsOnly(value: string, weight: Weight): string {
  const f = font(weight);
  const clean = String(value ?? "")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ");
  return Array.from(clean)
    .filter((ch) => ch === " " || f.charToGlyphIndex(ch) > 0)
    .join("")
    .replace(/ {2,}/g, " ");
}

/** Text the font can draw, trimmed. */
export const drawable = (value: string, weight: Weight) => glyphsOnly(value, weight).trim();

/** Width of a line in px; `tracking` = extra space between letters, in em. */
export function measure(value: string, weight: Weight, size: number, tracking = 0): number {
  const f = font(weight);
  if (!tracking) return f.getAdvanceWidth(value, size, { kerning: true });
  const chars = Array.from(value);
  return chars.reduce((w, ch) => w + f.getAdvanceWidth(ch, size), 0) + tracking * size * Math.max(0, chars.length - 1);
}

export type TextOpts = {
  weight: Weight;
  size: number;
  /** x of the anchor, y of the baseline */
  x: number;
  y: number;
  anchor?: "start" | "middle" | "end";
  tracking?: number;
};

export type Run = { text: string; fill: string; opacity?: number };

/** Differently coloured runs on one line (e.g. "drift" + ".li"), as SVG paths. Spaces inside
 *  runs are kept, so ["the ", "Movement."] reads "the Movement.". */
export function runs(parts: Run[], o: TextOpts): string {
  const f = font(o.weight);
  const tracking = o.tracking ?? 0;
  const items = parts.map((p) => ({ ...p, text: glyphsOnly(p.text, o.weight) })).filter((p) => p.text.length);
  if (!items.length) return "";
  const total = measure(items.map((p) => p.text).join(""), o.weight, o.size, tracking);
  let x = o.anchor === "middle" ? o.x - total / 2 : o.anchor === "end" ? o.x - total : o.x;
  return items
    .map((p) => {
      let d = "";
      if (!tracking) {
        d = f.getPath(p.text, x, o.y, o.size, { kerning: true }).toPathData(2);
        x += f.getAdvanceWidth(p.text, o.size, { kerning: true });
      } else {
        for (const ch of Array.from(p.text)) {
          if (ch !== " ") d += f.getPath(ch, x, o.y, o.size).toPathData(2);
          x += f.getAdvanceWidth(ch, o.size) + tracking * o.size;
        }
      }
      return d ? `<path d="${d}" fill="${p.fill}"${p.opacity !== undefined ? ` fill-opacity="${p.opacity}"` : ""}/>` : "";
    })
    .join("");
}

/** One line of text as SVG paths. */
export const text = (value: string, fill: string, o: TextOpts & { opacity?: number }) =>
  runs([{ text: drawable(value, o.weight), fill, opacity: o.opacity }], o);

/** Cuts a line to `maxWidth` with a trailing "…". */
export function ellipsize(line: string, weight: Weight, size: number, maxWidth: number): string {
  let s = drawable(line, weight);
  if (measure(s, weight, size) <= maxWidth) return s;
  while (s.length > 1 && measure(`${s}…`, weight, size) > maxWidth) s = s.slice(0, -1).trimEnd();
  return `${s}…`;
}

/** Greedy word wrap to `maxWidth` in at most `maxLines`; the last line gets "…" when text is cut. */
export function wrap(value: string, weight: Weight, size: number, maxWidth: number, maxLines: number): string[] {
  const words = drawable(value, weight).split(" ").filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (measure(next, weight, size) <= maxWidth) {
      cur = next;
      continue;
    }
    if (cur) lines.push(cur);
    cur = measure(w, weight, size) <= maxWidth ? w : ellipsize(w, weight, size, maxWidth);
  }
  if (cur) lines.push(cur);
  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  const last = ellipsize(`${kept[maxLines - 1]} ${lines[maxLines]}`, weight, size, maxWidth);
  kept[maxLines - 1] = last.endsWith("…") ? last : ellipsize(`${last}…`, weight, size, maxWidth);
  return kept;
}
