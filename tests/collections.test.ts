/**
 * The programmatic page generator.
 *
 * These pages are generated, which means a mistake here is not one bad page but
 * every page of a kind at once. The properties worth holding are the ones that
 * would be invisible in review and expensive in the index: two collections
 * sharing a slug, two sharing a <title>, or a claim about ranking that the data
 * cannot support.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  COLLECTIONS,
  collectionBySlug,
  collectionsForProduct,
  MIN_PRODUCTS_TO_INDEX,
  RANKING_NOTE,
} from "../lib/collections.ts";

describe("every generated page is distinct", () => {
  it("has no duplicate slugs", () => {
    const slugs = COLLECTIONS.map((collection) => collection.slug);
    assert.equal(new Set(slugs).size, slugs.length);
  });

  it("has no duplicate meta titles", () => {
    // Two pages with one title compete for the same query and split it.
    const titles = COLLECTIONS.map((collection) => collection.metaTitle);
    assert.equal(new Set(titles).size, titles.length);
  });

  it("has no duplicate meta descriptions", () => {
    const descriptions = COLLECTIONS.map((collection) => collection.metaDescription);
    assert.equal(new Set(descriptions).size, descriptions.length);
  });

  it("has no duplicate intros", () => {
    const intros = COLLECTIONS.map((collection) => collection.intro);
    assert.equal(new Set(intros).size, intros.length);
  });
});

describe("metadata stays within what a result page shows", () => {
  for (const collection of COLLECTIONS) {
    it(`${collection.slug} has a usable title and description`, () => {
      assert.ok(collection.metaTitle.length <= 60, `title too long: ${collection.metaTitle}`);
      assert.ok(collection.metaDescription.length >= 70, "description too thin");
      assert.ok(
        collection.metaDescription.length <= 175,
        `description too long: ${collection.metaDescription.length}`,
      );
      assert.ok(/^[A-Z]/.test(collection.metaDescription), "description starts lowercase");
    });
  }
});

describe("no page claims a ranking the data cannot support", () => {
  it("never says 'best'", () => {
    // There is no rating or review data on Bharat Hunt, so "best" would be an
    // unsupported claim — see RANKING_NOTE.
    for (const collection of COLLECTIONS) {
      const text = `${collection.title} ${collection.metaTitle} ${collection.metaDescription} ${collection.intro}`;
      assert.ok(!/\bbest\b/i.test(text), `"best" in ${collection.slug}`);
    }
  });

  it("defines its ordering in one place", () => {
    assert.match(RANKING_NOTE, /upvotes/i);
  });
});

describe("structure", () => {
  it("excludes the catch-all category", () => {
    assert.ok(
      COLLECTIONS.every((collection) => collection.filter.category !== "Other"),
      "'Free Other Products' answers no query",
    );
  });

  it("resolves every related slug to a real collection", () => {
    for (const collection of COLLECTIONS) {
      for (const slug of collection.related) {
        assert.ok(collectionBySlug(slug), `${collection.slug} links to missing ${slug}`);
      }
    }
  });

  it("never lists itself as related", () => {
    for (const collection of COLLECTIONS) {
      assert.ok(!collection.related.includes(collection.slug));
    }
  });

  it("keeps the index threshold above the existence threshold", () => {
    assert.ok(MIN_PRODUCTS_TO_INDEX > 1);
  });
});

describe("collectionsForProduct — the links on a product page", () => {
  it("matches on category and pricing together", () => {
    const found = collectionsForProduct({
      category: "Developer Tools",
      pricing_type: "free",
      tags: [],
    });
    assert.ok(found.some((collection) => collection.slug === "free-developer-tools"));
    assert.ok(!found.some((collection) => collection.slug === "paid-developer-tools"));
  });

  it("matches a topic collection on the tag, whatever the category", () => {
    const found = collectionsForProduct({
      category: "Finance",
      pricing_type: "paid",
      tags: ["AI"],
    });
    assert.ok(
      found.some((collection) => collection.slug === "ai-tools"),
      "tag matching must be case-insensitive",
    );
  });

  it("returns nothing for a product in the excluded category with no tags", () => {
    assert.deepEqual(
      collectionsForProduct({ category: "Other", pricing_type: "free", tags: [] }),
      [],
    );
  });
});
