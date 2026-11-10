import React from "react";
import { AbsoluteFill } from "remotion";
import { C, MONO, W, H } from "./style";
import { Shot } from "./components";
import { RIGS } from "./timeline";

// The hook in one frame: the same instant as CLASSIC 45 under the CRT and as
// the CHASE rig, split on the isometric diagonal, with the title.
// Rendered at 1920x1080 and scaled to 1280x720 by render.mjs.
export const THUMB = { id: "c02-rigs", trim: 299 };

export const Thumbnail: React.FC = () => {
  const cut = "polygon(0 0, 58% 0, 42% 100%, 0 100%)";
  return (
    <AbsoluteFill style={{ background: C.bg }}>
      <AbsoluteFill><Shot id={THUMB.id} variant="chase" trim={THUMB.trim} keys={[{ f: 0, z: 1.5, fx: 668, fy: 561 }]} /></AbsoluteFill>
      <AbsoluteFill style={{ clipPath: cut }}><Shot id={THUMB.id} trim={THUMB.trim} keys={[{ f: 0, z: 1.2, fx: 1112, fy: 702 }]} /></AbsoluteFill>
      <svg width={W} height={H} style={{ position: "absolute", inset: 0 }}>
        <line x1={W * 0.58} y1={0} x2={W * 0.42} y2={H} stroke={C.cyan} strokeWidth={6} />
      </svg>
      <AbsoluteFill style={{ background: "linear-gradient(180deg, rgba(4,7,12,.82) 0%, rgba(4,7,12,.0) 34%, rgba(4,7,12,0) 66%, rgba(4,7,12,.85) 100%)" }} />
      <div style={{ position: "absolute", left: 0, right: 0, top: 46, textAlign: "center", fontFamily: MONO, fontWeight: 800, fontSize: 196, letterSpacing: "-0.04em", color: "#fff", textShadow: "0 0 50px rgba(69,224,255,.7), 0 8px 30px rgba(0,0,0,.8)" }}>KNOTZAXXON</div>
      <div style={{ position: "absolute", left: 60, bottom: 60, fontFamily: MONO, fontWeight: 700, fontSize: 64, letterSpacing: "0.1em", color: C.amber, textShadow: "0 4px 20px rgba(0,0,0,.9)" }}>{RIGS.classic}</div>
      <div style={{ position: "absolute", right: 60, bottom: 60, fontFamily: MONO, fontWeight: 700, fontSize: 64, letterSpacing: "0.1em", color: C.cyanHot, textShadow: "0 4px 20px rgba(0,0,0,.9)" }}>OR {RIGS.chase}</div>
    </AbsoluteFill>
  );
};

// The short's cover (1080x1350): the same instant, CLASSIC 45 on the left, CHASE on the right.
export const ShortCover: React.FC = () => {
  const cut = "polygon(0 0, 62% 0, 40% 100%, 0 100%)";
  const label = (color: string): React.CSSProperties => ({ position: "absolute", bottom: 64, fontFamily: MONO, fontWeight: 700, fontSize: 56, letterSpacing: "0.1em", color, textShadow: "0 4px 20px rgba(0,0,0,.95)" });
  return (
    <AbsoluteFill style={{ background: C.bg }}>
      <AbsoluteFill><Shot id={THUMB.id} variant="chase" trim={THUMB.trim} hd keys={[{ f: 0, z: 1.35, fx: 788, fy: 468 }]} /></AbsoluteFill>
      <AbsoluteFill style={{ clipPath: cut }}><Shot id={THUMB.id} trim={THUMB.trim} hd keys={[{ f: 0, z: 1, fx: 1022, fy: 540 }]} /></AbsoluteFill>
      <svg width={1080} height={1350} style={{ position: "absolute", inset: 0 }}>
        <line x1={1080 * 0.62} y1={0} x2={1080 * 0.4} y2={1350} stroke={C.cyan} strokeWidth={6} />
      </svg>
      <AbsoluteFill style={{ background: "linear-gradient(180deg, rgba(4,7,12,.85) 0%, rgba(4,7,12,0) 22%, rgba(4,7,12,0) 80%, rgba(4,7,12,.85) 100%)" }} />
      <div style={{ position: "absolute", left: 0, right: 0, top: 54, textAlign: "center", fontFamily: MONO, fontWeight: 800, fontSize: 158, letterSpacing: "-0.04em", color: "#fff", textShadow: "0 0 50px rgba(69,224,255,.7), 0 8px 30px rgba(0,0,0,.8)" }}>KNOTZAXXON</div>
      <div style={{ ...label(C.amber), left: 40 }}>{RIGS.classic}</div>
      <div style={{ ...label(C.cyanHot), right: 40 }}>OR {RIGS.chase}</div>
    </AbsoluteFill>
  );
};
