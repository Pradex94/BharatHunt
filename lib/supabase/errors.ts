/**
 * True when a Supabase/PostgREST error means a referenced column doesn't exist
 * yet — either an unmigrated column (Postgres `42703 undefined_column`) or a
 * stale PostgREST schema cache (`PGRST204`, "Could not find the 'x' column …
 * in the schema cache"). Used to fall back to base columns so reads and writes
 * degrade gracefully if `db/product-launch-fields.sql` hasn't been applied.
 */
export function isMissingColumnError(
  error: { code?: string | null; message?: string | null } | null | undefined,
): boolean {
  if (!error) return false;
  const code = error.code ?? "";
  const message = (error.message ?? "").toLowerCase();
  return (
    code === "42703" ||
    code === "PGRST204" ||
    message.includes("schema cache") ||
    message.includes("does not exist")
  );
}
