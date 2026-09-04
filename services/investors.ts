import "server-only";

/**
 * Reads for the Investor Directory. The write half lives in
 * lib/actions/investors.ts and lib/investor-access.ts, matching how
 * services/promotions.ts and lib/actions/promotions.ts already divide.
 *
 * The security model, in one paragraph
 * ------------------------------------
 * The dataset is the product, so there is exactly one function in this file
 * that can return a premium row — `getInvestorDirectory` — and it takes a
 * `userId` and re-checks the purchase itself rather than trusting a caller to
 * have done it. Everything else is either the free preview (four rows, public
 * by RLS) or metadata. `investors` carries a SELECT policy admitting only
 * `is_free_preview` rows, so even if a bug called the anon client for the full
 * set it would come back with the previews, not the directory. The service
 * client is used for the paid read precisely because RLS *cannot* be talked
 * into returning that data.
 *
 * Uncached, all of it, for the reason services/promotions.ts records: this is
 * what someone is staring at immediately after paying, and a stale read is a
 * customer who paid and cannot see what they bought. `cacheRemember` would also
 * need a per-user key here, which is the shape of cache that leaks one
 * customer's entitlement to another if the key is ever wrong.
 */

import { createPublicClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  EMPTY_INVESTOR_FACETS,
  INVESTOR_FREE_PREVIEW_LIMIT,
  INVESTOR_SECTORS,
  INVESTOR_STAGES,
  INVESTOR_TYPES,
  type InvestorDirectoryPlan,
  type InvestorFacets,
  type InvestorFilters,
  type InvestorFull,
  type InvestorPreview,
} from "@/lib/investors";
import { isDodoId } from "@/lib/dodo-signature";

/** Structured log line, matching the shape services/promotions.ts uses. */
function logFailure(event: string, error: { code?: string | null; message?: string }) {
  console.error(
    JSON.stringify({
      event,
      code: error.code ?? null,
      message: error.message ?? null,
      at: new Date().toISOString(),
    }),
  );
}

/** The columns the free tier is allowed to see. Contact fields are absent. */
const PREVIEW_COLUMNS =
  "id, name, firm_name, title, logo_url, location, country, investor_type, investment_stages, sectors, portfolio, check_size_min_inr, check_size_max_inr, thesis, is_sample";

/**
 * Those plus the fields the purchase actually buys.
 *
 * Every name added here must also be granted to nobody but `service_role` — see
 * 20260905000000, which withholds `phone` from `anon`/`authenticated` the way
 * 20260904020000 withheld the rest. A column added to this list but left
 * publicly granted is a paid field given away.
 */
const FULL_COLUMNS = `${PREVIEW_COLUMNS}, website, email, phone, linkedin, contact_details`;

/**
 * A row as PostgREST returns it. Written out rather than pulled from
 * `types/database.ts` because these two select lists are narrower than the
 * table, and a `Tables<"investors">` here would type fields the query does not
 * fetch as present.
 */
type PreviewRow = {
  id: string;
  name: string;
  firm_name: string | null;
  title: string | null;
  logo_url: string | null;
  location: string | null;
  country: string | null;
  investor_type: string | null;
  investment_stages: string[] | null;
  sectors: string[] | null;
  portfolio: string[] | null;
  check_size_min_inr: number | null;
  check_size_max_inr: number | null;
  thesis: string | null;
  is_sample: boolean;
};

type FullRow = PreviewRow & {
  website: string | null;
  email: string | null;
  phone: string | null;
  linkedin: string | null;
  contact_details: string | null;
};

/** `?? null` on numbers, never `|| null`: a zero cheque floor is a real figure. */
const asAmount = (value: number | null | undefined): number | null =>
  value === null || value === undefined ? null : Number(value);

function toPreview(row: PreviewRow): InvestorPreview {
  return {
    id: row.id,
    name: row.name,
    firmName: row.firm_name,
    title: row.title,
    logoUrl: row.logo_url,
    location: row.location,
    country: row.country,
    investorType: row.investor_type,
    stages: row.investment_stages ?? [],
    sectors: row.sectors ?? [],
    portfolio: row.portfolio ?? [],
    checkSizeMinInr: asAmount(row.check_size_min_inr),
    checkSizeMaxInr: asAmount(row.check_size_max_inr),
    thesis: row.thesis,
    isSample: row.is_sample,
  };
}

function toFull(row: FullRow): InvestorFull {
  return {
    ...toPreview(row),
    website: row.website,
    email: row.email,
    phone: row.phone,
    linkedin: row.linkedin,
    contactDetails: row.contact_details,
  };
}

// Access
// ------

/**
 * Whether this user has bought the directory.
 *
 * The single authority on the question. Every path that returns premium data
 * calls it, and it is a database read every time rather than anything cached on
 * a session, a cookie or a Clerk claim — a refund has to take access away on
 * the next request, not whenever a token happens to expire.
 *
 * Service-role, and it has to be: `investor_directory_purchases` carries a
 * select-own policy, which the user-scoped client would satisfy, but this is
 * also called from the webhook and from server actions that have already
 * established identity by other means. One function, one query, no branch that
 * could answer "yes" for the wrong reason.
 */
export async function hasInvestorDirectoryAccess(userId: string | null): Promise<boolean> {
  if (!userId) return false;

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("investor_directory_purchases")
    .select("id")
    .eq("user_id", userId)
    .eq("status", "paid")
    .limit(1)
    .maybeSingle();

  if (error) {
    // Fail closed. An unreadable purchases table means we do not know whether
    // this person paid, and the safe answer to that is "no" — a customer sees a
    // transient lock and a support line, rather than the dataset being handed
    // out whenever Supabase hiccups.
    logFailure("investor_access_check_failed", error);
    return false;
  }

  return Boolean(data);
}

// The catalogue
// -------------

/**
 * The ₹499 plan.
 *
 * Read through the anon client: `investor_directory_plans` has a public SELECT
 * policy on `is_active`, the row is identical for every visitor, and going
 * through the Clerk-token client would make the page dynamic for no gain (see
 * the note on `createPublicClient`).
 *
 * `dodo_product_id` is read but never returned — it is collapsed into
 * `purchasable`. A plan with no Dodo product behind it cannot be charged for,
 * which is the fail-closed state a fresh deployment starts in: the page renders
 * the directory and says purchasing is unavailable, rather than a Pay button
 * that always errors.
 */
export async function getInvestorDirectoryPlan(): Promise<InvestorDirectoryPlan | null> {
  const supabase = createPublicClient();
  const { data, error } = await supabase
    .from("investor_directory_plans")
    .select("id, name, description, amount_paise, currency, dodo_product_id")
    .eq("id", "full-access")
    .eq("is_active", true)
    .maybeSingle();

  if (error || !data) {
    if (error) logFailure("investor_plan_query_failed", error);
    return null;
  }

  return {
    id: data.id,
    name: data.name,
    description: data.description,
    amountPaise: Number(data.amount_paise),
    currency: data.currency,
    purchasable: isDodoId(data.dodo_product_id, "pdt"),
  };
}

// The free tier
// -------------

/**
 * The free preview: at most `INVESTOR_FREE_PREVIEW_LIMIT` investors, visible to
 * everyone including signed-out visitors.
 *
 * The limit is applied here, in the query, rather than by slicing an array in a
 * component. That distinction is the whole free tier: a `.slice(0, 4)` in the
 * UI would mean the server had already sent every row to the browser, and the
 * "premium" data would be sitting in the RSC payload for anyone who opened the
 * network tab. Four rows are fetched; four rows exist.
 *
 * Anon client on purpose. These rows are public by policy, they are the same
 * for every visitor, and reading them without an identity is what lets the
 * marketing half of /investors stay cheap.
 */
export async function getFreeInvestors(): Promise<InvestorPreview[]> {
  const supabase = createPublicClient();
  const { data, error } = await supabase
    .from("investors")
    .select(PREVIEW_COLUMNS)
    // Redundant with the RLS policy, and kept anyway: the policy is the gate,
    // this is the intent. If the policy is ever loosened, the free preview
    // still returns preview rows rather than silently becoming the directory.
    .eq("is_published", true)
    .eq("is_free_preview", true)
    .order("sort_order", { ascending: true })
    .limit(INVESTOR_FREE_PREVIEW_LIMIT);

  if (error) {
    logFailure("free_investors_query_failed", error);
    return [];
  }

  return (data as PreviewRow[]).map(toPreview);
}

/**
 * How many investors the directory holds, and how many of those are seeded
 * samples.
 *
 * Counts only — no rows cross the wire. This is what lets the locked section
 * say something true and specific ("48 investor profiles") to someone who has
 * not paid, without that sentence being assembled from data they should not
 * have. `head: true` means Postgres returns the count and nothing else.
 *
 * `sampleCount` drives the demonstration-data notice. A page that shows invented
 * records has to say so, and the honest way to decide whether to say it is to
 * ask the database rather than hard-code a boolean that goes stale the day real
 * investors are imported.
 */
export async function getInvestorDirectoryStats(): Promise<{
  total: number;
  sampleCount: number;
}> {
  const supabase = createServiceClient();

  const [all, samples] = await Promise.all([
    supabase
      .from("investors")
      .select("id", { count: "exact", head: true })
      .eq("is_published", true),
    supabase
      .from("investors")
      .select("id", { count: "exact", head: true })
      .eq("is_published", true)
      .eq("is_sample", true),
  ]);

  /*
   * A null `count` is a failure too, and it is the one that would otherwise go
   * unnoticed.
   *
   * Verified against the live project rather than assumed: a `head: true` count
   * over a table PostgREST cannot see comes back **204 with `error: null` and
   * `count: null`**, not with a PGRST205 the way an ordinary select does. So
   * checking `error` alone would let a dropped or unmigrated table render as
   * "0 investors" with nothing in the logs — a page quietly telling visitors the
   * directory is empty, and no signal that anything broke.
   *
   * Both conditions log; both return zeros, because zero is the safe figure to
   * show either way (the locked section drops its count and says the generic
   * line instead).
   */
  if (all.error || all.count === null) {
    logFailure("investor_stats_query_failed", all.error ?? { message: "count returned null" });
    return { total: 0, sampleCount: 0 };
  }

  return { total: all.count, sampleCount: samples.count ?? 0 };
}

// The paid tier
// -------------

/**
 * How many rows one directory query may return.
 *
 * Not pagination for its own sake: without a ceiling, a paying customer's first
 * request is also a one-click export of the entire product. A limit does not
 * make scraping impossible — nothing shown to a customer can — but it makes the
 * whole dataset cost repeated, rate-limited, authenticated requests instead of
 * one.
 */
export const INVESTOR_PAGE_SIZE = 24;

/**
 * The directory, for a customer who has paid.
 *
 * Takes `userId` and checks entitlement *itself*. The obvious alternative —
 * a `hasAccess: boolean` parameter the caller passes in — is how this kind of
 * gate fails: it works everywhere it is used correctly, and the one call site
 * that forgets is not a type error. Here, the only way to reach premium rows is
 * to be a user id that a fresh database read says has paid.
 *
 * Returns `null` for "not entitled", which callers must distinguish from `[]`
 * ("entitled, nothing matched"). Two different screens.
 */
export async function getInvestorDirectory(
  userId: string | null,
  filters: Partial<InvestorFilters> = {},
  page = 0,
): Promise<{ investors: InvestorFull[]; total: number } | null> {
  if (!(await hasInvestorDirectoryAccess(userId))) return null;

  const supabase = createServiceClient();
  let query = supabase
    .from("investors")
    .select(FULL_COLUMNS, { count: "exact" })
    .eq("is_published", true);

  // Free text over the columns a founder would actually type into: the fund's
  // name, the firm behind it, where it is, and what it says it backs.
  //
  // `ilike` on a handful of columns rather than the `pg_trgm` machinery
  // lib/search.ts drives for products. That system exists because product
  // search has to be fast over an unbounded, growing corpus and has a
  // normalisation contract mirrored in SQL (see the note in CLAUDE.md). A
  // curated investor list is small, admin-authored, and read behind a paywall;
  // borrowing that pipeline would mean a second parity obligation for no
  // measurable gain.
  const term = (filters.q ?? "").trim();
  if (term) {
    // `%` and `,` are the two characters that would change the meaning of the
    // `or` filter string rather than be searched for, so they are stripped
    // before interpolation. Everything else is data.
    const safe = term.replace(/[%,]/g, " ").slice(0, 80);
    const pattern = `%${safe}%`;
    query = query.or(
      [
        `name.ilike.${pattern}`,
        `firm_name.ilike.${pattern}`,
        `location.ilike.${pattern}`,
        `thesis.ilike.${pattern}`,
        `investor_type.ilike.${pattern}`,
      ].join(","),
    );
  }

  // `contains` on a text[] compiles to the `@>` operator, which is what the GIN
  // indexes on these columns serve.
  if (filters.stage) query = query.contains("investment_stages", [filters.stage]);
  if (filters.sector) query = query.contains("sectors", [filters.sector]);
  if (filters.investorType) query = query.eq("investor_type", filters.investorType);
  // Equality on the normalised `country` column, not a LIKE over the free-text
  // `location`. The display string is "Mumbai, Maharashtra" for one row and
  // "Bengaluru Karnataka" for the next, so a substring match over it was never
  // going to be a filter — it was a coincidence detector.
  if (filters.location) query = query.eq("country", filters.location);

  const from = Math.max(0, page) * INVESTOR_PAGE_SIZE;
  const { data, error, count } = await query
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false })
    .range(from, from + INVESTOR_PAGE_SIZE - 1);

  if (error) {
    logFailure("investor_directory_query_failed", error);
    // An empty result for an entitled customer, not `null`: they *have* paid,
    // and telling them they have not because a query failed is the worse of the
    // two wrong answers. The UI renders its error state from `total`/length.
    return { investors: [], total: 0 };
  }

  return { investors: (data as FullRow[]).map(toFull), total: count ?? 0 };
}

/**
 * Which filter values the directory actually holds.
 *
 * This replaced a `getInvestorLocations` that derived a filter list by taking
 * the text after the last comma of each free-text location. That worked for the
 * "City, State" shape the schema was sketched against, and fell apart on the
 * real dataset, which is "City, State, Country" for most rows, "Delhi,India"
 * for some, and "San Francisco Bay Area" — naming no country at all — for
 * others. It would have offered a filter list mixing "India" and "Germany" with
 * one American metro area. Countries are now resolved once at import into their
 * own column, and this reads that column.
 *
 * The broader job is honesty about the rest of the filters. The vocabulary
 * constants in lib/investors.ts describe what an investor record *can* say; this
 * describes what the dataset *does* say. The imported workbook has no stages and
 * no sectors, so those come back empty and the UI renders no such filters —
 * rather than showing a founder six stage chips that match nothing. The day
 * stage data arrives, the filter appears with no code change.
 *
 * Entitlement-gated like everything else premium: which countries and investor
 * types a directory covers is itself a fact about the dataset, and handing it to
 * someone who has not paid gives away most of what the filters are worth.
 *
 * One query over four small columns rather than four `select distinct` round
 * trips. PostgREST has no DISTINCT, so the alternative is an RPC per facet; at
 * this size reducing in memory is cheaper than four database functions to keep
 * in step with the schema.
 */
export async function getInvestorFacets(userId: string | null): Promise<InvestorFacets> {
  if (!(await hasInvestorDirectoryAccess(userId))) return EMPTY_INVESTOR_FACETS;

  const supabase = createServiceClient();

  /*
   * Paged. PostgREST caps an unbounded select at 1,000 rows and returns the
   * truncated page with no error, so at 1,140 investors this silently computed
   * its facets from 88% of the directory -- a country present only in the tail
   * would have had no filter chip, with nothing anywhere to say why.
   */
  const rows: {
    investor_type: string | null;
    country: string | null;
    investment_stages: string[] | null;
    sectors: string[] | null;
  }[] = [];

  for (let from = 0; ; from += 1000) {
    const page = await supabase
      .from("investors")
      .select("investor_type, country, investment_stages, sectors")
      .eq("is_published", true)
      .range(from, from + 999);

    if (page.error) {
      logFailure("investor_facets_query_failed", page.error);
      return EMPTY_INVESTOR_FACETS;
    }
    rows.push(...(page.data ?? []));
    if ((page.data?.length ?? 0) < 1000) break;
  }

  const types = new Set<string>();
  const countries = new Set<string>();
  const stages = new Set<string>();
  const sectors = new Set<string>();

  for (const row of rows) {
    if (row.investor_type) types.add(row.investor_type);
    if (row.country) countries.add(row.country);
    for (const stage of row.investment_stages ?? []) if (stage) stages.add(stage);
    for (const sector of row.sectors ?? []) if (sector) sectors.add(sector);
  }

  /*
   * Stages and types are ordered by their vocabulary, not alphabetically:
   * "Series A" must not sort above "Seed", and an investor-type list reads best
   * from smallest cheque to largest. Anything present in the data but absent
   * from the vocabulary is appended rather than dropped — the data is the
   * authority on what exists, the constant only on preferred order.
   */
  const ordered = (present: Set<string>, vocabulary: readonly string[]) => [
    ...vocabulary.filter((value) => present.has(value)),
    ...[...present].filter((value) => !vocabulary.includes(value)).sort((a, b) => a.localeCompare(b)),
  ];

  return {
    stages: ordered(stages, INVESTOR_STAGES),
    sectors: ordered(sectors, INVESTOR_SECTORS),
    types: ordered(types, INVESTOR_TYPES),
    countries: [...countries].sort((a, b) => a.localeCompare(b)),
  };
}

// Receipts
// --------

/** One row of a customer's directory purchase history. */
export type InvestorPurchaseRow = {
  id: string;
  status: string;
  amountPaise: number;
  chargedAmount: number | null;
  chargedCurrency: string | null;
  paidAt: string | null;
  createdAt: string;
  /** Dodo payment id of the successful charge, for the customer's records. */
  reference: string | null;
};

/**
 * A customer's own purchases, newest first. Rendered under the directory so
 * someone who has paid can see the record rather than take a success screen's
 * word for it.
 *
 * Service-role with an explicit `user_id` filter. `investor_directory_purchases`
 * has a select-own policy that the user-scoped client would satisfy, but this is
 * called from the same server component that already resolved `userId`, and
 * scoping explicitly makes the authorization visible in this file rather than
 * one migration away.
 */
export async function getUserInvestorPurchases(
  userId: string,
  limit = 5,
): Promise<InvestorPurchaseRow[]> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("investor_directory_purchases")
    .select(
      "id, status, amount, charged_amount, charged_currency, dodo_payment_id, paid_at, created_at",
    )
    .eq("user_id", userId)
    // A failed or cancelled attempt is noise on a receipt list, and unlike the
    // promotion history there is nothing to come back and retry from here — the
    // unlock card is always on the page.
    .in("status", ["paid", "pending", "refunded"])
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    logFailure("investor_purchases_query_failed", error);
    return [];
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    status: row.status,
    amountPaise: Number(row.amount),
    chargedAmount: asAmount(row.charged_amount),
    chargedCurrency: row.charged_currency,
    paidAt: row.paid_at,
    createdAt: row.created_at,
    reference: row.dodo_payment_id,
  }));
}

// Admin
// -----

/** An investor row as the management table renders it, moderation flags kept. */
export type AdminInvestorRow = InvestorFull & {
  isPublished: boolean;
  isFreePreview: boolean;
  sortOrder: number;
};

/**
 * Every investor row, published or not, for /admin/investors.
 *
 * Service-role and unfiltered by design — it is the management view. The
 * authorization is the page's `getIsAdmin()` check plus the same check inside
 * each admin action; this function makes no access decision of its own and must
 * never be called from a path that has not made one.
 */
export async function getAdminInvestorRows(): Promise<AdminInvestorRow[]> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("investors")
    .select(`${FULL_COLUMNS}, is_published, is_free_preview, sort_order`)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });

  if (error) {
    logFailure("admin_investors_query_failed", error);
    return [];
  }

  return (data as (FullRow & {
    is_published: boolean;
    is_free_preview: boolean;
    sort_order: number;
  })[]).map((row) => ({
    ...toFull(row),
    isPublished: row.is_published,
    isFreePreview: row.is_free_preview,
    sortOrder: row.sort_order,
  }));
}
