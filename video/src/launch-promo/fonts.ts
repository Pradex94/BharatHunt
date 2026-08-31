/**
 * The two typefaces the Bharat Hunt design system uses, loaded for video.
 *
 * `design.md` locks Inter for headlines and JetBrains Mono for anything
 * numeric -- counts, prices, references -- because tabular figures stop numbers
 * jittering as they change. That second rule matters more in a video than on the
 * web: an upvote count that counts up would visibly wobble in a proportional
 * face, on every frame.
 *
 * `loadFont()` from `@remotion/google-fonts` rather than a `<link>` or an
 * `@import`: it blocks rendering until the font is actually ready. A CSS font
 * load races the renderer, so the first frames of a render come out in the
 * fallback face and nobody notices until the mp4 is posted.
 *
 * Only the weights and subsets in use are requested. Every extra one is bytes
 * downloaded on each render.
 */

import { loadFont as loadInter } from "@remotion/google-fonts/Inter";
import { loadFont as loadJetBrainsMono } from "@remotion/google-fonts/JetBrainsMono";

export const { fontFamily: inter } = loadInter("normal", {
  weights: ["400", "600", "700", "800"],
  subsets: ["latin"],
});

export const { fontFamily: jetBrainsMono } = loadJetBrainsMono("normal", {
  weights: ["500", "700"],
  subsets: ["latin"],
});
