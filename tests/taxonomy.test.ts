import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { deriveKnowledge, type KnowledgeInput } from "../lib/intelligence/knowledge.ts";
import { categoryForConcept, classify, reviewCategory } from "../lib/intelligence/taxonomy.ts";
import { CONCEPTS } from "../lib/intelligence/concepts.ts";

const PRODUCT_CATEGORIES = [
  "Developer Tools",
  "Productivity",
  "Finance",
  "Food & Drink",
  "Design Tools",
  "Marketing",
  "Health & Fitness",
  "Education",
  "Social",
  "Other",
];

function knowledgeOf(overrides: Partial<KnowledgeInput>) {
  return deriveKnowledge({
    id: "00000000-0000-4000-8000-000000000001",
    name: "Sample",
    tagline: "",
    description: "",
    category: "Other",
    pricing_type: "free",
    tags: [],
    ...overrides,
  });
}

describe("categoryForConcept", () => {
  it("only ever suggests a category the marketplace stores", () => {
    for (const concept of CONCEPTS) {
      const category = categoryForConcept(concept.key);
      if (category) assert.ok(PRODUCT_CATEGORIES.includes(category), `${concept.key} → ${category}`);
    }
  });

  it("never treats AI as a category", () => {
    assert.equal(categoryForConcept("ai"), null);
    assert.equal(categoryForConcept("chatbot"), null);
  });
});

describe("classify / reviewCategory", () => {
  it("suggests a home for an 'Other' listing that clearly describes one", () => {
    const knowledge = knowledgeOf({ name: "LedgerLy", tagline: "GST invoicing and accounting for small businesses" });
    assert.equal(classify(knowledge).suggested, "Finance");
    const review = reviewCategory("Other", knowledge);
    assert.equal(review?.flag, "uncategorised");
    assert.equal(review?.suggested, "Finance");
  });

  it("leaves a listing alone when its own category has evidence", () => {
    const knowledge = knowledgeOf({ tagline: "Invoicing and expense tracking", category: "Finance" });
    assert.equal(reviewCategory("Finance", knowledge), null);
  });

  it("flags a category nothing in the listing supports", () => {
    const knowledge = knowledgeOf({ tagline: "Edit videos and trim clips in your browser", category: "Finance" });
    const review = reviewCategory("Finance", knowledge);
    assert.equal(review?.flag, "possible-mismatch");
    assert.equal(review?.suggested, "Design Tools");
  });

  it("still flags a mismatch when the alternative is split, showing all the evidence", () => {
    const knowledge = knowledgeOf({ tagline: "Edit videos and add captions for YouTube", category: "Finance" });
    const review = reviewCategory("Finance", knowledge);
    assert.equal(review?.flag, "possible-mismatch");
    assert.ok(review && review.confidence < 0.6);
  });

  it("calls a listing with no mappable words thin, not wrong", () => {
    const knowledge = knowledgeOf({ tagline: "The best way to do it", category: "Productivity" });
    assert.equal(reviewCategory("Productivity", knowledge)?.flag, "too-little-detail");
    assert.equal(reviewCategory("Other", knowledge), null);
  });
});
