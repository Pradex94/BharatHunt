import type { NextConfig } from "next";

/**
 * Canonical host: https://bharathunt.org
 *
 * Three hosts were serving the full site with 200s and no redirects —
 * bharathunt.org, www.bharathunt.org and bharat-hunt.vercel.app — which is
 * three crawlable copies competing for the same rankings. These redirects
 * collapse them onto one origin so link equity consolidates.
 *
 * Matched on exact host, so Vercel preview deployments
 * (bharat-hunt-<hash>-<team>.vercel.app) are untouched and stay reachable.
 */
const CANONICAL_HOST = "bharathunt.org";
const DUPLICATE_HOSTS = ["www.bharathunt.org", "bharat-hunt.vercel.app"];

const nextConfig: NextConfig = {
  async redirects() {
    return DUPLICATE_HOSTS.flatMap((host) => [
      /*
       * The root needs its own rule. One "/:path*" rule looks like it covers everything,
       * and on Vercel it did — but on Workers an *empty* match is not substituted, so
       * https://www.bharathunt.org/ redirected to the literal "https://bharathunt.org/:path*"
       * and landed on a 404. Deeper paths were fine; only the bare root broke, which is
       * exactly the URL someone typing "www.bharathunt.org" hits.
       */
      {
        source: "/",
        has: [{ type: "host" as const, value: host }],
        destination: `https://${CANONICAL_HOST}/`,
        permanent: true,
      },
      {
        // ":path+" requires at least one segment, so the empty case never reaches it.
        source: "/:path+",
        has: [{ type: "host" as const, value: host }],
        destination: `https://${CANONICAL_HOST}/:path+`,
        permanent: true, // 301 — tells Google to move the index, not just the user
      },
    ]);
  },
};

export default nextConfig;
