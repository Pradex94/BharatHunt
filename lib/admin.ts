import "server-only";

import { currentUser } from "@clerk/nextjs/server";

import { ADMIN_EMAILS } from "@/lib/constants";

/** A Clerk user record, or anything carrying the email list we check against. */
type UserWithEmails = { emailAddresses: { emailAddress: string }[] } | null;

/**
 * The admin test itself — pure, so a caller that already holds the Clerk user
 * record can reuse it instead of paying for another `currentUser()`.
 *
 * `currentUser()` is an HTTP call to Clerk's Backend API on *every* invocation
 * (see node_modules/@clerk/nextjs/.../currentUser.js — no request memo), so a
 * server action that needs both the admin flag and the user's email would
 * otherwise make the same round trip twice on its critical path.
 */
export function isAdminUser(user: UserWithEmails): boolean {
  if (!user) return false;
  return user.emailAddresses.some((address) =>
    ADMIN_EMAILS.includes(address.emailAddress.toLowerCase()),
  );
}

/**
 * Server-authoritative admin check: true when the signed-in Clerk user owns any
 * email in ADMIN_EMAILS. This is the real gate for admin-only pages and the
 * privileged Server Actions (limit bypass, moderating any product). Never trust
 * a client-side admin flag for authorization.
 */
export async function getIsAdmin(): Promise<boolean> {
  return isAdminUser(await currentUser());
}
