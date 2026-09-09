import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { ArrowLeft, Newspaper } from "lucide-react";

import { getIsAdmin } from "@/lib/admin";
import { isAiExtractionEnabled } from "@/lib/funding/ai";
import { Container } from "@/components/ui/container";
import { FundingManager } from "@/components/admin/funding-manager";
import {
  getAdminFundingStats,
  getFundingReviewQueue,
  getFundingSources,
  getPublishedFundingRounds,
  getRecentIngestionRuns,
} from "@/services/funding-admin";

export const metadata = {
  title: "Funding admin",
  robots: { index: false, follow: false },
};

// Reads the signed-in identity and service-role data. Never prerender.
export const dynamic = "force-dynamic";

/**
 * The funding review dashboard.
 *
 * Two gates, in order: signed in, then admin. `getIsAdmin()` is
 * server-authoritative (lib/admin.ts) and this is what decides whether the page
 * renders — but it is not what authorizes the writes. Each action in
 * `lib/actions/funding-admin.ts` re-checks it, because a Server Action is a
 * public endpoint regardless of which page happened to draw the button.
 */
export default async function AdminFundingPage() {
  const { userId } = await auth();
  if (!userId) redirect("/login");
  if (!(await getIsAdmin())) redirect("/");

  const [stats, queue, published, sources, runs] = await Promise.all([
    getAdminFundingStats(),
    getFundingReviewQueue(),
    getPublishedFundingRounds(),
    getFundingSources(),
    getRecentIngestionRuns(),
  ]);

  return (
    <main className="min-h-dvh bg-background py-10 md:py-14">
      <Container>
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Newspaper className="size-5" />
              </span>
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-ink">Funding intelligence</h1>
                <p className="text-sm text-muted">
                  Review extracted rounds · manage sources · trigger ingestion.
                </p>
              </div>
            </div>

            <Link
              href="/admin"
              className="inline-flex min-h-11 items-center gap-2 rounded-md border border-border bg-card px-4 text-sm font-semibold text-ink transition-colors hover:border-primary/30 hover:bg-secondary-bg"
            >
              <ArrowLeft className="size-4" aria-hidden="true" />
              Admin dashboard
            </Link>
          </div>

          <FundingManager
            stats={stats}
            queue={queue}
            published={published}
            sources={sources}
            runs={runs}
            aiEnabled={isAiExtractionEnabled()}
          />
        </div>
      </Container>
    </main>
  );
}
