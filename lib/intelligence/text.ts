/**
 * Text handling shared by every Product Intelligence module: one tokenizer, so
 * the concept matcher, the similarity vectors and the query parser can never
 * disagree about what a word is.
 *
 * Framework-agnostic and dependency-free (relative `.ts` imports only), the
 * same contract as `lib/daily-agent/*`, so `npm test` reaches it directly.
 *
 * Deliberately not `lib/search.ts`. That normaliser strips *every* separator
 * ("grow easy" → "groweasy") because it serves substring matching against a
 * name, and it is mirrored in SQL. This one keeps word boundaries, because
 * concepts are phrases ("image to video") and similarity is a bag of words.
 */

/**
 * Words that carry no meaning about what a product does. Kept small on purpose:
 * "free", "no", "low", "open" and every domain noun stay, because "no code",
 * "low code", "open source" and the pricing words are evidence.
 */
const STOPWORDS = new Set([
  "a", "an", "the", "and", "or", "of", "for", "to", "in", "on", "at", "by", "with",
  "from", "your", "you", "yours", "our", "we", "us", "is", "are", "be", "been", "it",
  "its", "this", "that", "these", "those", "as", "into", "out", "all", "any", "every",
  "more", "most", "so", "than", "then", "just", "can", "will", "get", "gets", "make",
  "makes", "made", "use", "uses", "using", "via", "per", "one", "etc", "plus", "also",
  "how", "what", "who", "why", "when", "where", "which", "their", "they", "them", "me",
  "my", "i", "do", "does", "need", "needs", "want", "looking", "something", "help",
  "helps", "like", "best", "good", "great", "new", "very", "much", "many", "lets",
  "let", "while", "without", "within", "over", "under", "about", "after", "before",
  "has", "have", "had", "was", "were", "if", "but", "not", "only", "own", "each",
  "other", "some", "such", "same", "into", "onto", "up", "down", "there", "here",
  "now", "way", "ways", "online", "simple", "easy", "fast", "powerful",
  "k", "v", "ka", "ki", "ke", "hai", "karo",
  // Not here, on purpose: "app", "tool", "platform", "software". They look
  // like filler, but concept phrases depend on them — dropping "app" turned
  // "app builder" into "builder", which then matched every "resume builder".
  // The similarity vectors discount them anyway through document frequency.
]);

/**
 * A deliberately light stemmer: plural forms only. Anything cleverer
 * ("pricing" → "pric") damages more matches than it saves on a catalogue whose
 * listings are a sentence or two long.
 */
export function stem(word: string): string {
  // "-ies" and "-ie" both fold to "-y", so singular and plural agree in both
  // families: categories/category → category, calories/calorie → calory.
  if (word.length > 4 && word.endsWith("ies")) return `${word.slice(0, -3)}y`;
  if (word.length > 3 && word.endsWith("ie")) return `${word.slice(0, -2)}y`;
  if (
    word.length > 3 &&
    word.endsWith("s") &&
    !word.endsWith("ss") &&
    !word.endsWith("us") &&
    !word.endsWith("is")
  ) {
    return word.slice(0, -1);
  }
  return word;
}

/** Lowercase, accent-free, Latin alphanumeric words, stopwords removed, stemmed. */
export function tokenize(text: string | null | undefined): string[] {
  if (!text) return [];
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 1 && !STOPWORDS.has(token) && !/^\d+$/.test(token))
    .map(stem);
}

/**
 * Text as a space-padded token string, so a phrase test is a plain substring
 * test that still respects word boundaries: " image video " is found in
 * " upload image video generator " but " ai " is not found in " email ".
 * Phrases and haystacks both go through here, so stopword and plural handling
 * cancel out on both sides.
 */
export function phraseKey(text: string | null | undefined): string {
  const tokens = tokenize(text);
  return tokens.length === 0 ? "" : ` ${tokens.join(" ")} `;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * The listing's *own* wording for a lexicon phrase, for quoting back to a
 * visitor: phrase "run entirely browser" in "Runs entirely in your browser."
 * → "Runs entirely in your browser". Each phrase token may carry a suffix
 * (plurals), and up to two words (the stopwords the tokenizer dropped) may sit
 * between tokens. Falls back to the phrase itself if no span is found, which
 * only happens if the text changed since it was matched.
 */
export function quoteSource(text: string | null | undefined, phrase: string): string {
  const tokens = tokenize(phrase);
  const source = (text ?? "").normalize("NFKD").replace(/[̀-ͯ]/g, "");
  if (tokens.length === 0 || !source) return phrase;
  const pattern = tokens
    // A token stemmed from "-ies" ("category") must still find "categories".
    .map((token) =>
      token.endsWith("y") ? `${escapeRegExp(token.slice(0, -1))}(?:y|ie)[a-z0-9]*` : `${escapeRegExp(token)}[a-z0-9]*`,
    )
    .join("(?:[^a-z0-9]+[a-z0-9]+){0,2}?[^a-z0-9]+");
  const match = new RegExp(`(?<![a-z0-9])${pattern}`, "i").exec(source);
  return match ? cleanText(match[0]) : phrase;
}

/** Collapse whitespace and trim, for quoting a listing's own words back. */
export function cleanText(text: string | null | undefined): string {
  return (text ?? "").replace(/\s+/g, " ").trim();
}
