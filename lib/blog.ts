/**
 * Editorial blog content, hand-authored. Posts are plain structured content
 * (no CMS) — each has a lede, a set of section blocks, and metadata. The blog
 * is where the cream + serif editorial system does its best work, so the
 * rendering leans into long-measure prose.
 */

export type BlogBlock =
  | { type: "paragraph"; text: string }
  | { type: "heading"; text: string }
  | { type: "quote"; text: string; cite?: string }
  | { type: "list"; items: string[] };

export type BlogPost = {
  slug: string;
  title: string;
  /** One-sentence summary used on the index and meta description. */
  excerpt: string;
  author: string;
  /** ISO date. */
  date: string;
  /** Reading time in minutes. */
  readingMinutes: number;
  tag: string;
  body: BlogBlock[];
};

export const BLOG_POSTS: BlogPost[] = [
  {
    slug: "how-we-rank-products",
    title: "How ranking works on Bharat Hunt",
    excerpt:
      "Upvotes matter, but they're not the whole story. Here's exactly what moves a product up the marketplace — and what doesn't.",
    author: "The Bharat Hunt team",
    date: "2026-07-18",
    readingMinutes: 4,
    tag: "Product",
    body: [
      {
        type: "paragraph",
        text: "Every marketplace has to answer one question over and over: of everything here, what do we show first? Get it wrong and the good work sinks while noise floats. We think about our answer a lot, so it's worth writing down plainly.",
      },
      {
        type: "heading",
        text: "Trending is the default, and it decays",
      },
      {
        type: "paragraph",
        text: "The homepage and the marketplace both default to a trending sort. Trending isn't just raw upvotes — it's upvotes weighted by how recent they are. A product that earned forty votes this week outranks one that earned sixty votes two years ago. That decay is deliberate: discovery should feel alive, not like an archive of past winners.",
      },
      {
        type: "heading",
        text: "What actually feeds the score",
      },
      {
        type: "list",
        items: [
          "Upvotes, weighted toward the last few days.",
          "Comment activity — a conversation is a stronger signal than a silent vote.",
          "Recency of launch, so new work gets a fair window to be seen.",
        ],
      },
      {
        type: "paragraph",
        text: "You'll notice what's not on that list: how much someone paid, whether we know the founder, or how polished the landing page is. None of that touches the ranking. The order you see is the order the community voted for.",
      },
      {
        type: "quote",
        text: "Discovery should feel alive, not like an archive of past winners.",
      },
      {
        type: "heading",
        text: "If you want the archive, you can have it",
      },
      {
        type: "paragraph",
        text: "Trending is the default, not the only view. Switch the sort to Top rated and you'll see the all-time community favorites; switch to Newest and you'll see the raw firehose in launch order. Filters and sort all live in the URL, so any view you land on is a link you can share.",
      },
    ],
  },
  {
    slug: "launching-well",
    title: "How to launch well (a short, honest guide)",
    excerpt:
      "A good launch isn't a fireworks show. It's a clear tagline, an honest first screenshot, and being around to answer questions.",
    author: "Pardeep Bisla",
    date: "2026-07-11",
    readingMinutes: 6,
    tag: "Guides",
    body: [
      {
        type: "paragraph",
        text: "Most launch advice is written for products that don't need it — the ones with a waitlist of ten thousand and a launch-day budget. This is for the other ninety-nine percent: you built something real, you're proud of it, and you'd like people to actually find it. That's an achievable goal. Here's how to give yourself the best shot.",
      },
      {
        type: "heading",
        text: "Your tagline is doing most of the work",
      },
      {
        type: "paragraph",
        text: "On a marketplace, people read your tagline before anything else — often instead of everything else. It should say what the product does, for whom, in words your user would use. \"Catch bugs before your teammates do\" beats \"AI-powered code intelligence platform\" every time, because the first one is a promise and the second one is a category.",
      },
      {
        type: "heading",
        text: "Show the product, not a promise of the product",
      },
      {
        type: "paragraph",
        text: "The single most convincing thing you can put on your listing is a screenshot of the actual thing working. Not a marketing illustration, not a hero mockup with lorem ipsum — the real interface, doing the real job. If you're embarrassed by how the real thing looks, that's useful information about what to fix before you launch.",
      },
      {
        type: "heading",
        text: "Be there for the first day",
      },
      {
        type: "paragraph",
        text: "The comments on your launch are not a formality. They're the highest-intent conversation you'll have all month — people who found your product, understood it well enough to have an opinion, and cared enough to type. Answer every one. Fix the small thing someone points out and say you fixed it. That responsiveness is visible, and it converts.",
      },
      {
        type: "quote",
        text: "If you're embarrassed by how the real thing looks, that's useful information about what to fix before you launch.",
      },
      {
        type: "heading",
        text: "A launch is a start, not a finish line",
      },
      {
        type: "paragraph",
        text: "The products that do well here rarely spike and vanish. They show up, earn a handful of genuine users, listen to them, and come back a month later with the thing those users asked for. Launching well is really just the first visible instance of building well. Do that part right and the rest tends to follow.",
      },
    ],
  },
  {
    slug: "why-cream-not-white",
    title: "Why the whole site is cream, not white",
    excerpt:
      "A note on the design behind Bharat Hunt — the warm canvas, the coral, and the serif — and why we didn't reach for the usual cool gray.",
    author: "The Bharat Hunt team",
    date: "2026-07-04",
    readingMinutes: 3,
    tag: "Design",
    body: [
      {
        type: "paragraph",
        text: "If you look closely, the background of this site isn't white. It's a warm cream — a hair off the pure #ffffff that nearly every software product defaults to. That choice wasn't an accident, and it's the thread the rest of the design hangs from.",
      },
      {
        type: "heading",
        text: "Warm is a position, not a preference",
      },
      {
        type: "paragraph",
        text: "Cool gray-white is the safe default: it reads as neutral, technical, modern. The problem is that everyone made the same safe choice, so it now reads as anonymous. A warm canvas is a small act of counter-positioning. It says this is a place made by people, for people who make things — closer to a good magazine than a dashboard.",
      },
      {
        type: "heading",
        text: "One accent, used sparingly",
      },
      {
        type: "paragraph",
        text: "The coral you see on the buttons and callouts is the only brand color, and it's kept scarce on purpose. Voltage comes from restraint: when almost everything is warm neutral, the one coral CTA on a page is impossible to miss. Paint everything coral and you've painted nothing.",
      },
      {
        type: "heading",
        text: "A serif, at a normal weight",
      },
      {
        type: "paragraph",
        text: "Headlines are set in a serif at regular weight, never bold. That combination — serif shapes, calm weight, tight spacing — is what gives the pages their considered, literary feel. It's the difference between a product that shouts and one that speaks.",
      },
      {
        type: "quote",
        text: "Paint everything coral and you've painted nothing.",
      },
    ],
  },
];

const POST_BY_SLUG = new Map(BLOG_POSTS.map((p) => [p.slug, p]));

export function postFromSlug(slug: string): BlogPost | undefined {
  return POST_BY_SLUG.get(slug);
}

const DATE_FMT = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "long",
  day: "numeric",
});

export function formatPostDate(iso: string): string {
  return DATE_FMT.format(new Date(iso));
}
