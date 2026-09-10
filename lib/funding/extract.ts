/**
 * Turning a headline into a funding record, without inventing anything.
 *
 * This is the deterministic half of the extraction layer. It runs on every
 * candidate article, always, with no API key and no network — which is what
 * makes the feature work on a fresh clone. `lib/funding/ai.ts` is an optional
 * pass on top that can do better on prose this cannot parse; when it is not
 * configured, or when it fails, or when it returns something that does not
 * validate, what ships is this.
 *
 * The rule every function here obeys
 * ----------------------------------
 * A field is null unless the text said it. There is no "probably Seed", no
 * "most Indian fintech rounds are in Bengaluru", no zero standing in for an
 * undisclosed amount. `confidence` reports how much of the record came from an
 * unambiguous pattern, and the review queue exists because the honest answer to
 * "is this right?" is sometimes no.
 *
 * Pure and dependency-free, so `tests/funding-extract.test.ts` runs the real
 * thing against real headlines taken from the seeded feeds.
 */

import {
  FUNDING_STAGES,
  type FundingCity,
  type FundingIndustry,
  type FundingStage,
} from "./constants.ts";
import { decodeEntities, stripHtml } from "./normalize.ts";

export type ExtractionInput = {
  title: string;
  summary?: string | null;
  publishedAt?: string | null;
  sourceName?: string | null;
  /**
   * True when the article body is unavailable and only the headline can be
   * trusted — Google News items, whose `<description>` is a bare anchor tag.
   * Lowers confidence rather than changing what is extracted.
   */
  headlineOnly?: boolean;
};

export type ExtractedRound = {
  startupName: string | null;
  amount: string | null;
  amountNumeric: number | null;
  currency: string | null;
  fundingStage: FundingStage;
  investors: string[];
  leadInvestor: string | null;
  industry: FundingIndustry | null;
  location: string | null;
  city: FundingCity | null;
  confidence: number;
};

// ── Step 0: is this even a funding story? ────────────────────────────────

/**
 * Words that make an article worth extracting from. Cheap, and it runs before
 * anything expensive — a feed of forty items usually yields three or four
 * candidates, and the other thirty-six never reach the model.
 */
const FUNDING_SIGNALS = [
  "raises",
  "raised",
  "raising",
  "secures",
  "secured",
  "bags",
  "bagged",
  "funding",
  "funded",
  "investment",
  "invests",
  "invested",
  "seed round",
  "series a",
  "series b",
  "series c",
  "series d",
  "pre-seed",
  "pre-series",
  "venture debt",
  "led by",
  "mops up",
  "picks up",
  "nets",
  "fundraise",
  "round in",
];

/**
 * Words that mean this is about money but not about a round.
 *
 * A quarterly-results story and a secondary share sale both talk about crores
 * and investors, and both would extract cleanly into a funding record that
 * never happened. Cheaper to refuse them here than to correct them in review.
 */
const NOT_A_ROUND = [
  "ipo",
  "drhp",
  "listing",
  "quarterly results",
  "q1 fy",
  "q2 fy",
  "q3 fy",
  "q4 fy",
  "revenue",
  "profit",
  "loss narrows",
  "layoff",
  "shuts down",
  "bulk deal",
  "block deal",
  "offloads",
  "stake sale",
  "sells stake",
  "share sale",
  // A minority stake bought off the cap table is not a round the company
  // raised. "Bajaj Finance acquires 5% stake in TrueFan AI" is a real headline
  // whose body then describes the company's *previous* Series A — which is
  // exactly the article that would otherwise be stored as a new one.
  "% stake",
  "stake in",
  "minority stake",
  "esop",
  "buyback",
  "fund launch",
  "closes fund",
  "launches fund",
  "raises fund",
  "fund raise of rs",
  "maiden fund",
  /*
   * Weekly and monthly roundups.
   *
   * These are the most dangerous false positive available, because they extract
   * *cleanly*: "Indian Startups Raised $79 Mn This Week" yields a company
   * ("Indian"), an amount and a date, and lands in the database looking exactly
   * like a real round. They are also common — several publications run one
   * every Saturday.
   */
  "this week",
  "last week",
  "past week",
  "weekly funding",
  "funding roundup",
  "funding round-up",
  "startups raised",
  "startups raise",
  "tops the list",
  "top deals",
  "deals of the week",
  "here are the",
];

/**
 * True when an article looks like a funding announcement.
 *
 * Deliberately generous on the positive side and strict on the negative: a
 * missed round is invisible, a false one reaches a reviewer. Anything that
 * passes here still has to survive extraction — an article with no company name
 * and no amount is rejected later regardless of its keywords.
 */
/**
 * A VC announcing its own fund close.
 *
 * "Accel raises $550 million for its eighth India fund" is a company raising
 * money, and it is not a startup funding round. It survives the phrase list
 * above because none of those phrases appear in it — so it needs the shape
 * matched rather than the words: a raise, then the noun "fund" (not "funding")
 * shortly after.
 */
const VC_FUND_RAISE = /\b(?:raises|raised|closes|closed|announces|launches)\b[^.]{0,60}?\bfunds?\b(?!ing|ed|s\b)/i;

export function isFundingCandidate(title: string, summary?: string | null): boolean {
  const headline = (title ?? "").toLowerCase();
  const body = stripHtml(summary ?? "").slice(0, 600).toLowerCase();
  const haystack = `${headline} ${body}`;
  if (!haystack.trim()) return false;

  /*
   * Where the disqualifying phrase appears decides how much weight it carries.
   *
   * In the headline it is decisive: "Indian Startups Raised $132 Mn This Week"
   * is a roundup no matter what the body says, and an earlier version of this
   * let every such article through because it also contained the word "raised"
   * and so passed the override below.
   *
   * In the body it is only a hint, because Entrackr routinely recaps last
   * quarter's revenue or a previous stake sale inside a genuine round story.
   * There, an unambiguous headline wins.
   */
  if (NOT_A_ROUND.some((phrase) => headline.includes(phrase))) return false;
  if (VC_FUND_RAISE.test(headline)) return false;

  if (NOT_A_ROUND.some((phrase) => body.includes(phrase))) {
    const clearlyARound =
      /\b(raises|raised|secures|secured|bags|bagged|mops up|picks up)\b/.test(headline) &&
      !/\b(ipo|drhp|bulk deal|block deal|offloads|stake|buyback|fund)\b/.test(headline);
    if (!clearlyARound) return false;
  }

  return FUNDING_SIGNALS.some((signal) => haystack.includes(signal));
}

// ── Step 1: the amount ───────────────────────────────────────────────────

const MULTIPLIERS: Record<string, number> = {
  k: 1_000,
  thousand: 1_000,
  lakh: 100_000,
  lakhs: 100_000,
  lac: 100_000,
  lacs: 100_000,
  mn: 1_000_000,
  m: 1_000_000,
  million: 1_000_000,
  cr: 10_000_000,
  crore: 10_000_000,
  crores: 10_000_000,
  bn: 1_000_000_000,
  b: 1_000_000_000,
  billion: 1_000_000_000,
};

const UNIT_ALTERNATION = "crores|crore|cr|lakhs|lakh|lacs|lac|million|mn|billion|bn|thousand|k|m|b";

const INR_AMOUNT = new RegExp(
  String.raw`(?:₹|rs\.?|inr)\s*([\d,]+(?:\.\d+)?)\s*(` + UNIT_ALTERNATION + String.raw`)?\b`,
  "i",
);

const USD_AMOUNT = new RegExp(
  String.raw`(?:us\$|\$|usd)\s*([\d,]+(?:\.\d+)?)\s*(` + UNIT_ALTERNATION + String.raw`)?\b`,
  "i",
);

/**
 * Figures in the sentence that are not the size of the round.
 *
 * "valuing the company at Rs 14,656 crore" and "revenue of Rs 1,358 crore" are
 * both real sentences from a real feed, both sit inside genuine funding
 * articles, and both parse perfectly into a wrong `amount`. The guard looks at
 * the 40 characters before the match, which is where the disqualifying noun
 * always is.
 */
const AMOUNT_DISQUALIFIERS =
  /\b(valu\w*|revenue|profit|loss|turnover|market cap|gmv|arr|salar\w*|worth|topline|ebitda|debt of|repay\w*|sold|stake|buyback|ipo)\b/i;

/**
 * The same nouns, read on the *other* side of the figure.
 *
 * "Fashion brand Theater raises Series A at Rs 400 Cr valuation" puts the
 * disqualifying noun *after* the number, where the leading window cannot see
 * it. The first live production run duly recorded that company's valuation as
 * the money it raised — the exact fabrication the brief forbids.
 *
 * Deliberately tight: it must match immediately after the figure, past at most
 * one short connector. Widening it would break the sentence that states both —
 * "raised Rs 100 Cr at a Rs 1,000 Cr valuation" — where the real amount is
 * followed a few words later by a valuation it must survive.
 */
const TRAILING_AMOUNT_DISQUALIFIERS =
  /^[\s,]*(?:pre-money|post-money|in|at)?[\s-]*(?:valu\w*|market cap|revenue|arr|gmv|turnover|topline|ebitda)\b/i;

type AmountMatch = { text: string; value: number; currency: string };

function matchAmount(text: string, pattern: RegExp, currency: string): AmountMatch | null {
  /*
   * Every match, not just the first.
   *
   * `exec` returning one match meant a disqualified leading figure discarded
   * the whole text, so "at a Rs 400 Cr valuation, Theater raised Rs 50 Cr" lost
   * the real amount along with the fake one. Walking the matches lets the first
   * *acceptable* figure win instead.
   */
  const scanner = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`);

  for (const found of text.matchAll(scanner)) {
    if (found.index === undefined) continue;

    /*
     * Seventy characters, clipped at the clause boundary.
     *
     * Forty was not enough: "revenue grew nearly sevenfold to more than Rs 1,400
     * crore" puts forty-three characters between the disqualifying noun and the
     * figure, so the guard read a clean window and accepted a revenue line as a
     * funding round. Clipping at the last sentence break is what makes the wider
     * window safe — a "valuation" in the *previous* sentence says nothing about
     * this one, and reaching into it would suppress real amounts.
     */
    const window = text.slice(Math.max(0, found.index - 70), found.index);
    const clauseStart = Math.max(window.lastIndexOf(". "), window.lastIndexOf("; "));
    const before = clauseStart >= 0 ? window.slice(clauseStart + 2) : window;
    if (AMOUNT_DISQUALIFIERS.test(before)) continue;

    const end = found.index + found[0].length;
    if (TRAILING_AMOUNT_DISQUALIFIERS.test(text.slice(end, end + 30))) continue;

    const digits = Number(found[1].replace(/,/g, ""));
    if (!Number.isFinite(digits) || digits <= 0) continue;

    const unit = (found[2] ?? "").toLowerCase();
    const multiplier = unit ? (MULTIPLIERS[unit] ?? 1) : 1;
    const value = Math.round(digits * multiplier);

    // A round of eleven rupees, or of a hundred thousand crore, is a parse
    // failure wearing a number. Both ends are far outside any real round.
    if (value < 100_000 || value > 5_000_000_000_000) continue;

    return { text: found[0].trim().replace(/\s+/g, " "), value, currency };
  }
  return null;
}

/**
 * The amount, preferring the headline.
 *
 * A headline states the round and nothing else; a body paragraph states the
 * round, last year's revenue, the valuation and the founder's previous exit.
 * So the title is asked first and its answer is taken, and the body is only
 * consulted when the title carried no figure at all.
 */
export function extractAmount(
  title: string,
  summary?: string | null,
): { amount: string; amountNumeric: number; currency: string } | null {
  const body = stripHtml(summary ?? "");

  for (const text of [decodeEntities(title ?? ""), body.slice(0, 700)]) {
    if (!text) continue;
    // Rupees first: an Indian article that gives both usually leads with the
    // dollar figure and puts rupees in brackets, or the reverse — and either
    // way the two describe the same round, so whichever wins is correct.
    const inr = matchAmount(text, INR_AMOUNT, "INR");
    const usd = matchAmount(text, USD_AMOUNT, "USD");

    const chosen =
      inr && usd
        ? // Whichever the writer put first is the one they led with.
          text.indexOf(inr.text) <= text.indexOf(usd.text)
          ? inr
          : usd
        : (inr ?? usd);

    if (chosen) {
      return { amount: chosen.text, amountNumeric: chosen.value, currency: chosen.currency };
    }
  }
  return null;
}

// ── Step 2: the stage ────────────────────────────────────────────────────

/**
 * Ordered, because the first match wins and the specific has to beat the
 * general: "pre-seed" must be tested before "seed", or every pre-seed round in
 * the feed becomes a seed round.
 *
 * What is deliberately absent: "pre-Series A". It is a real stage and it is not
 * in this product's vocabulary, so the pattern for "Series A" refuses to match
 * inside it (the `(?<!pre-)` guard) and the round is left `Undisclosed` with
 * the phrase still visible in its headline. Calling it Series A would be a
 * fabrication and calling it Seed would be a different one; "we did not
 * classify this" is the only true answer available.
 */
const STAGE_PATTERNS: { stage: FundingStage; pattern: RegExp }[] = [
  { stage: "Pre-seed", pattern: /\bpre[\s-]?seed\b/i },
  { stage: "Series D+", pattern: /\bseries\s*[d-h]\b/i },
  { stage: "Series C", pattern: /(?<!pre[\s-])\bseries\s*c\b/i },
  { stage: "Series B", pattern: /(?<!pre[\s-])\bseries\s*b\b/i },
  { stage: "Series A", pattern: /(?<!pre[\s-])\bseries\s*a\d?\b/i },
  { stage: "Venture Debt", pattern: /\bventure debt\b/i },
  { stage: "Debt", pattern: /\b(debt (?:round|financing|funding)|debt from)\b/i },
  { stage: "Grant", pattern: /\bgrant\b/i },
  { stage: "Acquisition", pattern: /\b(acquires|acquired|acquisition)\b/i },
  { stage: "Angel", pattern: /\bangel (?:round|funding|investment)\b/i },
  { stage: "Seed", pattern: /\bseed\b/i },
  { stage: "Bootstrapped", pattern: /\bbootstrapp?ed\b/i },
];

export function extractStage(title: string, summary?: string | null): FundingStage {
  const haystack = `${decodeEntities(title ?? "")} ${stripHtml(summary ?? "").slice(0, 500)}`;
  for (const { stage, pattern } of STAGE_PATTERNS) {
    if (pattern.test(haystack)) return stage;
  }
  return "Undisclosed";
}

// ── Step 3: the company ──────────────────────────────────────────────────

/**
 * Nouns a writer puts between a description and the company's actual name.
 * "Cooling-as-a-Service (CaaS) platform Circolife" — everything up to and
 * including "platform" is description, and the name is what follows.
 */
const CATEGORY_NOUNS =
  "startup|startups|platform|company|companies|firm|brand|app|venture|marketplace|provider|maker|player|chain|unicorn|manufacturer|aggregator|network";

const DESCRIPTOR_HEADS = new RegExp(String.raw`^(.*\b(?:` + CATEGORY_NOUNS + String.raw`)\s+)`, "i");

/** The same nouns, as a trailing test. See `plausibleCompany`. */
const TRAILING_CATEGORY_NOUN = new RegExp(String.raw`\b(?:` + CATEGORY_NOUNS + String.raw`)$`, "i");

/** "Delhi-based", "AI-powered", "Bengaluru-headquartered". */
const LEADING_QUALIFIER = /^(?:[A-Za-z]+(?:-[A-Za-z]+)*-(?:based|backed|powered|led|focused|first|headquartered)\s+)+/i;

/** Sector adjectives that lead a headline: "Fintech startup X", "SaaS firm Y". */
const LEADING_SECTOR =
  /^(?:the\s+)?(?:fintech|edtech|healthtech|insurtech|agritech|foodtech|proptech|cleantech|deeptech|spacetech|legaltech|hrtech|saas|ai|ml|d2c|b2b|b2c|ev|electric vehicle|logistics|gaming|crypto|web3|quick commerce|e-?commerce|consumer|mobility|climate|space)\s+/i;

/**
 * Reduce "Delhi-based fintech startup ABC" to "ABC".
 *
 * Applied repeatedly because headlines stack these ("Gurugram-based AI-powered
 * water infrastructure platform DigitalPaani"). Each pass removes one layer,
 * and the loop stops when nothing more comes off — which also stops it eating a
 * name that happens to contain one of these words.
 */
export function stripDescriptors(raw: string): string {
  let name = raw.trim().replace(/^[^\w(]+/, "");

  // An editorial label before a colon: "Exclusive: DaMENSCH raises…". Without
  // this the company is stored as "Exclusive: DaMENSCH", which also slugifies
  // into a URL nobody would guess.
  name = name.replace(/^(?:exclusive|breaking|scoop|update|report|opinion|just in)\s*:\s*/i, "").trim();

  for (let pass = 0; pass < 4; pass += 1) {
    const before = name;

    const head = DESCRIPTOR_HEADS.exec(name);
    if (head && name.length > head[1].length) name = name.slice(head[1].length).trim();

    name = name.replace(LEADING_QUALIFIER, "").trim();
    name = name.replace(LEADING_SECTOR, "").trim();

    if (name === before) break;
  }

  // Parentheticals are always gloss, never the name: "Circolife (a CaaS play)".
  name = name.replace(/\s*\([^)]*\)\s*/g, " ").trim();
  // A trailing possessive belongs to the sentence, not the company.
  name = name.replace(/['’]s$/i, "").trim();

  /*
   * Trailing all-lowercase words are the sentence, not the name.
   *
   * "BlissClub recently raised…" captured "BlissClub recently". A company
   * name's tokens are capitalised or mixed-case; a bare lowercase trailing word
   * is an adverb or a preposition that the subject pattern swept up. Only
   * trailing ones are removed, so a lowercase-led name ("byteXL", "upGrad")
   * survives — and the loop stops as soon as a capitalised token is reached.
   */
  const words = name.split(/\s+/);
  while (
    words.length > 1 &&
    /^[a-z]+$/.test(words[words.length - 1]) &&
    // Stop at a category noun rather than removing it. "Indian space-tech
    // startup" has to reach `plausibleCompany` intact so it can be recognised
    // as a description and refused; trimming "startup" here would leave
    // "Indian space-tech" looking like a company name.
    !TRAILING_CATEGORY_NOUN.test(words[words.length - 1])
  ) {
    words.pop();
  }
  name = words.join(" ");

  return name.replace(/\s+/g, " ");
}

/** A parsed company name has to look like one before it is believed. */
function plausibleCompany(name: string | null): string | null {
  if (!name) return null;
  const clean = name.trim().replace(/[,;:.]+$/, "").trim();

  if (clean.length < 2 || clean.length > 60) return null;
  // Six words is a sentence fragment that survived the descriptor stripper.
  if (clean.split(/\s+/).length > 6) return null;
  /*
   * A name that *ends* in a category noun is a description, not a name.
   *
   * "Indian space-tech startup raises $100 million" never names the company in
   * its subject, and the stripper cannot help: it removes everything up to and
   * including "startup ", which requires a word after it. What survives is
   * "Indian space-tech startup", which looks like a plausible company and is
   * not one.
   */
  if (TRAILING_CATEGORY_NOUN.test(clean)) return null;
  // A verb in the middle means the pattern captured too much.
  if (/\b(raises|raised|secures|says|plans|launches|reports|to|will|has|have)\b/i.test(clean)) {
    return null;
  }
  // Names start with a letter or a digit, not punctuation or a conjunction.
  if (!/^[A-Za-z0-9]/.test(clean)) return null;
  /*
   * A demonym or a category noun is not a company.
   *
   * "Indian Startups Raised $79 Mn This Week" parses its subject as "Indian",
   * which then gets a slug, a profile page and a funding history. The roundup
   * keywords above catch most of these articles; this catches the ones whose
   * headline avoids them.
   */
  if (
    /^(the|a|an|and|or|its|his|her|their|this|that|it|from|to|with|for|after|over|amid|as|why|how|what|indian|indians|india|startup|startups|company|companies|founder|founders|investor|investors|funding|report|week|month)$/i.test(
      clean,
    )
  ) {
    return null;
  }

  return clean;
}

/**
 * The company that raised, from the headline.
 *
 * Three shapes, in descending confidence, all taken from feeds that are
 * actually seeded:
 *   1. "Circolife raises $4.5 Mn in pre-Series A round led by ..."
 *   2. "Navam Capital leads Rs 22 Cr round in DigitalPaani"
 *   3. "... in DigitalPaani's Series A"
 *
 * Returns null rather than a guess. An article whose subject cannot be named is
 * not stored as a round at all — a funding record with the wrong company on it
 * is worse than a missing one.
 */
export function extractStartupName(title: string, summary?: string | null): string | null {
  const headline = decodeEntities(title ?? "").trim();

  // 1. Subject-first: everything before the funding verb.
  //
  // The optional auxiliary matters more than it looks. Without it, the
  // non-greedy subject in "Delhi-based fintech startup ABC has raised $4
  // million" runs on to "…ABC has", which the plausibility check then rejects
  // for containing a verb — costing the one shape the brief gives as its own
  // worked example.
  const subject =
    /^(.+?)\s+(?:has\s+|have\s+|had\s+)?(?:raises|raised|secures|secured|bags|bagged|nets|netted|mops up|picks up|garners|closes|lands|receives)\b/i.exec(
      headline,
    );
  if (subject) {
    const name = plausibleCompany(stripDescriptors(subject[1]));
    if (name) return name;
  }

  // 2. Investor-first: "<Investor> leads <amount> round in <Company>".
  const inRound =
    /\b(?:leads?|led|backs?|invests? in|participates? in)\b[^.]*?\b(?:round|funding|investment)\s+(?:in|into|of)\s+([^,.;]+)/i.exec(
      headline,
    );
  if (inRound) {
    const name = plausibleCompany(stripDescriptors(inRound[1]));
    if (name) return name;
  }

  // 3. Possessive: "... in DigitalPaani's Series A round".
  const possessive = /\b(?:in|into)\s+([A-Z][\w&.-]*(?:\s+[A-Z][\w&.-]*){0,3})['’]s\s/.exec(headline);
  if (possessive) {
    const name = plausibleCompany(stripDescriptors(possessive[1]));
    if (name) return name;
  }

  // 4. Last resort, and only in the body: the same subject-first shape in the
  //    opening sentence, which is where a well-formed article restates it.
  const opening = stripHtml(summary ?? "").slice(0, 300);
  if (opening) {
    const bodySubject =
      /(?:^|\.\s+)(.{3,90}?)\s+(?:has raised|raised|has secured|secured|raises)\b/i.exec(opening);
    if (bodySubject) {
      const name = plausibleCompany(stripDescriptors(bodySubject[1]));
      if (name) return name;
    }
  }

  return null;
}

// ── Step 4: the investors ────────────────────────────────────────────────

/** Where an investor list stops. */
const INVESTOR_LIST_END =
  /\.(?:\s|$)|,?\s+(?:with participation|along with|as well as|the round|which|and the|to (?:expand|scale|fund)|for |in a |in the )/i;

function splitNames(fragment: string): string[] {
  return fragment
    .split(/,|\band\b|&|\bwith\b/i)
    .map((part) => part.replace(/\s+/g, " ").trim())
    .map((part) => part.replace(/^(?:the|a|an)\s+/i, "").trim())
    .map((part) => part.replace(/[.,;:]+$/, "").trim())
    .filter(Boolean);
}

/**
 * Cut a trailing prepositional clause off a captured name.
 *
 * "led by Baring Private Equity Partners India and Z3 Partners in June this
 * year" splits into two candidates, and the second arrives carrying the rest of
 * the sentence. A fund's name does not continue past "in", "during" or "last",
 * so everything from there is the article talking, not the name.
 *
 * **Case-sensitive, and that is the whole trick.** With `/i` this truncated
 * "All In Capital" to "All" — a real fund, in a real headline, destroyed by a
 * rule meant for prose. A trailing clause is written in lower case; a
 * capitalised "In" is part of a proper noun. That distinction costs nothing and
 * fixes the entire class.
 */
function trimTrailingClause(name: string): string {
  return name
    .replace(/\s+(?:in|on|at|during|since|after|before|earlier|last|this)\s+\S.*$/, "")
    .trim();
}

/**
 * Editorial framing that gets captured along with an investor's name.
 *
 * All observed in one pass over a live feed: "existing backer A91 Partners",
 * "new investor Tancom Electronics", "Eight Roads Ventures also participating".
 * The name is in there; the article's words around it are not part of it.
 */
/**
 * How a publication introduces an investor, stripped back to the investor.
 *
 * The second rule is the one production needed: YourStory's "…backed by
 * deep-tech venture capital firm Speciale Invest" stored the whole descriptor
 * as the investor's name, so the round card named a firm that does not exist
 * and the investor directory would have grown an entry for it.
 *
 * It only fires when the descriptor ends in an unambiguous category noun —
 * "firm", "fund", "major" — because that is the word that separates a
 * description from a name. "Speciale Invest" survives; so does "Blume Ventures",
 * whose category-sounding word is part of what it is called.
 */
const INVESTOR_DESCRIPTOR =
  /^(?:the\s+)?(?:[A-Za-z-]+\s+){0,4}?(?:venture\s+capital|vc|private\s+equity|investment|angel|deep-?tech|growth|impact)\s+(?:firm|fund|major|platform|company|house|arm)\s+/i;

function trimInvestorFraming(name: string): string {
  return name
    .replace(/^(?:the\s+)?(?:existing|new|returning|current|other|lead)\s+(?:backer|investor|investors|participant)s?\s+/i, "")
    .replace(INVESTOR_DESCRIPTOR, "")
    .replace(/\s+(?:also\s+)?(?:participating|participated|among others|and others|amongst others)\.?$/i, "")
    .trim();
}

/**
 * Bare job titles, which are never a fund.
 *
 * "Dhruv Vohra, Director" splits into a person and their title, and the title
 * arrives looking exactly like a short capitalised name.
 */
const JOB_TITLE_ONLY =
  /^(?:director|managing director|executive director|ceo|cto|cfo|coo|chairman|chairperson|founder|co-?founder|partner|general partner|managing partner|president|vice president|vp|md|head|group|family|others)$/i;

/** An investor name has to look like one, on the same argument as a company's. */
function plausibleInvestor(name: string): string | null {
  const clean = trimTrailingClause(trimInvestorFraming(name.trim()));

  if (JOB_TITLE_ONLY.test(clean)) return null;
  if (clean.length < 2 || clean.length > 70) return null;
  if (clean.split(/\s+/).length > 8) return null;
  if (!/^[A-Za-z0-9]/.test(clean)) return null;
  // Sentence fragments and job titles, not funds.
  if (
    /\b(round|funding|investment|participation|others|existing investors|undisclosed|company|startup|platform|its|their|who|which)\b/i.test(
      clean,
    )
  ) {
    return null;
  }
  // A fund's name contains neither a funding verb nor a price. Either means the
  // capture ran past the name and swallowed part of the headline.
  if (/\b(raises|raised|secures|secured|bags|bagged|closes)\b/i.test(clean)) return null;
  if (/[₹$]|\b(?:rs\.?|inr|usd)\s*\d/i.test(clean)) return null;
  // A fund name has at least one capitalised word. Lower-case fragments are
  // almost always the tail of a clause the splitter cut in the wrong place.
  if (!/[A-Z]/.test(clean)) return null;
  return clean;
}

/**
 * Who put money in, and who led.
 *
 * Both lists come only from explicit constructions — "led by", "with
 * participation from", "backed by", "from". An article that names no investor
 * yields `[]`, which is what section 9 of the brief asks for: an empty array,
 * never a plausible fund.
 */
export function extractInvestors(
  title: string,
  summary?: string | null,
): { investors: string[]; leadInvestor: string | null } {
  const text = `${decodeEntities(title ?? "")}. ${stripHtml(summary ?? "").slice(0, 900)}`;

  const leads: string[] = [];
  const others: string[] = [];

  const collect = (pattern: RegExp, into: string[]) => {
    const match = pattern.exec(text);
    if (!match?.[1]) return;
    const end = INVESTOR_LIST_END.exec(match[1]);
    const fragment = end ? match[1].slice(0, end.index) : match[1];
    for (const candidate of splitNames(fragment)) {
      const name = plausibleInvestor(candidate);
      if (name && !into.some((existing) => existing.toLowerCase() === name.toLowerCase())) {
        into.push(name);
      }
    }
  };

  collect(/\bled by\s+([^]{2,200})/i, leads);
  collect(/\b(?:leads?)\s+(?:the\s+|a\s+)?(?:[^.]{0,40}?)\bround\b/i, leads);
  collect(/\bwith participation from\s+([^]{2,300})/i, others);
  collect(/\b(?:backed by|participation of|joined by|along with)\s+([^]{2,300})/i, others);
  collect(/\braised[^.]{0,60}?\bfrom\s+([^]{2,250})/i, others);

  /*
   * "<Investor> leads ... round in <Company>" puts the lead first in the
   * headline, where the generic pattern above cannot see it.
   *
   * The `(?!by\b)` is load-bearing. Without it this also fires on "Circolife
   * raises $4.5 Mn in pre-Series A round led by Bharat Jaisinghani", capturing
   * everything up to "led" — which is the company, the verb and the amount,
   * offered as the name of a fund.
   */
  const headlineLead = /^([A-Z][^,]{1,60}?)\s+(?:leads|led)\s+(?!by\b)/.exec(
    decodeEntities(title ?? ""),
  );
  if (headlineLead) {
    const name = plausibleInvestor(headlineLead[1]);
    if (name && !leads.some((existing) => existing.toLowerCase() === name.toLowerCase())) {
      leads.unshift(name);
    }
  }

  const seen = new Set<string>();
  const investors: string[] = [];
  for (const name of [...leads, ...others]) {
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    investors.push(name);
    // Twelve is already more than any card renders; past that it is a parse
    // that ran away rather than a genuinely crowded round.
    if (investors.length >= 12) break;
  }

  return { investors, leadInvestor: leads[0] ?? null };
}

// ── Step 5: sector and geography ─────────────────────────────────────────

/**
 * Keyword to industry. First match wins, so the list is ordered from most
 * specific to least — "healthtech" has to be tested before "health", and
 * "quick commerce" before "commerce".
 */
const INDUSTRY_KEYWORDS: { industry: FundingIndustry; words: string[] }[] = [
  { industry: "Fintech", words: ["fintech", "neobank", "lending", "payments", "insurtech", "wealthtech", "upi", "nbfc", "credit card", "insurance"] },
  { industry: "Healthtech", words: ["healthtech", "healthcare", "medtech", "diagnostics", "pharma", "hospital", "telemedicine", "biotech", "clinic"] },
  { industry: "Edtech", words: ["edtech", "education", "learning platform", "upskilling", "tutoring", "coaching"] },
  { industry: "Deeptech", words: ["deeptech", "deep tech", "semiconductor", "robotics", "space", "satellite", "drone", "quantum", "defence", "defense", "material science"] },
  { industry: "Climate", words: ["climate", "cleantech", "clean energy", "solar", "renewable", "carbon", "sustainab", "waste management", "water"] },
  { industry: "Mobility", words: ["mobility", "electric vehicle", " ev ", "ev startup", "logistics", "fleet", "ride-hailing", "automotive", "transport"] },
  { industry: "AI", words: ["artificial intelligence", "ai-powered", "ai startup", "generative ai", "machine learning", "llm", " ai "] },
  { industry: "SaaS", words: ["saas", "software-as-a-service", "b2b software", "enterprise software", "developer tool", "devtool", "api platform"] },
  { industry: "D2C", words: ["d2c", "direct-to-consumer", "skincare", "beauty brand", "apparel", "beverage", "packaged food", "personal care"] },
  { industry: "Ecommerce", words: ["e-commerce", "ecommerce", "quick commerce", "marketplace", "retail tech", "q-commerce"] },
  { industry: "Consumer", words: ["consumer", "social app", "dating", "gaming", "entertainment", "media", "travel", "food delivery", "hospitality"] },
];

export function extractIndustry(title: string, summary?: string | null): FundingIndustry | null {
  const haystack = ` ${`${title ?? ""} ${stripHtml(summary ?? "").slice(0, 700)}`.toLowerCase()} `;
  for (const { industry, words } of INDUSTRY_KEYWORDS) {
    if (words.some((word) => haystack.includes(word))) return industry;
  }
  // No "Other" fallback. "Other" is a bucket an admin can put something in
  // knowingly; guessing it here would claim we classified an article we did not.
  return null;
}

/**
 * Place names to the eight buckets `funding_rounds.city` groups by.
 *
 * The NCR list is the reason this is a map rather than a match on the city
 * column: Gurugram, Noida and Ghaziabad are all "Delhi NCR" to a reader
 * comparing cities, and three separate slices of one metro would make the
 * cities chart wrong in a way that looks right.
 */
const CITY_KEYWORDS: { city: FundingCity; words: string[] }[] = [
  { city: "Bengaluru", words: ["bengaluru", "bangalore"] },
  { city: "Delhi NCR", words: ["delhi", "gurugram", "gurgaon", "noida", "ghaziabad", "faridabad", "ncr"] },
  { city: "Mumbai", words: ["mumbai", "bombay", "navi mumbai", "thane"] },
  { city: "Hyderabad", words: ["hyderabad", "secunderabad"] },
  { city: "Chennai", words: ["chennai", "madras"] },
  { city: "Pune", words: ["pune", "pimpri"] },
  {
    city: "Other India",
    // Cities only. "india" was here and had to go: it matched inside company
    // names ("Polycab India", "Baring Private Equity Partners India") and
    // inside expansion plans ("rolling out across India"), neither of which
    // says where the company is. A bare country name is not a location signal.
    words: ["ahmedabad", "kolkata", "jaipur", "kochi", "cochin", "indore", "surat", "lucknow", "chandigarh", "coimbatore", "bhubaneswar", "nagpur", "vadodara", "goa", "kanpur", "guwahati"],
  },
];

/**
 * The constructions that *do* place a company in India without naming a city.
 * Checked only after every city has failed, so a real city always wins.
 */
const INDIA_WITHOUT_A_CITY =
  /\bIndia-based\b|\bIndian\s+(?:startup|company|firm|brand|platform|venture|business)\b/i;

/**
 * Where the company is, as both the phrase the article used and the bucket it
 * falls in.
 *
 * "X-based" is looked for first: it is the construction that actually states a
 * company's location, whereas a bare city name in a body paragraph is as likely
 * to be an investor's address or a market being expanded into.
 */
export function extractLocation(
  title: string,
  summary?: string | null,
): { location: string | null; city: FundingCity | null } {
  const text = `${decodeEntities(title ?? "")} ${stripHtml(summary ?? "").slice(0, 700)}`;

  /*
   * One capitalised word before the hyphen, not two.
   *
   * The two-word form was written for "Navi Mumbai-based" and instead captured
   * the *previous* sentence's last word: "led by Accel, Multiply\nMumbai-based"
   * became "Multiply Mumbai", and "Gray Matters Capital\nBengaluru-based"
   * became "Capital Bengaluru". Both rendered on a card as the company's
   * location. Multi-word cities are still reached by the keyword scan below,
   * which costs nothing; a fabricated place name costs the page's credibility.
   */
  const based = /\b([A-Z][a-zA-Z]+)-(?:based|headquartered)\b/.exec(text);
  if (based) {
    const bucket = bucketCity(based[1]);
    if (bucket) return { location: based[1], city: bucket };
  }

  const lower = ` ${text.toLowerCase()} `;
  for (const { city, words } of CITY_KEYWORDS) {
    const hit = words.find((word) => lower.includes(` ${word}`));
    if (hit) return { location: titleCase(hit), city };
  }

  // Last: "India-based" or "Indian startup" — a country, but a stated one.
  if (INDIA_WITHOUT_A_CITY.test(text)) return { location: "India", city: "Other India" };

  return { location: null, city: null };
}

function bucketCity(name: string): FundingCity | null {
  const lower = name.toLowerCase();
  for (const { city, words } of CITY_KEYWORDS) {
    if (words.some((word) => lower.includes(word))) return city;
  }
  return null;
}

function titleCase(value: string): string {
  return value.replace(/\b[a-z]/g, (character) => character.toUpperCase());
}

// ── Step 6: the whole record ─────────────────────────────────────────────

/**
 * Confidence, as an audit of what was actually found rather than a feeling.
 *
 * Each term is a fact the text stated unambiguously. The floor is low on
 * purpose: an article that yields only a company name scores about 0.4, which
 * is exactly how much such a record should be trusted, and the review queue
 * sorts on it. It is never shown as a number to a visitor — the card says "AI
 * extracted" and nothing more, because a percentage implies a calibration
 * nobody has measured.
 */
function scoreConfidence(
  extracted: Omit<ExtractedRound, "confidence">,
  headlineOnly: boolean,
): number {
  let score = 0.2;
  if (extracted.startupName) score += 0.25;
  if (extracted.amountNumeric !== null) score += 0.2;
  if (extracted.fundingStage !== "Undisclosed") score += 0.15;
  if (extracted.leadInvestor) score += 0.1;
  else if (extracted.investors.length > 0) score += 0.06;
  if (extracted.industry) score += 0.05;
  if (extracted.city) score += 0.05;

  // A headline with no body behind it is one sentence of evidence.
  if (headlineOnly) score -= 0.15;

  return Math.round(Math.max(0, Math.min(1, score)) * 1000) / 1000;
}

/** Run every step. Never throws; an unparseable article yields a low score. */
export function extractRound(input: ExtractionInput): ExtractedRound {
  const { title, summary, headlineOnly = false } = input;

  const amount = extractAmount(title, summary);
  const { investors, leadInvestor } = extractInvestors(title, summary);
  const { location, city } = extractLocation(title, summary);

  const core: Omit<ExtractedRound, "confidence"> = {
    startupName: extractStartupName(title, summary),
    amount: amount?.amount ?? null,
    amountNumeric: amount?.amountNumeric ?? null,
    currency: amount?.currency ?? null,
    fundingStage: extractStage(title, summary),
    investors,
    leadInvestor,
    industry: extractIndustry(title, summary),
    location,
    city,
  };

  return { ...core, confidence: scoreConfidence(core, headlineOnly) };
}

/**
 * Whether an extraction is worth storing as a round at all.
 *
 * A company name is non-negotiable: it is the only field the rest of the
 * product is addressed by (`/funding/[slug]`, the dedupe key, the startup
 * rollup). Beyond that, a round needs at least one substantive fact — an
 * amount, a stage, or an investor — or it is a headline restated as a database
 * row.
 */
export function isStorableRound(extracted: ExtractedRound): boolean {
  if (!extracted.startupName) return false;
  return (
    extracted.amountNumeric !== null ||
    extracted.fundingStage !== "Undisclosed" ||
    extracted.investors.length > 0
  );
}

// ── Step 7: the summary ──────────────────────────────────────────────────

/**
 * A 50-80 word summary assembled from the extracted fields — not from the
 * article's sentences.
 *
 * This is the guarantee that matters legally and editorially: the generator has
 * no access to the publisher's prose. It can only say what the structured
 * record says, so it is incapable of reproducing a paragraph even if the model
 * layer is off and this is the only summary a round ever gets.
 *
 * Every clause is conditional on the fact existing. A round with no amount does
 * not get a sentence about an undisclosed amount; it gets a shorter summary.
 */
export function buildSummary(
  extracted: ExtractedRound,
  context: { sourceName?: string | null; announcementDate?: string | null; headline?: string },
): string {
  const company = extracted.startupName ?? "The company";
  const sentences: string[] = [];

  const descriptor = [
    extracted.industry ? `${extracted.industry}` : null,
    extracted.location ? `company based in ${extracted.location}` : "company",
  ]
    .filter(Boolean)
    .join(" ");

  const displayAmount = extracted.amount?.trim();
  if (displayAmount && extracted.fundingStage !== "Undisclosed") {
    sentences.push(`${company}, ${article(descriptor)} ${descriptor}, has raised ${displayAmount} at ${extracted.fundingStage}.`);
  } else if (displayAmount) {
    sentences.push(`${company}, ${article(descriptor)} ${descriptor}, has raised ${displayAmount}.`);
  } else if (extracted.fundingStage !== "Undisclosed") {
    sentences.push(
      `${company}, ${article(descriptor)} ${descriptor}, has closed a ${extracted.fundingStage} round. The amount was not reported.`,
    );
  } else {
    sentences.push(`${company}, ${article(descriptor)} ${descriptor}, has raised a new round. Neither the amount nor the stage was reported.`);
  }

  if (extracted.leadInvestor) {
    const followers = extracted.investors.filter((name) => name !== extracted.leadInvestor);
    sentences.push(
      followers.length > 0
        ? `${extracted.leadInvestor} led the round, joined by ${listOf(followers.slice(0, 4))}.`
        : `${extracted.leadInvestor} led the round.`,
    );
  } else if (extracted.investors.length > 0) {
    sentences.push(`Investors named in the announcement include ${listOf(extracted.investors.slice(0, 4))}.`);
  } else {
    sentences.push("No investors were named in the announcement.");
  }

  if (context.sourceName) {
    sentences.push(`Reported by ${context.sourceName}.`);
  }

  return clampWords(sentences.join(" "), 80);
}

function article(next: string): string {
  return /^[aeiou]/i.test(next) ? "an" : "a";
}

function listOf(names: string[]): string {
  if (names.length === 0) return "";
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** Hard word ceiling, so no summary can grow into a reproduction. */
export function clampWords(text: string, max: number): string {
  const words = text.trim().split(/\s+/);
  if (words.length <= max) return text.trim();
  return `${words.slice(0, max).join(" ").replace(/[,;:.]+$/, "")}…`;
}

/** Type guard used when a model or an admin hands back a stage as a string. */
export function asFundingStage(value: unknown): FundingStage | null {
  return typeof value === "string" && (FUNDING_STAGES as readonly string[]).includes(value)
    ? (value as FundingStage)
    : null;
}
