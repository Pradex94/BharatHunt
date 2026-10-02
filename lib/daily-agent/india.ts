/**
 * India verification: how sure we are that a product is built by an Indian
 * company or team, and the evidence for it.
 *
 * The score is an audit, not a feeling. Each signal kind has a fixed weight,
 * counts once (its strongest instance), and is stored with the literal text
 * that matched and the page it was on — so an admin can check every point of
 * the score against the source.
 *
 * What counts, strongest first
 * ----------------------------
 * - A Corporate Identification Number or a GSTIN: issued by the Indian state,
 *   and each encodes the state of registration.
 * - DPIIT / Startup India recognition.
 * - A postal address with a six-digit PIN next to an Indian city or state.
 * - An Indian legal entity (Private Limited / LLP) named alongside an Indian place.
 * - Third-party coverage that calls it "Bengaluru-based" (from discovery).
 * - Stated location ("headquartered in Pune"), Indian governing law.
 * - Self-declaration ("made in India"), a +91 number.
 *
 * What does not, per the brief: a `.in` domain, INR prices, UPI, an Indian
 * pricing page. Plenty of foreign products localise for India. Those are kept
 * as signals for transparency but capped at a few points *in total*, so no
 * combination of them can come near the threshold.
 *
 * Pure (relative imports only), so `tests/` can pin it.
 */

import { INDIA_STATES } from "../india-states.ts";
import type { IndiaSignal, IndiaSignalKind } from "./types.ts";

export const SIGNAL_WEIGHTS: Record<IndiaSignalKind, number> = {
  cin: 45,
  gstin: 40,
  dpiit: 30,
  address_with_pin: 30,
  legal_entity_india: 25,
  external_coverage: 25,
  stated_location: 20,
  governing_law: 15,
  location_mention: 12,
  self_declared: 12,
  phone: 10,
  in_domain: 2,
  inr_pricing: 2,
  upi: 2,
};

const WEAK_KINDS = new Set<IndiaSignalKind>(["in_domain", "inr_pricing", "upi"]);
/** The most the weak signals can add between them. */
export const WEAK_SIGNAL_CAP = 4;

/** Subtracted when the site states a foreign HQ and offers no hard Indian evidence. */
export const FOREIGN_HQ_PENALTY = 15;

/** Cities, folded to lower case, with their ISO 3166-2:IN state. */
const CITY_STATES: Array<[string, string]> = [
  ["bengaluru", "KA"], ["bangalore", "KA"], ["mysuru", "KA"], ["mysore", "KA"], ["mangaluru", "KA"],
  ["mangalore", "KA"], ["hubli", "KA"], ["belagavi", "KA"], ["mumbai", "MH"], ["navi mumbai", "MH"],
  ["thane", "MH"], ["pune", "MH"], ["nagpur", "MH"], ["nashik", "MH"], ["new delhi", "DL"],
  ["delhi", "DL"], ["gurugram", "HR"], ["gurgaon", "HR"], ["faridabad", "HR"], ["noida", "UP"],
  ["greater noida", "UP"], ["ghaziabad", "UP"], ["lucknow", "UP"], ["kanpur", "UP"], ["varanasi", "UP"],
  ["hyderabad", "TG"], ["secunderabad", "TG"], ["chennai", "TN"], ["coimbatore", "TN"], ["madurai", "TN"],
  ["tiruchirappalli", "TN"], ["kolkata", "WB"], ["ahmedabad", "GJ"], ["gandhinagar", "GJ"], ["surat", "GJ"],
  ["vadodara", "GJ"], ["rajkot", "GJ"], ["jaipur", "RJ"], ["udaipur", "RJ"], ["jodhpur", "RJ"],
  ["kochi", "KL"], ["cochin", "KL"], ["thiruvananthapuram", "KL"], ["trivandrum", "KL"], ["kozhikode", "KL"],
  ["thrissur", "KL"], ["chandigarh", "CH"], ["mohali", "PB"], ["ludhiana", "PB"], ["indore", "MP"],
  ["bhopal", "MP"], ["bhubaneswar", "OR"], ["visakhapatnam", "AP"], ["vijayawada", "AP"], ["patna", "BR"],
  ["ranchi", "JH"], ["dehradun", "UT"], ["guwahati", "AS"], ["raipur", "CT"], ["panaji", "GA"],
  ["srinagar", "JK"], ["jammu", "JK"], ["shimla", "HP"], ["puducherry", "PY"], ["gangtok", "SK"],
  ["shillong", "ML"], ["imphal", "MN"], ["agartala", "TR"], ["aizawl", "MZ"], ["kohima", "NL"],
];

/** RoC state codes in a CIN → our ISO codes. Most are identical; these are not. */
const CIN_STATE_ALIASES: Record<string, string> = { UR: "UT", TS: "TG", OD: "OR", CG: "CT" };

/** The two-digit state prefix of a GSTIN → ISO code. */
const GST_STATE_CODES: Record<string, string> = {
  "01": "JK", "02": "HP", "03": "PB", "04": "CH", "05": "UT", "06": "HR", "07": "DL", "08": "RJ",
  "09": "UP", "10": "BR", "11": "SK", "12": "AR", "13": "NL", "14": "MN", "15": "MZ", "16": "TR",
  "17": "ML", "18": "AS", "19": "WB", "20": "JH", "21": "OR", "22": "CT", "23": "MP", "24": "GJ",
  "26": "DH", "27": "MH", "29": "KA", "30": "GA", "31": "LD", "32": "KL", "33": "TN", "34": "PY",
  "35": "AN", "36": "TG", "37": "AP", "38": "LA",
};

const STATE_NAMES: Array<[string, string]> = INDIA_STATES.map((state) => [
  state.name.toLowerCase(),
  state.code.slice(3),
]);

const PLACE_WORDS: Array<[string, string]> = [...CITY_STATES, ...STATE_NAMES].sort(
  (a, b) => b[0].length - a[0].length,
);

const KNOWN_ISO = new Set(INDIA_STATES.map((state) => state.code.slice(3)));

function iso(code: string | undefined | null): string | null {
  if (!code) return null;
  const upper = (CIN_STATE_ALIASES[code.toUpperCase()] ?? code.toUpperCase()).slice(0, 2);
  return KNOWN_ISO.has(upper) ? `IN-${upper}` : null;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const PLACE_PATTERN = new RegExp(
  `\\b(${PLACE_WORDS.map(([word]) => escapeRegExp(word)).join("|")})\\b`,
  "i",
);

/** The first Indian place named in `text`, with its state. */
export function findIndianPlace(text: string): { place: string; stateCode: string | null } | null {
  const match = PLACE_PATTERN.exec(text);
  if (!match) return null;
  const word = match[1].toLowerCase();
  const state = PLACE_WORDS.find(([candidate]) => candidate === word)?.[1] ?? null;
  return { place: match[1], stateCode: iso(state) };
}

/** A short window of text around `index`, for evidence. */
function around(text: string, index: number, length: number, radius = 70): string {
  const start = Math.max(0, index - radius);
  const end = Math.min(text.length, index + length + radius);
  return `${start > 0 ? "…" : ""}${text.slice(start, end).replace(/\s+/g, " ").trim()}${end < text.length ? "…" : ""}`;
}

export type VerifiedPage = { url: string; text: string };

export type IndiaAssessment = {
  confidence: number;
  signals: IndiaSignal[];
  /** State from the strongest evidence that encodes one (CIN, GSTIN, address). */
  stateCode: string | null;
  city: string | null;
  foreignHeadquarters: boolean;
};

const CIN_PATTERN = /\b([LU])(\d{5})([A-Z]{2})(\d{4})(PTC|PLC|OPC|NPL|FTC|GOI|SGC|ULL|ULT|GAP|GAT)(\d{6})\b/;
const GSTIN_PATTERN = /\b(\d{2})[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]\b/;
const PIN_PATTERN = /\b([1-8]\d{2})\s?(\d{3})\b/g;
const LEGAL_ENTITY_PATTERN =
  /\b([A-Z][A-Za-z0-9&.'\- ]{1,60}?)\s+(Private Limited|Pvt\.?\s?Ltd\.?|Pvt\.? Limited|P\.\s?Ltd\.?|P\.\s?Limited|LLP)(?![A-Za-z])/g;
const DPIIT_PATTERN = /\b(DPIIT[- ]recogni[sz]ed|recogni[sz]ed by DPIIT|Startup India recogni[sz]ed|DIPP\d{3,})/i;
/*
 * Statements about where the *company* is. "Located in" is deliberately not
 * one: on real sites it is as often servers or data ("stored on servers
 * located in India") as the company.
 */
const STATED_LOCATION_PATTERN =
  /\b(?:headquartered|based|registered office|head office|hq)\s*(?:in|at|:)?\s+([A-Z][a-zA-Z]+(?: [A-Z][a-zA-Z]+)?)/g;
const BASED_HYPHEN_PATTERN = /\b([A-Z][a-zA-Z]+)-(?:based|headquartered)\b/g;
const GOVERNING_LAW_PATTERN =
  /\b(?:governed by (?:and construed in accordance with )?the laws of India|courts (?:at|of|in) ([A-Z][a-z]+)[^.]{0,40}India|jurisdiction of (?:the )?courts (?:at|of|in) ([A-Z][a-z]+))/i;
const SELF_DECLARED_PATTERN = /\b(made in india|built in india|proudly indian|made with ❤️? in india|made with love in india|designed in india)\b/i;
const PHONE_PATTERN = /(?:\+91|\(\+91\)|0091)[\s-]?[6-9]\d{4}[\s-]?\d{5}\b/;
const INR_PATTERN = /(₹\s?\d|\bINR\s?\d|\bRs\.?\s?\d)/;
const UPI_PATTERN = /\b(UPI|Razorpay|Paytm|PhonePe|Cashfree)\b/;

/** A non-Indian HQ, stated as an address. */
const FOREIGN_HQ_PATTERN =
  /\b(?:Delaware|Wilmington, DE|San Francisco, CA|Palo Alto|Mountain View, CA|New York, NY|[A-Z][a-z]+, (?:CA|NY|TX|WA|MA|FL|DE) \d{5}|Singapore \d{6}|London [A-Z]{1,2}\d|Dubai, (?:UAE|United Arab Emirates))\b/;

function add(
  found: Map<IndiaSignalKind, IndiaSignal>,
  kind: IndiaSignalKind,
  label: string,
  evidence: string,
  url: string | null,
) {
  if (found.has(kind)) return;
  found.set(kind, { kind, label, weight: SIGNAL_WEIGHTS[kind], evidence: evidence.slice(0, 220), url });
}

/**
 * Reads every page's visible text (plus the host and any discovery evidence)
 * and returns the confidence with its evidence.
 */
export function assessIndia(
  pages: VerifiedPage[],
  host: string,
  discoverySignals: IndiaSignal[] = [],
): IndiaAssessment {
  const found = new Map<IndiaSignalKind, IndiaSignal>();
  let stateCode: string | null = null;
  let stateRank = 0; // higher = stronger evidence for the state
  let city: string | null = null;
  let foreign = false;

  const setState = (code: string | null, rank: number, place?: string | null) => {
    if (code && rank > stateRank) {
      stateCode = code;
      stateRank = rank;
      if (place) city = place;
    }
  };

  for (const signal of discoverySignals) {
    if (!found.has(signal.kind)) found.set(signal.kind, { ...signal, weight: SIGNAL_WEIGHTS[signal.kind] });
    const place = findIndianPlace(signal.evidence);
    if (place) setState(place.stateCode, 1, place.place);
  }

  for (const page of pages) {
    const text = page.text;

    const cin = CIN_PATTERN.exec(text);
    if (cin) {
      add(found, "cin", `Indian company registration number (CIN) ${cin[0]}`, around(text, cin.index, cin[0].length), page.url);
      setState(iso(cin[3]), 5);
    }

    const gstin = GSTIN_PATTERN.exec(text);
    if (gstin) {
      add(found, "gstin", `Indian GST registration ${gstin[0]}`, around(text, gstin.index, gstin[0].length), page.url);
      setState(iso(GST_STATE_CODES[gstin[1]]), 4);
    }

    const dpiit = DPIIT_PATTERN.exec(text);
    if (dpiit) add(found, "dpiit", "Recognised under Startup India (DPIIT)", around(text, dpiit.index, dpiit[0].length), page.url);

    for (const pin of text.matchAll(PIN_PATTERN)) {
      const window = text.slice(Math.max(0, (pin.index ?? 0) - 120), (pin.index ?? 0) + 20);
      const place = findIndianPlace(window);
      if (place || /\bindia\b/i.test(window)) {
        add(
          found,
          "address_with_pin",
          `Postal address in ${place?.place ?? "India"} with PIN ${pin[1]}${pin[2]}`,
          around(text, pin.index ?? 0, pin[0].length, 100),
          page.url,
        );
        setState(place?.stateCode ?? null, 3, place?.place);
        break;
      }
    }

    // Every mention, not just the first: a footer often names the entity once
    // without an address and again, further down, beside it.
    for (const entity of text.matchAll(LEGAL_ENTITY_PATTERN)) {
      const index = entity.index ?? 0;
      // The entity's own name is cut out of the window first, so "BDO India
      // LLP" (someone's auditor) does not vouch for itself with its own "India".
      const window = `${text.slice(Math.max(0, index - 200), index)} ${text.slice(index + entity[0].length, index + entity[0].length + 200)}`;
      const place = findIndianPlace(window);
      if (place || /\bindia\b/i.test(window)) {
        add(found, "legal_entity_india", `Indian legal entity: ${entity[0].trim()}`, around(text, index, entity[0].length), page.url);
        setState(place?.stateCode ?? null, 2, place?.place);
        break;
      }
    }

    for (const pattern of [BASED_HYPHEN_PATTERN, STATED_LOCATION_PATTERN]) {
      for (const match of text.matchAll(pattern)) {
        const place = findIndianPlace(match[1] ?? "");
        if (place || /^india$/i.test(match[1] ?? "")) {
          add(
            found,
            "stated_location",
            `Says it is based in ${place?.place ?? "India"}`,
            around(text, match.index ?? 0, match[0].length),
            page.url,
          );
          setState(place?.stateCode ?? null, 2, place?.place);
          break;
        }
      }
    }

    const law = GOVERNING_LAW_PATTERN.exec(text);
    if (law) {
      const courtCity = law[1] ?? law[2] ?? null;
      const place = courtCity ? findIndianPlace(courtCity) : null;
      if (!courtCity || place) {
        add(found, "governing_law", "Terms are governed by Indian law / courts", around(text, law.index, law[0].length), page.url);
      }
    }

    if (!found.has("location_mention")) {
      const place = findIndianPlace(text);
      if (place) {
        const index = text.toLowerCase().indexOf(place.place.toLowerCase());
        add(found, "location_mention", `Mentions ${place.place}`, around(text, index, place.place.length), page.url);
        setState(place.stateCode, 1, place.place);
      }
    }

    const declared = SELF_DECLARED_PATTERN.exec(text);
    if (declared) add(found, "self_declared", `Says "${declared[0]}"`, around(text, declared.index, declared[0].length), page.url);

    const phone = PHONE_PATTERN.exec(text);
    if (phone) add(found, "phone", "Indian (+91) phone number", around(text, phone.index, phone[0].length, 30), page.url);

    const inr = INR_PATTERN.exec(text);
    if (inr) add(found, "inr_pricing", "Prices in rupees (weak: foreign products do this too)", around(text, inr.index, inr[0].length, 30), page.url);

    const upi = UPI_PATTERN.exec(text);
    if (upi) add(found, "upi", `Mentions ${upi[0]} (weak)`, around(text, upi.index, upi[0].length, 30), page.url);

    if (FOREIGN_HQ_PATTERN.test(text)) foreign = true;
  }

  if (/\.in$/i.test(host)) add(found, "in_domain", "Uses a .in domain (weak)", host, null);

  const signals = [...found.values()].sort((a, b) => b.weight - a.weight);
  const strong = signals.filter((signal) => !WEAK_KINDS.has(signal.kind));
  const weak = signals.filter((signal) => WEAK_KINDS.has(signal.kind));

  let confidence =
    strong.reduce((sum, signal) => sum + signal.weight, 0) +
    Math.min(WEAK_SIGNAL_CAP, weak.reduce((sum, signal) => sum + signal.weight, 0));

  const hard = found.has("cin") || found.has("gstin") || found.has("address_with_pin");
  const foreignHeadquarters = foreign && !hard;
  if (foreignHeadquarters) confidence -= FOREIGN_HQ_PENALTY;

  return {
    confidence: Math.max(0, Math.min(100, Math.round(confidence))),
    signals,
    stateCode,
    city,
    foreignHeadquarters,
  };
}

const PLACE_ALTERNATION = `(?:india|${PLACE_WORDS.map(([word]) => escapeRegExp(word)).join("|")})`;

/*
 * Phrasing about who *built* it, never where it is sold: "launches in India"
 * describes Apple Pay as well as it describes a Pune startup, which is the
 * exact confusion the brief warns about. "<City> startup", "Indian founders",
 * "from Pune" and "based in Pune" describe the maker; "in India" alone
 * describes a market.
 */
const BUILT_BY = new RegExp(
  `\\b(indian[- ](?:startup|company|founders?|team|developers?|engineers?|entrepreneurs?|makers?)|india-based|from ${PLACE_ALTERNATION}|based (?:in|out of) ${PLACE_ALTERNATION}|${PLACE_ALTERNATION}(?:'s)? (?:startup|founders?|team|company))\\b`,
  "i",
);

/**
 * India evidence in discovery text alone (a headline, a funding report, a Show
 * HN post). Used as a cheap pre-filter before anything is fetched, and kept as
 * evidence once the site is verified.
 *
 * `kind` says whose words they are: a news report is third-party coverage
 * (`external_coverage`); a maker's own Show HN post is `self_declared`, and
 * weighs accordingly.
 */
export function discoveryIndiaSignal(
  text: string,
  url: string | null,
  kind: "external_coverage" | "self_declared" = "external_coverage",
): IndiaSignal | null {
  const who = kind === "external_coverage" ? "Third-party coverage" : "The maker's own post";
  const hyphen = /\b([A-Z][a-zA-Z]+)-(?:based|headquartered)\b/.exec(text);
  if (hyphen && findIndianPlace(hyphen[1])) {
    return { kind, label: `${who} calls it ${hyphen[0]}`, weight: SIGNAL_WEIGHTS[kind], evidence: text.slice(0, 220), url };
  }
  const built = BUILT_BY.exec(text);
  if (built) {
    return {
      kind,
      label: `${who} says: "${built[0]}"`,
      weight: SIGNAL_WEIGHTS[kind],
      evidence: text.slice(0, 220),
      url,
    };
  }
  return null;
}
