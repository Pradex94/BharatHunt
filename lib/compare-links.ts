/**
 * URLs for the comparison page, in one place so the tray, the product page and
 * the compare page itself build them identically.
 *
 * `/compare?products=a,b,c` is the working URL: any combination, shareable,
 * never indexed. Framework-agnostic so it is safe on the client and in tests.
 */

export const MAX_COMPARE_PRODUCTS = 4;

const SLUG = /^[a-z0-9-]{1,80}$/;

export function parseCompareSlugs(raw: string | string[] | undefined): string[] {
  const value = Array.isArray(raw) ? raw.join(",") : (raw ?? "");
  return [...new Set(value.split(",").map((slug) => slug.trim().toLowerCase()))]
    .filter((slug) => SLUG.test(slug))
    .slice(0, MAX_COMPARE_PRODUCTS);
}

export function compareHref(slugs: string[]): string {
  const clean = parseCompareSlugs(slugs.join(","));
  return clean.length === 0 ? "/compare" : `/compare?products=${clean.join(",")}`;
}
