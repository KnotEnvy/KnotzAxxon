// The review loop, run after every render:
//   1. a contact sheet of the final, one frame per half bar (work/review/sheet-*.jpg)
//   2. per-bar loudness of the final against the score alone
//   3. full-resolution stills at every section start (work/review/sec-<bar>.jpg)
//   node review.mjs [file]      (--short: the 4:5 short, into work/review/short/)
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const SHORT = process.argv.includes("--short");
const file = process.argv.slice(2).find((a) => !a.startsWith("--")) || path.join(ROOT, "out", SHORT ? "KnotzAxxon-Short-4x5-60fps.mp4" : "KnotzAxxon-Trailer-1080p60.mp4");
const dir = path.join(ROOT, "work", "review", ...(SHORT ? ["short"] : []));
fs.mkdirSync(dir, { recursive: true });
const BAR = 100 / 60;
const SECTIONS = SHORT
  ? [0, 1, 2, 3, 4, 5, 7, 9, 10, 11, 13, 15, 16, 18, 19, 19.5, 20, 22, 23.7]
  : [0, 3, 4, 6, 8, 12, 16, 18, 20, 22, 24, 28, 30, 32, 34, 36, 40, 42, 44, 46.3];
const ff = (a) => spawnSync("ffmpeg", ["-y", "-v", "error", ...a], { encoding: "utf8" });

// 1. half-bar contact sheets, 4 bars x 2 per row, 3 sheets
const tmp = fs.mkdtempSync(path.join(dir, "hb-"));
ff(["-i", file, "-vf", `fps=${1 / (BAR / 2)},scale=320:-2,drawtext=fontfile=/home/knotz2/.local/share/fonts/win/arialbd.ttf:text='%{eif\\:n/2\\:d}.%{eif\\:mod(n\\,2)*5\\:d}':x=6:y=h-24:fontsize=18:fontcolor=yellow:box=1:boxcolor=black@0.6`, path.join(tmp, "%03d.jpg")]);
const n = fs.readdirSync(tmp).length;
const per = 40;
for (let s = 0; s * per < n; s++) {
  ff(["-start_number", String(s * per + 1), "-i", path.join(tmp, "%03d.jpg"), "-frames:v", "1", "-vf", `tile=8x${Math.ceil(Math.min(per, n - s * per) / 8)}`, "-q:v", "3", path.join(dir, `sheet-${s}.jpg`)]);
}
fs.rmSync(tmp, { recursive: true });
console.log(`sheets: ${Math.ceil(n / per)} (${n} frames, bar.half labels)`);

// 3. section-start stills (a few frames in, so cuts that land on the downbeat show their first content)
for (const bar of SECTIONS) ff(["-ss", (bar * BAR + 0.05).toFixed(3), "-i", file, "-frames:v", "1", "-q:v", "2", path.join(dir, `sec-${String(bar).padStart(4, "0")}.jpg`)]);
console.log(`stills: ${SECTIONS.length} in ${dir}`);

// 2. loudness per bar: final vs score
const r = spawnSync(process.execPath, [path.join(ROOT, "audio", "bars.mjs"), file, `--compare=${path.join(ROOT, "work", "audio", SHORT ? "music-short.wav" : "music.wav")}`], { encoding: "utf8" });
console.log("per-bar LUFS  final/score");
console.log(r.stdout);
