import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { ArrowLeft, Newspaper } from "lucide-react";

import { getIsAdmin } from "@/lib/admin";
import { Container } from "@/components/ui/container";
import { AiNewsManager } from "@/components/admin/ai-news-manager";
import {
  getAiAdminStats,
  getAiIngestionRunsAdmin,
  getAiSourcesAdmin,
  getPendingAiStoriesAdmin,
  getRecentAiArticlesAdmin,
  getRecentAiStoriesAdmin,
} from "@/services/ai-news-admin";

export const metadata = {
  title: "AI news admin",
  robots: { index: false, follow: false },
};

// Reads the signed-in identity and the service-role tables — never prerender.
export const dynamic = "force-dynamic";

/**
 * /admin/ai-news — the AI Trending control room.
 *
 * The gate is here and the gate is server-side: signed out redirects to login,
 * signed in without an admin email redirects home. Everything below reads
 * through the service-role client, which bypasses RLS, so this check is the only
 * thing standing between a visitor and the ingestion configuration — which is
 * why it runs before a single query does.
 *
 * The actions the manager calls each re-check the same thing. That is not
 * redundancy: a Server Action is a public endpoint reachable without ever
 * loading this page.
 */
export default async function AdminAiNewsPage() {
  const { userId } = await auth();
  if (!userId) redirect("/login");
  if (!(await getIsAdmin())) redirect("/");

  const [stats, sources, pending, stories, articles, runs] = await Promise.all([
    getAiAdminStats(),
    getAiSourcesAdmin(),
    getPendingAiStoriesAdmin(),
    getRecentAiStoriesAdmin(),
    getRecentAiArticlesAdmin(),
    getAiIngestionRunsAdmin(),
  ]);

  return (
    <main className="min-h-dvh bg-background py-10 md:py-14">
      <Container className="flex flex-col gap-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Newspaper className="size-5" />
            </span>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-ink">AI news</h1>
              <p className="text-sm text-muted">
                Sources, ingestion, the review queue and the trend ranking behind{" "}
                <Link href="/ai" className="text-primary hover:underline">
                  /ai
                </Link>
                .
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

        <AiNewsManager
          stats={stats}
          sources={sources}
          pending={pending}
          stories={stories}
          articles={articles}
          runs={runs}
        />
      </Container>
    </main>
  );
}
