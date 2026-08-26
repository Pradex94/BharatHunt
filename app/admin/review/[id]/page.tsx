import Link from "next/link";
import { ShieldCheck } from "lucide-react";

import { ReviewActions } from "@/components/admin/review-actions";
import { Container } from "@/components/ui/container";
import { getIsAdmin } from "@/lib/admin";
import { indiaStateName } from "@/lib/india-states";
import { getProductForReview } from "@/lib/review";
import { signReviewToken, verifyReviewToken, type ReviewAction } from "@/lib/review-token";

export const metadata = {
  title: "Review a launch",
  robots: { index: false, follow: false },
};

// Reads a token and the signed-in identity — never prerender, never cache.
export const dynamic = "force-dynamic";

/**
 * Where the Approve / Send back links in the review email land.
 *
 * This page **shows** the decision; it never makes it. A GET must stay
 * side-effect free here, and not out of principle: Gmail, Outlook and every
 * corporate link scanner fetch the URLs in a message before a human sees them,
 * so a link that approved on load would approve every launch automatically. The
 * buttons below are Server Action POSTs, which scanners do not make.
 *
 * Authorisation is the signed token from the mail, or an admin session. Without
 * one of the two the page says nothing about the product — not even that it
 * exists — since the id is in a URL that may be forwarded.
 */
export default async function ReviewLandingPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ action?: string; token?: string }>;
}) {
  const { id } = await params;
  const { action, token } = await searchParams;

  const requested: ReviewAction = action === "reject" ? "reject" : "approve";
  const other: ReviewAction = requested === "approve" ? "reject" : "approve";

  /*
   * Either link proves the same authority. Someone who opened "Send back" and
   * then decides to approve is making the other decision the same mail offered
   * them, so both buttons are live once one token checks out — and both are
   * re-minted below rather than reusing the one in the URL, since a signed link
   * only authorises the action it was signed for.
   */
  const byToken = verifyReviewToken(token, id, requested) || verifyReviewToken(token, id, other);
  const authorised = byToken || (await getIsAdmin());

  if (!authorised) {
    return (
      <Shell heading="This review link isn't valid">
        <p className="text-sm text-body">
          It may have expired — review links last seven days — or it was already used from another
          device. Sign in as an admin and the queue will still have it.
        </p>
        <Link href="/admin" className="text-sm font-semibold text-primary hover:underline">
          Open the review queue →
        </Link>
      </Shell>
    );
  }

  const product = await getProductForReview(id);

  if (!product) {
    return (
      <Shell heading="That product no longer exists">
        <p className="text-sm text-body">It was deleted after the review email went out.</p>
        <Link href="/admin" className="text-sm font-semibold text-primary hover:underline">
          Open the review queue →
        </Link>
      </Shell>
    );
  }

  if (product.status !== "pending") {
    const decided = product.status === "published" ? "already live" : "already back in drafts";
    return (
      <Shell heading={`${product.name} is ${decided}`}>
        <p className="text-sm text-body">
          Someone has reviewed this one — possibly you, from another device. Nothing to do here.
        </p>
        <Link href="/admin" className="text-sm font-semibold text-primary hover:underline">
          Open the review queue →
        </Link>
      </Shell>
    );
  }

  const state = indiaStateName(product.launchState);
  const details: Array<[string, string | null | undefined]> = [
    ["Tagline", product.tagline],
    ["Category", product.category],
    ["Pricing", product.pricingType],
    ["Maker", product.makerName],
    ["Launching from", state],
    ["Website", product.websiteUrl],
    ["GitHub", product.githubUrl],
  ];

  return (
    <Shell heading={product.name}>
      <p className="text-sm text-body">
        Waiting for review. Approving publishes it to the marketplace immediately; sending it back
        returns it to the maker&apos;s drafts with your note.
      </p>

      <dl className="divide-y divide-border border-y border-border">
        {details
          .filter(([, value]) => Boolean(value))
          .map(([label, value]) => (
            <div key={label} className="flex gap-4 py-2.5">
              <dt className="w-32 shrink-0 text-xs text-muted">{label}</dt>
              <dd className="min-w-0 flex-1 text-sm break-words text-ink">
                {/^https?:\/\//i.test(value ?? "") ? (
                  <a
                    href={value ?? "#"}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="text-primary hover:underline"
                  >
                    {value}
                  </a>
                ) : (
                  value
                )}
              </dd>
            </div>
          ))}
      </dl>

      {product.description && (
        <div>
          <p className="mb-1.5 text-xs text-muted">Description</p>
          <p className="rounded-xl bg-secondary-bg p-4 text-sm leading-relaxed whitespace-pre-wrap text-body">
            {product.description}
          </p>
        </div>
      )}

      <ReviewActions
        productId={product.id}
        productName={product.name}
        approveToken={byToken ? signReviewToken(product.id, "approve") : null}
        rejectToken={byToken ? signReviewToken(product.id, "reject") : null}
        size="lg"
      />

      <Link
        href={`/products/${product.slug}/edit`}
        className="text-sm text-muted hover:text-primary"
      >
        Open the full submission →
      </Link>
    </Shell>
  );
}

function Shell({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <main className="min-h-dvh bg-background py-12 md:py-16">
      <Container>
        <div className="mx-auto flex w-full max-w-xl flex-col gap-5">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
              <ShieldCheck className="size-5" />
            </span>
            <h1 className="text-xl font-bold tracking-tight text-ink">{heading}</h1>
          </div>
          {children}
        </div>
      </Container>
    </main>
  );
}
