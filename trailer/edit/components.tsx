import React from "react";
import { AbsoluteFill, Audio, Easing, OffthreadVideo, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { C, MONO, W, H } from "./style";

export const ease = Easing.bezier(0.45, 0, 0.2, 1);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Progress 0..1 between two frames, eased. */
export function prog(frame: number, from: number, to: number, e: (t: number) => number = ease) {
  return interpolate(frame, [from, to], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: e });
}

/** Camera keys over a clip (local frames): zoom z about focus (fx, fy) in 1920x1080 frame coordinates. */
export type Key = { f: number; z?: number; fx?: number; fy?: number };
export function camAt(keys: Key[] | undefined, frame: number) {
  let z = 1, fx = W / 2, fy = H / 2;
  if (!keys?.length) return { z, fx, fy };
  z = keys[0].z ?? z; fx = keys[0].fx ?? fx; fy = keys[0].fy ?? fy;
  for (let i = 1; i < keys.length; i++) {
    const k = keys[i];
    const nz = k.z ?? z, nfx = k.fx ?? fx, nfy = k.fy ?? fy;
    if (frame >= k.f) { z = nz; fx = nfx; fy = nfy; continue; }
    const t = prog(frame, keys[i - 1].f, k.f);
    return { z: lerp(z, nz, t), fx: lerp(fx, nfx, t), fy: lerp(fy, nfy, t) };
  }
  return { z, fx, fy };
}

/**
 * A gameplay shot, filling its box (the whole frame by default; `box` for a
 * panel). `variant` picks a re-render of the same instant through another
 * camera rig (e.g. "modern"); `hd` uses the 2x master for zooms and crops.
 * Keys zoom about a focus point given in 1920x1080 footage coordinates; the
 * focus sits at the centre of the box, clamped so the picture always covers.
 */
export const Shot: React.FC<{ id: string; variant?: string; trim: number; keys?: Key[]; hd?: boolean; filter?: string; style?: React.CSSProperties; box?: { w: number; h: number } }> = ({ id, variant, trim, keys, hd, filter, style, box }) => {
  const f = useCurrentFrame();
  const cfg = useVideoConfig();
  const bw = box?.w ?? cfg.width, bh = box?.h ?? cfg.height;
  const { z, fx, fy } = camAt(keys, f);
  const s = Math.max(bw / W, bh / H) * z;
  const vw = W * s, vh = H * s;
  const left = Math.min(0, Math.max(bw - vw, bw / 2 - fx * s));
  const top = Math.min(0, Math.max(bh - vh, bh / 2 - fy * s));
  const file = `footage/${id}${variant ? "_" + variant : ""}${hd ? "-4k" : ""}.mp4`;
  return (
    <AbsoluteFill style={{ overflow: "hidden", background: C.bg, ...style }}>
      <OffthreadVideo src={staticFile(file)} trimBefore={trim} muted
        style={{ position: "absolute", left, top, width: vw, height: vh, filter }} />
    </AbsoluteFill>
  );
};

/** The shot's own game sound (capture/sfx-pass.mjs), trimmed like the picture, with short fades at the cut. */
export const Sfx: React.FC<{ id: string; trim: number; dur: number; volume?: number; fadeIn?: number; fadeOut?: number }> = ({ id, trim, dur, volume = 2, fadeIn = 3, fadeOut = 4 }) => (
  <Audio src={staticFile(`audio/sfx/${id}.wav`)} trimBefore={trim}
    volume={(f) => volume * Math.min(1, (f + 1) / fadeIn, Math.max(0, (dur - f) / fadeOut))} />
);

/** A full-frame flash that decays (impact accents). */
export const Flash: React.FC<{ at: number; len?: number; peak?: number; color?: string }> = ({ at, len = 14, peak = 0.85, color = "#eafcff" }) => {
  const f = useCurrentFrame();
  if (f < at || f > at + len) return null;
  const o = peak * (1 - (f - at) / len) ** 2;
  return <AbsoluteFill style={{ background: color, opacity: o, mixBlendMode: "screen" }} />;
};

/** Fade to/from a colour over a window. */
export const Fade: React.FC<{ from: number; to: number; invert?: boolean; color?: string; max?: number }> = ({ from, to, invert, color = C.bg, max = 1 }) => {
  const f = useCurrentFrame();
  const t = prog(f, from, to, Easing.inOut(Easing.quad));
  const o = (invert ? 1 - t : t) * max;
  if (o <= 0.001) return null;
  return <AbsoluteFill style={{ background: color, opacity: o }} />;
};

/**
 * Text reveal in the game's sector-card manner: a stepped clip-path wipe
 * (Screens.sectorCard uses steps(14) over 550 ms) with a slight slide.
 */
export const Reveal: React.FC<{ at: number; out?: number; dur?: number; steps?: number; children: React.ReactNode; style?: React.CSSProperties }> = ({ at, out, dur = 26, steps = 14, children, style }) => {
  const f = useCurrentFrame();
  const raw = prog(f, at, at + dur, (t) => t);
  const t = Math.floor(raw * steps) / steps;
  const o = out != null ? 1 - prog(f, out, out + 8) : 1;
  if (f < at) return null;
  return (
    <div style={{ opacity: o * (0.5 + 0.5 * t), transform: `translateX(${(1 - t) * -6}px)`, clipPath: `inset(0 ${(1 - t) * 100}% 0 0)`, ...style }}>
      {children}
    </div>
  );
};

/** The game's kicker type: small, wide-tracked, amber. */
export const Kicker: React.FC<{ children: React.ReactNode; color?: string; size?: number; style?: React.CSSProperties }> = ({ children, color = C.kicker, size = 20, style }) => (
  <div style={{ color, fontFamily: MONO, fontWeight: 600, fontSize: size, letterSpacing: "0.3em", textTransform: "uppercase", ...style }}>{children}</div>
);

/** A tagline in the game's heading type, centred in a dark lower-third band. */
export const LowerLine: React.FC<{ at: number; out: number; children: React.ReactNode; kicker?: string; y?: number; size?: number }> = ({ at, out, children, kicker, y = 820, size = 64 }) => {
  const f = useCurrentFrame();
  const band = prog(f, at - 6, at + 10) * (1 - prog(f, out, out + 12));
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <div style={{ position: "absolute", left: 0, right: 0, top: y - 150, height: 330, opacity: band,
        background: "linear-gradient(180deg, transparent, rgba(3,8,14,.72) 38%, rgba(3,8,14,.72) 62%, transparent)" }} />
      <div style={{ position: "absolute", left: 0, right: 0, top: y - (kicker ? 52 : 0), display: "flex", flexDirection: "column", alignItems: "center", gap: 18 }}>
        {kicker && <Reveal at={at - 4} out={out}><Kicker size={19}>{kicker}</Kicker></Reveal>}
        <Reveal at={at} out={out}>
          <div style={{ color: "#fff", fontFamily: MONO, fontWeight: 700, fontSize: size, letterSpacing: "0.16em", textShadow: `0 0 34px rgba(69,224,255,.55), 0 4px 18px rgba(0,0,0,.7)` }}>{children}</div>
        </Reveal>
      </div>
    </AbsoluteFill>
  );
};

/** A HUD-style chip naming the camera rig (the game's SYSTEMS setting). */
export const RigChip: React.FC<{ label: string; at?: number; x?: number; y?: number; align?: "left" | "center" | "right"; small?: boolean; crt?: boolean }> = ({ label, at = 0, x, y = 128, align = "center", small, crt }) => {
  const { width } = useVideoConfig();
  const cx = x ?? width / 2;
  const tx = align === "center" ? "-50%" : align === "right" ? "-100%" : "0";
  return (
    <div style={{ position: "absolute", left: cx, top: y, transform: `translateX(${tx})` }}>
      <Reveal at={at} dur={16} steps={8}>
        <div style={{ position: "relative", padding: small ? "10px 18px 12px" : "14px 30px 16px", background: "linear-gradient(110deg, rgba(4,16,27,.88), rgba(4,16,27,.55))", borderLeft: `2px solid ${C.cyan}`, display: "flex", flexDirection: "column", alignItems: align === "right" ? "flex-end" : align === "left" ? "flex-start" : "center", gap: 6 }}>
          <div style={{ color: C.dim, fontFamily: MONO, fontSize: small ? 13 : 15, letterSpacing: "0.32em" }}>CAMERA RIG{crt ? " · CRT ON" : ""}</div>
          <div style={{ color: C.cyanHot, fontFamily: MONO, fontWeight: 700, fontSize: small ? 30 : 40, letterSpacing: "0.18em", textShadow: "0 0 18px rgba(69,224,255,.45)" }}>{label}</div>
        </div>
      </Reveal>
    </div>
  );
};

/** The game's title lockup (index.html #screen-title): kicker, KNOTZAXXON with its red/cyan glitch, subtitle. */
export const Logo: React.FC<{ scale?: number; at?: number; glitchAt?: number[] }> = ({ scale = 1, at = 0, glitchAt = [] }) => {
  const f = useCurrentFrame();
  const g = glitchAt.some((t) => f >= t && f < t + 5);
  const g2 = glitchAt.some((t) => f >= t + 2 && f < t + 6);
  const big = 190 * scale;
  const word = (color: string, dx: number, dy: number, clip: string, show: boolean) => (
    <div style={{ position: "absolute", inset: 0, color, transform: `translate(${dx}px, ${dy}px)`, clipPath: clip, opacity: show ? 0.85 : 0 }}>KNOTZAXXON</div>
  );
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      <Reveal at={at} dur={20}><Kicker size={22 * scale}>KNOTZ INTERACTIVE / FLIGHT DIVISION</Kicker></Reveal>
      <div style={{ position: "relative", marginTop: 26 * scale, fontFamily: MONO, fontWeight: 800, fontSize: big, letterSpacing: "-0.04em", lineHeight: 0.92, color: "#fff", textShadow: "0 0 40px rgba(69,224,255,.55)" }}>
        <Reveal at={at + 2} dur={22} steps={14}><span>KNOTZAXXON</span></Reveal>
        {word(C.red, -6 * scale, 2, "inset(0 0 55% 0)", g)}
        {word(C.cyan, 7 * scale, 0, "inset(52% 0 0 0)", g2)}
      </div>
      <Reveal at={at + 10} dur={20}><div style={{ marginTop: 28 * scale, color: C.ink, fontFamily: MONO, fontSize: 30 * scale, letterSpacing: "0.32em" }}>ASSAULT ON THE IRON FORTRESS</div></Reveal>
    </div>
  );
};

/** Letterbox-free darkening behind titles. */
export const Dim: React.FC<{ from: number; to: number; amount?: number; out?: number }> = ({ from, to, amount = 0.6, out }) => {
  const f = useCurrentFrame();
  const o = amount * prog(f, from, to) * (out != null ? 1 - prog(f, out, out + 12) : 1);
  return <AbsoluteFill style={{ background: `radial-gradient(ellipse at center, rgba(4,7,12,${o * 0.75}) 0%, rgba(4,7,12,${o}) 75%)` }} />;
};
