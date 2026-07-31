/**
 * Curated knowledge base for the Bharat Hunt assistant — a free, no-API chatbot
 * that answers common questions about the platform. `findAnswer` scores each
 * entry against the user's message (single-word keywords match whole words to
 * avoid false hits like "hi" inside "which"; multi-word phrases match on
 * substring and weigh more). Framework-agnostic and safe to import anywhere.
 */

export type ChatLink = { href: string; label: string };

export type KbEntry = {
  id: string;
  /** Canonical question — also used as a suggestion chip label. */
  q: string;
  keywords: string[];
  a: string;
  links?: ChatLink[];
};

export const KB: KbEntry[] = [
  {
    id: "what-is",
    q: "What is Bharat Hunt?",
    keywords: ["what", "about", "bharat", "hunt", "platform", "explain", "purpose", "means"],
    a: "Bharat Hunt is a Product-Hunt-for-India marketplace. Makers launch their products, and the community discovers, upvotes and comments on them — helping the best Indian products get noticed and grow.",
    links: [{ href: "/marketplace", label: "Explore products" }],
  },
  {
    id: "launch",
    q: "How do I launch a product?",
    keywords: [
      "launch",
      "submit",
      "post",
      "add",
      "publish",
      "list",
      "my product",
      "how do i launch",
      "create",
    ],
    a: "Sign in, then hit “Launch Product” in the top bar (or go to /submit). You'll add your product's name, tagline, description, category, pricing type, links and a hero image — it only takes a few minutes.",
    links: [{ href: "/submit", label: "Launch a product" }],
  },
  {
    id: "upvotes",
    q: "How do upvotes work?",
    keywords: ["upvote", "upvotes", "vote", "voting", "like", "trending", "rank", "ranking"],
    a: "Any signed-in member can upvote products they like. Upvotes are how products climb the rankings — the “Trending” and “Top rated” sorts on the marketplace are driven by them.",
    links: [{ href: "/marketplace?sort=top-rated", label: "See top rated" }],
  },
  {
    id: "comments",
    q: "Can I comment on products?",
    keywords: ["comment", "comments", "review", "reviews", "feedback", "discuss", "reply"],
    a: "Yes — every product page has a comments section where signed-in members can leave feedback and ask the maker questions. Real conversations help makers build better products.",
  },
  {
    id: "pricing-types",
    q: "What do the pricing badges mean?",
    keywords: ["pricing", "price", "free", "freemium", "paid", "badge", "cost of products"],
    a: "Each product shows a pricing badge: Free (no cost), Freemium (free tier plus paid upgrades), or Paid. You can filter the marketplace by any of these.",
    links: [{ href: "/marketplace", label: "Filter by pricing" }],
  },
  {
    id: "categories",
    q: "What categories are there?",
    keywords: ["category", "categories", "topics", "types", "kinds", "sections"],
    a: "Products are organised into ten categories: Developer Tools, Productivity, Finance, Food & Drink, Design Tools, Marketing, Health & Fitness, Education, Social, and Other.",
    links: [{ href: "/categories", label: "Browse categories" }],
  },
  {
    id: "discover",
    q: "How do I find products?",
    keywords: ["find", "discover", "browse", "search", "explore", "look", "marketplace"],
    a: "Head to the marketplace to browse everything, sort by Trending / Newest / Top rated, filter by category or pricing, or search by name, tag or maker.",
    links: [{ href: "/marketplace", label: "Open marketplace" }],
  },
  {
    id: "account",
    q: "Do I need an account?",
    keywords: ["account", "sign", "signup", "login", "log", "register", "join", "need account"],
    a: "Browsing is open to everyone. To upvote, comment, or launch a product you'll need a free account — sign up or log in from the top bar.",
    links: [
      { href: "/signup", label: "Sign up" },
      { href: "/login", label: "Log in" },
    ],
  },
  {
    id: "cost",
    q: "Is it free to use?",
    keywords: ["free to use", "cost", "charge", "pay", "fees", "fee", "money", "expensive", "price to"],
    a: "Yes — Bharat Hunt is free to browse and free to launch on. Create an account, submit your product, and start gathering upvotes at no cost.",
  },
  {
    id: "who-for",
    q: "Who is Bharat Hunt for?",
    keywords: ["who", "audience", "makers", "maker", "founders", "startups", "for whom", "meant"],
    a: "It's for Indian makers, founders and indie hackers launching products — and for the community of product enthusiasts and early adopters who love discovering what's new.",
  },
  {
    id: "edit",
    q: "Can I edit my product after launching?",
    keywords: ["edit", "update", "change", "delete", "remove", "manage"],
    a: "Yes — open your product's page while signed in as its maker and use the edit option to update its details.",
  },
  {
    id: "cookies",
    q: "How do you use cookies / my data?",
    keywords: ["cookie", "cookies", "privacy", "data", "gdpr", "consent"],
    a: "We use essential cookies to keep you signed in and to remember your cookie choice, and we don't run third-party analytics today. You can review and change your choice any time on the Cookie Policy page.",
    links: [{ href: "/cookies", label: "Cookie Policy" }],
  },
  {
    id: "contact",
    q: "How do I contact the team?",
    keywords: ["contact", "support", "help", "email", "reach", "team", "question for"],
    a: "You can reach the team at info@bharathunt.org, or read guides and updates on the blog.",
    links: [
      { href: "mailto:info@bharathunt.org", label: "Email us" },
      { href: "/blog", label: "Read the blog" },
    ],
  },
  {
    id: "greeting",
    q: "",
    keywords: ["hi", "hello", "hey", "namaste", "yo", "hola", "greetings"],
    a: "Hi! 👋 I'm the Bharat Hunt assistant. Ask me anything about the platform — how to launch a product, how upvotes work, categories, pricing, and more.",
  },
  {
    id: "thanks",
    q: "",
    keywords: ["thanks", "thank", "thankyou", "cheers", "appreciate"],
    a: "Happy to help! 🙌 Anything else you'd like to know about Bharat Hunt?",
  },
];

export const FALLBACK: KbEntry = {
  id: "fallback",
  q: "",
  keywords: [],
  a: "I'm not sure about that one yet — I can help with what Bharat Hunt is, launching a product, upvotes, comments, categories, pricing, discovering products, and accounts. Try one of the suggestions below.",
};

/** Starter questions surfaced as tappable chips. */
export const STARTERS: string[] = [
  "What is Bharat Hunt?",
  "How do I launch a product?",
  "How do upvotes work?",
  "Is it free to use?",
  "What categories are there?",
];

function tokenize(input: string): string[] {
  return input
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/** Best-matching KB entry for a free-text message, or FALLBACK if none score. */
export function findAnswer(input: string): KbEntry {
  const text = input.toLowerCase();
  const tokens = new Set(tokenize(input));

  let best: { entry: KbEntry; score: number } | null = null;
  for (const entry of KB) {
    let score = 0;
    for (const kw of entry.keywords) {
      if (kw.includes(" ")) {
        if (text.includes(kw)) score += 2;
      } else if (tokens.has(kw)) {
        score += 1;
      }
    }
    if (score > 0 && (!best || score > best.score)) {
      best = { entry, score };
    }
  }

  return best?.entry ?? FALLBACK;
}
