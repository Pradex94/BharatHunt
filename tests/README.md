# Tests

```bash
npm test              # everything below that needs no database
npm run test:fixtures # regenerate the generated fixtures after changing lib/search.ts
```

Node's built-in runner, no test framework installed. Node 24 strips TypeScript
natively, so `tests/*.test.ts` imports `lib/*.ts` directly and the suite costs
zero dependencies.

## The search-normalisation contract

`lib/search.ts` and `public.search_normalize()` /
`public.search_tokens()` (in
`supabase/migrations/20260809120000_product_search.sql`) are two hand-written
implementations of the same rule: lowercase, NFKD, strip everything outside
`[a-z0-9]`. That rule is what makes a product stored as `GrowEasy` findable by
someone typing `grow easy`.

Nothing in the build catches it when the two drift apart. Nothing *can* --
they are in different languages, on different sides of the network. When they
drift, search does not error. It just quietly stops matching, and the first
person to notice is a maker whose product stopped showing up.

So the contract is a shared corpus and three artifacts:

| File | Written by | Role |
|---|---|---|
| `tests/fixtures/search-corpus.json` | you, by hand | the inputs worth checking |
| `tests/fixtures/search-golden.json` | generator | what TypeScript produces |
| `supabase/tests/search-normalize-parity.sql` | generator | asserts Postgres produces the same |

`npm test` covers the TypeScript half and fails if either generated file is
stale, so you cannot change the normaliser and leave the SQL script describing
the old rules. It does **not** check Postgres -- that half needs a database and
`npm test` must run without one.

### Changing the normaliser

1. Edit `lib/search.ts` **and** the matching SQL function in a new migration.
2. `npm run test:fixtures` to regenerate.
3. `npm test` -- confirms the TypeScript side and that fixtures are current.
4. Run the SQL half (below) -- this is the step that actually proves parity.
5. Commit the corpus, both generated files, and the migration together.

Skipping step 4 means you have tested TypeScript against TypeScript.

### Running the SQL half

Against any database with the search migration applied:

```bash
psql "$DATABASE_URL" -f supabase/tests/search-normalize-parity.sql
```

Silence plus a `parity OK` notice means the implementations agree. A
divergence raises an exception listing *every* mismatching case, not just the
first, so one run tells you the whole story.

Throwaway database, no Supabase project needed:

```bash
docker run -d --name bh-parity -e POSTGRES_PASSWORD=postgres -p 55432:5432 postgres:17
# the migration expects an `extensions` schema and the anon/authenticated roles
psql "postgresql://postgres:postgres@localhost:55432/postgres" \
  -c "create schema if not exists extensions;" \
  -c "create extension if not exists pg_trgm schema extensions;" \
  -c "create role anon; create role authenticated;"
psql "postgresql://postgres:postgres@localhost:55432/postgres" \
  -f supabase/migrations/20260809120000_product_search.sql \
  -f supabase/migrations/20260809130000_search_suggestion_threshold.sql \
  -f supabase/tests/search-normalize-parity.sql
docker rm -f bh-parity
```

### Why the corpus looks like that

Most entries are there because they broke something or could:

- **`GrowEasy` / `grow easy` / `grow-easy`** -- the requirement the search
  architecture exists to satisfy.
- **`Ⅻ` (U+216B)** and **`①②③`** -- both caused parity failures at 139/140
  while the token splitter was being matched to Postgres's `[:alnum:]`. `\p{Nl}`
  is in; `\p{No}` is out.
- **`Café` twice** -- once precomposed (U+00E9), once decomposed (`e` +
  U+0301). They must normalise identically, which is the entire reason NFKD
  runs before the strip.
- **U+00A0, U+200B** -- invisible characters that survive a copy-paste from a
  website into the search box.
- **Devanagari, Kannada, CJK** -- these normalise to the empty string. See the
  caveat below; the test records the behaviour rather than endorsing it.

Non-ASCII in the generated `.sql` is `\uXXXX`-escaped so an editor or a
`core.autocrlf` setting cannot silently re-encode a codepoint in the one file
whose whole job is comparing codepoints.

### Known behaviour, recorded not endorsed

- **Non-Latin scripts normalise to empty.** A product named `दुकान` gets
  `search_name = ''` and is unreachable by name. For an India-focused
  marketplace that is a real gap, not a rounding error. Fixing it means
  transliteration or a separate index, which is a product decision, not a bug
  fix -- so the corpus pins the current behaviour and this note flags it.
- **`normalizeSearchText` and `searchTokens` disagree on `\p{No}`.** `①②③`
  normalises to `123` but yields no tokens, because the splitter matches
  Postgres's `[:alnum:]` while the normaliser matches NFKD. Both sides of the
  network agree with each other, which is what parity means, so this is
  consistent rather than correct.
- **`ß` is dropped, not expanded.** `Straße` normalises to `strae`; NFKD does
  not turn `ß` into `ss`. `Strasse` and `Straße` therefore do not match.
