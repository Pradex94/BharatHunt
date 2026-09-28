/**
 * Where funding entities link to.
 *
 * One module so a destination changes in one place. The case this exists for
 * is investors: there is no per-investor profile route yet, so an investor name
 * links to the feed filtered to that investor. When `/funding/investors/[slug]`
 * exists, `investorHref` is the only thing that has to learn about it — every
 * card, chart and ranking already calls through here.
 *
 * Pure and client-safe.
 */

import { FUNDING_GEO_FILTERS, type FundingCity } from "./constants.ts";

export function startupHref(slug: string): string {
  return `/funding/${slug}`;
}

export function investorHref(name: string): string {
  return `/funding?investor=${encodeURIComponent(name)}#funding-feed`;
}

export function industryHref(industry: string): string {
  return `/funding?industry=${encodeURIComponent(industry.toLowerCase())}#funding-feed`;
}

/** The geography filter token for a stored city bucket ("Other India" → "other"). */
export function geoTokenForCity(city: string): string | null {
  const match = FUNDING_GEO_FILTERS.find(
    (entry) => entry.value !== "india" && entry.cities.includes(city as FundingCity),
  );
  return match?.value ?? null;
}

export function cityHref(city: string): string | null {
  const token = geoTokenForCity(city);
  return token ? `/funding?geo=${token}#funding-feed` : null;
}

/** "Other India" is a bucket name, not a place; say what it means on screen. */
export function cityLabel(city: string): string {
  return city === "Other India" ? "Rest of India" : city;
}
