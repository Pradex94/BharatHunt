import { Composition, Folder } from "remotion";

import { LaunchPromo, PROMO_DURATION_IN_FRAMES } from "./launch-promo/LaunchPromo";
import { Cta } from "./launch-promo/scenes/Cta";
import { Hook } from "./launch-promo/scenes/Hook";
import { ProductReveal } from "./launch-promo/scenes/ProductReveal";
import { Proof } from "./launch-promo/scenes/Proof";
import { DEFAULT_PROMO, launchPromoSchema } from "./launch-promo/schema";

/**
 * 1080x1920, which is the shape of the places these get posted -- Reels, Shorts,
 * WhatsApp Status, X's mobile feed. A 16:9 promo is letterboxed into a stripe on
 * every one of them.
 *
 * Each scene is registered on its own inside a folder as well as in the full
 * promo. That is not duplication for its own sake: working on the CTA through
 * the full composition means scrubbing past eight seconds of video to reach it
 * on every reload, and double-clicking a sequence in the main timeline jumps
 * straight to the matching standalone composition.
 *
 * The scene compositions get a duration long enough to cover their own
 * animations plus a beat -- they exist to be looked at, not to be rendered.
 *
 * `schema` + `defaultProps` are what put the product fields in the Studio's
 * right-hand sidebar, so a promo for a different launch is a form fill rather
 * than a code edit. The same props go in through `--props` when rendering from
 * the CLI (see video/README.md).
 */
export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="LaunchPromo"
        component={LaunchPromo}
        durationInFrames={PROMO_DURATION_IN_FRAMES}
        fps={30}
        width={1080}
        height={1920}
        schema={launchPromoSchema}
        defaultProps={DEFAULT_PROMO}
      />

      <Folder name="LaunchPromo-Scenes">
        <Composition
          id="Scene-Hook"
          component={Hook}
          durationInFrames={75}
          fps={30}
          width={1080}
          height={1920}
        />
        <Composition
          id="Scene-ProductReveal"
          component={ProductReveal}
          durationInFrames={105}
          fps={30}
          width={1080}
          height={1920}
          schema={launchPromoSchema}
          defaultProps={DEFAULT_PROMO}
        />
        <Composition
          id="Scene-Proof"
          component={Proof}
          durationInFrames={90}
          fps={30}
          width={1080}
          height={1920}
          schema={launchPromoSchema}
          defaultProps={DEFAULT_PROMO}
        />
        <Composition
          id="Scene-Cta"
          component={Cta}
          durationInFrames={75}
          fps={30}
          width={1080}
          height={1920}
          schema={launchPromoSchema}
          defaultProps={DEFAULT_PROMO}
        />
      </Folder>
    </>
  );
};
