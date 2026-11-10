import React from "react";
import { AbsoluteFill, Audio, Sequence, staticFile, useCurrentFrame } from "remotion";
import { C, MONO } from "./style";
import { b, BEAT, RIGS, SITE_URL, TAGLINE } from "./timeline";
import { Dim, Fade, Flash, Key, Kicker, Logo, LowerLine, Reveal, RigChip, Shot, Sfx, prog } from "./components";

/**
 * The 4:5 short (1080x1350) for TikTok, Shorts and Reels: the trailer's story in
 * 27 bars (~47 s). The score is the trailer's own cue with its bars re-ordered
 * (audio/cue.js SHORT_MAP), so short bar n plays trailer bar SHORT_MAP[n]:
 *
 *   0-2   cold open: CLASSIC 45 + CRT, the dive to CHASE, through the wall on 2   (trailer 0, 2, 3)
 *   3-6   one simulation, three rigs: match cuts, then stacked                    (4-7)
 *   7-8   combat, half a bar each                                                 (8, 9)
 *   9-10  MATCH ALTITUDE. READ YOUR SHADOW. (slow motion)                         (16, 23)
 *   11-14 escalation, BREAK THE FORTRESS.                                         (24, 25, 30, 31)
 *   15-17 the Iron Sentinel                                                       (32, 36, 39)
 *   18-21 the duel; the missile blows in the rack on 20                           (40-43)
 *   22-26 title, then "Play free in your browser"                                 (44-48)
 *
 * Every shot is cropped from the 2x (3840x2160) masters, so a full-height
 * 4:5 window is downscaled, never upscaled. Focus points are in 1920x1080
 * footage coordinates.
 */
export const SW = 1080, SH = 1350;
export const SHORT_DURATION = 2800;

type Clip = { at: number; dur: number; id: string; trim: number; variant?: string; keys?: Key[]; sfx?: number };
const half = BEAT * 2;
const at = (x: number, y = 540, z = 1): Key[] => [{ f: 0, z, fx: x, fy: y }];

export const SHORT_CLIPS: Clip[] = [
  // 0-3: the cold open, one take. The classic view keeps the ship left of centre; follow it into the dive.
  { at: 0, dur: b(3), id: "c01-open", trim: 100, keys: [{ f: 0, fx: 660, fy: 600 }, { f: 100, fx: 680, fy: 560 }, { f: 170, fx: 960, fy: 540 }] },

  // 3-5: one simulation, three rigs (the stacked view, 5-7, is drawn below).
  { at: b(3), dur: half, id: "c02-rigs", trim: 0, keys: at(770, 560) },
  { at: b(3.5), dur: half, id: "c02-rigs", variant: "modern", trim: 50, sfx: 0 },
  { at: b(4), dur: half, id: "c02-rigs", variant: "chase", trim: 100, sfx: 0 },
  { at: b(4.5), dur: half, id: "c02-rigs", trim: 150, keys: at(700, 580), sfx: 0 },

  // 7-9: combat.
  { at: b(7), dur: half, id: "c03-fuel", trim: 46 },
  { at: b(7.5), dur: half, id: "c04-radar", trim: 88 },
  { at: b(8), dur: half, id: "c05-flak", trim: 56 },
  { at: b(8.5), dur: half, id: "c18-citadel", trim: 40 },

  // 9-11: the break, in slow motion.
  { at: b(9), dur: b(1), id: "c10-match", trim: 36 },
  { at: b(10), dur: b(1), id: "c11-shadow", trim: 96, keys: [{ f: 0, z: 1.05, fx: 690, fy: 600 }, { f: b(1), z: 1.15, fx: 740, fy: 590 }] },

  // 11-15: escalation.
  { at: b(11), dur: b(1), id: "c14-debris", trim: 22 },
  { at: b(12), dur: b(1), id: "c15-towers", trim: 28 },
  { at: b(13), dur: b(1), id: "c20-gauntlet", trim: 22 },
  { at: b(14), dur: b(1), id: "c21-gauntlet2", trim: 22 },

  // 15-18: the Iron Sentinel.
  { at: b(15), dur: b(1), id: "c22-boss-in", trim: 34, keys: [{ f: 0, z: 1.15, fx: 960, fy: 420 }, { f: b(1), z: 1.05, fx: 960, fy: 450 }] },
  { at: b(16), dur: half, id: "c24-core", trim: 0, keys: at(1060, 420, 1.05) },
  { at: b(16.5), dur: half, id: "c25-curtain", trim: 0, keys: at(960, 470) },
  { at: b(17), dur: half, id: "c26-escort", trim: 64, keys: at(960, 470) },
  { at: b(17.5), dur: half, id: "c27-missile", trim: 124, keys: at(960, 470) },

  // 18-22: the duel.
  { at: b(18), dur: b(1), id: "c28-duel", trim: 0, keys: [{ f: 0, z: 1, fx: 960, fy: 470 }, { f: b(1), z: 1.08 }] },
  { at: b(19), dur: half, id: "c28-duel", variant: "classic", trim: 100, keys: at(1000, 470), sfx: 0 },
  { at: b(19.5), dur: b(2.5), id: "c28-duel", trim: 150, keys: [{ f: 0, z: 1.1, fx: 960, fy: 470 }, { f: half, z: 1.02 }, { f: b(2.5), z: 1 }] },

  // 22-28: the title and the call to action over the classic, under the CRT.
  { at: b(22), dur: b(6), id: "c30-end", trim: 0, keys: at(820, 560), sfx: 0.35 },
];

/** Bars 5-7: the same instant through all three rigs, stacked. */
const Stack: React.FC<{ trim: number }> = ({ trim }) => {
  const f = useCurrentFrame();
  const head = 150, ph = (SH - head) / 3;
  const rows: { variant?: string; label: string; fx: number; fy: number; crt?: boolean }[] = [
    { label: RIGS.classic, fx: 860, fy: 560, crt: true },
    { variant: "modern", label: RIGS.modern, fx: 960, fy: 560 },
    { variant: "chase", label: RIGS.chase, fx: 960, fy: 560 },
  ];
  const open = prog(f, 0, 14);
  return (
    <AbsoluteFill style={{ background: C.bg }}>
      {rows.map((r, i) => (
        <div key={i} style={{ position: "absolute", left: 0, top: head + i * ph, width: SW, height: ph, overflow: "hidden" }}>
          <Shot id="c02-rigs" variant={r.variant} trim={trim} box={{ w: SW, h: ph }} keys={at(r.fx, r.fy)} />
          <RigChip label={r.label} at={4 + i * 4} x={28} y={ph - 104} align="left" small crt={r.crt} />
        </div>
      ))}
      {[0, 1, 2].map((i) => <div key={i} style={{ position: "absolute", top: head + i * ph - 1, left: 0, width: SW * open, height: 2, background: C.cyan, boxShadow: `0 0 18px ${C.cyan}` }} />)}
      <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: head, display: "flex", justifyContent: "center", alignItems: "center" }}>
        <Reveal at={6} out={b(2) - 10}>
          <div style={{ color: C.ink, fontFamily: MONO, fontWeight: 700, fontSize: 44, letterSpacing: "0.16em" }}>ONE FORTRESS. YOUR ANGLE.</div>
        </Reveal>
      </div>
    </AbsoluteFill>
  );
};

/** The end card: title, then one action, stacked for a tall frame. */
const EndCard: React.FC = () => {
  const f = useCurrentFrame();
  const swap = 170;
  const logoOut = prog(f, swap - 10, swap + 6);
  const big = { color: "#fff", fontFamily: MONO, fontWeight: 700, fontSize: 76, letterSpacing: "0.1em", lineHeight: 1.15, textAlign: "center" as const, textShadow: "0 0 34px rgba(69,224,255,.5)" };
  return (
    <AbsoluteFill>
      <Dim from={0} to={30} amount={0.62} />
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", opacity: 1 - logoOut, transform: `translateY(${-logoOut * 30}px)` }}>
        <Logo at={6} scale={0.78} glitchAt={[60, 130]} />
      </AbsoluteFill>
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", flexDirection: "column" }}>
        <Reveal at={swap} dur={18}><Logo scale={0.44} /></Reveal>
        <div style={{ height: 80 }} />
        <Reveal at={swap + 14} dur={22}><div style={big}>PLAY FREE</div></Reveal>
        <Reveal at={swap + 20} dur={22}><div style={big}>IN YOUR BROWSER</div></Reveal>
        <Reveal at={swap + 32} dur={22}>
          <div style={{ marginTop: 44, padding: "16px 28px", border: `2px solid ${C.cyan}`, background: "rgba(4,16,27,.7)", color: C.cyanHot, fontFamily: MONO, fontWeight: 700, fontSize: 40, letterSpacing: "0.04em" }}>{SITE_URL}</div>
        </Reveal>
        <Reveal at={swap + 46} dur={20}>
          <Kicker size={24} color={C.dim} style={{ marginTop: 44 }}>KEYBOARD · GAMEPAD · TOUCH</Kicker>
        </Reveal>
        <Reveal at={swap + 58} dur={20}>
          <div style={{ marginTop: 26, color: C.kicker, fontFamily: MONO, fontSize: 21, letterSpacing: "0.16em", textAlign: "center", lineHeight: 1.6 }}>EVERY TEXTURE, MODEL AND SOUND<br />IS GENERATED IN CODE</div>
        </Reveal>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/** The cold open's chip: the rig the player picked, then the swap as the camera dives. */
const OpenChip: React.FC = () => {
  const f = useCurrentFrame();
  const swap = 104; // the dive starts at short frame 100
  return (
    <>
      {f < swap && <div style={{ opacity: 1 - prog(f, swap - 8, swap) }}><RigChip label={RIGS.classic} crt at={8} y={110} /></div>}
      {f >= swap && <RigChip label={RIGS.chase} at={swap} y={110} />}
    </>
  );
};

const LINE_Y = 1030;

export const Short: React.FC = () => (
  <AbsoluteFill style={{ background: C.bg }}>
    {SHORT_CLIPS.map((c, i) => (
      <Sequence key={i} from={c.at} durationInFrames={c.dur} name={`${c.id}${c.variant ? "@" + c.variant : ""}`}>
        <Shot id={c.id} variant={c.variant} trim={c.trim} keys={c.keys} hd />
      </Sequence>
    ))}
    <Sequence from={b(5)} durationInFrames={b(2)} name="stack"><Stack trim={200} /></Sequence>

    {/* game sound: continuous across the rig cuts and the stack */}
    <Sequence from={b(3)} durationInFrames={b(4)}><Sfx id="c02-rigs" trim={0} dur={b(4)} /></Sequence>
    {SHORT_CLIPS.filter((c) => c.sfx !== 0 && c.id !== "c02-rigs").map((c, i) => (
      <Sequence key={"s" + i} from={c.at} durationInFrames={c.dur}><Sfx id={c.id} trim={c.trim} dur={c.dur} volume={2 * (c.sfx ?? 1)} /></Sequence>
    ))}

    <Sequence from={0} durationInFrames={b(2)} name="open-chip"><OpenChip /></Sequence>

    {/* bar 2: the hit as the ship clears the outer wall, then the title */}
    <Sequence from={b(2)} durationInFrames={b(1)} name="title">
      <Flash at={0} len={16} peak={0.7} />
      <Dim from={4} to={18} amount={0.55} out={b(1) - 14} />
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}><Logo at={8} scale={0.78} glitchAt={[60]} /></AbsoluteFill>
    </Sequence>

    {/* bars 3-5: rig chips on each cut */}
    <Sequence from={b(3)} durationInFrames={half}><RigChip label={RIGS.classic} crt at={2} y={110} /></Sequence>
    <Sequence from={b(3.5)} durationInFrames={half}><RigChip label={RIGS.modern} at={2} y={110} /></Sequence>
    <Sequence from={b(4)} durationInFrames={half}><RigChip label={RIGS.chase} at={2} y={110} /></Sequence>
    <Sequence from={b(4.5)} durationInFrames={half}><RigChip label={RIGS.classic} crt at={2} y={110} /></Sequence>

    {/* the game's own tagline */}
    <Sequence from={b(9)} durationInFrames={b(1)}><LowerLine at={6} out={b(1) - 12} y={LINE_Y} size={60} kicker="ONE INTERCEPTOR. EIGHT SECTORS.">{TAGLINE[0]}</LowerLine></Sequence>
    <Sequence from={b(10)} durationInFrames={b(1)}><LowerLine at={6} out={b(1) - 12} y={LINE_Y} size={60}>{TAGLINE[1]}</LowerLine></Sequence>
    <Sequence from={b(13)} durationInFrames={b(2)}><LowerLine at={4} out={b(2) - 14} y={LINE_Y} size={56}>{TAGLINE[2]}</LowerLine></Sequence>

    {/* impacts on section downbeats */}
    <Sequence from={b(7)} durationInFrames={20}><Flash at={0} len={12} peak={0.35} /></Sequence>
    <Sequence from={b(11)} durationInFrames={20}><Flash at={0} len={12} peak={0.4} /></Sequence>
    <Sequence from={b(15)} durationInFrames={20}><Flash at={0} len={14} peak={0.45} color="#ffd9d0" /></Sequence>

    {/* bar 22: out of the last blast into the title */}
    <Sequence from={b(22) - 6} durationInFrames={40}><Flash at={0} len={36} peak={0.95} color="#fff4e0" /></Sequence>
    <Sequence from={b(22)} durationInFrames={b(6)} name="end"><EndCard /><Fade from={b(6) - 40} to={b(6) - 4} /></Sequence>

    <Audio src={staticFile("audio/music-short.wav")} />
  </AbsoluteFill>
);
