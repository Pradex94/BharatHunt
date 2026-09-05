/**
 * Where a product row's title links, per status.
 *
 * The bug this guards against: /products/[slug] serves published rows only
 * (`getPublishedProductBySlug` filters `status = 'published'`, and the RLS
 * SELECT policy hides another maker's unpublished row from the user client
 * entirely). Both dashboards list every status, so linking a row's title
 * straight at the public page is a guaranteed 404 for anything in review — an
 * admin trying to approve a launch landed on "This page could not be found".
 *
 * The rule was already written down one file over ("Only a published product
 * has a public page; the others would 404") and still got broken, which is why
 * it lives in a tested function now instead of a comment.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { productRowHref } from "../lib/product-links.ts";

const row = { id: "prod-1", slug: "northstar" };

describe("productRowHref — published rows", () => {
  it("sends an admin to the public page", () => {
    assert.equal(
      productRowHref({ ...row, status: "published" }, "admin"),
      "/products/northstar",
    );
  });

  it("sends a maker to the public page", () => {
    assert.equal(
      productRowHref({ ...row, status: "published" }, "maker"),
      "/products/northstar",
    );
  });
});

describe("productRowHref — rows in review", () => {
  it("sends an admin to the review screen, where the decision is made", () => {
    assert.equal(
      productRowHref({ ...row, status: "pending" }, "admin"),
      "/admin/review/prod-1",
    );
  });

  it("sends the maker to their submission rather than a 404", () => {
    assert.equal(
      productRowHref({ ...row, status: "pending" }, "maker"),
      "/products/northstar/edit",
    );
  });
});

describe("productRowHref — every other unpublished status", () => {
  for (const status of ["draft", "archived", "rejected"]) {
    it(`keeps an admin off the public page for "${status}"`, () => {
      assert.equal(
        productRowHref({ ...row, status }, "admin"),
        "/products/northstar/edit",
      );
    });

    it(`keeps a maker off the public page for "${status}"`, () => {
      assert.equal(
        productRowHref({ ...row, status }, "maker"),
        "/products/northstar/edit",
      );
    });
  }

  /*
   * A status this function has never heard of is the dangerous case: a future
   * migration adding one must not silently start advertising a public page
   * that does not exist. Only "published" earns that link.
   */
  it("treats an unknown status as unpublished", () => {
    assert.equal(
      productRowHref({ ...row, status: "quarantined" }, "admin"),
      "/products/northstar/edit",
    );
  });
});

describe("productRowHref — slug and id are URL-encoded", () => {
  it("encodes a slug so a stray character cannot break out of the path", () => {
    assert.equal(
      productRowHref({ id: "a/b", slug: "a b", status: "published" }, "maker"),
      "/products/a%20b",
    );
  });

  it("encodes the id in the review link", () => {
    assert.equal(
      productRowHref({ id: "a/b", slug: "s", status: "pending" }, "admin"),
      "/admin/review/a%2Fb",
    );
  });
});
