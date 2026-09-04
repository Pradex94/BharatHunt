/**
 * Load the investor workbook into Supabase.
 *
 *   node scripts/import-investors.mjs --dry-run
 *   node scripts/import-investors.mjs
 *   node scripts/import-investors.mjs --file "Other Data.xlsx" --retire-samples
 *
 * A script rather than a migration, deliberately. A migration is schema, runs
 * once per database, and is committed; this reads a workbook full of real
 * people's contact details that must never be committed (see .gitignore) and
 * will be re-run every time the spreadsheet is refreshed. Different lifecycles.
 *
 * Idempotent. Every row gets a deterministic `source_key` and the load is an
 * upsert on it, so re-running after fixing a typo in the spreadsheet updates the
 * row in place rather than appending a second copy of the directory.
 *
 * ── The .xlsx is parsed by hand ──────────────────────────────────────────────
 * No `xlsx` / `exceljs` dependency. An .xlsx is a zip of XML, and everything
 * needed to read one is in Node's standard library once you accept writing a
 * small zip reader: `inflateRawSync` plus a scan of the central directory.
 * Adding a parser to the production dependency tree -- for a script that runs on
 * a laptop, in a package family with a long history of parser CVEs -- is a poor
 * trade for the ~70 lines below.
 *
 * ── What this script does NOT invent ─────────────────────────────────────────
 * The workbook has no investment stages, no sectors, no cheque sizes, no thesis
 * and no portfolio. Those stay empty rather than being guessed at. It would be
 * easy to infer "SaaS" from a job title, or a stage from the word "Seed" in a
 * firm's name, and every such guess would be a fabricated claim about a real
 * investor, sold to a founder for money.
 *
 * Read-only against the workbook. Writes only to `public.investors`.
 */

import { readFileSync } from "node:fs";
import { inflateRawSync } from "node:zlib";
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

// ── environment ──────────────────────────────────────────────────────────────

/**
 * A minimal `.env.local` reader, matching scripts/check-dodo-products.mjs.
 * Deliberately not `dotenv`: this repo has no such dependency and a data-loading
 * script is a poor reason to add one to a project that also handles payments.
 */
function loadEnv(path = ".env.local") {
  let text;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return {};
  }
  const env = {};
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).replace(/^export\s+/, "").trim();
    env[key] = trimmed.slice(eq + 1).trim().replace(/^(['"])(.*)\1$/, "$2");
  }
  return env;
}

// ── a very small zip reader ──────────────────────────────────────────────────

/**
 * Read a zip archive into `name -> Buffer`.
 *
 * Walks the central directory rather than scanning for local file signatures.
 * The central directory is the authoritative index and carries each entry's
 * compressed size, which a local header may not when the writer used a data
 * descriptor -- and Excel does. Scanning for `PK\x03\x04` appears to work on
 * most files and then silently truncates on one of them.
 */
function readZip(buffer) {
  // End of central directory: signature 0x06054b50, within the last 64KB+22.
  let eocd = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65558); i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd === -1) throw new Error("not a zip archive (no end-of-central-directory record)");

  const count = buffer.readUInt16LE(eocd + 10);
  let offset = buffer.readUInt32LE(eocd + 16);

  const files = new Map();
  for (let i = 0; i < count; i++) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) break; // central file header
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.toString("utf8", offset + 46, offset + 46 + nameLength);

    // The local header repeats the name and extra fields, and its extra-field
    // length can differ from the central one -- so it must be read here rather
    // than reused.
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const data = buffer.subarray(dataStart, dataStart + compressedSize);

    files.set(name, method === 0 ? Buffer.from(data) : inflateRawSync(data));
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return files;
}

// ── a very small xlsx reader ─────────────────────────────────────────────────

/** Unescape the five XML entities that appear in spreadsheet text. */
function unescapeXml(s) {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, "&"); // last, so "&amp;lt;" does not become "<"
}

/** Every `<t>` run inside one shared-string item, concatenated. */
function textOf(xml) {
  const out = [];
  for (const m of xml.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)) out.push(unescapeXml(m[1]));
  return out.join("");
}

/** `A` -> 0, `AB` -> 27. Column letters to a zero-based index. */
function columnIndex(ref) {
  let n = 0;
  for (const ch of ref.replace(/\d+/g, "")) n = n * 26 + (ch.toUpperCase().charCodeAt(0) - 64);
  return n - 1;
}

function readWorkbook(path) {
  const zip = readZip(readFileSync(path));
  const read = (name) => {
    const buf = zip.get(name);
    if (!buf) throw new Error(`workbook is missing ${name}`);
    return buf.toString("utf8");
  };

  const shared = [];
  if (zip.has("xl/sharedStrings.xml")) {
    const xml = read("xl/sharedStrings.xml");
    for (const m of xml.matchAll(/<si>([\s\S]*?)<\/si>/g)) shared.push(textOf(m[1]));
  }

  const rels = new Map();
  for (const m of read("xl/_rels/workbook.xml.rels").matchAll(
    /<Relationship[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g,
  )) {
    const target = m[2].replace(/^\/?/, "");
    rels.set(m[1], target.startsWith("xl/") ? target : `xl/${target}`);
  }

  const sheets = [];
  for (const m of read("xl/workbook.xml").matchAll(/<sheet[^>]*\/>/g)) {
    const name = /name="([^"]*)"/.exec(m[0])?.[1];
    const rid = /r:id="([^"]*)"/.exec(m[0])?.[1];
    if (name && rid && rels.has(rid)) sheets.push({ name: unescapeXml(name), path: rels.get(rid) });
  }

  return sheets.map(({ name, path: sheetPath }) => {
    const xml = zip.get(sheetPath).toString("utf8");
    const rows = [];
    /*
     * Both patterns spell out the self-closing alternative before the
     * open/close one, and that is not style -- it is a correctness fix.
     *
     * The obvious `<c ([^>]*?)\/?>(?:([\s\S]*?)<\/c>)?` looks like it handles
     * `<c r="B1"/>`, but the trailing group is optional *and* lazy, so on a
     * self-closing cell the regex happily runs past it and matches the *next*
     * cell's `</c>` -- consuming that cell whole. Excel emits a self-closing
     * `<c>` for any styled-but-empty cell, which these sheets are full of, and
     * the symptom was 455 email addresses silently vanishing between the
     * spreadsheet and the parse.
     */
    for (const rowMatch of xml.matchAll(/<row\b[^>]*?(?:\/>|>([\s\S]*?)<\/row>)/g)) {
      const cells = new Map();
      for (const cellMatch of (rowMatch[1] ?? "").matchAll(
        /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g,
      )) {
        const attrs = cellMatch[1];
        const body = cellMatch[2] ?? "";
        const ref = /r="([A-Z]+)\d+"/.exec(attrs)?.[1];
        if (!ref) continue;
        const type = /t="([^"]*)"/.exec(attrs)?.[1];
        let value;
        if (type === "s") {
          const idx = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
          value = idx === undefined ? "" : (shared[Number(idx)] ?? "");
        } else if (type === "inlineStr") {
          value = textOf(body);
        } else {
          value = unescapeXml(/<v>([\s\S]*?)<\/v>/.exec(body)?.[1] ?? "");
        }
        value = String(value).trim();
        if (value) cells.set(columnIndex(ref), value);
      }
      if (cells.size) {
        const width = Math.max(...cells.keys()) + 1;
        rows.push(Array.from({ length: width }, (_, i) => cells.get(i) ?? ""));
      }
    }
    return { name, rows };
  });
}

// ── normalisers ──────────────────────────────────────────────────────────────

const EMAIL_RE = /^[^@\s,;]+@[^@\s,;]+\.[A-Za-z]{2,}$/;

/**
 * The first genuinely valid address in a cell.
 *
 * 41 cells hold two addresses ("work@firm.com, personal@gmail.com") and one
 * holds a template ("[firstname]@indiaquotient.in"). A template is not an
 * address anyone can write to, so it is dropped rather than sold as a contact.
 */
function normaliseEmail(raw) {
  if (!raw) return null;
  for (const part of String(raw).split(/[,;]/)) {
    const candidate = part.trim().toLowerCase();
    if (candidate && !candidate.includes("[") && !candidate.includes("{") && EMAIL_RE.test(candidate)) {
      return candidate.slice(0, 200);
    }
  }
  return null;
}

/**
 * A dialable phone string, or null.
 *
 * 65 cells arrive as scientific notation -- Excel stored "+33 1 44 15 01 11" as
 * the number 3.3144150111e10 -- so those are expanded back to their digits
 * before formatting. A number that survives is only lightly cleaned: reformatting
 * international numbers into a single canonical shape is a good way to corrupt
 * the ones that do not fit the assumption.
 */
function normalisePhone(raw) {
  if (!raw) return null;
  let text = String(raw).trim();
  if (/^\d+(\.\d+)?[eE][+-]?\d+$/.test(text)) {
    const expanded = Number(text);
    if (!Number.isFinite(expanded)) return null;
    text = BigInt(Math.round(expanded)).toString();
  }
  const digits = text.replace(/\D/g, "");
  // Fewer than 7 digits cannot be a phone number; more than 15 breaks E.164 and
  // is almost always two numbers run together.
  if (digits.length < 7 || digits.length > 15) return null;
  return text.replace(/\s+/g, " ").slice(0, 40);
}

/**
 * An absolute https URL, or null.
 *
 * 1,016 of the 1,097 website cells are bare domains ("kotak.com"). The admin
 * action's `url()` validator requires a scheme and would have discarded every
 * one of them, so the scheme is added here. https rather than http: it is 2026,
 * and a directory that links founders over plaintext is worse than one that
 * occasionally 301s.
 */
function normaliseUrl(raw, { requireHost = true } = {}) {
  if (!raw) return null;
  let text = String(raw).trim();
  if (!text || text === "-") return null;
  if (!/^https?:\/\//i.test(text)) text = `https://${text}`;
  try {
    const url = new URL(text);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (requireHost && !url.hostname.includes(".")) return null;
    return url.toString().slice(0, 500);
  } catch {
    return null;
  }
}

/**
 * Countries that appear in the data, plus the metro aliases that appear instead
 * of one.
 *
 * "San Francisco Bay Area" and "Mumbai Metropolitan Region" are real values in
 * the workbook and name no country at all; without these two lines the location
 * filter would list a US metro area beside "Germany" as if they were peers.
 */
const COUNTRY_ALIASES = new Map(
  Object.entries({
    india: "India",
    "united states": "United States",
    usa: "United States",
    us: "United States",
    "united states of america": "United States",
    "united kingdom": "United Kingdom",
    uk: "United Kingdom",
    england: "United Kingdom",
    scotland: "United Kingdom",
    wales: "United Kingdom",
    singapore: "Singapore",
    "united arab emirates": "United Arab Emirates",
    uae: "United Arab Emirates",
    germany: "Germany",
    france: "France",
    canada: "Canada",
    australia: "Australia",
    netherlands: "Netherlands",
    switzerland: "Switzerland",
    spain: "Spain",
    italy: "Italy",
    sweden: "Sweden",
    israel: "Israel",
    japan: "Japan",
    china: "China",
    "hong kong": "Hong Kong",
    indonesia: "Indonesia",
    malaysia: "Malaysia",
    "south africa": "South Africa",
    brazil: "Brazil",
    mexico: "Mexico",
    ireland: "Ireland",
    belgium: "Belgium",
    denmark: "Denmark",
    norway: "Norway",
    finland: "Finland",
    poland: "Poland",
    portugal: "Portugal",
    austria: "Austria",
    "new zealand": "New Zealand",
    "south korea": "South Korea",
    korea: "South Korea",
    vietnam: "Vietnam",
    thailand: "Thailand",
    philippines: "Philippines",
    "sri lanka": "Sri Lanka",
    bangladesh: "Bangladesh",
    nepal: "Nepal",
    qatar: "Qatar",
    "saudi arabia": "Saudi Arabia",
    kenya: "Kenya",
    nigeria: "Nigeria",
    egypt: "Egypt",
    turkey: "Turkey",
    luxembourg: "Luxembourg",
    // Metro areas that stand in for a country in this dataset.
    "san francisco bay area": "United States",
    "greater new york city area": "United States",
    "washington dc-baltimore area": "United States",
    "mumbai metropolitan region": "India",
    "delhi ncr": "India",
    "national capital region": "India",
  }),
);

/**
 * Split a free-text location into a tidy display string and a country.
 *
 * The source is inconsistent -- "Mumbai, Maharashtra, India", "Delhi,India",
 * "Bengaluru Karnataka,India", "London, England, United Kingdom" -- so this
 * normalises whitespace around the separators, then tries the segments from the
 * right for something it recognises as a country. A location it cannot place
 * keeps its display string and gets a null country, which is the honest outcome:
 * the row still renders, it simply does not appear under a country filter.
 */
function normaliseLocation(raw) {
  if (!raw) return { location: null, country: null };
  const parts = String(raw)
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return { location: null, country: null };

  let country = null;
  let consumed = 0;
  for (let i = parts.length - 1; i >= 0; i--) {
    const hit = COUNTRY_ALIASES.get(parts[i].toLowerCase());
    if (hit) {
      country = hit;
      // Only the trailing segment is dropped from the display string; a country
      // name appearing mid-string is left alone.
      if (i === parts.length - 1) consumed = 1;
      break;
    }
  }

  const display = parts.slice(0, parts.length - consumed);
  return {
    location: (display.length ? display.join(", ") : parts.join(", ")).slice(0, 120),
    country,
  };
}

/**
 * Which kind of investor this row is, from the sheet it came from and its title.
 *
 * The vocabulary is lib/investors.ts's `INVESTOR_TYPES`, so the filter chips and
 * the stored values cannot drift. Order matters: the checks run most specific
 * first, because "Corporate Venture Capital" also contains "Venture Capital".
 */
function investorType(sheetName, title) {
  const t = (title ?? "").toLowerCase();
  const s = sheetName.toLowerCase();

  if (/family office/.test(t)) return "Family Office";
  if (/corporate vc|corporate venture|cvc/.test(t)) return "CVC";
  if (/accelerator|incubat/.test(t)) return "Accelerator";
  if (/syndicate/.test(t)) return "Syndicate";
  if (/micro ?vc/.test(t)) return "Micro VC";
  if (/private equity|buyout/.test(t)) return "Private Equity";
  if (/angel/.test(t)) return "Angel";
  if (/venture|vc\b|partner at|general partner|managing partner/.test(t)) return "VC";

  // No usable title: fall back to what the sheet itself asserts.
  if (s.includes("angel")) return "Angel";
  if (s.includes("vc firm")) return "VC";
  return null;
}

// ── sheet mapping ────────────────────────────────────────────────────────────

/**
 * Locate a column by trying header substrings in order.
 *
 * The four sheets disagree about their headers -- "Full Name" / "Company Name" /
 * "Firm Name", "Email" / "Email ID", "Phone Number" / "PhoneNumber" -- so
 * columns are found by matching rather than by fixed position. A fixed index
 * would silently read the wrong column the first time a sheet gains one.
 */
function locate(header, ...candidates) {
  const lower = header.map((h) => h.toLowerCase().trim());
  for (const candidate of candidates) {
    const i = lower.findIndex((h) => h.includes(candidate));
    if (i !== -1) return i;
  }
  return -1;
}

/**
 * `Top VC Firms` names organisations; the other three name people.
 *
 * The distinction is load-bearing for `firm_name`: a person's row puts their
 * employer there, and a firm's row must leave it null or the card reads
 * "Warburg Pincus / Warburg Pincus".
 */
function sheetIsFirms(name) {
  return name.toLowerCase().includes("top vc firms");
}

function buildRecords(sheets) {
  const records = [];
  const skipped = [];

  for (const { name, rows } of sheets) {
    if (rows.length < 2) continue;
    const header = rows[0];
    const idx = {
      name: locate(header, "full name", "company name", "firm name", "name"),
      title: locate(header, "title"),
      company: locate(header, "company", "firm"),
      phone: locate(header, "phone"),
      email: locate(header, "email"),
      location: locate(header, "location"),
      website: locate(header, "website", "application link"),
      linkedin: locate(header, "linkedin"),
    };
    const firmsSheet = sheetIsFirms(name);

    for (const row of rows.slice(1)) {
      const get = (key) => (idx[key] >= 0 && idx[key] < row.length ? row[idx[key]].trim() : "");

      const displayName = get("name");
      if (!displayName || displayName.length > 120) {
        if (displayName) skipped.push({ name, reason: "name too long", value: displayName.slice(0, 40) });
        continue;
      }

      const title = firmsSheet ? "" : get("title");
      // On the firms sheet the "company" column is the name column, so reusing
      // it would duplicate the name onto firm_name.
      const company = firmsSheet ? "" : get("company");
      const { location, country } = normaliseLocation(get("location"));

      records.push({
        source_key: createHash("sha256")
          .update(`${name}|${displayName.toLowerCase()}|${get("email").toLowerCase()}`)
          .digest("hex")
          .slice(0, 32),
        name: displayName,
        firm_name: company && company.toLowerCase() !== displayName.toLowerCase()
          ? company.slice(0, 160)
          : null,
        title: title ? title.slice(0, 200) : null,
        location,
        country,
        investor_type: investorType(name, title),
        email: normaliseEmail(get("email")),
        phone: normalisePhone(get("phone")),
        website: normaliseUrl(get("website")),
        linkedin: normaliseUrl(get("linkedin")),
        // Deliberately empty. See the header note: the workbook carries none of
        // these, and inventing them would be a fabricated claim about a real
        // person sold to a founder for money.
        investment_stages: [],
        sectors: [],
        portfolio: [],
        thesis: null,
        contact_details: null,
        check_size_min_inr: null,
        check_size_max_inr: null,
        /*
         * `is_published`, `is_free_preview` and `is_sample` are deliberately
         * absent from this payload.
         *
         * They are editorial decisions made in /admin/investors, not properties
         * of the spreadsheet. PostgREST's upsert updates exactly the columns it
         * is given, so including them would reset every one of those decisions
         * on each re-import -- which is not theoretical: an earlier version sent
         * `is_free_preview: false` and silently emptied the free preview (and
         * with it the entire public half of /investors) the first time the
         * workbook was reloaded.
         *
         * Omitting them means a *new* row takes the column defaults -- published
         * true, free-preview false, sample false, which is exactly right -- and
         * an *existing* row keeps whatever an admin set.
         */
      });
    }
  }

  // Two rows with the same source_key would make the upsert non-deterministic
  // (Postgres refuses "ON CONFLICT DO UPDATE command cannot affect row a second
  // time"), so the last occurrence wins and the collision is reported.
  const byKey = new Map();
  let collisions = 0;
  for (const record of records) {
    if (byKey.has(record.source_key)) collisions += 1;
    byKey.set(record.source_key, record);
  }

  const { merged, duplicates } = dedupe([...byKey.values()]);
  return { records: merged, skipped, collisions, duplicates };
}

/** How many fields of a record carry a value. The completeness score. */
function filledCount(record) {
  return [
    record.title,
    record.firm_name,
    record.location,
    record.country,
    record.investor_type,
    record.email,
    record.phone,
    record.website,
    record.linkedin,
  ].filter(Boolean).length;
}

/**
 * Collapse the same investor appearing on more than one sheet.
 *
 * The workbook overlaps: 8 people appear twice under the same email address,
 * and another 10 appear twice under the same name with two different addresses
 * (a personal one on the angel list, a fund one on the VC list). `source_key`
 * includes the sheet name, so the upsert alone treats those as different
 * investors -- and a paid directory that lists the same partner twice is
 * exactly the quality problem a buyer notices first.
 *
 * Two passes, strongest key first:
 *   1. email        -- an exact address match is the same person, full stop.
 *   2. name + firm  -- the same person reached at two addresses.
 *
 * Name alone is deliberately NOT a key. "Ajay Gupta" is a common name and two
 * different Ajay Guptas at two different firms are two different investors;
 * merging them would invent a person who does not exist.
 *
 * The surviving row is the most complete one, ties broken by `source_key` so the
 * result does not depend on sheet order or Map iteration. Anything the loser
 * knows and the winner does not is copied across, and a genuinely different
 * second email is preserved in `contact_details` rather than thrown away --
 * losing a working address to tidiness would make the merge a downgrade.
 */
function dedupe(records) {
  const collapse = (list, keyOf) => {
    const groups = new Map();
    for (const record of list) {
      const key = keyOf(record);
      if (!key) {
        groups.set(Symbol(), [record]);
        continue;
      }
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(record);
    }

    const out = [];
    let removed = 0;
    for (const group of groups.values()) {
      if (group.length === 1) {
        out.push(group[0]);
        continue;
      }
      removed += group.length - 1;
      const sorted = [...group].sort(
        (a, b) => filledCount(b) - filledCount(a) || a.source_key.localeCompare(b.source_key),
      );
      const winner = { ...sorted[0] };
      const alternates = new Set();
      for (const loser of sorted.slice(1)) {
        for (const field of [
          "title", "firm_name", "location", "country", "investor_type",
          "email", "phone", "website", "linkedin",
        ]) {
          if (!winner[field] && loser[field]) winner[field] = loser[field];
        }
        if (loser.email && loser.email !== winner.email) alternates.add(loser.email);
      }
      if (alternates.size) {
        winner.contact_details = `Also reachable at ${[...alternates].join(", ")}`.slice(0, 1000);
      }
      out.push(winner);
    }
    return { out, removed };
  };

  const byEmail = collapse(records, (r) => (r.email ? `e:${r.email}` : null));
  const byIdentity = collapse(byEmail.out, (r) =>
    r.firm_name ? `n:${r.name.toLowerCase()}|${r.firm_name.toLowerCase()}` : null,
  );

  /*
   * Third pass: name alone, but only for rows with no firm at all.
   *
   * Those are the organisation rows -- the `Top VC Firms` sheet names funds
   * rather than people -- and the workbook lists five of them twice under two
   * contact addresses ("info@" and "investors@" for the same fund). An exact
   * organisation-name match is a far stronger signal of identity than a person
   * name: two different people are called Ajay Gupta, two different funds are
   * not both called Khosla Ventures.
   *
   * The risk this accepts, stated plainly: if the source has mislabelled a row
   * -- one fund's name against another fund's address -- the merge attaches that
   * wrong address to the survivor as an alternate. It does not create the error,
   * but it does carry it forward more visibly, so a `--dry-run` after a workbook
   * refresh is worth the ten seconds.
   */
  const byOrgName = collapse(byIdentity.out, (r) =>
    r.firm_name ? null : `o:${r.name.toLowerCase()}`,
  );

  return {
    merged: byOrgName.out,
    duplicates: byEmail.removed + byIdentity.removed + byOrgName.removed,
  };
}

// ── main ─────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const option = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback;
};

const file = option("file", "India-Global Investor Data.xlsx");
const dryRun = flag("dry-run");
const retireSamples = flag("retire-samples");

const env = loadEnv();
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY;

console.log(`workbook : ${file}`);
const sheets = readWorkbook(file);
console.log(`sheets   : ${sheets.map((s) => `${s.name} (${s.rows.length - 1})`).join(", ")}`);

const { records, skipped, collisions, duplicates } = buildRecords(sheets);

const withEmail = records.filter((r) => r.email).length;
const withPhone = records.filter((r) => r.phone).length;
const withType = records.filter((r) => r.investor_type).length;
const withCountry = records.filter((r) => r.country).length;
const countries = new Map();
for (const r of records) if (r.country) countries.set(r.country, (countries.get(r.country) ?? 0) + 1);

console.log(`
parsed   : ${records.length} unique investors (${duplicates} duplicates merged, ${collisions} key collisions, ${skipped.length} skipped)
  email      ${withEmail}
  phone      ${withPhone}
  type       ${withType}
  country    ${withCountry}  ->  ${[...countries.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([c, n]) => `${c} ${n}`).join(", ")}
  website    ${records.filter((r) => r.website).length}
  linkedin   ${records.filter((r) => r.linkedin).length}
  stages/sectors/cheque/thesis/portfolio: 0 (not present in the workbook)`);

if (dryRun) {
  console.log("\n--dry-run: nothing written. Sample of three parsed rows:");
  for (const r of records.slice(0, 3)) {
    console.log(
      `  ${r.name} | ${r.title ?? "-"} | ${r.firm_name ?? "-"} | ${r.investor_type ?? "-"} | ${r.location ?? "-"} (${r.country ?? "?"})`,
    );
  }
  process.exit(0);
}

if (!url || !key) {
  console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required to write.");
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

// Chunked, because a single 1,150-row upsert is a large request body and one
// failure loses the whole load. 200 keeps each request small enough to retry by
// hand and small enough to see which chunk failed.
const CHUNK = 200;
let written = 0;
for (let i = 0; i < records.length; i += CHUNK) {
  const chunk = records.slice(i, i + CHUNK);
  const { error } = await supabase.from("investors").upsert(chunk, { onConflict: "source_key" });
  if (error) {
    console.error(`\nchunk ${i / CHUNK + 1} failed: ${error.code ?? ""} ${error.message}`);
    process.exit(1);
  }
  written += chunk.length;
  process.stdout.write(`\rwriting  : ${written}/${records.length}`);
}
console.log(`\nupserted : ${written}`);

if (flag("prune")) {
  /*
   * Delete imported rows the current workbook no longer produces.
   *
   * Without this the load is append-and-update only, so a row that is removed
   * from the spreadsheet -- or, more often, one that a newly added dedupe rule
   * merges away -- lingers in the directory forever. Scoped to
   * `source_key not null`, so anything an admin authored by hand in
   * /admin/investors is never touched.
   */
  const keys = new Set(records.map((r) => r.source_key));

  /*
   * Paged, because PostgREST caps an unbounded select at 1,000 rows and returns
   * that truncated page without an error. The first version of this read 1,000
   * of 1,140 rows, found every one of them in `keys`, and cheerfully reported
   * "nothing stale" while five merged-away duplicates stayed in the directory.
   * A prune that silently under-deletes is worse than no prune, because it looks
   * like it worked.
   */
  const existing = [];
  let error = null;
  for (let from = 0; ; from += 1000) {
    const page = await supabase
      .from("investors")
      .select("id, source_key")
      .not("source_key", "is", null)
      .range(from, from + 999);
    if (page.error) {
      error = page.error;
      break;
    }
    existing.push(...(page.data ?? []));
    if ((page.data?.length ?? 0) < 1000) break;
  }

  if (error) {
    console.error(`prune lookup failed: ${error.message}`);
  } else {
    const stale = existing.filter((row) => !keys.has(row.source_key)).map((row) => row.id);
    if (stale.length) {
      const { error: delError } = await supabase.from("investors").delete().in("id", stale);
      if (delError) console.error(`prune failed: ${delError.message}`);
      else console.log(`pruned   : ${stale.length} rows no longer in the workbook`);
    } else {
      console.log("pruned   : 0 (nothing stale)");
    }
  }
}

if (retireSamples) {
  // The seeded demonstration rows exist so the page has something to render
  // before real data lands. Once it has, they are noise -- and the "Sample data"
  // notice on /investors is driven by their count, so removing them is also what
  // takes the notice down.
  const { error, count } = await supabase
    .from("investors")
    .delete({ count: "exact" })
    .eq("is_sample", true);
  if (error) console.error(`sample cleanup failed: ${error.message}`);
  else console.log(`retired  : ${count ?? 0} sample rows`);
}

const { count: total } = await supabase
  .from("investors")
  .select("id", { count: "exact", head: true })
  .eq("is_published", true);
console.log(`published: ${total ?? "?"} investors now live`);
