/* Design system: design.md (Bharat Hunt — orange) · /admin/investors
 *
 * Investor management: the CRUD screen behind the Investor Directory.
 *
 * A sibling of /admin rather than a section on it, for the same reason
 * /promote/checkout is its own route: the admin dashboard is a launch review
 * queue, and bolting a fifteen-field editor onto it would make the page about
 * two unrelated jobs. The link between them is in the header below.
 *
 * The `getIsAdmin()` check here decides what is *rendered*. It is not what
 * authorizes the writes — every action in lib/actions/admin-investors.ts
 * re-checks it server-side, because a Server Action is a public endpoint whether
 * or not a page ever draws a button for it.
 */

import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { ArrowLeft, Building2 } from "lucide-react";

import { getIsAdmin } from "@/lib/admin";
import { getAdminInvestorRows } from "@/services/investors";
import { Container } from "@/components/ui/container";
import { InvestorManager } from "@/components/admin/investor-manager";

export const metadata = {
  title: "Investor management",
  robots: { index: false, follow: false },
};

// Reads the signed-in identity — never prerender.
export const dynamic = "force-dynamic";

export default async function AdminInvestorsPage() {
  const { userId } = await auth();
  if (!userId) {
    redirect("/login");
  }
  if (!(await getIsAdmin())) {
    redirect("/");
  }

  const investors = await getAdminInvestorRows();

  return (
    <main className="min-h-dvh bg-background py-12 md:py-16">
      <Container>
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
          <div>
            <Link
              href="/admin"
              className="inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-primary"
            >
              <ArrowLeft className="size-3.5" aria-hidden="true" />
              Admin dashboard
            </Link>

            <div className="mt-4 flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Building2 className="size-5" />
              </span>
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-ink">Investor management</h1>
                <p className="text-sm text-muted">
                  Add, edit and publish the investors behind{" "}
                  <Link href="/investors" className="text-primary hover:underline">
                    the directory
                  </Link>
                  .
                </p>
              </div>
            </div>
          </div>

          <InvestorManager investors={investors} />
        </div>
      </Container>
    </main>
  );
}
