import "server-only";

import { currentUser } from "@clerk/nextjs/server";

import { ADMIN_EMAILS } from "@/lib/constants";

/**
 * Server-authoritative admin check: true when the signed-in Clerk user owns any
 * email in ADMIN_EMAILS. This is the real gate for admin-only pages and the
 * privileged Server Actions (limit bypass, moderating any product). Never trust
 * a client-side admin flag for authorization.
 */
export async function getIsAdmin(): Promise<boolean> {
  const user = await currentUser();
  if (!user) return false;
  return user.emailAddresses.some((address) =>
    ADMIN_EMAILS.includes(address.emailAddress.toLowerCase()),
  );
}
