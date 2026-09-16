import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { ArrowLeft, Rocket } from "lucide-react";

import { LaunchPlatformManager } from "@/components/admin/launch-platform-manager";
import { Container } from "@/components/ui/container";
import { getIsAdmin } from "@/lib/admin";
import { getAllPlatformRowsAdmin } from "@/services/launch-agent";

export const metadata = {
  title: "Launch platforms admin",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * The Launch Agent platform registry. The page gate decides what renders; every
 * write re-checks admin status in lib/actions/launch-agent-admin.ts.
 */
export default async function AdminLaunchAgentPage() {
  const { userId } = await auth();
  if (!userId) redirect("/login");
  if (!(await getIsAdmin())) redirect("/");

  const rows = await getAllPlatformRowsAdmin();

  return (
    <main className="min-h-dvh bg-background py-10 md:py-14">
      <Container>
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Rocket className="size-5" />
              </span>
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-ink">Launch platforms</h1>
                <p className="text-sm text-muted">The Launch Agent registry · changes apply without a deploy.</p>
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

          {rows === null ? (
            <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              The Launch Agent tables don&apos;t exist yet. Apply <code>supabase/migrations/20260915000000_launch_agent.sql</code>.
            </p>
          ) : (
            <LaunchPlatformManager rows={rows} />
          )}
        </div>
      </Container>
    </main>
  );
}
