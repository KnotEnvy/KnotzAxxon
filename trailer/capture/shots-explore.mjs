// Exploration probes (not in the trailer): what each sector looks like in each rig.
const ALTS = ['modern', 'chase'];
const S = 19403;
export const SHOTS = [
  { id: 'x-open', frames: 420, alts: ALTS, spec: { seed: S, camera: 'classic', crt: true, sector: 0, into: 230 } },
  { id: 'x-s1', frames: 360, alts: ALTS, spec: { seed: S, camera: 'classic', sector: 1, into: 450 } },
  { id: 'x-s1b', frames: 360, alts: ALTS, spec: { seed: S, camera: 'classic', sector: 1, into: 900 } },
  { id: 'x-s2', frames: 360, alts: ALTS, spec: { seed: S, camera: 'classic', sector: 2, into: 200 } },
  { id: 'x-s2b', frames: 360, alts: ALTS, spec: { seed: S, camera: 'classic', sector: 2, into: 560 } },
  { id: 'x-s3', frames: 360, alts: ALTS, spec: { seed: S, camera: 'classic', sector: 3, into: 180 } },
  { id: 'x-s4', frames: 360, alts: ALTS, spec: { seed: S, camera: 'classic', sector: 4, into: 250 } },
  { id: 'x-s5', frames: 360, alts: ALTS, spec: { seed: S, camera: 'classic', sector: 5, into: 400 } },
  { id: 'x-s6', frames: 360, alts: ALTS, spec: { seed: S, camera: 'classic', sector: 6, into: 550 } },
  { id: 'x-boss', frames: 900, alts: ALTS, spec: { seed: S, camera: 'classic', sector: 7, into: 30 } },
];
