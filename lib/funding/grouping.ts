/**
 * Folding duplicate records of one funding event into a single card.
 *
 * Ingestion already merges most duplicates (`findSameEvent` in ingest.ts), but
 * two kinds get through, and both are visible in the published data:
 *
 *   - The same company reported with different stages ("Seed" by one outlet,
 *     nothing by another → "Undisclosed"), which gives two event keys, and
 *     headlines too different for the similarity fallback.
 *   - A misread company name ("for hospitality" out of "…$6.7 Mn seed round in
 *     Dextr AI for hospitality"), which gives a different slug, so the
 *     fallback — which requires the same slug — never compares them.
 *
 * This is the display-side safety net. It never deletes anything: the
 * non-canonical records become "also reported by" sources on the canonical
 * card, so every outlet stays attributed and one click away.
 *
 * Two records are the same event when they are within `WINDOW_DAYS` of each
 * other, name the same company (same slug, or one's headline names the other's
 * company), and do not contradict each other on the amount. Conservative on
 * purpose: a false merge hides a real round, which is worse than showing a
 * duplicate.
 *
 * Pure and client-safe; `tests/funding-grouping.test.ts` covers it.
 */

import type { FundingCoverage, FundingRoundRow } from "@/services/funding";

const WINDOW_DAYS = 10;
/** Two disclosed amounts within 5% are the same figure reported with rounding. */
const AMOUNT_TOLERANCE = 0.05;

function dayNumber(date: string): number {
  const time = Date.parse(date.slice(0, 10));
  return Number.isNaN(time) ? Number.NaN : Math.floor(time / 86_400_000);
}

function mentions(headline: string, name: string): boolean {
  const clean = name.trim().toLowerCase();
  // A two-letter "name" matches half the headlines ever written.
  if (clean.length < 3) return false;
  return headline.toLowerCase().includes(clean);
}

function amountsAgree(a: FundingRoundRow, b: FundingRoundRow): boolean | null {
  if (a.amount_inr === null || b.amount_inr === null) return null;
  const high = Math.max(a.amount_inr, b.amount_inr);
  if (high === 0) return true;
  return Math.abs(a.amount_inr - b.amount_inr) / high <= AMOUNT_TOLERANCE;
}

export function isSameFundingEvent(a: FundingRoundRow, b: FundingRoundRow): boolean {
  const gap = Math.abs(dayNumber(a.announcement_date) - dayNumber(b.announcement_date));
  if (!(gap <= WINDOW_DAYS)) return false;

  const sameSlug = a.startup_slug === b.startup_slug;
  const crossMention =
    mentions(a.headline, b.startup_name) || mentions(b.headline, a.startup_name);
  if (!sameSlug && !crossMention) return false;

  const amounts = amountsAgree(a, b);
  if (amounts === false) return false;
  if (amounts === true) return true;

  // One or both amounts unknown: only merge when nothing else disagrees — the
  // same company, and stages that match or where one side simply has none.
  const stagesAgree =
    a.funding_stage === b.funding_stage ||
    a.funding_stage === "Undisclosed" ||
    b.funding_stage === "Undisclosed";
  return sameSlug && stagesAgree;
}

/** How much a record knows — the most complete one fronts the group. */
function richness(round: FundingRoundRow, majoritySlug: string): number {
  return (
    (round.startup_slug === majoritySlug ? 4 : 0) +
    (round.funding_stage !== "Undisclosed" ? 2 : 0) +
    (round.lead_investor ? 2 : 0) +
    (round.amount_inr !== null ? 2 : 0) +
    (round.industry ? 1 : 0) +
    (round.city ? 1 : 0) +
    Math.min(round.investors.length, 4) * 0.5
  );
}

function mergeGroup(members: FundingRoundRow[]): FundingRoundRow {
  if (members.length === 1) return members[0];

  const slugCounts = new Map<string, number>();
  for (const member of members) {
    slugCounts.set(member.startup_slug, (slugCounts.get(member.startup_slug) ?? 0) + 1);
  }
  const majoritySlug = [...slugCounts.entries()].sort((x, y) => y[1] - x[1])[0][0];

  const ranked = [...members].sort(
    (x, y) => richness(y, majoritySlug) - richness(x, majoritySlug),
  );
  const canonical = ranked[0];
  const rest = ranked.slice(1);
  const pick = <K extends keyof FundingRoundRow>(key: K, empty: (v: FundingRoundRow[K]) => boolean) =>
    empty(canonical[key]) ? (rest.find((r) => !empty(r[key]))?.[key] ?? canonical[key]) : canonical[key];

  const investors: string[] = [];
  const seenInvestor = new Set<string>();
  for (const member of ranked) {
    for (const name of member.investors) {
      const key = name.toLowerCase();
      if (!seenInvestor.has(key)) {
        seenInvestor.add(key);
        investors.push(name);
      }
    }
  }

  const coverage: FundingCoverage[] = [];
  const seenUrl = new Set<string>([canonical.source_url]);
  const addCoverage = (item: FundingCoverage) => {
    if (!item.url || seenUrl.has(item.url)) return;
    seenUrl.add(item.url);
    coverage.push(item);
  };
  for (const item of canonical.coverage ?? []) addCoverage(item);
  for (const member of rest) {
    addCoverage({
      source_name: member.source_name,
      url: member.source_url,
      published_at: member.source_published_at ?? member.announcement_date,
    });
    for (const item of member.coverage ?? []) addCoverage(item);
  }

  const isNull = (value: unknown) => value === null || value === undefined || value === "";
  const hasAmount = (r: FundingRoundRow) => r.amount_numeric !== null || !isNull(r.amount);
  const amountSource = hasAmount(canonical) ? canonical : (rest.find(hasAmount) ?? canonical);

  return {
    ...canonical,
    funding_stage:
      canonical.funding_stage === "Undisclosed"
        ? (rest.find((r) => r.funding_stage !== "Undisclosed")?.funding_stage ?? "Undisclosed")
        : canonical.funding_stage,
    // The four amount fields travel together from one record, never mixed.
    amount: amountSource.amount,
    amount_numeric: amountSource.amount_numeric,
    currency: amountSource.currency,
    amount_inr: amountSource.amount_inr,
    industry: pick("industry", isNull),
    sub_industry: pick("sub_industry", isNull),
    city: pick("city", isNull),
    location: pick("location", isNull),
    lead_investor: pick("lead_investor", isNull),
    logo_url: pick("logo_url", isNull),
    summary: pick("summary", isNull),
    investors,
    // The merged card carries facts from several records, so it is only as
    // checked as its least-checked one.
    verified: members.every((member) => member.verified),
    coverage,
  };
}

/**
 * Collapse same-event records, keeping the list's order: each group appears
 * where its first member did.
 */
export function groupFundingEvents(rounds: FundingRoundRow[]): FundingRoundRow[] {
  const parent = rounds.map((_, index) => index);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));

  for (let i = 0; i < rounds.length; i++) {
    for (let j = i + 1; j < rounds.length; j++) {
      if (find(i) !== find(j) && isSameFundingEvent(rounds[i], rounds[j])) {
        parent[find(j)] = find(i);
      }
    }
  }

  const groups = new Map<number, FundingRoundRow[]>();
  const order: number[] = [];
  rounds.forEach((round, index) => {
    const root = find(index);
    const bucket = groups.get(root);
    if (bucket) bucket.push(round);
    else {
      groups.set(root, [round]);
      order.push(root);
    }
  });

  return order.map((root) => mergeGroup(groups.get(root)!));
}
