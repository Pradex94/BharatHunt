import { linearTiming, TransitionSeries } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";

import { Cta } from "./scenes/Cta";
import { Hook } from "./scenes/Hook";
import { ProductReveal } from "./scenes/ProductReveal";
import { Proof } from "./scenes/Proof";
import type { LaunchPromoProps } from "./schema";

/**
 * The whole promo: hook, product, proof, ask.
 *
 * ── Why the durations are written out longhand ───────────────────────────────
 * Every `durationInFrames` below is a literal, not a constant or a sum. That is
 * what makes the timeline draggable in the Studio -- Remotion can only write a
 * new value back into the code if it can see the old one there. The redundancy
 * is the feature.
 *
 * ── The arithmetic, because a transition is not free ─────────────────────────
 * `TransitionSeries` *overlaps* neighbouring sequences by the transition's
 * duration rather than inserting time between them, so the total is:
 *
 *     75 + 105 + 90 + 75  =  345 frames of scenes
 *     3 transitions x 15  =   45 frames of overlap
 *     ------------------------------------------------
 *     total               =  300 frames  =  10s at 30fps
 *
 * `PROMO_DURATION_IN_FRAMES` is exported so Root.tsx registers a composition of
 * exactly that length. Change a scene here and that constant has to move too --
 * there is no way to derive it that also leaves the literals editable, and of
 * the two, editable timing is worth more than a computed total.
 *
 * ── Fades, not wipes ─────────────────────────────────────────────────────────
 * Three of the four scenes share the same near-black ground, so a fade reads as
 * one continuous piece rather than four slides. The gradient in the final scene
 * then arrives as an actual change.
 */
export const PROMO_DURATION_IN_FRAMES = 300;

export const LaunchPromo: React.FC<LaunchPromoProps> = (props) => {
  return (
    <TransitionSeries>
      <TransitionSeries.Sequence durationInFrames={75} name="Hook">
        <Hook />
      </TransitionSeries.Sequence>

      <TransitionSeries.Transition timing={linearTiming({ durationInFrames: 15 })} presentation={fade()} />

      <TransitionSeries.Sequence durationInFrames={105} name="Product reveal">
        <ProductReveal {...props} />
      </TransitionSeries.Sequence>

      <TransitionSeries.Transition timing={linearTiming({ durationInFrames: 15 })} presentation={fade()} />

      <TransitionSeries.Sequence durationInFrames={90} name="Proof">
        <Proof {...props} />
      </TransitionSeries.Sequence>

      <TransitionSeries.Transition timing={linearTiming({ durationInFrames: 15 })} presentation={fade()} />

      <TransitionSeries.Sequence durationInFrames={75} name="Call to action">
        <Cta {...props} />
      </TransitionSeries.Sequence>
    </TransitionSeries>
  );
};
