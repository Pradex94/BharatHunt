/**
 * Who may act on a campaign — the one authorization rule of this feature, kept
 * pure so its rejection paths are tested (tests/launch-agent-ownership.test.ts)
 * rather than taken on trust.
 *
 * The product id a client sends is only a lookup key. The server loads the
 * product itself and compares its `creator_id` with the session's Clerk user id;
 * this function is that comparison. Admins may *read* a campaign for support,
 * but only the owner may change one — an admin editing someone's launch copy
 * would put words in a maker's mouth.
 */

export type CampaignAccessDecision =
  | { ok: true; role: "owner" | "admin" }
  | { ok: false; status: 401 | 403 | 404; error: string };

export function authorizeCampaignAccess(input: {
  userId: string | null;
  product: { creatorId: string; status: string } | null;
  isAdmin?: boolean;
  intent: "read" | "write";
}): CampaignAccessDecision {
  if (!input.userId) return { ok: false, status: 401, error: "Please log in." };
  // Not found and not yours are the same answer, so ids cannot be probed.
  if (!input.product) return { ok: false, status: 404, error: "That product was not found." };
  const isOwner = input.product.creatorId === input.userId;
  if (!isOwner) {
    if (input.isAdmin && input.intent === "read") return { ok: true, role: "admin" };
    return { ok: false, status: 404, error: "That product was not found." };
  }
  if (input.product.status !== "published") {
    return { ok: false, status: 403, error: "Launch Agent starts once your product is live on BharatHunt." };
  }
  return { ok: true, role: "owner" };
}
