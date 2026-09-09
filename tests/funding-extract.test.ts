import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildSummary,
  extractAmount,
  extractIndustry,
  extractInvestors,
  extractLocation,
  extractRound,
  extractStage,
  extractStartupName,
  isFundingCandidate,
  isStorableRound,
  stripDescriptors,
} from "../lib/funding/extract.ts";

/**
 * Every headline below is real, taken from the feeds this feature actually
 * seeds (`supabase/migrations/20260909020000_funding_sources_seed.sql`) on the
 * day the extractor was written. That is the point of them: an extractor tested
 * against sentences its author invented is tested against its own assumptions,
 * and the sentences that break this kind of code are always the ones a person
 * would not think to write — a valuation quoted in the same paragraph as the
 * round, a bulk deal that reads like a raise, a stage that does not exist in
 * our vocabulary.
 *
 * The assertions that check for `null` matter as much as the ones that check a
 * value. This extractor's job is to be *silent* when the text does not say
 * something, and a test suite that only asserts successes cannot tell the
 * difference between "extracted correctly" and "guessed convincingly".
 */

describe("isFundingCandidate — what reaches the expensive path", () => {
  it("accepts a plain round announcement", () => {
    assert.equal(
      isFundingCandidate("Circolife raises $4.5 Mn in pre-Series A round led by Bharat Jaisinghani"),
      true,
    );
  });

  it("accepts the investor-first phrasing", () => {
    assert.equal(isFundingCandidate("Navam Capital leads Rs 22 Cr round in DigitalPaani"), true);
  });

  it("refuses a secondary-market bulk deal", () => {
    // Money, an investor and a crore figure — and no round.
    assert.equal(
      isFundingCandidate("TPG-backed NewQuest offloads Rs 200 Cr Shadowfax stake in a bulk deal"),
      false,
    );
  });

  it("refuses an IPO story", () => {
    assert.equal(
      isFundingCandidate("Kuku to build 1,000-member AI team ahead of Rs 3,500 Cr IPO"),
      false,
    );
  });

  it("refuses a minority-stake purchase whose body describes an older round", () => {
    // The trap: the article body genuinely contains "Series A funding round led
    // by", because it is recapping the company's previous raise.
    assert.equal(
      isFundingCandidate(
        "Bajaj Finance acquires 5% stake in TrueFan AI",
        "The Gurugram-based startup had previously secured $10 million in a Series A funding round led by Baring Private Equity Partners India and Z3 Partners in June this year.",
      ),
      false,
    );
  });

  it("still accepts a round whose body mentions revenue", () => {
    // Entrackr routinely recaps last quarter inside a genuine round story, so
    // the negative keywords must not veto an unambiguous headline.
    assert.equal(
      isFundingCandidate(
        "DigitalPaani raises Rs 22 crore led by Navam Capital",
        "Its revenue has grown nearly sixfold over the past two years.",
      ),
      true,
    );
  });

  it("refuses empty input rather than throwing", () => {
    assert.equal(isFundingCandidate("", null), false);
  });
});

describe("extractAmount — the figure, and only the right figure", () => {
  it("reads rupees in crore", () => {
    assert.deepEqual(extractAmount("Navam Capital leads Rs 22 Cr round in DigitalPaani"), {
      amount: "Rs 22 Cr",
      amountNumeric: 220_000_000,
      currency: "INR",
    });
  });

  it("reads a decimal crore figure", () => {
    const result = extractAmount("OORJAA Raises Rs 9.7 Crore in Series A First Close");
    assert.equal(result?.amountNumeric, 97_000_000);
    assert.equal(result?.currency, "INR");
  });

  it("reads dollars abbreviated as Mn", () => {
    const result = extractAmount("Circolife raises $4.5 Mn in pre-Series A round");
    assert.equal(result?.amountNumeric, 4_500_000);
    assert.equal(result?.currency, "USD");
  });

  it("reads dollars written out", () => {
    const result = extractAmount(
      "Delhi-based fintech startup ABC has raised $4 million in a seed round led by XYZ Ventures.",
    );
    assert.equal(result?.amountNumeric, 4_000_000);
    assert.equal(result?.currency, "USD");
  });

  it("reads a comma-grouped figure", () => {
    const result = extractAmount("Company raises Rs 3,500 crore");
    assert.equal(result?.amountNumeric, 35_000_000_000);
  });

  it("does not mistake a valuation for a round", () => {
    // The disqualifier guard. Both figures parse; only one is the raise.
    const result = extractAmount(
      "Shadowfax update",
      "At the end of Tuesday's session the share price closed at Rs 249.8, valuing the company at Rs 14,656 crore.",
    );
    assert.equal(result, null);
  });

  it("does not mistake revenue for a round", () => {
    const result = extractAmount(
      "Kuku scales up",
      "According to sources, revenue grew nearly sevenfold to more than Rs 1,400 crore in FY26.",
    );
    assert.equal(result, null);
  });

  it("prefers the headline over the body", () => {
    // The body carries a bigger, older figure. The headline is the round.
    const result = extractAmount(
      "Circolife raises $4.5 Mn in pre-Series A round",
      "The company had earlier raised Rs 200 crore across previous rounds.",
    );
    assert.equal(result?.amountNumeric, 4_500_000);
    assert.equal(result?.currency, "USD");
  });

  it("returns null when no amount is reported", () => {
    assert.equal(extractAmount("Acme raises an undisclosed seed round"), null);
  });

  it("rejects an implausibly small figure as a parse failure", () => {
    assert.equal(extractAmount("Shares fell to Rs 249.8 apiece"), null);
  });
});

describe("extractStage", () => {
  it("reads Series A", () => {
    assert.equal(extractStage("OORJAA Raises Rs 9.7 Crore in Series A First Close"), "Series A");
  });

  it("reads pre-seed without collapsing it into seed", () => {
    assert.equal(extractStage("Acme raises $1M in a pre-seed round"), "Pre-seed");
  });

  it("refuses to call pre-Series A either Seed or Series A", () => {
    // "Pre-Series A" is a real stage and is not in this product's vocabulary.
    // Undisclosed is the only answer here that is not a fabrication — and the
    // phrase itself survives, visible, in the headline the card renders.
    assert.equal(
      extractStage("Circolife raises $4.5 Mn in pre-Series A round led by Bharat Jaisinghani"),
      "Undisclosed",
    );
  });

  it("reads venture debt ahead of plain debt", () => {
    assert.equal(extractStage("Acme raises Rs 40 Cr in venture debt"), "Venture Debt");
  });

  it("falls back to Undisclosed rather than guessing", () => {
    assert.equal(extractStage("Acme raises Rs 22 crore in fresh funding"), "Undisclosed");
  });
});

describe("stripDescriptors — finding the name inside the description", () => {
  it("removes a city qualifier and a sector noun", () => {
    assert.equal(stripDescriptors("Delhi-based fintech startup ABC"), "ABC");
  });

  it("removes a stacked qualifier chain", () => {
    assert.equal(
      stripDescriptors("Gurugram-based AI-powered water infrastructure platform DigitalPaani"),
      "DigitalPaani",
    );
  });

  it("removes a parenthetical gloss", () => {
    assert.equal(
      stripDescriptors("Cooling-as-a-Service (CaaS) platform Circolife"),
      "Circolife",
    );
  });

  it("leaves a bare name alone", () => {
    assert.equal(stripDescriptors("Circolife"), "Circolife");
  });
});

describe("extractStartupName — who raised", () => {
  it("reads the subject-first shape", () => {
    assert.equal(
      extractStartupName("Circolife raises $4.5 Mn in pre-Series A round led by Bharat Jaisinghani"),
      "Circolife",
    );
  });

  it("reads the investor-first shape", () => {
    assert.equal(
      extractStartupName("Navam Capital leads Rs 22 Cr round in DigitalPaani"),
      "DigitalPaani",
    );
  });

  it("reads through an auxiliary verb and a stack of descriptors", () => {
    assert.equal(
      extractStartupName(
        "Delhi-based fintech startup ABC has raised $4 million in a seed round led by XYZ Ventures.",
      ),
      "ABC",
    );
  });

  it("handles a capitalised headline", () => {
    assert.equal(
      extractStartupName("OORJAA Raises Rs 9.7 Crore in Series A First Close Led by Equentis Angel Fund"),
      "OORJAA",
    );
  });

  it("returns null rather than naming the wrong company", () => {
    // No subject, no "round in", no possessive. A guess here would put a real
    // company's name on a round it did not raise.
    assert.equal(extractStartupName("Funding activity slowed in September"), null);
  });
});

describe("extractInvestors — named, or empty", () => {
  it("reads a single lead", () => {
    const result = extractInvestors(
      "Circolife raises $4.5 Mn in pre-Series A round led by Bharat Jaisinghani",
    );
    assert.equal(result.leadInvestor, "Bharat Jaisinghani");
    assert.deepEqual(result.investors, ["Bharat Jaisinghani"]);
  });

  it("reads the lead from an investor-first headline", () => {
    const result = extractInvestors("Navam Capital leads Rs 22 Cr round in DigitalPaani");
    assert.equal(result.leadInvestor, "Navam Capital");
  });

  it("reads a lead plus a participation list", () => {
    const result = extractInvestors(
      "DigitalPaani raises Rs 22 crore",
      "has raised Rs 22 crore in a funding round led by Navam Capital, with participation from Enzia Ventures, Chakra Growth Capital and 3one4 Capital.",
    );
    assert.equal(result.leadInvestor, "Navam Capital");
    assert.ok(result.investors.includes("Enzia Ventures"));
    assert.ok(result.investors.includes("3one4 Capital"));
  });

  it("reads two co-leads", () => {
    const result = extractInvestors(
      "TrueFan AI raises $10 million",
      "secured $10 million in a Series A funding round led by Baring Private Equity Partners India and Z3 Partners in June this year.",
    );
    assert.ok(result.investors.includes("Z3 Partners"));
    assert.equal(result.leadInvestor, "Baring Private Equity Partners India");
  });

  it("returns an empty array when nobody is named", () => {
    // Section 9 of the brief, verbatim: investors = [] when unknown.
    const result = extractInvestors("Acme raises Rs 5 crore in seed funding");
    assert.deepEqual(result.investors, []);
    assert.equal(result.leadInvestor, null);
  });

  it("does not turn a sentence fragment into a fund", () => {
    const result = extractInvestors(
      "Acme raises Rs 5 crore",
      "The round was led by existing investors and the company declined to comment.",
    );
    assert.equal(result.investors.includes("existing investors"), false);
  });
});

describe("extractIndustry and extractLocation", () => {
  it("classifies a fintech round", () => {
    assert.equal(extractIndustry("Delhi-based fintech startup ABC has raised $4 million"), "Fintech");
  });

  it("classifies a climate round from the body", () => {
    assert.equal(
      extractIndustry("DigitalPaani raises Rs 22 crore", "an operating system for water and wastewater infrastructure"),
      "Climate",
    );
  });

  it("returns null rather than guessing a sector", () => {
    assert.equal(extractIndustry("Acme raises Rs 5 crore in seed funding"), null);
  });

  it("buckets an NCR city into Delhi NCR", () => {
    // Gurugram, Noida and Delhi are one market to a reader comparing cities;
    // three separate slices would make the cities chart quietly wrong.
    assert.deepEqual(extractLocation("Gurugram-based startup Acme raises Rs 5 crore"), {
      location: "Gurugram",
      city: "Delhi NCR",
    });
  });

  it("reads Bengaluru through its other spelling", () => {
    assert.equal(extractLocation("Bangalore-based Acme raises Rs 5 crore").city, "Bengaluru");
  });

  it("returns nulls when no place is named", () => {
    assert.deepEqual(extractLocation("Acme raises Rs 5 crore"), { location: null, city: null });
  });
});

describe("extractRound — the whole record, and its confidence", () => {
  const brief = extractRound({
    title: "Delhi-based fintech startup ABC has raised $4 million in a seed round led by XYZ Ventures.",
    sourceName: "Example News",
  });

  it("reproduces the worked example from the brief", () => {
    assert.equal(brief.startupName, "ABC");
    assert.equal(brief.amountNumeric, 4_000_000);
    assert.equal(brief.currency, "USD");
    assert.equal(brief.fundingStage, "Seed");
    assert.equal(brief.leadInvestor, "XYZ Ventures");
    assert.deepEqual(brief.investors, ["XYZ Ventures"]);
    assert.equal(brief.industry, "Fintech");
    assert.equal(brief.city, "Delhi NCR");
  });

  it("scores a complete extraction highly", () => {
    assert.ok(brief.confidence >= 0.9, `expected a high score, got ${brief.confidence}`);
  });

  it("scores a headline-only extraction lower than the same text with a body", () => {
    const withBody = extractRound({ title: "Acme raises Rs 5 crore in a seed round" });
    const headlineOnly = extractRound({
      title: "Acme raises Rs 5 crore in a seed round",
      headlineOnly: true,
    });
    assert.ok(headlineOnly.confidence < withBody.confidence);
  });

  it("leaves every unreported field null", () => {
    const sparse = extractRound({ title: "Acme raises fresh funding" });
    assert.equal(sparse.amountNumeric, null);
    assert.equal(sparse.currency, null);
    assert.equal(sparse.leadInvestor, null);
    assert.equal(sparse.industry, null);
    assert.equal(sparse.city, null);
    assert.equal(sparse.fundingStage, "Undisclosed");
    assert.deepEqual(sparse.investors, []);
  });

  it("never throws on junk", () => {
    const junk = extractRound({ title: "!!! ???", summary: "<p></p>" });
    assert.equal(junk.startupName, null);
    assert.ok(junk.confidence >= 0);
  });
});

describe("isStorableRound — what is worth a database row", () => {
  it("refuses a round with no company", () => {
    assert.equal(
      isStorableRound(extractRound({ title: "Funding activity slowed in September" })),
      false,
    );
  });

  it("refuses a company name with no substantive fact", () => {
    assert.equal(isStorableRound(extractRound({ title: "Acme raises fresh capital" })), false);
  });

  it("accepts a company plus an amount", () => {
    assert.equal(isStorableRound(extractRound({ title: "Acme raises Rs 5 crore" })), true);
  });
});

/**
 * Every case below is a bug the extractor actually produced on the first live
 * run over the seeded Entrackr feed. They are grouped because they share a
 * cause worth remembering: each pattern was written against sentences someone
 * imagined, and broke on the sentence a real newsroom wrote.
 */
describe("regressions from the first live run", () => {
  it('keeps "All In Capital" whole', () => {
    // The trailing-clause trimmer was case-insensitive and cut at " In ",
    // storing a real fund as "All".
    const result = extractInvestors(
      "Fabric care startup Iztri raises Seed round led by All In Capital, Suashish Group",
    );
    assert.equal(result.leadInvestor, "All In Capital");
    assert.ok(result.investors.includes("Suashish Group"));
  });

  it("still trims a genuine lowercase trailing clause", () => {
    // The fix must not disable the trimmer it narrowed.
    const result = extractInvestors(
      "Acme raises $10M",
      "in a Series A round led by Baring Private Equity Partners India and Z3 Partners in June this year.",
    );
    assert.ok(result.investors.includes("Z3 Partners"));
  });

  it("drops a bare job title captured beside a person", () => {
    const result = extractInvestors(
      "Gaming tech startup ARC raises Rs 10.5 Cr in pre-seed round",
      "led by Chimera VC, with participation from MIXI Global Investments, Dhruv Vohra, Director.",
    );
    assert.equal(result.investors.includes("Director"), false);
    assert.ok(result.investors.includes("Chimera VC"));
  });

  it("strips editorial framing from an investor name", () => {
    const result = extractInvestors(
      "DaMENSCH raises fresh funding",
      "with participation from existing backer A91 Partners, new investor Tancom Electronics and Eight Roads Ventures also participating.",
    );
    assert.ok(result.investors.includes("A91 Partners"), result.investors.join(" | "));
    assert.ok(result.investors.includes("Tancom Electronics"), result.investors.join(" | "));
    assert.ok(result.investors.includes("Eight Roads Ventures"), result.investors.join(" | "));
  });

  it("does not read a company name's country as the company's location", () => {
    // "Polycab India" put every such round in "Other India".
    assert.deepEqual(
      extractLocation(
        "Circolife raises $4.5 Mn in pre-Series A round",
        "led by Bharat Jaisinghani, joint managing director of Polycab India.",
      ),
      { location: null, city: null },
    );
  });

  it('still places a company that says "India-based"', () => {
    assert.deepEqual(extractLocation("India-based Acme raises $2M"), {
      location: "India",
      city: "Other India",
    });
  });

  it("does not glue the previous word onto an X-based location", () => {
    // "led by Accel, Multiply Mumbai-based…" produced the location
    // "Multiply Mumbai"; "Gray Matters Capital Bengaluru-based…" produced
    // "Capital Bengaluru".
    assert.deepEqual(
      extractLocation("Fundly.ai raises $4 Mn led by Accel, Multiply", "Mumbai-based Fundly.ai said."),
      { location: "Mumbai", city: "Mumbai" },
    );
    assert.deepEqual(
      extractLocation("HerSpace secures $40 Mn from Gray Matters Capital", "Bengaluru-based HerSpace said."),
      { location: "Bengaluru", city: "Bengaluru" },
    );
  });

  it("drops an editorial label before the company name", () => {
    assert.equal(
      extractStartupName("Exclusive: DaMENSCH raises fresh funding at flat valuation of Rs 600 Cr"),
      "DaMENSCH",
    );
  });

  it("drops a trailing adverb swept up with the company name", () => {
    assert.equal(stripDescriptors("BlissClub recently"), "BlissClub");
  });

  it("keeps a legitimately lowercase-led company name", () => {
    // The trailing-lowercase trim must not eat names like upGrad or byteXL.
    assert.equal(stripDescriptors("upGrad"), "upGrad");
    assert.equal(stripDescriptors("byteXL"), "byteXL");
  });

  it("refuses a weekly roundup, which extracts cleanly and is entirely wrong", () => {
    // The worst false positive available: a company ("Indian"), an amount and a
    // date, all parsed correctly from an article about forty different rounds.
    assert.equal(
      isFundingCandidate("From Skyroot To Pronto — Indian Startups Raised $132 Mn This Week"),
      false,
    );
    assert.equal(
      isFundingCandidate("Funding and acquisitions in Indian startups this week [May 04 - May 09]"),
      false,
    );
  });

  it("refuses a demonym as a company name", () => {
    // The backstop for a roundup headline that dodges the keywords above.
    assert.equal(extractStartupName("Indian startups raised $79 million"), null);
  });

  it("refuses a description that never names the company", () => {
    // "Indian space-tech startup raises $100 million" was stored as a company
    // called "Indian space-tech", with a slug and a profile page.
    assert.equal(
      extractStartupName("Indian space-tech startup raises $100 million, to 4x satellite production"),
      null,
    );
    assert.equal(
      extractStartupName("Google-backed Indian space startup raises $100 million"),
      null,
    );
  });

  it("still reads the company when the same headline names it", () => {
    // The rule above must not cost us the well-formed version of that sentence.
    assert.equal(
      extractStartupName("Indian space startup Pixxel raises $100 million, plans expansion"),
      "Pixxel",
    );
  });

  it("refuses a VC announcing its own fund", () => {
    // A firm raising a fund is a company raising money, and is not a startup
    // funding round — but it uses every word one does.
    assert.equal(isFundingCandidate("Accel raises $550 million for its eighth India fund"), false);
    assert.equal(isFundingCandidate("Blume Ventures closes $250 Mn fourth fund"), false);
  });

  it("still accepts a round that merely mentions the word funding", () => {
    assert.equal(isFundingCandidate("Acme raises Rs 22 crore in fresh funding"), true);
  });
});

describe("buildSummary — original prose, assembled from fields", () => {
  const round = extractRound({
    title: "Delhi-based fintech startup ABC has raised $4 million in a seed round led by XYZ Ventures.",
  });

  it("stays inside the 80-word ceiling", () => {
    const summary = buildSummary(round, { sourceName: "Example News" });
    assert.ok(summary.split(/\s+/).length <= 80);
  });

  it("states the facts it was given", () => {
    const summary = buildSummary(round, { sourceName: "Example News" });
    assert.match(summary, /ABC/);
    assert.match(summary, /\$4 million/);
    assert.match(summary, /Seed/);
    assert.match(summary, /XYZ Ventures/);
    assert.match(summary, /Example News/);
  });

  it("says an amount was not reported rather than implying zero", () => {
    const noAmount = extractRound({ title: "Acme raises an undisclosed seed round" });
    const summary = buildSummary(noAmount, { sourceName: "Example News" });
    assert.match(summary, /not reported/i);
    assert.doesNotMatch(summary, /₹0|\$0/);
  });

  it("says nobody was named rather than naming somebody", () => {
    const noInvestors = extractRound({ title: "Acme raises Rs 5 crore in a seed round" });
    const summary = buildSummary(noInvestors, { sourceName: "Example News" });
    assert.match(summary, /No investors were named/i);
  });

  it("cannot reproduce the source's prose, because it never sees it", () => {
    // The structural guarantee: the generator's only inputs are the extracted
    // fields, so a distinctive sentence in the article cannot appear in the
    // summary even by accident.
    const distinctive =
      "Its platform combines AI-driven insights with real-time asset monitoring to help utilities improve water recycling.";
    const extracted = extractRound({ title: "DigitalPaani raises Rs 22 crore", summary: distinctive });
    const summary = buildSummary(extracted, { sourceName: "Entrackr" });
    assert.doesNotMatch(summary, /real-time asset monitoring/);
  });
});
