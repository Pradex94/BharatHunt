# Design — Bharat Hunt

A locked design system for this app: a **premium, modern-SaaS "Product Hunt for
India"** aesthetic — Apple / Linear / Product Hunt. Warm off-white canvas, white
cards, one confident orange accent, and near-black bands for contrast. Every
page reads this file before emitting code.

## Genre
Modern SaaS — clean, premium, minimal. Lots of whitespace, perfect alignment,
soft shadows, generous rounded corners. Not cyberpunk, not dark mode.

## Color (implemented in app/globals.css)
Orange is the **only** chromatic brand color — no blue, no green.

- **Primary orange** `#FF6B1A` — every CTA, accent, highlight, active state.
- **Secondary orange** `#FF8A3D` — the gradient end (`--gradient-primary`,
  `linear-gradient(135deg,#FF6B1A,#FF8A3D)`) used on buttons + accent surfaces.
- **Primary active** `#E85D0F` — press / darker hover.
- **Canvas** `#FFF9F5` — warm off-white page floor (`bg-background`).
- **Soft peach band** `#FFF3EC` — `bg-secondary-bg`, feature/section containers.
- **White cards** `#FFFFFF` — `bg-card`, the floating product/feature cards.
- **Near-black surfaces** `#0F0F10` (`bg-surface-dark`), elevated `#1C1C1F` —
  the "Explore collections" + "Community" bands.
- **Ink** `#17140F` (`text-ink`/foreground) · body `#4B5563` (`text-body`) ·
  muted `#6B7280` (`text-muted`) · muted-soft `#9CA3AF`.
- **On dark** `#FFFFFF` / soft `#A1A1AA`.
- **Border** `#F2E7DD` — soft warm hairline.
- **Icon-tile accents** (feature/product icons only, gradient tiles): orange,
  violet `#8B5CF6`, rose `#F43F5E`, amber `#F59E0B`, dark. Never blue/green.
- **Semantic** success `#16A34A` · warning `#D97706` · error `#DC2626`
  (functional states only, not brand surfaces).

## Typography
- **Inter** everywhere (`--font-sans`, drives `--font-display` too).
- **Bold headlines** — h1–h4 are Inter **700** with tight tracking (`-0.02em`),
  set in globals.css. Large, confident hero (`Display` = ~68px).
- Body: Inter 400; labels/emphasis 500–600.
- **JetBrains Mono** (`Numeric`) for counts, votes, stats — tabular figures.

## Spacing & layout
- Max content width **1400px**, centered, generous whitespace.
- Section rhythm ~80–96px (`py-14 md:py-20`+). Card padding 20–32px.
- 4px spacing scale.

## Shape (radius, implemented in globals.css)
Rounded corners everywhere. md 12 (buttons/inputs) · lg 16 · xl 20 ·
**2xl 24 (product/feature cards)** · 3xl 32 (large section containers) · pill.

## Elevation
Very soft, slightly orange-tinted shadows (`--shadow-sm/soft/hover`). Cards rest
on a whisper of shadow and **lift on hover** (`hover:-translate-y-1
hover:shadow-hover`). The hover glow on CTAs comes from `.btn-gradient`.

## Motion (Framer Motion)
- `FadeIn` / `FadeInStagger` / `FadeInItem` — fade-up on scroll (once).
- Hero product card floats (`.animate-bh-float`, 6s ease-in-out loop).
- Button hover glow + card hover lift, 200ms ease-out.
- `prefers-reduced-motion` honored (MotionConfig + CSS guard).

## Components (voice)
- **Nav** — sticky glass top-bar: logo (orange gradient square + flame) + menu
  + search box + Log in + **Launch Product** (orange gradient CTA).
- **Footer** — light (white) 4-column: brand + socials · Platform · Resources ·
  Company · Connect · copyright.
- **Buttons** — `default` = orange gradient + glow; `outline` = white + hairline;
  `on-coral` = white button for orange bands.
- **Cards** — white, `rounded-3xl` (24px), soft shadow, hover-lift. Colored
  gradient icon tile top-left.
- **Dark bands** — `bg-surface-dark`, orange accents, used for collections +
  community only (deliberate, not a global dark mode).

## CTA voice
Primary CTA is a verb ("Launch Your Product", "Launch Product", "Subscribe").
One orange gradient CTA is the loudest thing on any view.

## What pages MUST share
Orange accent + gradient; Inter bold headlines; white-card-on-cream surfaces;
24px card radius; soft shadow + hover-lift; the logo lockup; 1400px container.

## Notes
- The homepage (`app/page.tsx`) is a pixel-recreation of the reference mockup
  with **static demo content** (`components/landing/data.ts`) — ZenTask /
  Payflow / DocuGen / ShipFast / TypeFit and the community stats are
  presentation data, not live product rows.
- Inner pages (marketplace, product, categories, collections, blog) run on the
  same tokens and re-theme automatically via the shared semantic color names.

## Exports

### tokens.css
```css
:root {
  --color-primary:      #ff6b1a;
  --color-primary-2:    #ff8a3d;
  --color-primary-active:#e85d0f;
  --color-canvas:       #fff9f5;
  --color-surface-soft: #fff3ec;
  --color-card:         #ffffff;
  --color-surface-dark: #0f0f10;
  --color-ink:          #17140f;
  --color-body:         #4b5563;
  --color-muted:        #6b7280;
  --color-border:       #f2e7dd;

  --gradient-primary: linear-gradient(135deg, #ff6b1a 0%, #ff8a3d 100%);
  --glow-primary: 0 8px 24px -6px rgb(255 107 26 / 0.45);

  --font-sans: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  --font-mono: "JetBrains Mono", ui-monospace, monospace;

  --radius-md: 12px; --radius-2xl: 24px; --radius-3xl: 32px; --radius-pill: 9999px;
}
```

Tailwind `@theme` + shadcn CSS variables are implemented natively in
`app/globals.css` — that file is the source of truth.
