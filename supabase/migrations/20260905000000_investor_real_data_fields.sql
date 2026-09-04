-- Columns the real investor dataset needs, and the grants that keep the paid
-- ones paid.
--
-- Why this exists
-- ---------------
-- 20260904000000 was designed against a schema sketch. The actual dataset
-- (India-Global Investor Data.xlsx, ~1,150 rows across four sheets) carries four
-- fields the table had nowhere to put:
--
--   title       "Founder & Managing Partner", "Angel Investor", "Venture Partner"
--               -- present on 1,062 of 1,151 rows and the single most useful
--               piece of context after the name. Without it a card reads
--               "Abhishek Agarwal / ROCKSTUD CAPITAL" and says nothing about why
--               that person is in an investor directory.
--   phone       ~620 rows. A contact field, and the most sensitive one here.
--   country     Derived, not raw. See the note below.
--   source_key  Import identity, so a re-run updates rather than duplicates.
--
-- And it is worth stating plainly what the dataset does NOT have: no investment
-- stages, no sectors, no cheque sizes, no thesis, no portfolio. Those columns
-- stay, because they are the right shape for this product and can be filled in
-- later, but they are empty for every imported row today. The UI is changed in
-- the same commit to stop advertising filters it cannot serve.
--
-- Idempotent throughout: safe to re-run.

-- 1. The new columns
-- ------------------

alter table public.investors add column if not exists title text;
alter table public.investors add column if not exists phone text;

comment on column public.investors.title is
  'Role at the firm ("Angel Investor", "Venture Partner"). Public: shown in the free preview.';

-- Country, stored separately from `location` rather than parsed at query time.
--
-- `location` is the display string exactly as an admin or an import left it, and
-- it is not a reliable structure: the source data holds "Mumbai, Maharashtra,
-- India", "Delhi,India", "London, England, United Kingdom", "San Francisco Bay
-- Area" (no country at all) and "Mumbai Metropolitan Region" (likewise). The
-- original `getInvestorLocations` grouped on the segment after the last comma,
-- which was right for "City, State" and produces "India" / "United States" /
-- "San Francisco Bay Area" for this data -- a filter list mixing countries with
-- one American metro area.
--
-- So the country is resolved once, at import, by a normaliser that knows the
-- country names and the handful of metro aliases, and is null when it genuinely
-- cannot be determined. A filter reads this column; nothing re-parses a display
-- string per request.
alter table public.investors add column if not exists country text;

comment on column public.investors.country is
  'Normalised country, resolved at import from the free-text location. Null when undeterminable. Drives the location filter; `location` remains the display string.';

create index if not exists investors_country_idx
  on public.investors (country)
  where is_published and country is not null;

-- Import identity.
--
-- The source has no stable id, so re-importing the workbook has to be able to
-- recognise a row it has already loaded. A deterministic key over the sheet plus
-- the row's identifying fields makes the import an upsert instead of an append,
-- which is the difference between fixing a typo in the spreadsheet and having
-- 1,150 duplicates. Null for anything created by hand in /admin/investors.
alter table public.investors add column if not exists source_key text;

-- Not a partial index, and that is deliberate. `where source_key is not null`
-- would be the tidier expression of the intent, but PostgREST's upsert infers
-- its ON CONFLICT target from a unique index, and inference against a partial
-- index only succeeds when the predicate is restated in the statement -- which
-- the client cannot do. A plain unique index infers cleanly, and Postgres
-- already treats NULLs as distinct, so the many hand-authored rows with a null
-- source_key coexist happily under it.
create unique index if not exists investors_source_key_key
  on public.investors (source_key);

comment on column public.investors.source_key is
  'Deterministic key for imported rows, so a re-import updates in place. Null for rows authored in the admin UI.';

-- 2. Grants
-- ---------
-- Since 20260904020000, `anon` and `authenticated` hold *column* grants on this
-- table rather than a table grant -- so a newly added column is unreadable by
-- them until it is named here. That default is the safe one, and this is the
-- migration that has to be explicit about which side of the paywall each new
-- column falls on.

-- Public: shown on the free preview cards.
grant select (title, country) on public.investors to anon, authenticated;

-- `phone` and `source_key` are deliberately NOT granted.
--
-- phone is a contact field and sits with email, linkedin, website and
-- contact_details behind the purchase. source_key is internal bookkeeping that
-- no client has a reason to read.
--
-- Restated rather than assumed, because it is the whole point of this block:
-- adding a column is the moment a paid field can accidentally become a public
-- one, and the only defence is naming the public ones explicitly.
