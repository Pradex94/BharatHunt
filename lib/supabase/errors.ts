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

/**
 * True when the request never reached a verdict — the connection stalled, timed
 * out or was aborted — as opposed to the database answering with a complaint.
 *
 * The distinction matters for writes. A `23505` means the row was rejected and
 * nothing was stored; a transport failure means we do not know, because
 * postgrest-js reports "gave up on the socket" and "the statement failed" in the
 * same `{ error }` shape. A caller that conflates them tells a maker their
 * launch failed when it may be sitting in the table.
 *
 * postgrest-js builds these from the thrown `Error` (`index.cjs`, the
 * `shouldThrowOnError` catch): `message` becomes `"<ErrorName>: <message>"` and
 * `code` is left empty, while every genuine PostgREST/Postgres error carries a
 * code. That pairing — no code, and a message naming a JS error class — is what
 * identifies one.
 */
export function isTransportError(
  error: { code?: string | null; message?: string | null } | null | undefined,
): boolean {
  if (!error) return false;
  if (error.code) return false;
  return /^(AbortError|TimeoutError|TypeError|FetchError|Error):/.test(error.message ?? "");
}
