/**
 * India's states and union territories, with the coordinates needed to plot
 * them on the dot-matrix map in `components/landing/india-map.tsx`.
 *
 * Framework-agnostic and client-safe (see CLAUDE.md) — the launch form imports
 * it in the browser, the map imports it on the server.
 *
 * `code` is ISO 3166-2:IN. `x`/`y` are already projected into that map's
 * `0 0 1000 1137` viewBox, so plotting is a lookup rather than trigonometry.
 * Both the names and the label points come from Natural Earth's 1:10m admin-1
 * dataset (public domain) — not hand-typed — and every point was verified by
 * point-in-polygon against the committed outline. If the map's projection ever
 * changes, these coordinates have to be regenerated with it.
 */

export type IndiaStateKind = "state" | "ut";

export type IndiaState = {
  /** ISO 3166-2:IN, e.g. "IN-KA". */
  code: string;
  name: string;
  kind: IndiaStateKind;
  /** Label point, projected into the india-map viewBox. */
  x: number;
  y: number;
};

/**
 * All 28 states + 8 union territories, alphabetical.
 *
 * Note: Natural Earth types Himachal Pradesh as a union territory, which is
 * wrong — it has been a state since 1971 — so `kind` is corrected here (the
 * dataset would otherwise yield 9 UTs).
 *
 * Lakshadweep's islands are below the map's sliver threshold, so a marker
 * there sits on open water rather than on land. That only shows if someone
 * actually launches from Lakshadweep; the position is still correct.
 */
export const INDIA_STATES: readonly IndiaState[] = [
  { code: "IN-AN", name: "Andaman and Nicobar", kind: "ut", x: 878.6, y: 1133.9 },
  { code: "IN-AP", name: "Andhra Pradesh", kind: "state", x: 379.1, y: 795.9 },
  { code: "IN-AR", name: "Arunachal Pradesh", kind: "state", x: 901.8, y: 352.9 },
  { code: "IN-AS", name: "Assam", kind: "state", x: 851.3, y: 433 },
  { code: "IN-BR", name: "Bihar", kind: "state", x: 605.3, y: 457.5 },
  { code: "IN-CH", name: "Chandigarh", kind: "ut", x: 295.2, y: 260.7 },
  { code: "IN-CT", name: "Chhattisgarh", kind: "state", x: 485.2, y: 602.9 },
  { code: "IN-DH", name: "Dadra & Nagar Haveli and Daman & Diu", kind: "ut", x: 167.4, y: 662.3 },
  { code: "IN-DL", name: "Delhi", kind: "ut", x: 306.3, y: 341.8 },
  { code: "IN-GA", name: "Goa", kind: "state", x: 200.5, y: 837.6 },
  { code: "IN-GJ", name: "Gujarat", kind: "state", x: 108.2, y: 567.8 },
  { code: "IN-HR", name: "Haryana", kind: "state", x: 278.4, y: 325.7 },
  { code: "IN-HP", name: "Himachal Pradesh", kind: "state", x: 313.3, y: 223.4 },
  { code: "IN-JH", name: "Jharkhand", kind: "state", x: 579.5, y: 539.1 },
  { code: "IN-JK", name: "Jammu and Kashmir", kind: "ut", x: 291.1, y: 130 },
  { code: "IN-KA", name: "Karnataka", kind: "state", x: 257.7, y: 871.1 },
  { code: "IN-KL", name: "Kerala", kind: "state", x: 287.1, y: 1011.5 },
  { code: "IN-LA", name: "Ladakh", kind: "ut", x: 319.9, y: 127.6 },
  { code: "IN-LD", name: "Lakshadweep", kind: "ut", x: 158.9, y: 981.6 },
  { code: "IN-MH", name: "Maharashtra", kind: "state", x: 250.8, y: 688.2 },
  { code: "IN-ML", name: "Meghalaya", kind: "state", x: 793.4, y: 465.3 },
  { code: "IN-MN", name: "Manipur", kind: "state", x: 880.5, y: 493.2 },
  { code: "IN-MP", name: "Madhya Pradesh", kind: "state", x: 352.1, y: 560.8 },
  { code: "IN-MZ", name: "Mizoram", kind: "state", x: 846.1, y: 551 },
  { code: "IN-NL", name: "Nagaland", kind: "state", x: 905.2, y: 441.4 },
  { code: "IN-OR", name: "Odisha", kind: "state", x: 558.1, y: 646.2 },
  { code: "IN-PB", name: "Punjab", kind: "state", x: 247.8, y: 249.5 },
  { code: "IN-PY", name: "Puducherry", kind: "ut", x: 398.5, y: 992.1 },
  { code: "IN-RJ", name: "Rajasthan", kind: "state", x: 195.7, y: 417 },
  { code: "IN-SK", name: "Sikkim", kind: "state", x: 695.6, y: 385.3 },
  { code: "IN-TG", name: "Telangana", kind: "state", x: 353.7, y: 762.1 },
  { code: "IN-TN", name: "Tamil Nadu", kind: "state", x: 346.9, y: 988.9 },
  { code: "IN-TR", name: "Tripura", kind: "state", x: 807.1, y: 526.7 },
  { code: "IN-UP", name: "Uttar Pradesh", kind: "state", x: 440.3, y: 418 },
  { code: "IN-UT", name: "Uttarakhand", kind: "state", x: 381.7, y: 288 },
  { code: "IN-WB", name: "West Bengal", kind: "state", x: 671, y: 556.6 },
];

const BY_CODE: ReadonlyMap<string, IndiaState> = new Map(
  INDIA_STATES.map((entry) => [entry.code, entry]),
);

/**
 * Subdivision codes that geo-IP providers emit which aren't ISO 3166-2.
 *
 * These are the states that were renamed or split after the ISO code was
 * assigned, so databases disagree: ISO kept CT/OR/UT while most Indian-facing
 * sources use the post-rename CG/OD/UK. Without this, launches from
 * Chhattisgarh, Odisha, Uttarakhand and Telangana would silently resolve to
 * nothing — four of the codes most likely to actually turn up.
 */
const CODE_ALIASES: Readonly<Record<string, string>> = {
  CG: "IN-CT", // Chhattisgarh
  OD: "IN-OR", // Odisha (ISO still uses the pre-2011 "Orissa" code)
  UK: "IN-UT", // Uttarakhand (ISO still uses the pre-2007 "Uttaranchal" code)
  TS: "IN-TG", // Telangana
  DN: "IN-DH", // Dadra & Nagar Haveli, merged into IN-DH in 2020
  DD: "IN-DH", // Daman & Diu, merged into IN-DH in 2020
};

const BY_NAME: ReadonlyMap<string, IndiaState> = new Map(
  INDIA_STATES.map((entry) => [entry.name.toLowerCase(), entry]),
);

export function getIndiaState(code: string | null | undefined): IndiaState | null {
  return code ? (BY_CODE.get(code) ?? null) : null;
}

/** Display name for a stored code, falling back to the code itself. */
export function indiaStateName(code: string | null | undefined): string | null {
  return getIndiaState(code)?.name ?? null;
}

export function isIndiaStateCode(value: string | null | undefined): boolean {
  return Boolean(value && BY_CODE.has(value));
}

/**
 * Turn whatever a geo-IP provider reports into an ISO 3166-2:IN code.
 *
 * Accepts a bare subdivision code ("KA"), an already-qualified one ("IN-KA"),
 * a post-rename alias ("OD"), or the state's name — providers vary, and some
 * send names when they have no code. Returns null for anything unrecognised
 * rather than guessing.
 */
export function normalizeIndiaStateCode(region: string | null | undefined): string | null {
  const raw = (region ?? "").trim();
  if (!raw) return null;

  const upper = raw.toUpperCase();
  const bare = upper.startsWith("IN-") ? upper.slice(3) : upper;

  if (BY_CODE.has(`IN-${bare}`)) return `IN-${bare}`;
  if (CODE_ALIASES[bare]) return CODE_ALIASES[bare];

  return BY_NAME.get(raw.toLowerCase())?.code ?? null;
}
