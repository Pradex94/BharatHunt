/**
 * Prints the search-normaliser function definitions from the search migration.
 *
 *   node scripts/extract-search-functions.mjs > normalisers.sql
 *
 * CI loads these into a throwaway Postgres to check that they still agree with
 * `lib/search.ts` (see `.github/workflows/ci.yml` and `tests/README.md`). Only
 * the three normalisers are wanted: the rest of the migration adds generated
 * columns to `products`/`profiles`, which do not exist in an empty database.
 *
 * **Why a script rather than sed or awk.** Two shell versions of this were
 * wrong before this file existed. `sed -n '28,78p'` silently loads whatever
 * happens to be on those lines, so editing the migration quietly changes what
 * CI tests. Replacing it with an awk range worked locally and then failed on
 * CI, because the YAML carried `\$fn` where the local test had `$fn` -- bash
 * read it as a literal string and matched nothing. Escaping a regex through a
 * YAML block scalar into a double-quoted shell string into awk has too many
 * layers to get right by eye. Here the regex is just a regex, and
 * `tests/extract-search-functions.test.ts` proves it still finds all three.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

export const MIGRATION_PATH = join(
  root,
  "supabase",
  "migrations",
  "20260809120000_product_search.sql",
);

/** The functions the parity check exercises, in dependency order. */
export const FUNCTION_NAMES = ["search_normalize", "search_normalize_array", "search_tokens"];

/**
 * Pull one `create or replace function public.<name>(...) ... $$;` block.
 *
 * Anchored on the function name and terminated by the first line that is
 * exactly `$$;`, which is how every function in this migration closes. Throws
 * rather than returning empty: a missing function means the migration was
 * restructured and CI would otherwise test nothing while reporting success.
 */
export function extractFunction(sql, name) {
  const lines = sql.split(/\r?\n/);
  const start = lines.findIndex((line) =>
    line.startsWith(`create or replace function public.${name}(`),
  );
  if (start === -1) {
    throw new Error(
      `Could not find "create or replace function public.${name}(" in ${MIGRATION_PATH}. ` +
        `If the migration was restructured, update scripts/extract-search-functions.mjs.`,
    );
  }

  const end = lines.findIndex((line, i) => i > start && line.trim() === "$$;");
  if (end === -1) {
    throw new Error(`Found public.${name} but no closing "$$;" after it.`);
  }

  return lines.slice(start, end + 1).join("\n");
}

/** All three, concatenated as loadable SQL. */
export function extractAll(sql = readFileSync(MIGRATION_PATH, "utf8")) {
  return `${FUNCTION_NAMES.map((name) => extractFunction(sql, name)).join("\n\n")}\n`;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.stdout.write(extractAll());
}
