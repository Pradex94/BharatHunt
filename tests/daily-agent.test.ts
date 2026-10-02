import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { autoPublishActive, isRunDue, localClock, parseConfig, parseWeights } from "../lib/daily-agent/config.ts";
import { buildContent, clip } from "../lib/daily-agent/content.ts";
import {
  buildProductIndex,
  checkDuplicate,
  isNotAProductSite,
  nameSimilarity,
  normalizeSite,
} from "../lib/daily-agent/domain.ts";
import { evaluateCandidate } from "../lib/daily-agent/evaluate.ts";
import { detectPricing, secondaryPageLinks, visibleText } from "../lib/daily-agent/extract.ts";
import { assessIndia, discoveryIndiaSignal, WEAK_SIGNAL_CAP } from "../lib/daily-agent/india.ts";
import { domainGuesses, extractLaunchedName, siteMatchesName } from "../lib/daily-agent/names.ts";
import { isPathAllowed, parseRobots, rulesForStatus } from "../lib/daily-agent/robots.ts";
import { assessSafety } from "../lib/daily-agent/safety.ts";
import { decideEligibility, mayAutoPublish, selectTop, shortfallMessage } from "../lib/daily-agent/select.ts";
import {
  fundingCandidates,
  newsLaunchCandidates,
  runSources,
  showHnCandidates,
  type DiscoverySource,
} from "../lib/daily-agent/sources.ts";
import type { Facts } from "../lib/daily-agent/types.ts";

const CATEGORIES = [
  "Developer Tools", "Productivity", "Finance", "Food & Drink", "Design Tools",
  "Marketing", "Health & Fitness", "Education", "Social", "Other",
] as const;

function facts(overrides: Partial<Facts> = {}): Facts {
  return {
    productName: "Ledgerly",
    companyName: null,
    founderNames: [],
    siteDescription: "Ledgerly helps Indian small businesses send GST invoices and track payments.",
    aboutText: null,
    category: "Finance",
    pricingType: "freemium",
    freeTrial: null,
    stateCode: null,
    city: null,
    logoUrl: "https://ledgerly.in/logo.png",
    screenshotUrl: null,
    socialLinks: {},
    platformLinks: {},
    pagesRead: ["https://ledgerly.in/"],
    waitlistOnly: false,
    productSignals: 5,
    serviceSignals: 0,
    https: true,
    responseMs: 400,
    ...overrides,
  };
}

describe("normalizeSite — one product, one key", () => {
  it("treats scheme, www and trailing slash variants as the same domain", () => {
    const keys = ["https://example.com", "https://www.example.com/", "http://example.com", "example.com/pricing"].map(
      (url) => normalizeSite(url)?.key,
    );
    assert.deepEqual(new Set(keys), new Set(["example.com"]));
  });

  it("folds a product's subdomain onto its registrable domain", () => {
    assert.equal(normalizeSite("https://app.emergent.sh/")?.key, "emergent.sh");
  });

  it("keeps Indian second-level suffixes intact", () => {
    assert.equal(normalizeSite("https://shop.acme.co.in/")?.key, "acme.co.in");
  });

  it("keeps every tenant on shared hosting separate", () => {
    assert.equal(normalizeSite("https://foo.vercel.app")?.key, "foo.vercel.app");
    assert.notEqual(normalizeSite("https://foo.vercel.app")?.key, normalizeSite("https://bar.vercel.app")?.key);
  });

  it("rejects non-web and IP URLs", () => {
    assert.equal(normalizeSite("javascript:alert(1)"), null);
    assert.equal(normalizeSite("http://10.0.0.1/"), null);
    assert.equal(normalizeSite(""), null);
  });

  it("knows a platform page is not a product site", () => {
    assert.ok(isNotAProductSite("https://github.com/someone/repo"));
    assert.ok(isNotAProductSite("https://inc42.com/buzz/x"));
    assert.ok(!isNotAProductSite("https://totumai.in"));
  });
});

describe("checkDuplicate — never create a duplicate product", () => {
  const index = buildProductIndex([
    { id: "p1", name: "PhonePe", website_url: "https://www.phonepe.com/" },
    { id: "p2", name: "Emergent", website_url: "https://app.emergent.sh/" },
    { id: "p3", name: "CoachFit OS", website_url: "https://coachfitos.com/" },
    { id: "p4", name: "Some Repo", website_url: null, github_url: "https://github.com/a/b" },
  ]);

  it("matches on the normalised domain", () => {
    const result = checkDuplicate(index, normalizeSite("http://phonepe.com")?.key ?? null, ["Phone Pe Business"]);
    assert.equal(result.kind, "duplicate");
    assert.equal(result.kind === "duplicate" && result.productId, "p1");
  });

  it("matches a subdomain to the product's root domain", () => {
    assert.equal(checkDuplicate(index, "emergent.sh", ["Emergent Agent"]).kind, "duplicate");
  });

  it("matches the same name when the domain is unknown", () => {
    assert.equal(checkDuplicate(index, null, ["Coachfit OS"]).kind, "duplicate");
  });

  it("flags a same-name product on a different known domain as similar, not duplicate", () => {
    const result = checkDuplicate(index, "phonepe.co.uk", ["PhonePe"]);
    assert.equal(result.kind, "similar");
  });

  it("does not treat github.com as one giant duplicate key", () => {
    assert.equal(checkDuplicate(index, "github.com", ["Unrelated Tool"]).kind, "unique");
  });

  it("scores names by folded bigram overlap", () => {
    assert.equal(nameSimilarity("Sarvam AI", "Sarvam"), 1);
    assert.ok(nameSimilarity("Ledgerly", "Ledgerlyy") > 0.9);
    assert.ok(nameSimilarity("Ledgerly", "Fitbook") < 0.3);
  });
});

describe("assessIndia — evidence, not assumptions", () => {
  it("does not call a product Indian for a .in domain, rupee prices and UPI", () => {
    const result = assessIndia(
      [{ url: "https://x.in/", text: "Plans from ₹499 per month. Pay with UPI or Razorpay." }],
      "x.in",
    );
    assert.ok(result.confidence <= WEAK_SIGNAL_CAP, `got ${result.confidence}`);
  });

  it("reads a CIN as strong evidence and takes the state from it", () => {
    const result = assessIndia(
      [{ url: "https://acme.com/terms", text: "Acme Labs Private Limited, CIN: U72900KA2021PTC145678." }],
      "acme.com",
    );
    assert.ok(result.signals.some((signal) => signal.kind === "cin"));
    assert.equal(result.stateCode, "IN-KA");
  });

  it("reads a GSTIN and maps its numeric state code", () => {
    const result = assessIndia([{ url: "u", text: "GSTIN: 27AAPFU0939F1ZV" }], "acme.com");
    assert.ok(result.signals.some((signal) => signal.kind === "gstin"));
    assert.equal(result.stateCode, "IN-MH");
  });

  it("clears the default threshold with an address plus a legal entity", () => {
    const result = assessIndia(
      [
        {
          url: "https://acme.com/contact",
          text: "Acme Technologies Pvt. Ltd.\n4th Floor, HSR Layout, Bengaluru, Karnataka 560102\nPhone: +91 98450 12345",
        },
      ],
      "acme.com",
    );
    assert.ok(result.confidence >= 70, `got ${result.confidence}`);
    assert.equal(result.stateCode, "IN-KA");
    assert.equal(result.city, "Bengaluru");
  });

  it("penalises a foreign HQ when there is no hard Indian evidence", () => {
    const withForeign = assessIndia(
      [{ url: "u", text: "Our team is in Bengaluru. Headquarters: 548 Market St, San Francisco, CA 94104" }],
      "acme.com",
    );
    assert.ok(withForeign.foreignHeadquarters);
  });

  it("stores the literal evidence with every signal", () => {
    const result = assessIndia([{ url: "https://a.com/about", text: "We are headquartered in Pune and proud of it." }], "a.com");
    const stated = result.signals.find((signal) => signal.kind === "stated_location");
    assert.ok(stated?.evidence.includes("headquartered in Pune"));
    assert.equal(stated?.url, "https://a.com/about");
  });
});

describe("discoveryIndiaSignal — who built it, not where it sells", () => {
  it("ignores a foreign product launching in India", () => {
    assert.equal(discoveryIndiaSignal("Apple Pay launches in India with Axis Bank", null), null);
  });

  it("accepts '<City>-based' and 'Indian startup' phrasing", () => {
    assert.ok(discoveryIndiaSignal("Bengaluru-based Kokasa raises seed round", null));
    assert.ok(discoveryIndiaSignal("Indian startup Kokasa launches defence systems", null));
  });

  it("marks a maker's own post as self-declared, which weighs less", () => {
    const signal = discoveryIndiaSignal("I'm a solo developer from Pune", null, "self_declared");
    assert.equal(signal?.kind, "self_declared");
    assert.ok((signal?.weight ?? 99) < 25);
  });
});

describe("robots.txt", () => {
  it("prefers our own group over the wildcard group", () => {
    const rules = parseRobots("User-agent: *\nDisallow: /\n\nUser-agent: BharatHuntBot\nDisallow: /admin");
    assert.ok(isPathAllowed(rules, "/"));
    assert.ok(!isPathAllowed(rules, "/admin/x"));
  });

  it("lets the longest match win and Allow win a tie", () => {
    const rules = parseRobots("User-agent: *\nDisallow: /about\nAllow: /about/team");
    assert.ok(!isPathAllowed(rules, "/about"));
    assert.ok(isPathAllowed(rules, "/about/team"));
  });

  it("supports * and $", () => {
    const rules = parseRobots("User-agent: *\nDisallow: /*.pdf$");
    assert.ok(!isPathAllowed(rules, "/files/terms.pdf"));
    assert.ok(isPathAllowed(rules, "/files/terms.pdf?x=1"));
  });

  it("treats 4xx as allowed and 5xx as disallowed", () => {
    assert.ok(isPathAllowed(rulesForStatus(404, ""), "/anything"));
    assert.ok(!isPathAllowed(rulesForStatus(503, ""), "/"));
  });
});

describe("headline names and domain probing", () => {
  it("pulls the launched product out of a headline", () => {
    assert.equal(extractLaunchedName("Epigamia cofounder launches Kokasa to build defence tech systems"), "Kokasa");
    assert.equal(
      extractLaunchedName("Ex-Soulfull MD Prashant Parameswaran Launches Arovia To Build Regional Food Brands Portfolio"),
      "Arovia",
    );
  });

  it("returns null when no proper name follows the verb", () => {
    assert.equal(extractLaunchedName("Apple Pay launches in India"), null);
    assert.equal(extractLaunchedName("Zepto launches new feature for users"), null);
  });

  it("guesses a bounded set of domains", () => {
    const guesses = domainGuesses("Kokasa");
    assert.ok(guesses.length <= 4);
    assert.equal(guesses[0], "https://kokasa.com/");
    assert.deepEqual(domainGuesses("x"), []);
  });

  it("accepts a page only when it names itself the same thing", () => {
    assert.ok(siteMatchesName("Rivet", "Rivet", null));
    assert.ok(siteMatchesName("Kokasa", null, "Kokasa — defence systems"));
    assert.ok(!siteMatchesName("Rivet", "Rivets & Fasteners Company", null));
  });
});

describe("extraction helpers", () => {
  it("reads visible text without scripts or styles", () => {
    const text = visibleText("<style>.a{}</style><p>Hello&nbsp;there</p><script>evil()</script>");
    assert.equal(text, "Hello there");
  });

  it("finds contact/about/terms links on the same site only", () => {
    const html = `<a href="/contact">Contact</a><a href="https://other.com/about">x</a><a href="/about-us">About</a><a href="/blog">Blog</a>`;
    assert.deepEqual(secondaryPageLinks(html, "https://acme.com/", 3), [
      "https://acme.com/contact",
      "https://acme.com/about-us",
    ]);
  });

  it("reads pricing only from what the site says", () => {
    assert.equal(detectPricing("Free plan forever. Pro ₹499/month.").pricingType, "freemium");
    assert.equal(detectPricing("Starts at $29 per month").pricingType, "paid");
    assert.equal(detectPricing("We help teams collaborate.").pricingType, null);
  });
});

describe("safety", () => {
  it("is a hard stop when the product itself is gambling", () => {
    assert.deepEqual(assessSafety("Win real cash playing real-money rummy", "").hard, ["gambling"]);
  });

  it("sends body-only mentions to a human instead", () => {
    const result = assessSafety("Expense tracker for teams", "Our blog: why sports betting apps fail");
    assert.deepEqual(result.hard, []);
    assert.ok(result.soft.includes("gambling"));
  });
});

describe("eligibility and selection", () => {
  const base = {
    reachable: true,
    robotsAllowed: true,
    parked: false,
    indiaConfidence: 85,
    foreignHeadquarters: false,
    overallScore: 80,
    facts: facts(),
    safety: { hard: [], soft: [] },
    similarName: false,
    websiteInferred: false,
    thinDescription: false,
    minIndiaConfidence: 70,
    minQualityScore: 60,
  };

  it("passes a verified product", () => {
    assert.equal(decideEligibility(base).status, "eligible");
  });

  it("refuses a broken site and an unestablished India connection", () => {
    assert.equal(decideEligibility({ ...base, reachable: false }).status, "ineligible");
    assert.equal(decideEligibility({ ...base, indiaConfidence: 10 }).status, "ineligible");
  });

  it("sends a borderline India connection and an inferred website to review", () => {
    const low = decideEligibility({ ...base, indiaConfidence: 50 });
    assert.equal(low.status, "needs_review");
    assert.ok(low.issues.includes("low_india_confidence"));
    assert.equal(decideEligibility({ ...base, websiteInferred: true }).status, "needs_review");
  });

  it("skips a site whose robots.txt says no", () => {
    assert.equal(decideEligibility({ ...base, robotsAllowed: false }).status, "skipped");
  });

  it("selects fewer than the target rather than relaxing anything", () => {
    const picks = selectTop(
      [
        { id: "a", overallScore: 90, indiaConfidence: 90, category: "Finance", discoveredAt: "1" },
        { id: "b", overallScore: 70, indiaConfidence: 90, category: "Finance", discoveredAt: "2" },
        { id: "c", overallScore: 65, indiaConfidence: 90, category: "Social", discoveredAt: "3" },
      ],
      5,
    );
    assert.deepEqual(picks, ["a", "b", "c"]);
    assert.equal(shortfallMessage(3, 5), "Only 3 verified products found today.");
    assert.equal(shortfallMessage(5, 5), null);
  });

  it("prefers category variety, then fills from the remainder", () => {
    const picks = selectTop(
      [
        { id: "f1", overallScore: 95, indiaConfidence: 90, category: "Finance", discoveredAt: "1" },
        { id: "f2", overallScore: 94, indiaConfidence: 90, category: "Finance", discoveredAt: "2" },
        { id: "f3", overallScore: 93, indiaConfidence: 90, category: "Finance", discoveredAt: "3" },
        { id: "s1", overallScore: 70, indiaConfidence: 90, category: "Social", discoveredAt: "4" },
      ],
      3,
    );
    assert.deepEqual(picks, ["f1", "f2", "s1"]);
  });

  it("auto-publishes only when every gate holds", () => {
    const candidate = {
      status: "selected" as const,
      indiaConfidence: 90,
      overallScore: 80,
      issues: [],
      pricingKnown: true,
      websiteInferred: false,
      minIndiaConfidence: 70,
      minQualityScore: 60,
    };
    assert.ok(mayAutoPublish(candidate));
    assert.ok(!mayAutoPublish({ ...candidate, issues: ["no_logo"] }));
    assert.ok(!mayAutoPublish({ ...candidate, websiteInferred: true }));
    assert.ok(!mayAutoPublish({ ...candidate, status: "needs_review" }));
  });
});

describe("content — verified facts only", () => {
  it("drops hype and never invents a founder, price or city", () => {
    const draft = buildContent({
      name: "Ledgerly",
      facts: facts({
        siteDescription: "India's #1 invoicing app. Ledgerly helps small businesses send GST invoices in seconds.",
        pricingType: null,
      }),
      signals: [],
      indiaConfidence: 20,
      minIndiaConfidence: 70,
      sourceName: "show_hn",
      discoveredOn: "2026-10-02",
      categories: CATEGORIES,
    });
    assert.ok(!/#1/.test(draft.tagline + draft.shortDescription + draft.fullDescription));
    assert.ok(!/founded by/i.test(draft.fullDescription));
    assert.ok(!/free|paid/i.test(draft.fullDescription));
    // Below the India threshold, the draft does not call it Indian.
    assert.ok(!/based in|Indian company/i.test(draft.fullDescription));
    assert.equal(draft.generatedBy, "template");
  });

  it("states verified facts plainly", () => {
    const draft = buildContent({
      name: "Ledgerly",
      facts: facts({ companyName: "Ledgerly Labs Private Limited", city: "Pune", stateCode: "IN-MH", freeTrial: true }),
      signals: [{ kind: "cin", label: "", weight: 45, evidence: "", url: null }],
      indiaConfidence: 90,
      minIndiaConfidence: 70,
      sourceName: "show_hn",
      discoveredOn: "2026-10-02",
      categories: CATEGORIES,
    });
    assert.match(draft.fullDescription, /built by Ledgerly Labs Private Limited/);
    assert.match(draft.fullDescription, /Pune, Maharashtra/);
    assert.match(draft.whyInteresting, /registered as an Indian company/);
    assert.ok(draft.tagline.length <= 80);
    assert.ok(draft.tags.includes("fintech"));
  });

  it("clips at a word boundary", () => {
    assert.equal(clip("one two three four", 10), "one two…");
  });
});

describe("evaluateCandidate — a whole site, end to end", () => {
  const home = `<!doctype html><html><head>
    <title>Ledgerly — GST invoicing for small businesses</title>
    <meta name="description" content="Ledgerly helps small businesses send GST invoices and get paid faster.">
    <meta property="og:image" content="https://ledgerly.in/og.png">
    <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
  </head><body>
    <a href="/pricing">Pricing</a><a href="/contact">Contact</a>
    <p>Sign up and start free. Free plan forever; Pro is ₹499/month.</p>
    <footer>Ledgerly Software Private Limited · 12 MG Road, Bengaluru, Karnataka 560001 · CIN U72200KA2022PTC123456</footer>
  </body></html>`;

  it("produces an eligible, well-scored candidate with evidence", () => {
    const result = evaluateCandidate({
      name: "Ledgerly",
      host: "ledgerly.in",
      pages: [{ url: "https://ledgerly.in/", html: home, status: 200, ms: 300 }],
      discoverySignals: [],
      duplicate: { kind: "unique" },
      websiteInferred: false,
      sourceName: "manual",
      discoveredOn: "2026-10-02",
      categories: CATEGORIES,
      weights: parseWeights({}),
      minIndiaConfidence: 70,
      minQualityScore: 60,
    });
    assert.ok(result.indiaConfidence >= 70, `india ${result.indiaConfidence}`);
    assert.equal(result.facts.stateCode, "IN-KA");
    assert.equal(result.facts.pricingType, "freemium");
    assert.equal(result.facts.logoUrl, "https://ledgerly.in/apple-touch-icon.png");
    assert.equal(result.eligibility.status, "eligible", JSON.stringify(result.eligibility));
    assert.ok(result.scores.overallScore >= 60, `overall ${result.scores.overallScore}`);
  });

  it("refuses a parked domain", () => {
    const result = evaluateCandidate({
      name: "Kokasa",
      host: "kokasa.com",
      pages: [{ url: "https://kokasa.com/", html: "<title>kokasa.com</title>This domain is for sale!", status: 200, ms: 100 }],
      discoverySignals: [],
      duplicate: { kind: "unique" },
      websiteInferred: true,
      sourceName: "news_launches",
      discoveredOn: "2026-10-02",
      categories: CATEGORIES,
      weights: parseWeights({}),
      minIndiaConfidence: 70,
      minQualityScore: 60,
    });
    assert.equal(result.eligibility.status, "ineligible");
  });
});

describe("discovery sources", () => {
  it("keeps only Show HN posts whose maker connects them to India", () => {
    const candidates = showHnCandidates(
      {
        hits: [
          { objectID: "1", title: "Show HN: Totum – AI accounting for finance teams", url: "https://totumai.in", story_text: "Built by a small team from Bengaluru." },
          { objectID: "2", title: "Show HN: Read the Odyssey in Greek", url: "https://readwithgloss.com" },
          { objectID: "3", title: "Show HN: My repo, from India", url: "https://github.com/a/b" },
        ],
      },
      10,
    );
    assert.deepEqual(candidates.map((candidate) => candidate.websiteUrl), ["https://totumai.in"]);
    assert.equal(candidates[0].name, "Totum");
    assert.deepEqual(candidates[0].sourceUrls, ["https://news.ycombinator.com/item?id=1"]);
  });

  it("turns Indian launch headlines into name-only candidates and skips foreign ones", () => {
    const candidates = newsLaunchCandidates(
      [
        { title: "Bengaluru-based Epigamia cofounder launches Kokasa to build defence tech", url: "https://inc42.com/a", excerpt: null, publishedAt: null, sourceName: "Inc42", region: "india" },
        { title: "OpenAI launches Dots, its Muse competitor", url: "https://x.com/b", excerpt: null, publishedAt: null, sourceName: "ET Tech", region: "india" },
      ],
      10,
    );
    assert.deepEqual(candidates.map((candidate) => candidate.name), ["Kokasa"]);
    assert.equal(candidates[0].websiteUrl, null);
  });

  it("drops extractor noise from funding names", () => {
    const candidates = fundingCandidates(
      [
        { startupName: "for hospitality", headline: "x", summary: null, sourceUrl: "u1", location: "India", city: null, announcedOn: "2026-09-25" },
        { startupName: "Nuvah", headline: "Nuvah raises seed", summary: null, sourceUrl: "u2", location: "India", city: "Other India", announcedOn: "2026-09-24" },
      ],
      10,
    );
    assert.deepEqual(candidates.map((candidate) => candidate.name), ["Nuvah"]);
  });

  it("isolates a failing or slow source from the others", async () => {
    const ok: DiscoverySource = {
      key: "ok", name: "ok", description: "", priority: 1, rateLimit: { maxRequests: 0 }, defaultEnabled: true,
      async discover() {
        return [{ name: "A", websiteUrl: "https://a.com", sourceName: "ok", sourceUrls: [], snippet: null, publishedAt: null, discoverySignals: [], discoveryScore: 1 }];
      },
    };
    const broken: DiscoverySource = { ...ok, key: "broken", async discover() { throw new Error("HTTP 429"); } };
    const slow: DiscoverySource = { ...ok, key: "slow", discover: () => new Promise((resolve) => setTimeout(() => resolve([]), 500)) };
    const result = await runSources(
      [broken, slow, ok],
      { now: new Date(), fetchText: async () => "", queries: { recentArticles: async () => [], recentFundingRounds: async () => [] }, manualUrls: [] },
      10,
      50,
    );
    assert.equal(result.candidates.length, 1);
    assert.deepEqual(result.reports.map((report) => [report.source, report.ok]), [["broken", false], ["slow", false], ["ok", true]]);
    assert.match(result.reports[0].error ?? "", /429/);
  });
});

describe("config", () => {
  it("clamps every bound and falls back on bad values", () => {
    const config = parseConfig({
      agent_type: "daily5",
      daily_target: 500,
      max_concurrent_requests: 0,
      timezone: "Mars/Olympus",
      run_time: "25:99",
      mode: "auto_publish",
      auto_publish_allowed: false,
    });
    assert.equal(config.dailyTarget, 25);
    assert.equal(config.maxConcurrentRequests, 1);
    assert.equal(config.timezone, "Asia/Kolkata");
    assert.equal(config.runTime, "09:00");
    // Auto mode without the kill switch released is still approval.
    assert.equal(autoPublishActive(config), false);
  });

  it("restores default weights when all are zero", () => {
    const weights = parseWeights({ india: 0, completeness: 0, website: 0, uniqueness: 0, launchReadiness: 0, relevance: 0 });
    assert.equal(weights.india, 25);
  });

  it("reads the IST clock, not UTC", () => {
    // 2 Oct 2026 03:45 UTC = 09:15 IST.
    const now = new Date("2026-10-02T03:45:00Z");
    assert.deepEqual(localClock(now, "Asia/Kolkata"), { date: "2026-10-02", minutes: 9 * 60 + 15 });
    assert.ok(isRunDue(now, { runTime: "09:00", timezone: "Asia/Kolkata" }));
    assert.ok(!isRunDue(now, { runTime: "10:00", timezone: "Asia/Kolkata" }));
  });
});

describe("regressions found by the live dry run (2026-10-02)", () => {
  it("does not read a count as a product name", () => {
    assert.equal(extractLaunchedName("Peak XV ups Surge seed investment ceiling to $5M, unveils 18-startup cohort"), null);
  });

  it("tries the whole name before stripping a generic suffix", () => {
    assert.deepEqual(domainGuesses("QNu Labs").slice(0, 2), ["https://qnulabs.com/", "https://qnulabs.in/"]);
    assert.ok(domainGuesses("QNu Labs", 6).includes("https://qnu.com/"));
  });

  it("uses a name that already is a domain as-is", () => {
    assert.equal(domainGuesses("Fundly.ai")[0], "https://fundly.ai/");
  });

  it("finds an Indian legal entity even when an earlier mention has no address", () => {
    const text =
      "Traccia is built by Algen AI Private Limited. " +
      "x".repeat(400) +
      " A product of Algen AI Private Limited WeWork Roshni Tech Hub, Marathahalli, Bengaluru, Karnataka 560037, India";
    // As in the live run: the maker's Show HN post also said "based out of Bengaluru".
    const post = discoveryIndiaSignal("We are based out of Bengaluru", "https://news.ycombinator.com/item?id=1", "self_declared");
    const result = assessIndia([{ url: "https://traccia.ai/", text }], "traccia.ai", post ? [post] : []);
    assert.ok(result.signals.some((signal) => signal.kind === "legal_entity_india"));
    assert.ok(result.confidence >= 70, `got ${result.confidence}`);
  });
});

describe("regressions from the second live dry run", () => {
  it("does not let an auditor's 'India' vouch for the company", () => {
    const result = assessIndia(
      [{ url: "u", text: "Our platform is SOC 2 compliant and independently audited by BDO India LLP every year." }],
      "haptik.ai",
    );
    assert.ok(!result.signals.some((signal) => signal.kind === "legal_entity_india"));
  });

  it("does not read where servers are as where the company is", () => {
    const result = assessIndia([{ url: "u", text: "Data is stored on cloud servers located in India and abroad." }], "x.com");
    assert.ok(!result.signals.some((signal) => signal.kind === "stated_location"));
  });

  it("recognises the 'P. Limited' abbreviation beside an Indian address", () => {
    const result = assessIndia([{ url: "u", text: "CoRover P. Limited, Bommanahalli, Bengaluru" }], "corover.ai");
    assert.ok(result.signals.some((signal) => signal.kind === "legal_entity_india"));
  });

  it("drops 'industry leading' and 'a leading' sentences from the draft", () => {
    const draft = buildContent({
      name: "Krutrim",
      facts: facts({
        siteDescription: "India's AI-first cloud platform - Industry Leading. Krutrim offers GPU cloud and AI models for developers.",
      }),
      signals: [],
      indiaConfidence: 90,
      minIndiaConfidence: 70,
      sourceName: "india_ai_gazetteer",
      discoveredOn: "2026-10-02",
      categories: CATEGORIES,
    });
    assert.ok(!/leading/i.test(draft.tagline + draft.fullDescription), draft.tagline);
    assert.match(draft.tagline, /GPU cloud/);
  });
});
