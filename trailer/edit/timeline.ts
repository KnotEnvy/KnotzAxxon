// One clock for picture and score: 144 bpm at 60 fps, so a beat is 25 frames
// and a bar is 100. Every cut is placed in bars; audio/cue.js uses the same bars.
export const FPS = 60;
export const BAR = 100;
export const BEAT = 25;
export const b = (bars: number) => Math.round(bars * BAR);
export const DURATION = 5200; // 50 bars plus the last chord's ring-out

export const SITE_URL = "knotenvy.github.io/KnotzAxxon";

// Words on screen come from the game: the title screen (index.html), the
// CAMERA RIG setting (src/core/Settings.js) and the sector cards.
export const TAGLINE = ["MATCH ALTITUDE.", "READ YOUR SHADOW.", "BREAK THE FORTRESS."];
export const RIGS = { classic: "CLASSIC 45", modern: "MODERN 20", chase: "CHASE" };
