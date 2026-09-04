"use server";

/**
 * Investor CRUD for /admin/investors.
 *
 * Every export of a `"use server"` module is a public HTTP endpoint that anyone
 * can post to, and these four write the product's own dataset — so each one
 * re-establishes identity *and* re-checks admin status as its first two
 * statements. The page's `getIsAdmin()` guard decides what is rendered; it is
 * not what authorizes anything. A non-admin who posts one of these action ids
 * directly gets the same refusal a logged-out caller does.
 *
 * `getIsAdmin()` is server-authoritative (lib/admin.ts): it reads the Clerk user
 * record and compares emails against `ADMIN_EMAILS`. The `ADMIN_EMAILS` constant
 * is also read on the client to decide whether to draw the Admin link, which is
 * cosmetic only — this is the gate.
 */

import { revalidatePath } from "next/cache";
import { auth } from "@clerk/nextjs/server";

import { getIsAdmin } from "@/lib/admin";
import { createServiceClient } from "@/lib/supabase/service";
import { audit } from "@/lib/investor-access";

export type AdminInvestorResult = { ok: true; id: string } | { ok: false; error: string };

/** Identity + admin, in that order. Returns the caller's id or a refusal. */
async function requireAdmin(): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  const { userId } = await auth();
  if (!userId) return { ok: false, error: "Please log in." };
  if (!(await getIsAdmin())) {
    audit("admin_investor_denied", { userId });
    return { ok: false, error: "You do not have access to manage investors." };
  }
  return { ok: true, userId };
}

/**
 * The shape an investor form submits, before it is trusted.
 *
 * A plain object rather than `FormData`, because the arrays (stages, sectors,
 * portfolio) are the interesting part and `FormData` flattens them into repeated
 * keys that then have to be reassembled. The client sends JSON-ish values; every
 * one of them is re-derived below.
 */
export type InvestorInput = {
  name?: unknown;
  firmName?: unknown;
  title?: unknown;
  phone?: unknown;
  country?: unknown;
  logoUrl?: unknown;
  website?: unknown;
  location?: unknown;
  investorType?: unknown;
  stages?: unknown;
  sectors?: unknown;
  portfolio?: unknown;
  checkSizeMinInr?: unknown;
  checkSizeMaxInr?: unknown;
  thesis?: unknown;
  email?: unknown;
  linkedin?: unknown;
  contactDetails?: unknown;
  isFreePreview?: unknown;
  isPublished?: unknown;
  sortOrder?: unknown;
};

/** A bounded string, or null. Empty and whitespace-only both become null. */
function text(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().slice(0, max);
  return trimmed || null;
}

/**
 * A bounded array of bounded strings.
 *
 * Accepts an array or a comma-separated string, because the admin form uses a
 * plain text input for these — typing "SaaS, FinTech, AI" is faster than
 * operating three multi-selects, and this is a tool for one person.
 *
 * Capped at 20 entries and 60 characters each: these render as badges, and a
 * row with 400 tags would be a broken card rather than a rich profile.
 */
function tags(value: unknown): string[] {
  const raw = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",")
      : [];

  const seen = new Set<string>();
  for (const entry of raw) {
    if (typeof entry !== "string") continue;
    const trimmed = entry.trim().slice(0, 60);
    if (trimmed) seen.add(trimmed);
    if (seen.size >= 20) break;
  }
  return [...seen];
}

/**
 * A non-negative whole-rupee figure, or null.
 *
 * Capped at ₹10,000 crore. Not a real business rule — it is the "someone typed
 * their phone number into the cheque-size field" bound, which is worth catching
 * before it renders as "₹98,76,54,32,10Cr" on a card.
 */
function rupees(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100_000_000_000) return null;
  return Math.trunc(parsed);
}

/**
 * An http(s) URL, or null.
 *
 * Parsed rather than regex-matched, and the protocol is checked explicitly: a
 * `javascript:` value stored here would be rendered into an `href` on the detail
 * panel, which is a stored XSS with extra steps. React escapes text, not URL
 * schemes.
 */
function url(value: unknown): string | null {
  const raw = text(value, 500);
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

/** Turns validated input into a row. `name` is the only required field. */
function toRow(input: InvestorInput) {
  const min = rupees(input.checkSizeMinInr);
  const max = rupees(input.checkSizeMaxInr);

  return {
    name: text(input.name, 120),
    firm_name: text(input.firmName, 160),
    title: text(input.title, 200),
    // Free text, not a parsed number: these are international, and the import
    // normaliser (scripts/import-investors.mjs) keeps them as recorded for the
    // same reason — reformatting a number you guessed the shape of corrupts it.
    phone: text(input.phone, 40),
    // Drives the country filter. Free text so an admin is not blocked by a
    // vocabulary list, and `getInvestorFacets` derives the filter options from
    // whatever is actually stored.
    country: text(input.country, 60),
    logo_url: url(input.logoUrl),
    website: url(input.website),
    location: text(input.location, 120),
    investor_type: text(input.investorType, 60),
    investment_stages: tags(input.stages),
    sectors: tags(input.sectors),
    portfolio: tags(input.portfolio),
    check_size_min_inr: min,
    // The table has a CHECK that max >= min, and a violation there would surface
    // to the admin as an opaque Postgres error. Swapping them is what the person
    // meant, and it keeps the constraint the last line of defence rather than
    // the error message.
    check_size_max_inr: max !== null && min !== null && max < min ? min : max,
    thesis: text(input.thesis, 2000),
    email: text(input.email, 200),
    linkedin: url(input.linkedin),
    contact_details: text(input.contactDetails, 1000),
    is_free_preview: input.isFreePreview === true,
    is_published: input.isPublished !== false,
    sort_order: Number.isFinite(Number(input.sortOrder)) ? Math.trunc(Number(input.sortOrder)) : 0,
    // Anything written through this form is real data an admin typed. Clearing
    // the flag is what makes the "sample data" notice on /investors disappear by
    // itself as the seeds are replaced, with nothing to remember to switch off.
    is_sample: false,
  };
}

export async function createInvestor(input: InvestorInput): Promise<AdminInvestorResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;

  const row = toRow(input);
  if (!row.name) return { ok: false, error: "An investor needs a name." };

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("investors")
    .insert({ ...row, name: row.name })
    .select("id")
    .single();

  if (error || !data) {
    audit("admin_investor_create_failed", { code: error?.code ?? null });
    return { ok: false, error: "Could not save that investor." };
  }

  audit("admin_investor_created", { investorId: data.id, adminId: gate.userId });
  revalidatePath("/admin/investors");
  revalidatePath("/investors");
  return { ok: true, id: data.id };
}

export async function updateInvestor(
  id: string,
  input: InvestorInput,
): Promise<AdminInvestorResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;

  if (!/^[0-9a-f-]{36}$/i.test(String(id))) {
    return { ok: false, error: "Unknown investor." };
  }

  const row = toRow(input);
  if (!row.name) return { ok: false, error: "An investor needs a name." };

  const supabase = createServiceClient();
  const { error } = await supabase
    .from("investors")
    .update({ ...row, name: row.name })
    .eq("id", id);

  if (error) {
    audit("admin_investor_update_failed", { investorId: id, code: error.code ?? null });
    return { ok: false, error: "Could not save that investor." };
  }

  audit("admin_investor_updated", { investorId: id, adminId: gate.userId });
  revalidatePath("/admin/investors");
  revalidatePath("/investors");
  return { ok: true, id };
}

export async function deleteInvestor(id: string): Promise<AdminInvestorResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;

  if (!/^[0-9a-f-]{36}$/i.test(String(id))) {
    return { ok: false, error: "Unknown investor." };
  }

  const supabase = createServiceClient();
  const { error } = await supabase.from("investors").delete().eq("id", id);

  if (error) {
    audit("admin_investor_delete_failed", { investorId: id, code: error.code ?? null });
    return { ok: false, error: "Could not delete that investor." };
  }

  audit("admin_investor_deleted", { investorId: id, adminId: gate.userId });
  revalidatePath("/admin/investors");
  revalidatePath("/investors");
  return { ok: true, id };
}

/**
 * Flip one boolean on one row.
 *
 * A separate action from `updateInvestor` because the admin table's toggles are
 * one-click, and routing them through the full form action would mean sending
 * every field back to re-save two — which is also how a half-loaded form
 * silently blanks a thesis.
 */
export async function setInvestorFlag(
  id: string,
  flag: "is_published" | "is_free_preview",
  value: boolean,
): Promise<AdminInvestorResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;

  if (!/^[0-9a-f-]{36}$/i.test(String(id))) {
    return { ok: false, error: "Unknown investor." };
  }

  /*
   * The patch is built by an explicit branch rather than `{ [flag]: value }`.
   *
   * A computed key widens to `string`, which drops the update out of the
   * generated `Database` types entirely — so a typo'd column name would compile
   * and fail at runtime as a PostgREST error. Two literal branches keep the
   * column names checked against the schema, and they are also the whole
   * validation: a `flag` outside the pair reaches neither.
   */
  const patch =
    flag === "is_published"
      ? { is_published: Boolean(value) }
      : flag === "is_free_preview"
        ? { is_free_preview: Boolean(value) }
        : null;

  if (!patch) return { ok: false, error: "Unknown field." };

  const supabase = createServiceClient();
  const { error } = await supabase.from("investors").update(patch).eq("id", id);

  if (error) {
    audit("admin_investor_flag_failed", { investorId: id, code: error.code ?? null });
    return { ok: false, error: "Could not update that investor." };
  }

  audit("admin_investor_flag_set", { investorId: id, flag, value: Boolean(value) });
  revalidatePath("/admin/investors");
  revalidatePath("/investors");
  return { ok: true, id };
}
