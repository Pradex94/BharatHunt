import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import {
  ADMIN_PRODUCT_STATUSES,
  adminProductsHref,
  asAdminProductStatus,
  sanitizeAdminSearch,
} from "../lib/admin-filters.ts";

describe("asAdminProductStatus", () => {
  it("accepts every status the table actually stores", () => {
    for (const status of ADMIN_PRODUCT_STATUSES) {
      assert.equal(asAdminProductStatus(status), status);
    }
  });

  it("treats an unknown status as no filter at all", () => {
    assert.equal(asAdminProductStatus("live"), null);
    assert.equal(asAdminProductStatus(""), null);
    assert.equal(asAdminProductStatus(undefined), null);
    assert.equal(asAdminProductStatus(null), null);
  });

  it("does not pass a crafted value through to the query", () => {
    assert.equal(asAdminProductStatus("published') or ('1'='1"), null);
    assert.equal(asAdminProductStatus("PUBLISHED"), null);
  });
});

describe("sanitizeAdminSearch", () => {
  it("keeps an ordinary search term intact", () => {
    assert.equal(sanitizeAdminSearch("  zen task  "), "zen task");
  });

  it("strips the characters PostgREST reads as filter grammar", () => {
    // Unescaped, this term would close the `ilike` and add a second condition
    // that matches every row in the table.
    const term = sanitizeAdminSearch("a,id.gt.0");
    assert.ok(!term.includes(","), term);
    assert.equal(term, "a id.gt.0");
  });

  it("strips ilike wildcards, so a search cannot match everything", () => {
    assert.equal(sanitizeAdminSearch("%"), "");
    assert.equal(sanitizeAdminSearch("a_b"), "a b");
  });

  it("strips quotes and parentheses", () => {
    assert.equal(sanitizeAdminSearch(`x")(or'`), "x or");
  });

  it("caps a pasted essay", () => {
    assert.equal(sanitizeAdminSearch("z".repeat(500)).length, 80);
  });

  it("handles nothing at all", () => {
    assert.equal(sanitizeAdminSearch(undefined), "");
    assert.equal(sanitizeAdminSearch(null), "");
  });
});

describe("adminProductsHref", () => {
  it("keeps the search term when a status chip is clicked", () => {
    assert.equal(adminProductsHref("pending", "zen"), "/admin?status=pending&q=zen");
  });

  it("keeps the status when the term is cleared", () => {
    assert.equal(adminProductsHref("draft", ""), "/admin?status=draft");
  });

  it("is the bare page when nothing is filtered", () => {
    assert.equal(adminProductsHref(null, ""), "/admin");
  });

  it("encodes a term that would otherwise break the URL", () => {
    assert.equal(adminProductsHref(null, "a b&c"), "/admin?q=a+b%26c");
  });
});
