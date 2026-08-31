# Launch promo videos

Vertical (1080×1920) promo clips for Bharat Hunt launches, built with
[Remotion](https://remotion.dev). Ten seconds, four scenes: hook → product →
proof → call to action.

This is a **separate project from the Next.js app**, with its own
`package.json`, `tsconfig.json` and React copy. It is excluded from the root
`tsconfig.json` and `eslint.config.mjs`, so `npx tsc --noEmit` and
`npm run lint` at the repo root do not see it. Run its checks from in here.

```bash
cd video
npm install
npm run dev     # Remotion Studio
npm run lint    # eslint + tsc for this project only
```

## Editing

`npm run dev` opens the Studio. The composition takes a Zod schema
(`src/launch-promo/schema.ts`), so the product fields appear as a form in the
right-hand sidebar — swapping in a different launch is a form fill, not a code
edit.

Each scene is also registered on its own under the **LaunchPromo-Scenes**
folder. Double-click a sequence in the main timeline to jump straight to it
rather than scrubbing eight seconds to reach the CTA.

## Rendering

```bash
# The default product (ZenTask, from the landing page's demo data)
npx remotion render LaunchPromo out/promo.mp4

# A real launch
npx remotion render LaunchPromo out/zomato-clone.mp4 --props=./props/example.json

# One frame, to check layout without waiting for a render
npx remotion still LaunchPromo out/check.png --frame=130 --scale=0.4
```

`--props` takes a JSON file matching the schema:

```json
{
  "productName": "Hyperlocal Delivery Manager",
  "tagline": "Route, track and settle same-day deliveries across 40 Indian cities",
  "category": "Logistics",
  "makerName": "Venkataraman Krishnan",
  "upvotes": 1284,
  "slug": "hyperlocal-delivery-manager"
}
```

Those field names match the `products` row plus its joined profile and upvote
aggregate, so generating a promo from live data is a query and a
`JSON.stringify` away. **Nothing here reads Supabase directly** — the video
project has no database credentials and should not get any; feed it JSON.

## Things worth knowing before you edit

**Animate with `useCurrentFrame()` and `interpolate()`, never CSS.** A CSS
`transition`, a CSS `animation` or a Tailwind animation class renders as a
still frame — the renderer jumps between frames rather than playing them, so
there is no wall clock for CSS to animate against.

**Keep `interpolate()` calls inline in the `style` prop.** Pulling a value into
a `const`, spreading an object, or building a `transform` string all break the
Studio's ability to recognise the keyframes, and it greys those controls out.
Same reason the colours are inline hex rather than a shared palette constant —
tempting to centralise, but it costs the visual editing.

**A scene's animations must finish before its outgoing transition starts**,
which is `durationInFrames - 15`. `TransitionSeries` *overlaps* neighbouring
sequences rather than inserting time between them, so anything still animating
after that point plays out underneath its own fade. This already bit once: the
maker credit in `Proof` landed three frames before the scene ended and was
invisible in the render while looking perfectly fine in the standalone scene
composition. If you lengthen a scene, update `PROMO_DURATION_IN_FRAMES` in
`LaunchPromo.tsx` too — the total is
`sum(scenes) - (15 × number of transitions)`.

**Fonts load through `@remotion/google-fonts`**, which blocks rendering until
the face is ready. A `<link>` or `@import` races the renderer and the first
frames come out in the fallback font.

## Layout rules

From Remotion's own guidance, for a 1080px-wide composition:

- Keep key text ≥80px from the sides and ≥100px from top and bottom. Scenes use
  96px padding.
- Headlines ≥84px, important supporting text ≥44px.

Long product names and slugs are handled by size steps in `ProductReveal.tsx`
and `Cta.tsx`. Both were checked against a 27-character name and a
27-character slug.
