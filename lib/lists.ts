/**
 * Rules for user lists ("collections" in the UI) — framework-agnostic, so the
 * actions, the pages and `npm test` agree. The database enforces the hard
 * limits too (20261004000000: 50 lists a person, 200 products a list).
 */

export const MAX_LISTS_PER_USER = 50;
export const MAX_PRODUCTS_PER_LIST = 200;
export const MAX_TITLE_LENGTH = 80;
export const MAX_DESCRIPTION_LENGTH = 280;

/** A public list is indexable only once it is worth reading — the same bar as the SEO collections. */
export const MIN_PRODUCTS_TO_INDEX_LIST = 3;

/** Suggested names in the empty state; picking one only pre-fills the field. */
export const LIST_NAME_IDEAS = ["My AI tools", "Startup stack", "Tools to try", "Indian SaaS", "Marketing stack", "Developer tools"];

export function cleanListTitle(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const title = raw.replace(/\s+/g, " ").trim().slice(0, MAX_TITLE_LENGTH);
  return title.length > 0 ? title : null;
}

export function cleanListDescription(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const description = raw.replace(/\s+/g, " ").trim().slice(0, MAX_DESCRIPTION_LENGTH);
  return description.length > 0 ? description : null;
}

/**
 * "My AI Startup Stack" → "my-ai-startup-stack-k3x9". The suffix keeps slugs
 * unique without a lookup and makes a private list's URL unguessable from its
 * title — though privacy itself is RLS's job, not the slug's.
 */
export function listSlug(title: string, random: () => number = Math.random): string {
  const base =
    title
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60)
      .replace(/-+$/g, "") || "list";
  const alphabet = "abcdefghijkmnpqrstuvwxyz23456789";
  let suffix = "";
  for (let index = 0; index < 4; index += 1) suffix += alphabet[Math.floor(random() * alphabet.length)];
  return `${base}-${suffix}`;
}

export const LIST_SLUG_PATTERN = /^[a-z0-9-]{3,100}$/;
