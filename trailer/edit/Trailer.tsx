import React from "react";
import { AbsoluteFill, Audio, Sequence, staticFile, useCurrentFrame } from "remotion";
import { C, MONO, W, H } from "./style";
import { b, BEAT, RIGS, SITE_URL, TAGLINE } from "./timeline";
import { Dim, Fade, Flash, Key, Kicker, Logo, LowerLine, Reveal, RigChip, Shot, Sfx, prog } from "./components";

/**
 * The cut. Each clip: where it starts (frames), how long, which shot and
 * which source frame it starts from (trim). Shots with `variant` are the same
 * simulation re-rendered through another camera rig. Game sound follows the
 * picture (the base shot's sound, trimmed the same way).
 */
type Clip = { at: number; dur: number; id: string; trim: number; variant?: string; keys?: Key[]; hd?: boolean; sfx?: number; filter?: string };

const half = BEAT * 2;
const TOUR: [string, number][] = [["t1-card", 16], ["t2-card", 16], ["t3-card", 16], ["t4-card", 16], ["t5-card", 16], ["t6-card", 16], ["t7-card", 16], ["t8-card", 16]];
const cardZoom: Key[] = [{ f: 0, z: 1.12, fx: 960, fy: 330 }, { f: half, z: 1.2 }];

export const CLIPS: Clip[] = [
  // 0-4: cold open. CLASSIC 45 + CRT, then the fly-in to CHASE through the outer wall (bar 3).
  { at: 0, dur: b(4), id: "c01-open", trim: 0 },

  // 4-6: one simulation, three rigs, cut on the half bar.
  { at: b(4), dur: half, id: "c02-rigs", trim: 0 },
  { at: b(4.5), dur: half, id: "c02-rigs", variant: "modern", trim: 50, sfx: 0 },
  { at: b(5), dur: half, id: "c02-rigs", variant: "chase", trim: 100, sfx: 0 },
  { at: b(5.5), dur: half, id: "c02-rigs", trim: 150, sfx: 0 },
  // (6-8 is the three-way split, drawn below)

  // 8-12: combat.
  { at: b(8), dur: b(1), id: "c03-fuel", trim: 46 },
  { at: b(9), dur: b(1), id: "c04-radar", trim: 52 },
  { at: b(10), dur: b(1), id: "c05-flak", trim: 62 },
  { at: b(11), dur: b(1), id: "c06-airfield", trim: 40 },

  // 12-16: the sector tour, half a bar each, the game's own sector cards.
  ...TOUR.map(([id, trim], i) => ({ at: b(12) + i * half, dur: half, id, trim, keys: cardZoom })),

  // 16-24: the break (real slow motion).
  { at: b(16), dur: b(2), id: "c10-match", trim: 36 },
  { at: b(18), dur: b(2), id: "c11-shadow", trim: 36, hd: true, keys: [{ f: 0, z: 1.25, fx: 760, fy: 640 }, { f: b(2), z: 1.5, fx: 820, fy: 600 }] },
  { at: b(20), dur: b(2), id: "c12-wire", trim: 26 },
  { at: b(22), dur: b(2), id: "c13-gates", trim: 2 },

  // 24-32: escalation, one bar each.
  { at: b(24), dur: b(1), id: "c14-debris", trim: 22 },
  { at: b(25), dur: b(1), id: "c15-towers", trim: 28 },
  { at: b(26), dur: b(1), id: "c17-wing", trim: 20 },
  { at: b(27), dur: b(1), id: "c18-citadel", trim: 18 },
  { at: b(28), dur: b(1), id: "c19-gatesync", trim: 4 },
  { at: b(29), dur: b(1), id: "c16-carrier", trim: 30 },
  { at: b(30), dur: b(1), id: "c20-gauntlet", trim: 22 },
  { at: b(31), dur: b(1), id: "c21-gauntlet2", trim: 22 },

  // 32-36: the Iron Sentinel arrives; both cannons shot off.
  { at: b(32), dur: b(2), id: "c22-boss-in", trim: 34, hd: true, keys: [{ f: 0, z: 1.55, fx: 960, fy: 360 }, { f: b(2), z: 1.3, fx: 960, fy: 420 }] },
  { at: b(34), dur: b(2), id: "c23-pods", trim: 0, hd: true, keys: [{ f: 0, z: 1.3, fx: 960, fy: 420 }, { f: b(2), z: 1.42, fx: 960, fy: 400 }] },

  // 36-40: montage, half a bar each.
  { at: b(36), dur: half, id: "c24-core", trim: 0, hd: true, keys: [{ f: 0, z: 1.35, fx: 1100, fy: 380 }] },
  { at: b(36.5), dur: half, id: "c25-curtain", trim: 0, hd: true, keys: [{ f: 0, z: 1.3, fx: 960, fy: 430 }] },
  { at: b(37), dur: half, id: "c26-escort", trim: 10, hd: true, keys: [{ f: 0, z: 1.25, fx: 960, fy: 430 }] },
  { at: b(37.5), dur: half, id: "c27-missile", trim: 24, hd: true, keys: [{ f: 0, z: 1.3, fx: 960, fy: 430 }] },
  { at: b(38), dur: half, id: "c24-core", trim: 60, hd: true, keys: [{ f: 0, z: 1.35, fx: 1100, fy: 380 }] },
  { at: b(38.5), dur: half, id: "c25-curtain", trim: 62, hd: true, keys: [{ f: 0, z: 1.3, fx: 960, fy: 430 }] },
  { at: b(39), dur: half, id: "c26-escort", trim: 64, hd: true, keys: [{ f: 0, z: 1.25, fx: 960, fy: 430 }] },
  { at: b(39.5), dur: half, id: "c27-missile", trim: 124, hd: true, keys: [{ f: 0, z: 1.3, fx: 960, fy: 450 }] },

  // 40-44: the duel. RACK n/6 on the HUD; the missile blows in the rack on 42; the last blast on 44.
  { at: b(40), dur: b(1), id: "c28-duel", trim: 0, hd: true, keys: [{ f: 0, z: 1.3, fx: 960, fy: 420 }, { f: b(1), z: 1.4 }] },
  { at: b(41), dur: half, id: "c28-duel", variant: "classic", trim: 100, hd: true, keys: [{ f: 0, z: 1.25, fx: 1060, fy: 400 }], sfx: 0 },
  { at: b(41.5), dur: b(2.5), id: "c28-duel", trim: 150, hd: true, keys: [{ f: 0, z: 1.4, fx: 960, fy: 420 }, { f: half, z: 1.25 }, { f: b(2.5), z: 1.1 }] },

  // 44-52: the title and the call to action over the classic, under the CRT.
  { at: b(44), dur: b(8), id: "c30-end", trim: 0, sfx: 0.35 },
];

/** Bars 6-8: the same instant through all three rigs, side by side. */
const Split: React.FC<{ trim: number }> = ({ trim }) => {
  const f = useCurrentFrame();
  const cols: { variant?: string; label: string; fx: number; crt?: boolean }[] = [
    { label: RIGS.classic, fx: 820, crt: true },
    { variant: "modern", label: RIGS.modern, fx: 960 },
    { variant: "chase", label: RIGS.chase, fx: 960 },
  ];
  const cw = W / 3;
  const open = prog(f, 0, 14);
  return (
    <AbsoluteFill style={{ background: C.bg }}>
      {cols.map((c, i) => (
        <div key={i} style={{ position: "absolute", left: i * cw, top: 0, width: cw, height: H, overflow: "hidden" }}>
          <div style={{ position: "absolute", left: cw / 2 - c.fx, top: 0, width: W, height: H }}>
            <Shot id="c02-rigs" variant={c.variant} trim={trim} />
          </div>
          <RigChip label={c.label} at={4 + i * 4} x={cw / 2} y={H - 190} small crt={c.crt} />
        </div>
      ))}
      {[1, 2].map((i) => <div key={i} style={{ position: "absolute", left: i * cw - 1, top: 0, width: 2, height: H * open, background: C.cyan, boxShadow: `0 0 18px ${C.cyan}` }} />)}
      <div style={{ position: "absolute", left: 0, right: 0, top: 58, display: "flex", justifyContent: "center" }}>
        <Reveal at={10} out={b(2) - 10}>
          <div style={{ padding: "12px 26px", background: "rgba(4,16,27,.82)", color: C.ink, fontFamily: MONO, fontWeight: 700, fontSize: 34, letterSpacing: "0.2em" }}>ONE FORTRESS. YOUR ANGLE.</div>
        </Reveal>
      </div>
    </AbsoluteFill>
  );
};

/** The end card: title, then one action. */
const EndCard: React.FC = () => {
  const f = useCurrentFrame();
  const swap = 230;
  const logoOut = prog(f, swap - 10, swap + 6);
  return (
    <AbsoluteFill>
      <Dim from={0} to={30} amount={0.62} />
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", opacity: 1 - logoOut, transform: `translateY(${-logoOut * 30}px)` }}>
        <Logo at={6} scale={1.05} glitchAt={[60, 150]} />
      </AbsoluteFill>
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", flexDirection: "column", gap: 0 }}>
        <Reveal at={swap} dur={18}><Logo scale={0.5} /></Reveal>
        <div style={{ height: 70 }} />
        <Reveal at={swap + 14} dur={22}>
          <div style={{ color: "#fff", fontFamily: MONO, fontWeight: 700, fontSize: 70, letterSpacing: "0.12em", textShadow: "0 0 34px rgba(69,224,255,.5)" }}>PLAY FREE IN YOUR BROWSER</div>
        </Reveal>
        <Reveal at={swap + 26} dur={22}>
          <div style={{ marginTop: 34, padding: "16px 34px", border: `2px solid ${C.cyan}`, background: "rgba(4,16,27,.7)", color: C.cyanHot, fontFamily: MONO, fontWeight: 700, fontSize: 46, letterSpacing: "0.08em" }}>{SITE_URL}</div>
        </Reveal>
        <Reveal at={swap + 40} dur={20}>
          <Kicker size={22} color={C.dim} style={{ marginTop: 40 }}>KEYBOARD · GAMEPAD · TOUCH</Kicker>
        </Reveal>
        <Reveal at={swap + 52} dur={20}>
          <div style={{ marginTop: 22, color: C.kicker, fontFamily: MONO, fontSize: 20, letterSpacing: "0.18em" }}>EVERY TEXTURE, MODEL AND SOUND IS GENERATED IN CODE</div>
        </Reveal>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

export const Trailer: React.FC = () => (
  <AbsoluteFill style={{ background: C.bg }}>
    {CLIPS.map((c, i) => (
      <Sequence key={i} from={c.at} durationInFrames={c.dur} name={`${c.id}${c.variant ? "@" + c.variant : ""}`}>
        <Shot id={c.id} variant={c.variant} trim={c.trim} keys={c.keys} hd={c.hd} filter={c.filter} />
      </Sequence>
    ))}
    <Sequence from={b(6)} durationInFrames={b(2)} name="split"><Split trim={200} /></Sequence>

    {/* game sound: continuous across the rig ping-pong and the split */}
    <Sequence from={b(4)} durationInFrames={b(4)}><Sfx id="c02-rigs" trim={0} dur={b(4)} /></Sequence>
    {CLIPS.filter((c) => c.sfx !== 0 && c.id !== "c02-rigs").map((c, i) => (
      <Sequence key={"s" + i} from={c.at} durationInFrames={c.dur}><Sfx id={c.id} trim={c.trim} dur={c.dur} volume={2 * (c.sfx ?? 1)} /></Sequence>
    ))}

    {/* bar 3: the hit as the ship clears the outer wall, then the title */}
    <Sequence from={b(3)} durationInFrames={b(1)} name="title">
      <Flash at={0} len={16} peak={0.7} />
      <Dim from={4} to={18} amount={0.55} out={b(1) - 14} />
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}><Logo at={8} scale={0.82} glitchAt={[60]} /></AbsoluteFill>
      <Fade from={b(1) - 12} to={b(1)} max={0.0} />
    </Sequence>

    {/* bars 4-6: rig chips on each cut */}
    <Sequence from={b(4)} durationInFrames={half}><RigChip label={RIGS.classic} crt at={2} /></Sequence>
    <Sequence from={b(4.5)} durationInFrames={half}><RigChip label={RIGS.modern} at={2} /></Sequence>
    <Sequence from={b(5)} durationInFrames={half}><RigChip label={RIGS.chase} at={2} /></Sequence>
    <Sequence from={b(5.5)} durationInFrames={half}><RigChip label={RIGS.classic} crt at={2} /></Sequence>

    {/* the game's own tagline, as the spine of the break and the escalation */}
    <Sequence from={b(16)} durationInFrames={b(2)}><LowerLine at={10} out={b(2) - 16} kicker="ONE INTERCEPTOR. EIGHT HOSTILE SECTORS.">{TAGLINE[0]}</LowerLine></Sequence>
    <Sequence from={b(18)} durationInFrames={b(2)}><LowerLine at={10} out={b(2) - 16}>{TAGLINE[1]}</LowerLine></Sequence>
    <Sequence from={b(30)} durationInFrames={b(2)}><LowerLine at={4} out={b(2) - 14}>{TAGLINE[2]}</LowerLine></Sequence>

    {/* impacts on section downbeats */}
    <Sequence from={b(8)} durationInFrames={20}><Flash at={0} len={12} peak={0.35} /></Sequence>
    <Sequence from={b(24)} durationInFrames={20}><Flash at={0} len={12} peak={0.4} /></Sequence>
    <Sequence from={b(32)} durationInFrames={20}><Flash at={0} len={14} peak={0.45} color="#ffd9d0" /></Sequence>

    {/* bar 44: out of the last blast into the title */}
    <Sequence from={b(44) - 6} durationInFrames={40}><Flash at={0} len={36} peak={0.95} color="#fff4e0" /></Sequence>
    <Sequence from={b(44)} durationInFrames={b(8)} name="end"><EndCard /><Fade from={b(8) - 40} to={b(8) - 4} /></Sequence>

    <Audio src={staticFile("audio/music.wav")} />
  </AbsoluteFill>
);
