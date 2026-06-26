# TechTank — Landing Page Plan

## Project Overview

**Platform**: TechTank — a warm, community-driven product discovery platform for software apps  
**Stack**: SvelteKit + Svelte 5 + Tailwind v4  
**Mode**: Light + Dark with toggle  
**Goal**: A landing page that communicates the platform's energy, shows the product in action, and converts visitors into waitlist signups or early users

---

## Design System

### Aesthetic Direction
**Flat + Skeuomorphic hybrid with warm ember gradients**

The UI lives at the intersection of flat clarity and subtle tactility. Cards feel slightly raised — not glossy or overdone — just enough shadow and gradient to feel warm and touchable. Gradients are accent-only (never full-bleed backgrounds). The overall palette is warm rather than sterile: creamy whites, ember oranges, amber golds.

### Color Palette

| Token | Light | Dark | Use |
|---|---|---|---|
| `--brand-from` | `#E8593C` | `#E8593C` | Primary gradient start |
| `--brand-to` | `#F2A623` | `#F2A623` | Primary gradient end |
| `--brand-gradient` | `135deg, #E8593C → #F2A623` | same | CTAs, accents, logo |
| `--surface` | `#FFFFFF` | `#1A1614` | Card backgrounds |
| `--surface-2` | `#FFF8F5` | `#221E1B` | Page background (warm tinted) |
| `--surface-3` | `#FFF2EC` | `#2A2320` | Subtle section tints |
| `--text-primary` | `#18120E` | `#F5EDE8` | Headings |
| `--text-secondary` | `#6B5A52` | `#9E8A80` | Body, labels |
| `--border` | `rgba(232,89,60,0.12)` | `rgba(232,89,60,0.15)` | Card borders |

### Typography

| Role | Font | Size / Weight |
|---|---|---|
| Display (hero) | `Instrument Serif` (italic) | 56–72px / 400 |
| Headings | `Bricolage Grotesque` | 28–40px / 700 |
| UI / Body | `DM Sans` | 14–16px / 400–500 |
| Mono / Tags | `JetBrains Mono` | 12px / 400 |

> Load via `@fontsource` packages — avoids FOUT, works with SvelteKit SSR.

### Shadows (Tailwind custom)

```js
shadows: {
  'card':  '0 1px 3px rgba(0,0,0,0.07), 0 4px 16px rgba(0,0,0,0.05)',
  'card-hover': '0 4px 12px rgba(232,89,60,0.12), 0 1px 3px rgba(0,0,0,0.06)',
  'cta':   '0 4px 20px rgba(232,89,60,0.35)',
  'inner': 'inset 0 1px 2px rgba(0,0,0,0.04)',
}
```

### Border Radius
- Cards, inputs, sections: `16px`
- Buttons: `10px`
- Tags/badges: `20px` (pill)
- Product icon thumbnails: `12px`

---

## Animations

All animations are CSS-native or use Svelte's built-in `transition:` / `animate:` directives. No heavy JS animation libraries.

| Animation | Trigger | Technique |
|---|---|---|
| Hero text reveal | Page load | Svelte `fly` + stagger via delay |
| Product cards entry | Scroll into view | `IntersectionObserver` + CSS `@keyframes` |
| Upvote button press | Click | CSS `scale` + `translate` micro-interaction |
| Card hover lift | Hover | `box-shadow` + `translateY(-2px)` transition |
| Nav backdrop | Scroll past hero | CSS `backdrop-filter` + opacity transition |
| Dark mode toggle | Click | `transition: background 300ms, color 200ms` |
| Number counter (stats) | Scroll into view | JS `requestAnimationFrame` counter |
| Maker avatars | Hover on section | CSS stagger `animation-delay` |

---

## Page Sections

### 1. Navbar
- Logo (mark + wordmark), left-aligned
- Nav links: Products · Makers · Categories · About — center
- Right: Dark mode toggle + "Get early access" CTA button (gradient)
- Sticky with `backdrop-filter: blur(12px)` on scroll
- Mobile: hamburger → slide-down drawer

### 2. Hero
- **Layout**: Two-column — left text, right product preview mockup
- **Headline**: Large display font, 2–3 lines, italic weight for warmth
  - e.g. *"The launchpad for software that matters"*
- **Subheadline**: 18px body, 1–2 lines, warm secondary color
- **CTAs**: "Browse today's products" (primary, gradient) + "Submit yours →" (ghost)
- **Social proof strip**: "Join 4,200+ makers · 1,800+ products launched"
- **Right side**: Floating product card mockup (3 stacked cards with subtle rotation, parallax on scroll)
- **Background**: Warm off-white (`--surface-2`) with a very subtle radial glow from brand-from color (5–8% opacity), no texture

### 3. Featured Products (Grid Gallery)
- **Heading**: "Today's top picks"
- **Layout**: `3-column` grid on desktop, `2-col` tablet, `1-col` mobile
- **Card anatomy**:
  - Top: 3px gradient accent border (`--brand-gradient`)
  - Product icon (48×48, rounded 12px) + name + tagline
  - Tags (category pills)
  - Bottom row: upvote button (animated) + comment count
- **Cards**: white background, `shadow-card`, lifts on hover to `shadow-card-hover`
- **Filter bar** above grid: "All · Developer Tools · Productivity · Design · AI · Open Source" pill tabs — active tab gets gradient fill
- **"See all products →"** link below grid

### 4. How It Works
- **Heading**: "Built by makers, for makers"
- **Layout**: 3 horizontal steps on desktop, stacked on mobile
- **Step cards**:
  1. 🚀 **Launch** — Submit your product in under 2 minutes
  2. 🔥 **Get discovered** — The community votes on what matters
  3. ⭐ **Grow** — Real feedback, real users, real momentum
- **Connector**: Dashed gradient line between steps (CSS, decorative)
- **Visual**: Simple icon illustration per step (SVG, brand-colored)

### 5. Maker Spotlight
- **Heading**: "Meet the makers"
- **Layout**: Horizontal scroll row of maker cards (3 visible + hint of 4th)
- **Maker card**:
  - Avatar (circle, warm ring on hover)
  - Name + @handle
  - "Made X products" counter
  - Top product name with upvote count
- **Background**: `--surface-3` tinted section (`rgba(242,166,35,0.04)`)
- **CTA**: "Become a maker →"

### 6. Newsletter / Waitlist
- **Heading**: "Be the first to know"
- **Layout**: Centered, max-width 560px
- **Sub-copy**: "New products drop every day. Get the weekly digest of the best in software."
- **Input**: Email field + "Join the list" button (inline on desktop, stacked on mobile)
- **Below input**: "No spam. Unsubscribe anytime. 4,200+ already in."
- **Background**: Warm gradient card (`135deg, rgba(232,89,60,0.06), rgba(242,166,35,0.06)`) with subtle border

### 7. Footer
- **Columns** (4):
  - TechTank logo + 1-line description
  - Product: Browse, Submit, Categories, Trending
  - Company: About, Blog, Careers, Press
  - Social: Twitter/X, GitHub, Discord
- **Bottom bar**: © TechTank · Privacy · Terms · Built with ❤️ by makers
- **Dark divider line** between main footer and bottom bar

---

## File & Folder Structure

```
src/
├── routes/
│   └── (landing)/
│       └── +page.svelte         # Landing page root
├── lib/
│   ├── components/
│   │   ├── layout/
│   │   │   ├── Navbar.svelte
│   │   │   └── Footer.svelte
│   │   ├── landing/
│   │   │   ├── Hero.svelte
│   │   │   ├── FeaturedProducts.svelte
│   │   │   ├── ProductCard.svelte
│   │   │   ├── FilterBar.svelte
│   │   │   ├── HowItWorks.svelte
│   │   │   ├── MakerSpotlight.svelte
│   │   │   ├── MakerCard.svelte
│   │   │   └── NewsletterCTA.svelte
│   │   └── ui/
│   │       ├── Button.svelte
│   │       ├── Badge.svelte
│   │       ├── UpvoteButton.svelte
│   │       └── ThemeToggle.svelte
│   ├── stores/
│   │   └── theme.svelte.ts      # Dark mode rune store
│   └── utils/
│       ├── intersection.ts      # IntersectionObserver helper
│       └── counter.ts           # Animated number counter
├── app.css                      # Tailwind v4 + CSS custom props
└── app.html
```

---

## Tailwind v4 Configuration Notes

- Use `@theme` block in `app.css` to define custom tokens (colors, shadows, fonts) — no `tailwind.config.js` needed in v4
- Custom shadow and gradient utilities defined as CSS variables inside `@theme`
- Dark mode: class-based (`dark:`) toggled by adding `.dark` to `<html>` via the theme store

```css
@theme {
  --color-brand-from: #E8593C;
  --color-brand-to: #F2A623;
  --shadow-card: 0 1px 3px rgba(0,0,0,0.07), 0 4px 16px rgba(0,0,0,0.05);
  --shadow-card-hover: 0 4px 12px rgba(232,89,60,0.12), 0 1px 3px rgba(0,0,0,0.06);
  --shadow-cta: 0 4px 20px rgba(232,89,60,0.35);
  --font-display: 'Instrument Serif', serif;
  --font-heading: 'Bricolage Grotesque', sans-serif;
  --font-body: 'DM Sans', sans-serif;
  --font-mono: 'JetBrains Mono', monospace;
}
```

---

## Implementation Order

1. **Setup** — SvelteKit project, Tailwind v4, fonts, `app.css` tokens, theme store
2. **Layout shell** — `Navbar` + `Footer` with dark mode toggle wired up
3. **Hero** — static first, then add parallax card mockup
4. **FeaturedProducts** — `ProductCard` component, mock data, filter bar
5. **HowItWorks** — static section, SVG step icons
6. **MakerSpotlight** — horizontal scroll row, `MakerCard`
7. **NewsletterCTA** — form with basic validation, success state
8. **Animations** — add scroll reveals, hover states, micro-interactions last
9. **Responsive** — mobile pass for all sections
10. **Dark mode** — audit all sections in dark, fix contrast issues
11. **Polish** — lighthouse audit, a11y, meta tags, OG image

---

## Mock Data Shape (for dev)

```ts
// src/lib/data/products.ts
export type Product = {
  id: string
  name: string
  tagline: string
  icon: string        // URL or local asset
  tags: string[]
  upvotes: number
  comments: number
  maker: Maker
  featured?: boolean
  isNew?: boolean
}

export type Maker = {
  id: string
  name: string
  handle: string
  avatar: string
  productsCount: number
  topProduct?: string
}
```

---

## Accessibility Checklist

- [ ] All interactive elements keyboard-navigable
- [ ] Color contrast ratio ≥ 4.5:1 for body text (both modes)
- [ ] Upvote button has `aria-label` and `aria-pressed`
- [ ] Dark mode toggle has `aria-label`
- [ ] Images have `alt` text
- [ ] Filter tabs use `role="tablist"` + `role="tab"`
- [ ] Email input has associated `<label>`
- [ ] Reduced motion: wrap all animations in `@media (prefers-reduced-motion: no-preference)`