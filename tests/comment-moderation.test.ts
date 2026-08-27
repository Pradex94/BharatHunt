/**
 * The comment gate.
 *
 * Written against two comments that were live on the site: a pasted embed badge
 * (`<a href=… style=…>`) and a four-line Python script. Neither was abuse —
 * comments are escaped when rendered, so nothing ran — but a product page reads
 * as abandoned when the thread under it is other people's clipboards.
 *
 * The allow-cases carry more weight than the block-cases, and more here than
 * anywhere else in this suite. A comment is one sentence, often typed on a
 * phone, often not in English, and a rule that eats a real one costs a reader
 * who will not try twice. Every case below is something a person could
 * plausibly write under an Indian product launch.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { moderateComment } from "../lib/moderation.ts";

const rejects = (body: string) => {
  const result = moderateComment(body);
  return result.ok ? null : result.code;
};

describe("pasted markup is refused", () => {
  const pastes = [
    // The badge embed, verbatim in shape.
    '<a href="https://bharathunt.org/products/zapiflow" target="_blank" rel="noopener" style="display:inline-flex;padding:10px 16px;">',
    '<span style="display:inline-flex;align-items:center">Badge</span>',
    "<script>alert(1)</script>",
    "<iframe src='https://example.com'></iframe>",
    "<div class='wrapper'>",
  ];

  for (const body of pastes) {
    it(`blocks ${JSON.stringify(body.slice(0, 40))}…`, () => {
      assert.equal(rejects(body), "code_snippet");
    });
  }
});

describe("pasted code is refused", () => {
  const snippets = [
    'import requests\n\nip = requests.get("https://api.ipify.org").text\nprint(ip)',
    'const res = await fetch("/api/products");\nconsole.log(res);',
    "def hello(name):\n    return f'hi {name}'",
    "```\nnpm run build\n```",
    "#include <stdio.h>",
    "function init() {\n  setup();\n}",
  ];

  for (const body of snippets) {
    it(`blocks ${JSON.stringify(body.slice(0, 34))}…`, () => {
      assert.equal(rejects(body), "code_snippet");
    });
  }
});

describe("real comments are left alone", () => {
  const legitimate = [
    "Upvoted!",
    "This is exactly what I needed for my agency. Signed up already.",
    "Does it have an API? I'd want to plug it into our CRM.",
    "Love the print preview, but the export button did nothing for me on Safari.",
    "motarway te bas aa gyi", // Punjabi — a real comment, whatever it looks like to a matcher
    "Bahut badhiya kaam hai bhai, keep going 🚀",
    "Pricing is 499/mo which = good value honestly",
    "Works great with Next.js 16 and Supabase.",
    "I use it every day (really).",
    "Congrats on the launch! 🎉🎉",
    "loooooove this, been waiting for an Indian alternative",
    "Is the free tier limited to 3 projects or unlimited?",
    "Reach support@zapiflow.in — they replied to me in an hour.",
    "The GST invoice feature saved me a whole afternoon.",
    "Feels faster than Zapier for simple flows. Array<string> support would be nice though.",
  ];

  for (const body of legitimate) {
    it(`allows ${JSON.stringify(body.slice(0, 40))}`, () => {
      assert.equal(rejects(body), null, "a real comment must not be refused");
    });
  }
});

describe("spam and abuse are still refused", () => {
  it("blocks a phone number", () => {
    assert.equal(rejects("Call me on 9876543210 for a better deal"), "spam_formatting");
  });

  it("blocks solicitation", () => {
    assert.equal(rejects("DM me for a discount coupon"), "spam_formatting");
  });

  it("blocks a comment shouted in caps", () => {
    assert.equal(rejects("BEST PRODUCT EVER BUY NOW TODAY"), "spam_formatting");
  });

  it("blocks adult content", () => {
    assert.equal(rejects("watch free porn videos here"), "adult_content");
  });
});

describe("one weak signal is not enough on its own", () => {
  it("allows a single line that merely ends in a semicolon", () => {
    assert.equal(rejects("Nice work; the onboarding is smooth."), null);
  });

  it("allows a lone equals sign", () => {
    assert.equal(rejects("value = money saved, honestly"), null);
  });

  it("blocks once two weak signals stack up", () => {
    assert.equal(rejects("total = price * qty;\nrender(total);"), "code_snippet");
  });
});
