/**
 * The launch gate's spam-formatting rules.
 *
 * These exist because the gate had none, and two rules were rejecting ordinary
 * submissions:
 *
 *   - `CONTACT_BAIT` listed the bare words "whatsapp" and "telegram", so
 *     "WhatsApp CRM" and "Telegram bot builder" — an entire product category on
 *     an Indian marketplace — could not be launched at all.
 *   - `PHONE` was `(?:\+?\d[\s-]?){9,}`, i.e. any run of nine or more digits,
 *     so "Covering 2023 2024 2025 2026" read as a phone number.
 *
 * A moderation rule that blocks real makers is worse than one that lets some
 * spam through: the spam gets removed later, the maker leaves immediately. So
 * the allow-cases below carry more weight than the block-cases.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { moderateProduct } from "../lib/moderation.ts";

/*
 * A submission that passes every rule except whatever the case is probing.
 *
 * The URL is deliberately not example.com: the gate rejects placeholder
 * domains under `untrusted_link`, and that rule runs *before* the spam checks.
 * An earlier version of this fixture used it, so every case returned
 * `untrusted_link` — which made the block-cases fail loudly, but made the
 * allow-cases pass vacuously while proving nothing.
 */
function submit(name: string, tagline: string) {
  return moderateProduct({
    name,
    tagline,
    description:
      "A genuinely useful tool for teams who need to get work done without friction, built over the last year.",
    tags: ["saas"],
    techStack: ["nextjs"],
    websiteUrl: "https://tryflowbase.com",
    ctaText: "Try it",
    ctaUrl: "https://tryflowbase.com",
  });
}

/**
 * True when the submission is rejected *by the spam rule specifically*.
 *
 * Asserting on the code rather than on `ok` is what stops an unrelated rule
 * firing first from being mistaken for the behaviour under test.
 */
const spamFormatting = (name: string, tagline: string) => {
  const result = submit(name, tagline);
  return !result.ok && result.code === "spam_formatting";
};

describe("platform names are products, not contact details", () => {
  const legitimate: [string, string][] = [
    ["WhatsApp CRM", "Manage customer conversations at scale"],
    ["ChatFlow", "Automate your WhatsApp marketing in minutes"],
    ["Sendly", "WhatsApp Business API for growing teams"],
    ["BotKit", "Build a Telegram bot without writing code"],
    ["LeadGen", "Turn Telegram groups into a sales pipeline"],
  ];

  for (const [name, tagline] of legitimate) {
    it(`allows "${name} — ${tagline}"`, () => {
      assert.equal(
        spamFormatting(name, tagline),
        false,
        "naming the platform a product integrates with is not contact bait",
      );
    });
  }
});

describe("actual solicitation is still blocked", () => {
  const bait: [string, string][] = [
    ["Deals Hub", "DM me for early access"],
    ["Deals Hub", "WhatsApp me for a demo"],
    ["Deals Hub", "Telegram us to get started"],
    ["Deals Hub", "Call now to book a slot"],
    ["Deals Hub", "Contact us on our other site"],
    ["Deals Hub", "Ping me on our channel"],
  ];

  for (const [name, tagline] of bait) {
    it(`blocks "${tagline}"`, () => {
      assert.equal(spamFormatting(name, tagline), true);
    });
  }
});

describe("numbers in a tagline are usually just numbers", () => {
  const legitimate: [string, string][] = [
    ["Timeline", "Covering 2023 2024 2025 2026 in a single view"],
    ["NumCrunch", "Handles 123456789 rows per second"],
    ["Ledger", "Track 100000000 transactions without lag"],
    ["Scale", "Serving 10,000 makers across India"],
    ["Version", "Now on v1.2.3 with 40 new features"],
  ];

  for (const [name, tagline] of legitimate) {
    it(`allows "${tagline}"`, () => {
      assert.equal(
        spamFormatting(name, tagline),
        false,
        "a large or grouped number is not a phone number",
      );
    });
  }
});

describe("real phone numbers are still blocked", () => {
  const numbers: [string, string][] = [
    ["Deals Hub", "Reach the team at +91 98765 43210 today"],
    ["Deals Hub", "Support on +1-555-123-4567 around the clock"],
    ["Deals Hub", "Ring 9876543210 for onboarding help"],
  ];

  for (const [name, tagline] of numbers) {
    it(`blocks "${tagline}"`, () => {
      assert.equal(spamFormatting(name, tagline), true);
    });
  }
});

describe("the rest of the spam rules still hold", () => {
  it("blocks an email address in the headline", () => {
    assert.equal(spamFormatting("Deals Hub", "Write to sales@example.com for a quote"), true);
  });

  it("blocks ALL CAPS", () => {
    assert.equal(spamFormatting("DEALS HUB", "BEST PRODUCT EVER LAUNCHED"), true);
  });

  it("passes an ordinary submission untouched", () => {
    const result = submit("GrowEasy", "Grow your business with simple analytics");
    assert.equal(result.ok, true, result.ok ? "" : result.message);
  });
});
