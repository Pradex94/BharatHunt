/**
 * The concept lexicon: what a product *does*, in words a listing or a visitor
 * actually uses.
 *
 * This is the layer that lets "I need something to make LinkedIn posts" find a
 * product whose listing says "ghostwriter" and "content creation" without either
 * word appearing in the query. Each concept is a small set of phrases plus the
 * concepts next to it, so an AI writing tool can sit beside social-media and
 * marketing-automation products across categories.
 *
 * Why a lexicon and not a model: this deployment makes no LLM calls (a standing
 * decision), and on a catalogue of short listings a curated vocabulary is both
 * more precise and *explainable* — every match carries the phrase that produced
 * it, so a "why this matches" line can quote the listing instead of inventing
 * a claim. Adding a concept is an editorial act, reviewed like code, and
 * covered by `tests/intelligence.test.ts`.
 *
 * Phrases are matched through `phraseKey` (lib/intelligence/text.ts) on both
 * sides, so stopwords and plurals cancel out: "edit videos" and "video
 * editing" are separate phrases, but "editors" and "editor" are not.
 */

import { phraseKey } from "./text.ts";

export type ConceptGroup =
  | "ai"
  | "content"
  | "marketing"
  | "sales"
  | "productivity"
  | "files"
  | "developer"
  | "business"
  | "finance"
  | "career"
  | "education"
  | "life"
  | "attribute";

export type Concept = {
  key: string;
  /** Lowercase noun phrase that reads inside a sentence: "useful for {label}". */
  label: string;
  group: ConceptGroup;
  phrases: string[];
  /** Neighbouring concepts, worth partial credit in similarity and matching. */
  related?: string[];
  /**
   * How much a shared concept says about two products being alike. Broad
   * concepts that half the catalogue carries ("AI", "analytics") say little.
   * Defaults to 1.
   */
  weight?: number;
};

export const CONCEPTS: readonly Concept[] = [
  // ── AI ─────────────────────────────────────────────────────────────────
  {
    key: "ai",
    label: "AI",
    group: "ai",
    weight: 0.25,
    phrases: [
      "ai", "artificial intelligence", "ai powered", "genai", "generative ai", "llm", "gpt",
      "machine learning", "agentic", "neural", "gemini", "chatgpt", "claude",
    ],
  },
  {
    key: "ai-agents",
    label: "AI agents",
    group: "ai",
    phrases: [
      "ai agent", "agent", "agentic ai", "autonomous agent", "mcp", "model context protocol",
      "agent cli", "agents control plane",
    ],
    related: ["ai-infra", "automation", "chatbot"],
  },
  {
    key: "chatbot",
    label: "chatbots and assistants",
    group: "ai",
    phrases: [
      "chatbot", "chat bot", "conversational ai", "virtual assistant", "ai assistant",
      "assistant", "rag chatbot", "ai conversation", "copilot",
    ],
    related: ["customer-support", "ai-agents"],
  },
  {
    key: "ai-infra",
    label: "AI infrastructure",
    group: "ai",
    phrases: [
      "ai infrastructure", "ai gateway", "mcp gateway", "llm", "inference", "gpu",
      "model serving", "rag", "vector", "ai workload", "custom model", "sovereign ai",
      "frontier class model", "observability", "evaluation", "ai system",
    ],
    related: ["cloud-infra", "dev-tools", "ai-agents"],
  },
  {
    key: "ai-visibility",
    label: "AI search visibility",
    group: "marketing",
    phrases: [
      "geo", "aeo", "ai visibility", "ai search", "ai search visibility", "generative engine",
      "ai answer", "ai generated answer", "visibility in ai",
    ],
    related: ["seo"],
  },

  // ── Content ────────────────────────────────────────────────────────────
  {
    key: "content-writing",
    label: "content writing",
    group: "content",
    phrases: [
      "content writing", "copywriting", "copywriter", "blog", "blog writing", "ghostwriter",
      "ai writing", "writing assistant", "content generation", "article", "post generator",
      "content creation", "write", "writing", "repurpose", "caption generator",
    ],
    related: ["linkedin", "social-media", "seo", "email-marketing"],
  },
  {
    key: "linkedin",
    label: "LinkedIn content",
    group: "content",
    phrases: ["linkedin", "linkedin post", "linkedin post generator", "linkedin content"],
    related: ["social-media", "content-writing"],
  },
  {
    key: "social-media",
    label: "social media",
    group: "content",
    // Broad: half the content tools name a platform. "creator" is an audience
    // (AUDIENCES), not evidence that a product is about social media.
    weight: 0.7,
    phrases: [
      "social media", "instagram", "facebook", "twitter", "tiktok", "linkedin", "youtube",
      "reel", "youtube short", "multi platform publishing", "multi posting", "social post",
      "content distribution", "pinterest", "threads", "social link",
    ],
    related: ["content-writing", "dm-automation", "video-editing", "linkedin"],
  },
  {
    key: "dm-automation",
    label: "Instagram and DM automation",
    group: "marketing",
    phrases: [
      "dm automation", "comment dm", "auto dm", "autodm", "instagram automation",
      "auto reply", "comment automation", "instagram dm",
    ],
    related: ["social-media", "marketing-automation", "whatsapp"],
  },
  {
    key: "video-editing",
    label: "video editing",
    group: "content",
    phrases: [
      "video editor", "video editing", "edit video", "caption", "subtitle", "screen recording",
      "record screen", "multitrack timeline", "timeline", "clip", "video production",
      "editing cohort",
    ],
    related: ["video-generation", "social-media", "media-production"],
  },
  {
    key: "video-generation",
    label: "AI video generation",
    group: "content",
    phrases: [
      "ai video", "text video", "image video", "video generator", "video generation",
      "photo video", "motion transfer", "character animation", "veo", "ugc video",
      "video ad", "video creation", "video studio", "kling",
    ],
    related: ["video-editing", "image-generation", "ads"],
  },
  {
    key: "image-editing",
    label: "photo and image editing",
    group: "content",
    phrases: [
      "photo editor", "photo editing", "image editor", "image editing", "background removal",
      "background remover", "remove background", "image background", "remove image background",
      "object removal", "upscale", "upscaler",
      "image upscaler", "image scaler", "enhance photo", "photo restoration",
      "watermark remover", "transparent png", "denoise", "parallax photo",
    ],
    related: ["image-generation", "design"],
  },
  {
    key: "image-generation",
    label: "image generation",
    group: "content",
    phrases: [
      "image generator", "text image", "ai image", "generate image", "ad creative",
      "image ad", "social proof image", "product photography",
    ],
    related: ["image-editing", "design", "video-generation"],
  },
  {
    key: "design",
    label: "design",
    group: "content",
    weight: 0.7,
    phrases: [
      "graphic design", "ui design", "ux", "figma", "logo", "branding", "web design",
      "design", "3d", "illustration", "color palette",
    ],
    related: ["image-editing", "image-generation", "website-builder"],
  },

  // ── Marketing & growth ─────────────────────────────────────────────────
  {
    key: "seo",
    label: "SEO",
    group: "marketing",
    phrases: [
      "seo", "search engine optimization", "keyword", "ranking", "organic search", "local seo",
      "backlink", "google search", "search visibility", "seo ready",
    ],
    related: ["ai-visibility", "content-writing", "analytics"],
  },
  {
    key: "ads",
    label: "advertising",
    group: "marketing",
    phrases: [
      "advertising", "advertisement", "ad campaign", "google ad", "meta ad", "run ad", "ugc ad",
      "facebook ad", "ad generator", "sponsor", "sponsor slot", "promotion", "bid", "outbid",
      "ad film",
    ],
    related: ["marketing-automation", "launch-platform", "video-generation"],
  },
  {
    key: "email-marketing",
    label: "email marketing",
    group: "marketing",
    phrases: [
      "email marketing", "email campaign", "campaign", "newsletter", "deliverability",
      "email validation", "transactional email", "drip", "segment audience",
    ],
    related: ["email", "marketing-automation", "crm"],
  },
  {
    key: "email",
    label: "email and inboxes",
    group: "productivity",
    phrases: [
      "business email", "inbox", "email alias", "forwarding alias", "disposable inbox", "tempmail",
      "managed email", "mail", "email",
    ],
    related: ["email-marketing", "security"],
  },
  {
    key: "marketing-automation",
    label: "marketing automation",
    group: "marketing",
    phrases: [
      "marketing automation", "automate workflow", "broadcast", "bulk message",
      "campaign automation", "lead generation", "omnichannel messaging", "marketing campaign",
      "digital marketing", "growth marketing",
    ],
    related: ["email-marketing", "whatsapp", "crm", "dm-automation"],
  },
  {
    key: "whatsapp",
    label: "WhatsApp and business messaging",
    group: "marketing",
    phrases: [
      "whatsapp", "whatsapp api", "whatsapp business", "whatsapp campaign", "whatsapp broadcast",
      "sms", "rcs", "business messaging", "shared inbox",
    ],
    related: ["marketing-automation", "customer-support", "crm"],
  },
  {
    key: "launch-platform",
    label: "product launch and discovery",
    group: "marketing",
    phrases: [
      "launch your startup", "launch your product", "product launch", "upvote", "leaderboard",
      "startup discovery", "discover startup", "discover founder", "product hunt",
      "showcase your product", "startup ecosystem", "top 100", "top floor",
    ],
    related: ["ads", "community"],
  },

  // ── Sales & customers ──────────────────────────────────────────────────
  {
    key: "crm",
    label: "CRM",
    group: "sales",
    phrases: [
      "crm", "customer relationship", "manage client", "client management", "sales pipeline",
      "contact graph", "generate lead", "lead management", "capture lead",
    ],
    related: ["sales", "email-marketing", "marketing-automation", "whatsapp"],
  },
  {
    key: "sales",
    label: "sales",
    group: "sales",
    phrases: [
      "sales", "sales team", "lead generation", "prospecting", "outreach", "conversion",
      "convert visitor", "procurement",
    ],
    related: ["crm", "marketing-automation"],
  },
  {
    key: "customer-support",
    label: "customer support",
    group: "sales",
    phrases: [
      "customer support", "helpdesk", "help desk", "shared inbox", "customer conversation",
      "customer engagement", "live chat", "support ticket", "automate support",
    ],
    related: ["chatbot", "whatsapp", "crm"],
  },
  {
    key: "analytics",
    label: "analytics",
    group: "business",
    weight: 0.6,
    phrases: [
      "analytics", "insight", "dashboard", "metric", "report", "observability", "monitoring",
      "visitor tracking", "license analytics", "team analytics", "competitor tracking",
    ],
    related: ["seo", "ai-infra"],
  },

  // ── Productivity ───────────────────────────────────────────────────────
  {
    key: "notes",
    label: "notes and knowledge",
    group: "productivity",
    phrases: [
      "note", "note taking", "knowledge base", "second brain", "wiki",
      "connected workspace", "bookmark", "journal", "knowledge archive", "memory",
    ],
    related: ["task-management", "collaboration"],
  },
  {
    key: "task-management",
    label: "tasks and focus",
    group: "productivity",
    phrases: [
      "task", "task management", "todo", "project management", "kanban", "reminder",
      "checklist", "planner", "goal", "pomodoro", "focus", "deep work", "attendance",
      "break reminder", "organise", "organize",
    ],
    related: ["notes", "collaboration"],
  },
  {
    key: "collaboration",
    label: "team collaboration",
    group: "productivity",
    weight: 0.7,
    phrases: [
      "collaboration", "collaborate", "collaborative", "team collaboration", "channel",
      "message your team", "shared workspace", "workspace",
    ],
    related: ["notes", "task-management"],
  },
  {
    key: "voice",
    label: "voice and speech",
    group: "productivity",
    phrases: [
      "voice dictation", "speech", "dictation", "voice agent", "voice ai", "transcription", "neural voice",
      "call summary", "business number", "phone app", "call recording", "text speech",
      "speaking",
    ],
    related: ["chatbot", "customer-support"],
  },
  {
    key: "automation",
    label: "workflow automation",
    group: "productivity",
    weight: 0.6,
    phrases: [
      "automation", "automate", "workflow", "no code", "low code", "nocode", "drag drop",
      "no low code",
    ],
    related: ["ai-agents", "marketing-automation"],
  },
  {
    key: "calculators",
    label: "calculators",
    group: "productivity",
    phrases: [
      "calculator", "unit converter", "units converter", "emi calculator", "salary calculator",
      "gpu calculator", "hike calculator", "conversion tool",
    ],
    related: ["personal-finance"],
  },
  {
    key: "browser-extension",
    label: "browser extensions",
    group: "productivity",
    phrases: ["chrome extension", "browser extension", "extension"],
  },

  // ── Files & documents ──────────────────────────────────────────────────
  {
    key: "pdf",
    label: "PDF tools",
    group: "files",
    phrases: [
      "pdf", "pdf editor", "merge pdf", "compress pdf", "convert pdf", "edit pdf", "merge split",
    ],
    related: ["file-conversion", "documents"],
  },
  {
    key: "file-conversion",
    label: "file conversion",
    group: "files",
    phrases: [
      "file converter", "convert file", "convert pdf", "image converter", "compress",
      "docx", "file format", "spreadsheet",
    ],
    related: ["pdf", "documents"],
  },
  {
    key: "documents",
    label: "documents",
    group: "files",
    weight: 0.7,
    phrases: [
      "document", "print", "court document", "letter credit", "requirements doc", "paperwork",
      "paperless",
    ],
    related: ["pdf", "file-conversion"],
  },
  {
    key: "file-sharing",
    label: "file sharing",
    group: "files",
    phrases: [
      "file sharing", "share file", "send file", "file transfer", "large file", "p2p",
      "peer peer", "clipboard", "secure link", "fast transfer",
    ],
    related: ["cloud-storage"],
  },
  {
    key: "cloud-storage",
    label: "cloud storage",
    group: "files",
    phrases: [
      "cloud storage", "unlimited storage", "personal cloud", "file management", "backup",
      "storage",
    ],
    related: ["file-sharing"],
  },

  // ── Developer ──────────────────────────────────────────────────────────
  {
    key: "dev-tools",
    label: "developer tools",
    group: "developer",
    phrases: [
      "developer", "devtool", "developer tool", "developer toolkit", "coding", "code", "ide",
      "terminal", "cli", "debugging", "json formatter", "tunneling", "tunnel", "rest client",
      "swagger", "software architecture", "system diagram", "open source repository",
    ],
    related: ["api", "testing", "cloud-infra", "website-builder"],
  },
  {
    key: "api",
    label: "APIs",
    group: "developer",
    phrases: ["api", "sdk", "rest api", "developer api", "api platform", "api development", "api design"],
    related: ["dev-tools"],
  },
  {
    key: "website-builder",
    label: "website and app building",
    group: "developer",
    phrases: [
      "website builder", "build website", "business website", "build app", "app builder",
      "app development", "vibecode", "vibe coding", "website cloner", "clone any", "framer",
      "webflow", "mobile website", "high performance website", "mobile friendly",
      "landing page", "digital business page",
    ],
    related: ["dev-tools", "design", "seo"],
  },
  {
    key: "testing",
    label: "testing and QA",
    group: "developer",
    phrases: [
      "testing", "qa", "test automation", "bug detection", "bug", "quality assurance",
      "failure healing",
    ],
    related: ["dev-tools"],
  },
  {
    key: "cloud-infra",
    label: "cloud and infrastructure",
    group: "developer",
    phrases: [
      "cloud infrastructure", "cloud computing", "hosting", "idle server",
      "compute", "compute environment", "deploy", "deployment", "kubernetes", "devops",
      "infrastructure", "cost optimization", "ssl",
    ],
    related: ["ai-infra", "dev-tools", "security"],
  },
  {
    key: "security",
    label: "security and privacy",
    group: "developer",
    phrases: [
      "security", "cybersecurity", "cryptography", "quantum encryption", "identity",
      "access layer", "authentication", "end end encryption", "end end encrypted", "encrypted",
      "aes gcm", "zero tracking", "identity shield", "spam",
    ],
    related: ["cloud-infra"],
  },

  // ── Business ───────────────────────────────────────────────────────────
  {
    key: "ecommerce",
    label: "e-commerce",
    group: "business",
    phrases: [
      "ecommerce", "e commerce", "online store", "inventory", "order", "catalog", "sell online",
      "d2c", "checkout", "membership", "sell membership",
    ],
    related: ["payments", "local-business", "marketplace"],
  },
  {
    key: "marketplace",
    label: "marketplaces and classifieds",
    group: "business",
    phrases: [
      "classified", "buy sell", "used car", "rental", "supplier", "verified supplier",
      "procure", "marketplace", "campus marketplace",
    ],
    related: ["ecommerce", "local-business"],
  },
  {
    key: "local-business",
    label: "local businesses",
    group: "business",
    phrases: [
      "small business", "local business", "google map", "restaurant", "menu", "qr based ordering",
      "dining", "printer shop", "cyber cafe", "shop owner", "local shop", "msme",
    ],
    related: ["website-builder", "ecommerce", "food"],
  },
  {
    key: "legal",
    label: "legal and compliance",
    group: "business",
    phrases: [
      "legal", "law", "lawyer", "advocate", "court", "compliance", "company registration",
      "contract", "legal research", "legal drafting", "precedent", "gst",
    ],
    related: ["accounting", "documents"],
  },
  {
    key: "hiring",
    label: "hiring and HR",
    group: "business",
    phrases: [
      "hiring", "recruiting", "recruitment", "recruiter", "hr", "background verification",
      "employment check", "payroll", "casting call", "audition",
    ],
    related: ["job-search", "resume"],
  },
  {
    key: "saas-management",
    label: "SaaS and subscription management",
    group: "business",
    phrases: ["subscription", "saas spend", "procurement", "license", "renewal alert", "saas marketplace"],
    related: ["accounting"],
  },

  // ── Finance ────────────────────────────────────────────────────────────
  {
    key: "payments",
    label: "payments",
    group: "finance",
    phrases: [
      "payment", "upi", "checkout", "payment gateway", "collect payment", "accept payment",
      "netbanking", "wallet", "tipping", "money transfer", "zero fee", "zero commission",
    ],
    related: ["accounting", "ecommerce", "banking"],
  },
  {
    key: "accounting",
    label: "billing and accounting",
    group: "finance",
    phrases: [
      "invoicing", "invoice", "billing", "accounting", "gst", "tax", "taxation", "bookkeeping",
      "tax ready", "one bill",
    ],
    related: ["payments", "personal-finance", "legal"],
  },
  {
    key: "personal-finance",
    label: "personal finance",
    group: "finance",
    phrases: [
      "personal finance", "budget", "budgeting", "expense", "split expense", "bill",
      "bill tracking", "credit card", "reward", "emi", "salary", "ctc", "in hand salary",
      "group spending", "payment reminder", "due",
    ],
    related: ["investing", "accounting", "calculators"],
  },
  {
    key: "investing",
    label: "investing",
    group: "finance",
    phrases: [
      "investing", "investment", "mutual fund", "stock", "stock market", "sip", "portfolio",
      "wealth", "fire planning", "trading", "gold", "ppf",
    ],
    related: ["personal-finance", "banking"],
  },
  {
    key: "banking",
    label: "banking, lending and insurance",
    group: "finance",
    phrases: [
      "banking", "bank", "letter credit", "trade finance", "lending", "loan", "insurance",
      "recurring deposit", "fd", "swift", "documentary credit",
    ],
    related: ["payments", "investing"],
  },

  // ── Career & education ─────────────────────────────────────────────────
  {
    key: "resume",
    label: "resumes and CVs",
    group: "career",
    phrases: ["resume", "cv", "ats", "resume builder", "ats resume", "cv maker", "resume maker", "ats keyword"],
    related: ["job-search", "interview-prep"],
  },
  {
    key: "job-search",
    label: "job search and careers",
    group: "career",
    phrases: [
      "job", "job search", "job seeker", "job hunting", "job application", "career",
      "career development", "job match", "internship", "govt job", "government job",
      "placement", "job offer", "job ready",
    ],
    related: ["resume", "interview-prep", "hiring", "learning"],
  },
  {
    key: "interview-prep",
    label: "interview preparation",
    group: "career",
    phrases: [
      "interview", "mock interview", "interview preparation", "interview copilot",
      "interview assistant", "placement preparation", "dsa", "system design",
    ],
    related: ["job-search", "resume", "learning"],
  },
  {
    key: "learning",
    label: "learning and courses",
    group: "education",
    phrases: [
      "learning", "course", "cohort", "tutor", "study plan", "education", "edtech",
      "edutech", "lesson", "learning path", "skill", "training", "student companion",
      "study material",
    ],
    related: ["exam-prep", "job-search", "interview-prep"],
  },
  {
    key: "exam-prep",
    label: "exams and homework help",
    group: "education",
    phrases: [
      "exam", "admit card", "syllabus", "exam result", "upsc", "ssc", "jee", "neet", "test prep",
      "homework", "step step", "answer key", "handwritten problem",
    ],
    related: ["learning"],
  },
  {
    key: "study-abroad",
    label: "study abroad",
    group: "education",
    phrases: ["study abroad", "university", "admission", "visa", "ausbildung", "tuition free"],
    related: ["learning"],
  },

  // ── Life & local ───────────────────────────────────────────────────────
  {
    key: "health",
    label: "health and care",
    group: "life",
    phrases: [
      "health", "healthcare", "healthtech", "doctor", "medical", "medicine", "patient",
      "pregnancy", "vaccination", "vaccine", "pediatrician", "surgeon", "homeopathy",
      "doctor consultation",
    ],
    related: ["fitness", "wellbeing", "kids"],
  },
  {
    key: "fitness",
    label: "fitness and nutrition",
    group: "life",
    phrases: [
      "fitness", "gym", "workout", "activewear", "calorie", "nutrition", "diet", "diet plan",
      "coach", "athleisure",
    ],
    related: ["health", "wellbeing"],
  },
  {
    key: "wellbeing",
    label: "wellbeing",
    group: "life",
    phrases: [
      "mental health", "mood", "mood tracker", "journal", "wellness", "meditation", "anxiety",
      "stress", "emotion", "break reminder",
    ],
    related: ["health", "fitness"],
  },
  {
    key: "food",
    label: "food and dining",
    group: "life",
    phrases: ["food", "restaurant", "dining", "menu", "recipe", "grocery", "mandi", "mandi bhav", "order food"],
    related: ["local-business"],
  },
  {
    key: "pets",
    label: "pet care",
    group: "life",
    phrases: ["pet", "pet care", "dog walking", "dog", "cat"],
  },
  {
    key: "fashion",
    label: "fashion",
    group: "life",
    phrases: ["fashion", "outfit", "clothing", "apparel", "ethnic wear", "kurti", "saree", "styling", "streetwear"],
  },
  {
    key: "entertainment",
    label: "entertainment",
    group: "life",
    phrases: ["music", "radio", "entertainment", "movie", "game", "gaming", "bollywood", "fun"],
    related: ["social"],
  },
  {
    key: "news",
    label: "news",
    group: "life",
    phrases: ["news", "headline", "breaking news", "current affair", "tech news"],
  },
  {
    key: "social",
    label: "social and relationships",
    group: "life",
    phrases: [
      "social network", "dating", "marriage", "wedding", "friend", "matrimony", "biodata",
      "red flag",
    ],
    related: ["community"],
  },
  {
    key: "community",
    label: "communities",
    group: "life",
    weight: 0.7,
    phrases: [
      "community", "forum", "create group", "networking", "campus", "college community", "chat",
      "hackathon", "tech community",
    ],
    related: ["events", "social"],
  },
  {
    key: "events",
    label: "events and webinars",
    group: "life",
    phrases: ["event", "hackathon", "webinar", "meetup", "conference", "going live", "live session"],
    related: ["community"],
  },
  {
    key: "civic",
    label: "civic and government services",
    group: "life",
    phrases: [
      "civic", "civictech", "government", "public service", "sarkari", "govt", "official",
      "accountability", "pothole",
    ],
  },
  {
    key: "travel",
    label: "travel",
    group: "life",
    phrases: ["travel", "trip", "hotel", "flight", "tourism"],
  },
  {
    key: "real-estate",
    label: "real estate",
    group: "life",
    phrases: ["real estate", "property", "rental", "rent", "housing"],
    related: ["marketplace"],
  },
  {
    key: "logistics",
    label: "logistics",
    group: "business",
    phrases: ["logistics", "shipping", "supply chain", "delivery", "fleet", "freight", "maritime"],
  },
  {
    key: "kids",
    label: "kids and parenting",
    group: "life",
    phrases: ["kid", "children", "parent", "parenting", "baby", "school"],
    related: ["health", "learning"],
  },
  {
    key: "media-production",
    label: "media production",
    group: "content",
    phrases: ["media production", "production house", "ad film", "corporate film", "music video"],
    related: ["video-editing"],
  },

  // ── Attributes: describe a product, never make two products alike ──────
  {
    key: "india-focus",
    label: "India-focused",
    group: "attribute",
    weight: 0,
    phrases: [
      "india", "indian", "bharat", "hindi", "marathi", "tamil", "telugu", "kannada", "bengali",
      "malayalam", "gujarati", "upi", "gst", "msme", "rupee", "inr", "sarkari", "bharatgpt",
    ],
  },
  {
    key: "privacy",
    label: "privacy-first",
    group: "attribute",
    weight: 0.3,
    phrases: [
      "privacy", "private design", "privacy first", "privacy friendly", "end end encryption",
      "on device", "offline", "offline first", "local first", "no upload",
      "zero tracking", "run entirely browser", "run browser", "client side", "never leave",
      "runs locally", "run locally",
    ],
  },
];

/** Concepts whose overlap means "these products do the same job". */
export const SIMILARITY_CONCEPTS = CONCEPTS.filter((concept) => concept.group !== "attribute");

const BY_KEY = new Map(CONCEPTS.map((concept) => [concept.key, concept]));

export function conceptByKey(key: string): Concept | undefined {
  return BY_KEY.get(key);
}

export function conceptWeight(key: string): number {
  return BY_KEY.get(key)?.weight ?? 1;
}

export function conceptLabel(key: string): string {
  return BY_KEY.get(key)?.label ?? key;
}

/** Whether two concepts are neighbours in either direction. */
export function conceptsRelated(a: string, b: string): boolean {
  return Boolean(BY_KEY.get(a)?.related?.includes(b) || BY_KEY.get(b)?.related?.includes(a));
}

// ── Audiences ────────────────────────────────────────────────────────────

export type Audience = { key: string; label: string; phrases: string[] };

/**
 * Who a listing says it is for. Only ever derived from the listing's own words
 * — a product that never names its audience has none, and the comparison
 * table says "Not stated" rather than guessing.
 */
export const AUDIENCES: readonly Audience[] = [
  {
    key: "founder",
    label: "Founders and startups",
    phrases: ["founder", "startup", "entrepreneur", "solopreneur", "indie hacker", "side project"],
  },
  {
    key: "student",
    label: "Students",
    phrases: ["student", "college", "campus", "university", "exam", "placement", "learner", "school"],
  },
  {
    key: "developer",
    label: "Developers",
    phrases: ["developer", "engineer", "programmer", "devtool", "coding", "ai engineer", "for developers"],
  },
  {
    key: "creator",
    label: "Creators",
    phrases: ["creator", "youtuber", "influencer", "streamer", "content creator", "creator economy"],
  },
  {
    key: "marketer",
    label: "Marketers",
    phrases: ["marketer", "marketing team", "growth team", "agency", "brand"],
  },
  {
    key: "small-business",
    label: "Small businesses",
    phrases: [
      "small business", "msme", "sme", "local business", "restaurant", "freelancer", "shop owner",
      "growing business", "printer shop",
    ],
  },
  {
    key: "enterprise",
    label: "Enterprises",
    phrases: ["enterprise", "enterprise grade", "global organization", "large organization", "b2b"],
  },
  {
    key: "job-seeker",
    label: "Job seekers",
    phrases: ["job seeker", "job application", "candidate", "fresher", "job hunting"],
  },
];

const AUDIENCE_BY_KEY = new Map(AUDIENCES.map((audience) => [audience.key, audience]));

export function audienceLabel(key: string): string {
  return AUDIENCE_BY_KEY.get(key)?.label ?? key;
}

// ── Matching ─────────────────────────────────────────────────────────────

type CompiledPhrase = { key: string; phrase: string; padded: string };

function compile<T extends { key: string; phrases: string[] }>(entries: readonly T[]): CompiledPhrase[] {
  const compiled: CompiledPhrase[] = [];
  for (const entry of entries) {
    for (const phrase of entry.phrases) {
      const padded = phraseKey(phrase);
      if (padded) compiled.push({ key: entry.key, phrase, padded });
    }
  }
  return compiled;
}

const COMPILED_CONCEPTS = compile(CONCEPTS);
const COMPILED_AUDIENCES = compile(AUDIENCES);

/** Every phrase that matched, keyed by concept (or audience) key. */
export type PhraseHits = Map<string, string[]>;

function hitsIn(text: string | null | undefined, compiled: CompiledPhrase[]): PhraseHits {
  const hits: PhraseHits = new Map();
  const haystack = phraseKey(text);
  if (!haystack) return hits;
  for (const { key, phrase, padded } of compiled) {
    if (!haystack.includes(padded)) continue;
    const list = hits.get(key);
    if (list) {
      if (!list.includes(phrase)) list.push(phrase);
    } else {
      hits.set(key, [phrase]);
    }
  }
  return hits;
}

/** Concepts named in a piece of text, with the phrases that named them. */
export function matchConcepts(text: string | null | undefined): PhraseHits {
  return hitsIn(text, COMPILED_CONCEPTS);
}

/** Audiences named in a piece of text, with the phrases that named them. */
export function matchAudiences(text: string | null | undefined): PhraseHits {
  return hitsIn(text, COMPILED_AUDIENCES);
}
