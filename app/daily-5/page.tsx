import type { Metadata } from "next";
import Link from "next/link";

import { Daily5View, dailyHeading, formatDailyDate } from "@/components/daily5/daily5-view";
import { Container } from "@/components/ui/container";
import { SITE_NAME } from "@/lib/constants";
import { getDaily5Dates, getDaily5Day } from "@/services/daily-agent";

/**
 * /daily-5 — the most recent day with published Daily 5 picks.
 *
 * Prerendered and refreshed every ten minutes, plus an on-demand revalidation
 * whenever a pick is published (lib/daily-agent/publish.ts). Before the first
 * list exists the page says so and asks not to be indexed, so the index never
 * holds an empty shell.
 */

export const dynamic = "force-static";
export const revalidate = 600;

async function latest() {
  const dates = await getDaily5Dates();
  const day = dates[0] ? await getDaily5Day(dates[0]) : null;
  return { dates, day };
}

export async function generateMetadata(): Promise<Metadata> {
  const { day } = await latest();
  if (!day) {
    return {
      title: "BharatHunt Daily 5",
      description: "Indian products worth discovering, picked and verified every day.",
      alternates: { canonical: "/daily-5" },
      robots: { index: false, follow: true },
    };
  }
  const title = `${dailyHeading(day.products.length)} — Daily 5, ${formatDailyDate(day.date)}`;
  const description = `${day.products.map((product) => product.name).join(", ")}: Indian products picked by ${SITE_NAME} Daily 5, each checked against its own website.`;
  return {
    title,
    description,
    alternates: { canonical: "/daily-5" },
    openGraph: { title, description, url: "/daily-5", type: "website" },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function Daily5Page() {
  const { dates, day } = await latest();
  if (!day) {
    return (
      <main className="min-h-dvh bg-background py-16">
        <Container>
          <div className="mx-auto max-w-2xl text-center">
            <h1 className="text-3xl font-bold tracking-tight text-ink">BharatHunt Daily 5</h1>
            <p className="mt-3 text-body">
              Indian products worth discovering, picked and verified every day. The first list is on its way.
            </p>
            <Link href="/marketplace" className="btn-gradient mt-6 inline-flex min-h-11 items-center rounded-md px-5 text-sm font-semibold text-white">
              Explore the marketplace
            </Link>
          </div>
        </Container>
      </main>
    );
  }
  return (
    <Daily5View
      day={day}
      dates={dates}
      path="/daily-5"
      crumbs={[
        { name: "Home", path: "/" },
        { name: "Daily 5", path: "/daily-5" },
      ]}
    />
  );
}
