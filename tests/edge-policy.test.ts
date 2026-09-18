/**
 * The edge layer's decisions, which run before Next.js on every Worker request.
 *
 * The two ways this file can hurt the site are asymmetric. Calling a real page
 * a probe, or serving a signed-in visitor a cached anonymous page, is a visible
 * bug. Missing a probe, or declining to cache a page, only costs the CPU the
 * request already cost before this layer existed. So most assertions here are
 * about what must NOT be caught.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  canonicalRedirect,
  edgeCacheKey,
  edgeCacheRuleFor,
  freshnessOf,
  isAnonymousRequest,
  isCacheableRequestShape,
  isProbePath,
  isStorableResponse,
  productSlugFromPath,
  routeLabel,
  subrequestKind,
} from "../lib/edge-policy.ts";

const params = (query = "") => new URLSearchParams(query);
const headersOf = (entries: Record<string, string>) => (name: string) => entries[name.toLowerCase()] ?? null;

describe("isProbePath", () => {
  it("catches the paths the 2026-09-18 scanner actually sent", () => {
    for (const path of [
      "/root/%2eaws/config",
      "/*%2eenv%2ewww",
      "/kyc/%2eenv%2estaging",
      "/home/phpinfo%2ephp",
      "/config/backup/debug%2elog",
      "/api/new/config%2eyaml",
      "/src/main/resources/application-test%2eproperties",
      "/wp-json/batch/v1",
      "/xmlrpc.php",
      "/.env",
      "/.git/config",
      "/var/www/html/config/%2eenv",
    ]) {
      assert.equal(isProbePath(path), true, path);
    }
  });

  it("never catches a real route", () => {
    for (const path of [
      "/",
      "/ai",
      "/ai/openai-launches-new-reasoning-model",
      "/products/wp-rocket",
      "/products/sendgrove/opengraph-image",
      "/products/sendgrove/edit",
      "/funding/guides/how-to-raise-a-seed-round",
      "/sitemap.xml",
      "/robots.txt",
      "/favicon.ico",
      "/icon.svg",
      "/.well-known/security.txt",
      "/api/webhooks/clerk",
      "/__clerk/v1/client",
      "/categories/developer-tools",
      "/blog/launch-checklist",
    ]) {
      assert.equal(isProbePath(path), false, path);
    }
  });

  it("treats a malformed escape as a probe rather than throwing", () => {
    assert.equal(isProbePath("/%E0%A4%A"), true);
  });
});

describe("canonicalRedirect", () => {
  it("sends www to the apex, keeping path and query", () => {
    assert.equal(
      canonicalRedirect(new URL("https://www.bharathunt.org/products/x?ref=a")),
      "https://bharathunt.org/products/x?ref=a",
    );
    // The bare root is the case that once 404'd on Workers (see next.config.ts).
    assert.equal(canonicalRedirect(new URL("https://www.bharathunt.org/")), "https://bharathunt.org/");
  });

  it("leaves every other host alone", () => {
    assert.equal(canonicalRedirect(new URL("https://bharathunt.org/")), null);
    assert.equal(canonicalRedirect(new URL("https://cf.bharathunt.org/ai")), null);
  });
});

describe("edgeCacheRuleFor", () => {
  it("caches the public pages that dominate crawler and visitor traffic", () => {
    for (const path of [
      "/",
      "/ai",
      "/ai/some-story",
      "/funding",
      "/funding/some-startup",
      "/funding/guides/some-guide",
      "/marketplace",
      "/products/sendgrove",
      "/products/sendgrove/opengraph-image",
      "/categories/productivity",
      "/collections/free-developer-tools",
      "/blog",
      "/about",
      "/robots.txt",
      "/sitemap.xml",
    ]) {
      assert.notEqual(edgeCacheRuleFor(path, params()), null, path);
    }
  });

  it("never caches a personal, authenticated or write path", () => {
    for (const path of [
      "/submit",
      "/dashboard",
      "/dashboard/launch-agent/sendgrove",
      "/admin",
      "/admin/review/123",
      "/products/sendgrove/edit",
      "/promote/checkout",
      "/login",
      "/signup",
      "/api/launch-agent/platforms",
      "/pipeline-preview",
    ]) {
      assert.equal(edgeCacheRuleFor(path, params()), null, path);
    }
  });

  it("does not cache search results or RSC-by-URL requests", () => {
    assert.equal(edgeCacheRuleFor("/marketplace", params("q=notion")), null);
    assert.equal(edgeCacheRuleFor("/ai", params("_rsc=abc")), null);
    assert.notEqual(edgeCacheRuleFor("/marketplace", params("category=ai&page=2")), null);
  });
});

describe("isCacheableRequestShape", () => {
  it("accepts a plain document GET or HEAD", () => {
    assert.equal(isCacheableRequestShape("GET", headersOf({ accept: "text/html" })), true);
    assert.equal(isCacheableRequestShape("HEAD", headersOf({})), true);
  });

  it("rejects router requests and server actions, whose response depends on headers", () => {
    assert.equal(isCacheableRequestShape("GET", headersOf({ rsc: "1" })), false);
    assert.equal(isCacheableRequestShape("GET", headersOf({ "next-router-prefetch": "1" })), false);
    assert.equal(isCacheableRequestShape("GET", headersOf({ "next-router-segment-prefetch": "/_tree" })), false);
    assert.equal(isCacheableRequestShape("GET", headersOf({ "next-router-state-tree": "%5B%5D" })), false);
    assert.equal(isCacheableRequestShape("POST", headersOf({ "next-action": "abc" })), false);
  });

  it("always lets OpenNext's ISR revalidation reach Next.js", () => {
    // The exact request the DO queue sends: HEAD, no cookies, these headers.
    assert.equal(
      isCacheableRequestShape("HEAD", headersOf({ "x-prerender-revalidate": "abc", "x-isr": "1" })),
      false,
    );
    assert.equal(isCacheableRequestShape("GET", headersOf({ "x-isr": "1" })), false);
  });

  it("respects a hard reload", () => {
    assert.equal(isCacheableRequestShape("GET", headersOf({ "cache-control": "no-cache" })), false);
  });
});

describe("isAnonymousRequest", () => {
  it("treats no cookies, unrelated cookies and a signed-out Clerk browser as anonymous", () => {
    assert.equal(isAnonymousRequest(null, params()), true);
    assert.equal(isAnonymousRequest("_ga=GA1.1.1; bh_consent=all", params()), true);
    assert.equal(isAnonymousRequest("__client_uat=0; _ga=x", params()), true);
    assert.equal(isAnonymousRequest("__client_uat_Abc123=0", params()), true);
  });

  it("bypasses for any sign of a Clerk session, suffixed or not", () => {
    assert.equal(isAnonymousRequest("__session=eyJ", params()), false);
    assert.equal(isAnonymousRequest("_ga=x; __session_Abc123=eyJ", params()), false);
    assert.equal(isAnonymousRequest("__client_uat=1789760050", params()), false);
    assert.equal(isAnonymousRequest("__client_uat_Abc123=1789760050", params()), false);
    assert.equal(isAnonymousRequest("__refresh_Abc123=x", params()), false);
    assert.equal(isAnonymousRequest("__clerk_db_jwt=x", params()), false);
  });

  it("bypasses a Clerk handshake arriving in the query string", () => {
    assert.equal(isAnonymousRequest(null, params("__clerk_handshake=abc")), false);
  });
});

describe("edgeCacheKey", () => {
  it("includes the deployed version, so a deploy never serves the previous build's HTML", () => {
    const url = new URL("https://bharathunt.org/ai");
    assert.notEqual(edgeCacheKey(url, "v1"), edgeCacheKey(url, "v2"));
  });

  it("ignores tracking parameters and parameter order", () => {
    const a = edgeCacheKey(new URL("https://bharathunt.org/marketplace?sort=new&category=ai&utm_source=x"), "v");
    const b = edgeCacheKey(new URL("https://bharathunt.org/marketplace?category=ai&sort=new&fbclid=y"), "v");
    assert.equal(a, b);
  });

  it("keeps parameters that change the page", () => {
    const a = edgeCacheKey(new URL("https://bharathunt.org/ai?page=2"), "v");
    const b = edgeCacheKey(new URL("https://bharathunt.org/ai?page=3"), "v");
    assert.notEqual(a, b);
  });
});

describe("freshnessOf", () => {
  const rule = { fresh: 120, stale: 3600 };
  it("walks fresh → stale → expired", () => {
    assert.equal(freshnessOf(0, 60_000, rule), "fresh");
    assert.equal(freshnessOf(0, 121_000, rule), "stale");
    assert.equal(freshnessOf(0, 3_721_000, rule), "expired");
  });
  it("treats a missing or future timestamp as expired", () => {
    assert.equal(freshnessOf(Number.NaN, 0, rule), "expired");
    assert.equal(freshnessOf(10_000, 0, rule), "expired");
  });
});

describe("isStorableResponse", () => {
  it("stores a plain 200 page, image, sitemap or robots file", () => {
    assert.equal(isStorableResponse(200, headersOf({ "content-type": "text/html; charset=utf-8" })), true);
    assert.equal(isStorableResponse(200, headersOf({ "content-type": "image/png" })), true);
    assert.equal(isStorableResponse(200, headersOf({ "content-type": "application/xml" })), true);
    assert.equal(isStorableResponse(200, headersOf({ "content-type": "text/plain" })), true);
  });
  it("never stores an error, a redirect, a per-browser response or an RSC payload", () => {
    assert.equal(isStorableResponse(404, headersOf({ "content-type": "text/html" })), false);
    assert.equal(isStorableResponse(307, headersOf({ "content-type": "text/html" })), false);
    assert.equal(
      isStorableResponse(200, headersOf({ "content-type": "text/html", "set-cookie": "a=b" })),
      false,
    );
    assert.equal(isStorableResponse(200, headersOf({ "content-type": "text/x-component" })), false);
  });
});

describe("labels", () => {
  it("collapses slugs so logs group by route", () => {
    assert.equal(routeLabel("/products/sendgrove"), "/products/:slug");
    assert.equal(routeLabel("/products/sendgrove/opengraph-image"), "/products/:slug/opengraph-image");
    assert.equal(routeLabel("/ai/some-story"), "/ai/:slug");
    assert.equal(routeLabel("/ai"), "/ai");
    assert.equal(routeLabel("/"), "/");
    assert.equal(routeLabel("/admin/review/abc"), "/admin/review/*");
  });

  it("extracts a product slug only from the product page itself", () => {
    assert.equal(productSlugFromPath("/products/sendgrove"), "sendgrove");
    assert.equal(productSlugFromPath("/products/sendgrove/edit"), null);
    assert.equal(productSlugFromPath("/products/sendgrove/opengraph-image"), null);
  });

  it("classifies subrequests by host", () => {
    assert.equal(subrequestKind("kzchsimhvxlocgvispom.supabase.co"), "db");
    assert.equal(subrequestKind("apn1-x.upstash.io"), "cache");
    assert.equal(subrequestKind("api.clerk.com"), "auth");
    assert.equal(subrequestKind("api.anthropic.com"), "ai");
    assert.equal(subrequestKind("techcrunch.com"), "external");
  });
});
