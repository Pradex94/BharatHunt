import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Daily5View, dailyHeading, formatDailyDate } from "@/components/daily5/daily5-view";
import { SITE_NAME } from "@/lib/constants";
import { getDaily5Dates, getDaily5Day } from "@/services/daily-agent";

/**
 * /daily-5/<YYYY-MM-DD> — one day's list, permanently.
 *
 * Only dates with at least one published pick exist: anything else is a 404,
 * so the site never generates the thousands of empty date pages the brief
 * warns about. Pages render on first request and refresh every ten minutes
 * (ISR), plus an on-demand revalidation when a pick for that date is published.
 */

export const revalidate = 600;
export const dynamicParams = true;

export async function generateStaticParams() {
  // Rendered on demand; nothing to prebuild at deploy time.
  return [];
}

type PageProps = { params: Promise<{ date: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { date } = await params;
  const day = await getDaily5Day(date);
  if (!day) return { title: "Daily 5 list not found", robots: { index: false, follow: true } };
  const pretty = formatDailyDate(day.date);
  const title = `${dailyHeading(day.products.length)} — Daily 5, ${pretty}`;
  const description = `${SITE_NAME} Daily 5 for ${pretty}: ${day.products.map((product) => product.name).join(", ")}. Indian products, each checked against its own website.`;
  const path = `/daily-5/${day.date}`;
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: { title, description, url: path, type: "article" },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function Daily5DatePage({ params }: PageProps) {
  const { date } = await params;
  const day = await getDaily5Day(date);
  if (!day) notFound();
  const dates = await getDaily5Dates();
  return (
    <Daily5View
      day={day}
      dates={dates}
      path={`/daily-5/${day.date}`}
      crumbs={[
        { name: "Home", path: "/" },
        { name: "Daily 5", path: "/daily-5" },
        { name: formatDailyDate(day.date), path: `/daily-5/${day.date}` },
      ]}
    />
  );
}
