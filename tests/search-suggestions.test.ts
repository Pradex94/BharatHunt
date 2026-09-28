import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { EMPTY_SUGGESTIONS, countSuggestions, entityNamePattern } from "../lib/search.ts";

describe("entityNamePattern", () => {
  it("matches the space-separated form ingestion stores", () => {
    assert.equal(entityNamePattern("Grow Easy"), "%grow%easy%");
    assert.equal(entityNamePattern("grow-easy"), "%grow%easy%");
    assert.equal(entityNamePattern("Café"), "%cafe%");
  });

  it("never lets a wildcard or filter separator from the user through", () => {
    assert.equal(entityNamePattern("100%_off,(x)"), "%100%off%x%");
    assert.equal(entityNamePattern("%%__"), "");
  });

  it("caps the number of words", () => {
    assert.equal(entityNamePattern("a b c d e f g h"), "%a%b%c%d%e%f%");
  });
});

describe("countSuggestions", () => {
  it("counts every group", () => {
    assert.equal(countSuggestions(EMPTY_SUGGESTIONS), 0);
    assert.equal(
      countSuggestions({
        ...EMPTY_SUGGESTIONS,
        ai: [{ name: "Sarvam", slug: "sarvam", type: "company" }],
        investors: [{ name: "Accel", slug: "accel", deal_count: 3 }],
      }),
      2,
    );
  });
});
