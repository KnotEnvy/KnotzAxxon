/**
 * Renders the trailer with Remotion, then masters the sound.
 *
 *   node render.mjs                  -> out/KnotzAxxon-Trailer-1080p60.mp4 (then run review.mjs)
 *   node render.mjs --stills=1.5,20  -> work/review/still-<t>.jpg
 *   node render.mjs --thumbnail      -> out/KnotzAxxon-Thumbnail.jpg
 *   node render.mjs --frames=0-599   -> a partial render for review (work/review/part.mp4)
 *   add --short to any of these for the 4:5 short (out/KnotzAxxon-Short-4x5-60fps.mp4, the cover
 *   out/KnotzAxxon-Short-Cover.jpg, review files in work/review/short/)
 */
import { bundle } from "@remotion/bundler";
import { renderMedia, renderStill, selectComposition } from "@remotion/renderer";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (n) => args.find((a) => a.startsWith(`--${n}=`))?.split("=").slice(1).join("=");
process.env.LD_LIBRARY_PATH = [process.env.LD_LIBRARY_PATH, "/home/knotz2/.local/opt/chromium-libs/root/usr/lib/x86_64-linux-gnu"].filter(Boolean).join(":");
// Reuse Playwright's headless shell instead of downloading another browser.
const shell = (() => {
  const cache = path.join(process.env.HOME, ".cache", "ms-playwright");
  const dirs = fs.readdirSync(cache).filter((d) => d.startsWith("chromium_headless_shell-")).sort().reverse();
  for (const d of dirs) {
    const exe = path.join(cache, d, "chrome-headless-shell-linux64", "chrome-headless-shell");
    if (fs.existsSync(exe)) return exe;
  }
  return null;
})();
const port = Number(opt("port") ?? 3057);
const common = { browserExecutable: shell, port, chromiumOptions: { gl: "swangle" } };

console.log("bundling...");
const serveUrl = await bundle({ entryPoint: path.join(ROOT, "edit", "index.ts"), publicDir: path.join(ROOT, "public") });
const SHORT = args.includes("--short");
const review = path.join(ROOT, "work", "review", ...(SHORT ? ["short"] : []));
fs.mkdirSync(review, { recursive: true });
fs.mkdirSync(path.join(ROOT, "out"), { recursive: true });

if (args.includes("--thumbnail") && SHORT) {
  const composition = await selectComposition({ serveUrl, id: "ShortCover", ...common });
  const output = path.join(ROOT, "out", "KnotzAxxon-Short-Cover.jpg");
  await renderStill({ composition, serveUrl, output, imageFormat: "jpeg", jpegQuality: 92, ...common });
  console.log(output);
  process.exit(0);
}
if (args.includes("--thumbnail")) {
  const composition = await selectComposition({ serveUrl, id: "Thumbnail", ...common });
  const full = path.join(review, "thumbnail-1080.png");
  await renderStill({ composition, serveUrl, output: full, imageFormat: "png", ...common });
  const output = path.join(ROOT, "out", "KnotzAxxon-Thumbnail.jpg");
  spawnSync("ffmpeg", ["-y", "-v", "error", "-i", full, "-vf", "scale=1280:720:flags=lanczos", "-q:v", "2", output]);
  console.log(output);
  process.exit(0);
}
const composition = await selectComposition({ serveUrl, id: SHORT ? "Short" : "Trailer", ...common });
const stills = opt("stills");
if (stills) {
  for (const t of stills.split(",").map(Number)) {
    const output = path.join(review, `still-${t.toFixed(2)}.jpg`);
    await renderStill({ composition, serveUrl, output, frame: Math.round(t * composition.fps), imageFormat: "jpeg", jpegQuality: 88, ...common });
    console.log(output);
  }
  process.exit(0);
}
const range = opt("frames")?.split("-").map(Number);
const silent = path.join(ROOT, "work", `${SHORT ? "short-" : ""}${range ? "part-raw.mov" : "trailer-raw.mov"}`);
const t0 = Date.now();
let lastLog = 0;
if (!args.includes("--master-only")) await renderMedia({
  composition, serveUrl, codec: "h264", outputLocation: silent, ...common,
  frameRange: range ? [range[0], range[1]] : undefined,
  crf: 14, x264Preset: "slow", pixelFormat: "yuv420p", audioCodec: "pcm-16", audioBitrate: undefined,
  concurrency: Number(opt("concurrency") ?? 10), timeoutInMilliseconds: 240000, offthreadVideoCacheSizeInBytes: 2 * 1024 ** 3, offthreadVideoThreads: 4,
  onProgress: ({ progress }) => { const now = Date.now(); if (now - lastLog > 15000) { lastLog = now; console.log(`${(progress * 100).toFixed(1)}%  ${((now - t0) / 1000).toFixed(0)} s`); } },
});
console.log(`rendered in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
// Master: measure, apply plain gain to -14 LUFS (streaming target), then a peak
// limiter (ceiling -1.5 dBFS, 4x oversampled detection) so impacts keep their shape.
const out = range ? path.join(review, "part.mp4") : path.join(ROOT, "out", SHORT ? "KnotzAxxon-Short-4x5-60fps.mp4" : "KnotzAxxon-Trailer-1080p60.mp4");
const lufs = (file, af = "") => {
  const p = spawnSync("ffmpeg", ["-hide_banner", "-nostats", "-i", file, "-af", `${af}${af ? "," : ""}ebur128=peak=true`, "-f", "null", "-"], { encoding: "utf8" });
  const tail = p.stderr.slice(p.stderr.lastIndexOf("Summary:"));
  return { I: Number(tail.match(/I:\s+(-?[\d.]+) LUFS/)[1]), TP: Number(tail.match(/Peak:\s+(-?[\d.]+) dBFS/)[1]) };
};
const limit = "alimiter=limit=0.68:attack=1:release=60:level=disabled:asc=1";
let gain = -14 - lufs(silent).I;
for (let k = 0; k < 2; k++) gain += -14 - lufs(silent, `volume=${gain.toFixed(2)}dB,${limit}`).I; // the limiter costs a little loudness
const r = spawnSync("ffmpeg", ["-y", "-v", "error", "-i", silent, "-c:v", "copy", "-af", `volume=${gain.toFixed(2)}dB,${limit},aresample=48000`, "-c:a", "aac", "-b:a", "320k", "-movflags", "+faststart", out], { encoding: "utf8" });
if (r.status !== 0) { console.error(r.stderr); process.exit(1); }
const fin = lufs(out);
console.log(`gain ${gain.toFixed(2)} dB -> ${fin.I} LUFS, true peak ${fin.TP} dBTP -> ${out}`);
