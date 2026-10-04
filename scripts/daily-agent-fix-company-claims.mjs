// Removes "<Product> is built by <Company>" clauses that Daily 5 wrote into a
// product description when the company does not verifiably belong to the
// product (lib/daily-agent/domain.ts companyNameFits). Dry run by default;
// pass --apply to write. Touches only published Daily 5 products.
//
//   node scripts/daily-agent-fix-company-claims.mjs          # show changes
//   node scripts/daily-agent-fix-company-claims.mjs --apply  # write them
import { readFileSync } from "node:fs";
import { cleanLegalName, companyNameFits } from "../lib/daily-agent/domain.ts";

const apply = process.argv.includes("--apply");
const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((line) => line.includes("=") && !line.startsWith("#"))
    .map((line) => {
      const at = line.indexOf("=");
      return [line.slice(0, at).trim(), line.slice(at + 1).trim().replace(/^"|"$/g, "")];
    }),
);
const base = `${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1`;
const headers = {
  apikey: env.SUPABASE_SERVICE_ROLE_KEY,
  Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
  "Content-Type": "application/json",
};

const response = await fetch(
  `${base}/daily_agent_candidates?select=facts,product:products!daily_agent_candidates_product_id_fkey(id,name,website_url,description,source)&status=eq.published`,
  { headers },
);
const rows = await response.json();
if (!response.ok) throw new Error(JSON.stringify(rows));

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * content.ts writes the clause in three shapes:
 *   "X is built by C, founded by A, based in P."  → "X was founded by A, based in P."
 *   "X is built by C, based in P."                → "X is based in P."
 *   "X is built by C."                            → (sentence removed)
 */
function withoutClaim(description, product, company) {
  const lead = `${escape(product)} is built by ${escape(company)}`;
  return description
    .replace(new RegExp(`${lead}, founded by`), `${product} was founded by`)
    .replace(new RegExp(`${lead}, based in`), `${product} is based in`)
    .replace(new RegExp(`\\s*${lead}\\.`), "")
    .trim();
}

let changes = 0;
for (const row of rows) {
  const product = row.product;
  const company = row.facts?.companyName;
  if (!product || product.source !== "daily_agent" || !company || !product.description) continue;
  const name = cleanLegalName(company);
  if (name && companyNameFits(name, { name: product.name, website: product.website_url })) continue;

  const next = withoutClaim(product.description, product.name, company);
  if (next === product.description) continue;
  changes += 1;

  const sentence = (text, needle) =>
    text.split(/(?<=\.)\s+/).find((part) => part.includes(needle)) ?? "(none)";
  console.log(`\n${product.name} (${product.id})`);
  console.log(`  - ${sentence(product.description, company)}`);
  const replacement = next.split(/(?<=\.)\s+/).find((part) => part.startsWith(`${product.name} was founded`) || part.startsWith(`${product.name} is based`));
  console.log(`  + ${replacement ?? "(sentence removed)"}`);

  if (apply) {
    const write = await fetch(`${base}/products?id=eq.${product.id}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ description: next }),
    });
    console.log(write.ok ? "  written" : `  FAILED ${write.status} ${await write.text()}`);
  }
}
console.log(`\n${changes} description(s) ${apply ? "updated" : "would change (dry run; pass --apply to write)"}.`);
