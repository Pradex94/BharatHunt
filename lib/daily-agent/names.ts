/**
 * From a name in a headline to a website we can verify.
 *
 * Indian startup news names products without linking them ("Epigamia cofounder
 * launches Kokasa to build defence tech systems"), and funding reports carry a
 * company name but no URL. Without a paid search API, the agent resolves a name
 * the way a person would: try the obvious domains and keep one only if the
 * page there names itself the same thing. A resolved website is always marked
 * `website_inferred`, which keeps it out of auto-publish — an admin confirms
 * it is the right company.
 *
 * Pure, so `tests/` can pin it.
 */

import { nameKey } from "./domain.ts";

/** Words that follow "launches" but are not a product name. */
const NOT_A_NAME = new Set([
  "a", "an", "the", "its", "new", "in", "on", "with", "for", "to", "of", "and", "operations", "services",
  "india", "ai", "app", "platform", "fund", "funds", "programme", "program", "campaign", "initiative",
  "first", "second", "pilot", "beta", "version", "series", "round", "ipo", "store", "stores", "office",
  "offices", "unit", "plant", "brand", "range", "line", "collection", "feature", "features", "tool", "tools",
]);

/** Verbs that introduce a launch in a headline. */
const LAUNCH_VERB = /\b(?:launches|launched|unveils|unveiled|introduces|debuts|rolls out|announces the launch of)\s+/i;

/**
 * The product a headline says was launched: the capitalised run straight after
 * the verb. Null unless that run looks like a proper name.
 */
export function extractLaunchedName(headline: string): string | null {
  const verb = LAUNCH_VERB.exec(headline);
  if (!verb) return null;
  const after = headline.slice(verb.index + verb[0].length);
  const words: string[] = [];
  for (const raw of after.split(/\s+/)) {
    const word = raw.replace(/[’'"“”,:;.!?()]+$/g, "").replace(/^["“'(]+/, "");
    if (!word) break;
    // Headline Case capitalises every word, so stop at connectives regardless of case.
    if (/^(to|for|with|in|on|at|as|amid|after|that|which|and|&|—|–|-|:|via|from|its|by)$/i.test(word)) break;
    // A name starts with a capital letter ("Kokasa", "QNu Labs"); a leading
    // digit is almost always a count ("unveils 18-startup cohort").
    if (!(words.length === 0 ? /^[A-Z][\w.&+-]*$/ : /^[A-Z0-9][\w.&+-]*$/).test(word)) break;
    words.push(word);
    if (words.length >= 3 || /[,:;]$/.test(raw)) break;
  }
  const name = words.join(" ").trim();
  if (!name || name.length < 3 || name.length > 40) return null;
  if (words.every((word) => NOT_A_NAME.has(word.toLowerCase()))) return null;
  if (NOT_A_NAME.has(words[0].toLowerCase())) return null;
  return name;
}

/** Candidate home pages for a name, most likely first, at most `limit`. */
const TLD_SUFFIX = /\.(ai|com|in|io|co|app|so|dev)$/;

export function domainGuesses(name: string, limit = 4): string[] {
  const folded = name.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").trim();
  // A name that already is a domain ("Fundly.ai") is the strongest guess of all.
  const literal = /^[a-z0-9-]+\.(ai|com|in|io|co|app|so|dev)$/.test(folded) ? folded : null;
  const bare = folded.replace(TLD_SUFFIX, "");
  // The whole name first ("QNu Labs" → qnulabs), then without the generic
  // suffix (→ qnu), because companies register either.
  const full = bare.replace(/[^a-z0-9]+/g, "");
  const stripped = bare
    .replace(/\b(ai|labs|technologies|tech|app|india|pvt|ltd|private|limited)\b/g, " ")
    .replace(/[^a-z0-9]+/g, "");
  const aiish = /\bai\b|\.ai$/i.test(name);
  const usable = (base: string) => base.length >= 3 && base.length <= 30;

  const guesses: string[] = [];
  if (literal) guesses.push(`https://${literal}/`);
  for (const base of [full, stripped].filter(usable)) {
    guesses.push(`https://${base}.com/`, aiish ? `https://${base}.ai/` : `https://${base}.in/`);
  }
  if (usable(stripped)) guesses.push(`https://${stripped}.co.in/`, `https://${stripped}.co/`);
  return [...new Set(guesses)].slice(0, limit);
}

/**
 * Whether a page at a guessed domain is the product we were looking for: its
 * own name (site name or title) must fold to the same key, or start with it.
 * "Rivet" matching "Rivet — the plumbing marketplace" is a match; "Rivet"
 * matching "Rivets & Fasteners Co." is not.
 */
export function siteMatchesName(name: string, siteName: string | null, title: string | null): boolean {
  const target = nameKey(name);
  if (target.length < 3) return false;
  for (const candidate of [siteName, title]) {
    if (!candidate) continue;
    const head = candidate.split(/\s[|\-–—:·]\s/)[0];
    const key = nameKey(head);
    if (key === target) return true;
    if (key.startsWith(target) && key.length - target.length <= 3) return true;
  }
  return false;
}
