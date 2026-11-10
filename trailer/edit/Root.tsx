import React from "react";
import { Composition } from "remotion";
import { Trailer } from "./Trailer";
import { Thumbnail, ShortCover } from "./Thumbnail";
import { Short, SHORT_DURATION, SW, SH } from "./Short";
import { DURATION, FPS } from "./timeline";

export const Root: React.FC = () => (
  <>
    <Composition id="Trailer" component={Trailer} durationInFrames={DURATION} fps={FPS} width={1920} height={1080} />
    <Composition id="Short" component={Short} durationInFrames={SHORT_DURATION} fps={FPS} width={SW} height={SH} />
    <Composition id="ShortCover" component={ShortCover} durationInFrames={1} fps={FPS} width={SW} height={SH} />
    <Composition id="Thumbnail" component={Thumbnail} durationInFrames={1} fps={FPS} width={1920} height={1080} />
  </>
);
