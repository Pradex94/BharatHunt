import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { phraseKey, quoteSource, tokenize } from "../lib/intelligence/text.ts";
import { CONCEPTS, AUDIENCES, matchConcepts } from "../lib/intelligence/concepts.ts";
import { contentHash, deriveKnowledge, type KnowledgeInput } from "../lib/intelligence/knowledge.ts";
import { computeSimilarities, conceptOverlap, sharedConceptPhrase } from "../lib/intelligence/similarity.ts";
import { verifiedDifferences } from "../lib/intelligence/differences.ts";
import { splitRelated } from "../lib/intelligence/related.ts";
import { buildCompareRows } from "../lib/intelligence/compare.ts";
import { compareHref, parseCompareSlugs } from "../lib/compare-links.ts";

let seq = 0;
function product(overrides: Partial<KnowledgeInput>): KnowledgeInput {
  seq += 1;
  return {
    id: overrides.id ?? `00000000-0000-4000-8000-${String(seq).padStart(12, "0")}`,
    name: `Product ${seq}`,
    tagline: "",
    description: "",
    category: "Productivity",
    pricing_type: "free",
    tags: [],
    website_url: "https://example.com",
    github_url: null,
    launch_state: null,
    launch_state_source: null,
    source: "maker",
    platform_links: {},
    ...overrides,
  };
}

const withKnowledge = (input: KnowledgeInput) => ({ ...input, knowledge: deriveKnowledge(input) });

describe("tokenize / phraseKey", () => {
  it("lowercases, strips accents and punctuation, drops stopwords and plurals", () => {
    assert.deepEqual(tokenize("Edit Vidéos for YouTube creators!"), ["edit", "video", "youtube", "creator"]);
  });

  it("keeps the words concept phrases depend on", () => {
    // "app" as a stopword once turned "app builder" into "builder", which then
    // matched every "resume builder" in the catalogue.
    assert.equal(phraseKey("App builder"), " app builder ");
    assert.equal(phraseKey("no code"), " no code ");
  });

  it("quotes the listing's own words, not the normalised phrase", () => {
    assert.equal(quoteSource("Edit fast. Runs entirely in your browser!", "run entirely browser"), "Runs entirely in your browser");
    assert.equal(quoteSource("Browse all categories", "category"), "categories");
    assert.equal(quoteSource("Nothing relevant", "video editor"), "video editor");
  });

  it("matches phrases on word boundaries only", () => {
    assert.ok(phraseKey("Send an email campaign").includes(phraseKey("email campaign")));
    assert.ok(!phraseKey("Send an email").includes(phraseKey("ai")));
  });
});

describe("concept lexicon", () => {
  it("has unique keys, and every related concept exists", () => {
    const keys = CONCEPTS.map((concept) => concept.key);
    assert.equal(new Set(keys).size, keys.length);
    for (const concept of CONCEPTS) {
      for (const related of concept.related ?? []) {
        assert.ok(keys.includes(related), `${concept.key} → unknown related concept ${related}`);
      }
      assert.ok(concept.phrases.every((phrase) => phraseKey(phrase) !== ""), `${concept.key} has an empty phrase`);
    }
    assert.equal(new Set(AUDIENCES.map((audience) => audience.key)).size, AUDIENCES.length);
  });

  it("understands a request without its exact words", () => {
    const hits = matchConcepts("I need a tool to write LinkedIn posts");
    assert.ok(hits.has("linkedin"));
    assert.ok(hits.has("content-writing"));
  });

  it("does not read negations of common phrases as features", () => {
    assert.ok(!matchConcepts("No ads. No daily limits.").has("ads"));
    assert.ok(!matchConcepts("We avoid private universities").has("privacy"));
    assert.ok(!matchConcepts("Learn more.").has("learning"));
  });
});

describe("deriveKnowledge", () => {
  it("does not call a product AI-first on the strength of a tag alone", () => {
    const tagged = deriveKnowledge(product({ tagline: "Online payments for India", tags: ["ai", "education"] }));
    assert.equal(tagged.aiFirst, false);
    const described = deriveKnowledge(product({ tagline: "AI-powered lead generation" }));
    assert.equal(described.aiFirst, true);
  });

  it("only claims open source with both the words and a repository", () => {
    const words = deriveKnowledge(product({ description: "Explore open-source repositories" }));
    assert.equal(words.openSource, false);
    const real = deriveKnowledge(
      product({ description: "100% free and open-source", github_url: "https://github.com/x/y" }),
    );
    assert.equal(real.openSource, true);
  });

  it("keeps the evidence for every concept", () => {
    const knowledge = deriveKnowledge(product({ name: "ClipCut", tagline: "AI video editor for creators" }));
    const video = knowledge.concepts.find((concept) => concept.key === "video-editing");
    assert.deepEqual(video && { field: video.field, phrase: video.phrase }, { field: "tagline", phrase: "video editor" });
    assert.deepEqual(knowledge.audiences.map((audience) => audience.key), ["creator"]);
  });

  it("records how a launch location is known", () => {
    const verified = deriveKnowledge(product({ launch_state: "IN-KA", launch_state_source: "verified", source: "daily_agent" }));
    assert.deepEqual(verified.indiaConnection, { state: "IN-KA", basis: "verified" });
    assert.equal(verified.listingSource, "daily_agent");
  });

  it("changes its content hash only when a derivation input changes", () => {
    const base = product({ tagline: "Invoices for freelancers" });
    assert.equal(contentHash(base), contentHash({ ...base }));
    assert.notEqual(contentHash(base), contentHash({ ...base, tagline: "Invoices for agencies" }));
    assert.equal(contentHash({ ...base, tags: ["a", "b"] }), contentHash({ ...base, tags: ["b", "a"] }));
  });
});

describe("similarity", () => {
  const editor = withKnowledge(product({ name: "CutPro", category: "Marketing", tagline: "AI video editor with captions", description: "Edit videos by typing, add subtitles and export clips for YouTube." }));
  const generator = withKnowledge(product({ name: "MotionGen", category: "Design Tools", tagline: "Turn a photo into an AI video", description: "Image to video generator with character animation for creators." }));
  const pdf = withKnowledge(product({ name: "PdfBox", category: "Marketing", tagline: "Merge and compress PDF files", description: "Free online PDF tools: merge, split and compress documents." }));
  const thin = withKnowledge(product({ name: "Zz", category: "Marketing", tagline: "wedfhjk", description: "" }));
  const duplicate = withKnowledge(product({ name: "cutpro", category: "Marketing", tagline: "AI video editor with captions", description: "Edit videos by typing." }));

  const results = computeSimilarities([editor, generator, pdf, thin, duplicate]);

  it("finds related products across categories", () => {
    assert.equal(results.get(editor.id)?.[0]?.similarId, generator.id);
  });

  it("is not swayed by a shared category alone", () => {
    assert.ok(!results.get(editor.id)?.some((entry) => entry.similarId === pdf.id));
  });

  it("skips listings with no signal, and never pairs a product with its own duplicate", () => {
    assert.deepEqual(results.get(thin.id), []);
    assert.ok(!results.get(editor.id)?.some((entry) => entry.similarId === duplicate.id));
  });

  it("ignores popularity entirely", () => {
    const popular = { ...generator, id: "popular" };
    const again = computeSimilarities([editor, popular, pdf]);
    const original = computeSimilarities([editor, generator, pdf]);
    assert.equal(again.get(editor.id)?.[0]?.score, original.get(editor.id)?.[0]?.score);
  });

  it("names shared concepts, and drops a bare AI next to anything specific", () => {
    const { shared } = conceptOverlap(editor.knowledge, generator.knowledge);
    assert.ok(shared.includes("video-generation"));
    assert.ok(!shared.includes("ai"));
    assert.equal(sharedConceptPhrase(["video-editing", "social-media"]), "video editing, social media");
  });
});

describe("verifiedDifferences — only what both listings support", () => {
  const paid = withKnowledge(product({ name: "PaidCo", tagline: "CRM for agencies", pricing_type: "paid" }));

  it("names a free plan and a maker-confirmed location", () => {
    const other = withKnowledge(product({ name: "FreeCo", tagline: "CRM for freelancers", pricing_type: "freemium", launch_state: "IN-KL", launch_state_source: "maker" }));
    const labels = verifiedDifferences(paid, other, 5).map((difference) => difference.label);
    assert.deepEqual(labels.slice(0, 2), ["Free plan", "Built in Kerala"]);
  });

  it("never claims a paid alternative is cheaper, and says nothing when nothing differs", () => {
    const free = withKnowledge(product({ tagline: "CRM", pricing_type: "free" }));
    const twin = withKnowledge(product({ tagline: "CRM", pricing_type: "paid" }));
    assert.deepEqual(verifiedDifferences(free, twin), []);
  });

  it("attaches the basis for every claim", () => {
    const other = withKnowledge(product({ tagline: "Runs entirely in your browser", pricing_type: "paid" }));
    const [difference] = verifiedDifferences(paid, other);
    assert.equal(difference.key, "privacy");
    assert.equal(difference.basis, "Its listing says “Runs entirely in your browser”");
  });
});

describe("splitRelated", () => {
  it("puts same-job products under alternatives and the rest under similar", () => {
    const base = withKnowledge(product({ tagline: "AI resume builder" }));
    const alternative = withKnowledge(product({ tagline: "ATS resume checker" }));
    const loose = withKnowledge(product({ tagline: "AI notes" }));
    const { alternatives, similar } = splitRelated(base, [
      { product: alternative, sharedConcepts: ["resume", "ai"] },
      { product: loose, sharedConcepts: ["ai"] },
    ]);
    assert.deepEqual(alternatives.map((entry) => entry.product.id), [alternative.id]);
    assert.equal(alternatives[0].reason, "Both listings cover resumes and CVs");
    assert.deepEqual(similar.map((entry) => entry.product.id), [loose.id]);
  });
});

describe("buildCompareRows", () => {
  it("labels provenance and never invents a value", () => {
    const maker = withKnowledge(product({ name: "A", tagline: "Invoicing for small businesses", pricing_type: "paid" }));
    const curated = withKnowledge(product({ name: "B", tagline: "UPI payments", source: "daily_agent", launch_state: "IN-MH", launch_state_source: "verified" }));
    const rows = buildCompareRows([maker, curated]);
    const byKey = Object.fromEntries(rows.map((row) => [row.key, row.cells]));

    assert.deepEqual(byKey["free-plan"][0], { text: "None listed", provenance: null, empty: true });
    assert.equal(byKey.pricing[1].provenance, "verified");
    assert.equal(byKey.india[0].empty, true);
    assert.match(byKey.india[1].text, /Maharashtra \(verified/);
    assert.ok(!rows.some((row) => /best|winner/i.test(row.label)));
  });
});

describe("compare links", () => {
  it("cleans, de-duplicates and caps slugs at four", () => {
    assert.deepEqual(parseCompareSlugs("A,b,,b,c d,e,f,g"), ["a", "b", "e", "f"]);
    assert.equal(compareHref(["x", "y"]), "/compare?products=x,y");
    assert.equal(compareHref([]), "/compare");
  });
});
