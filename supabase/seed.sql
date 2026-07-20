-- Development seed data: sample published products so the feed has content
-- to render while it's being built. Attributed to whichever profile was
-- created first (e.g. your own test signup) — if no profiles exist yet,
-- this seeds nothing. Sign up once, then rerun.

with creator as (
  select id from public.profiles order by created_at limit 1
)
insert into public.products (
  creator_id, slug, name, tagline, description, category, pricing_type, tags,
  status, published_at
)
select
  creator.id, v.slug, v.name, v.tagline, v.description, v.category,
  v.pricing_type, v.tags, 'published', now()
from creator, (
  values
    (
      'ai-code-reviewer',
      'AI Code Reviewer',
      'Catch bugs before your teammates do',
      'An AI-powered code review bot that comments on your pull requests with correctness, security, and style feedback.',
      'Developer Tools',
      'freemium',
      array['ai', 'devtools', 'productivity']
    ),
    (
      'focusflow',
      'FocusFlow',
      'A calmer way to plan your day',
      'A minimalist daily planner that blends time-blocking with gentle nudges, built for people who get overwhelmed by traditional to-do apps.',
      'Productivity',
      'free',
      array['productivity', 'planning']
    ),
    (
      'snapinvoice',
      'SnapInvoice',
      'Turn a photo of a receipt into an invoice',
      'Point your phone at a receipt or handwritten bill and get a shareable, payable invoice in seconds.',
      'Finance',
      'paid',
      array['finance', 'small-business']
    ),
    (
      'localeats-india',
      'LocalEats India',
      'Discover home-run food businesses near you',
      'A directory of home chefs, tiffin services, and small food businesses across Indian cities, with reviews from real neighbors.',
      'Food & Drink',
      'free',
      array['food', 'local', 'marketplace']
    ),
    (
      'pixelcraft-studio',
      'PixelCraft Studio',
      'Design app icons in your browser',
      'A lightweight, no-signup editor for designing app icons and social thumbnails, with export presets for every major platform.',
      'Design Tools',
      'freemium',
      array['design', 'tools']
    )
) as v(slug, name, tagline, description, category, pricing_type, tags)
on conflict (slug) do nothing;
