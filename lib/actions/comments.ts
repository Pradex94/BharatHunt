"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@clerk/nextjs/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getIsAdmin } from "@/lib/admin";
import { ensureProfile } from "@/lib/ensure-profile";
import { moderateComment } from "@/lib/moderation";
import { checkRateLimitByIpAndUser } from "@/lib/rate-limit";

export type CommentFormState = { error?: string } | undefined;

export async function addComment(
  productId: string,
  productSlug: string,
  _prevState: CommentFormState,
  formData: FormData,
): Promise<CommentFormState> {
  const body = String(formData.get("body") ?? "").trim();

  if (!body) {
    return { error: "Comment can't be empty." };
  }
  if (body.length > 500) {
    return { error: "Comments must be 500 characters or fewer." };
  }

  // Comments are reviews of the product, not a paste buffer — see the note
  // above `moderateComment`. Checked before auth so a paste costs nothing.
  const moderation = moderateComment(body);
  if (!moderation.ok) {
    return { error: moderation.message };
  }

  const { userId } = await auth();

  if (!userId) {
    return { error: "You must be logged in to comment." };
  }

  // Checked after auth so the limiter is keyed by identity rather than by IP,
  // and before any database work so a flood costs one Redis INCR.
  const limit = await checkRateLimitByIpAndUser("comment", userId);
  if (!limit.ok) {
    return { error: limit.message };
  }

  const supabase = createClient();

  // profiles.id FK guard — the Clerk webhook may not have created this row.
  try {
    await ensureProfile();
  } catch (profileError) {
    return {
      error:
        profileError instanceof Error ? profileError.message : "Could not prepare your profile.",
    };
  }

  const { error } = await supabase
    .from("comments")
    .insert({ product_id: productId, user_id: userId, body });

  if (error) {
    return { error: error.message };
  }

  const { error: counterError } = await supabase.rpc("increment_product_counter", {
    target_product_id: productId,
    counter_column: "comment_count",
    delta: 1,
  });
  if (counterError) {
    return { error: counterError.message };
  }

  revalidatePath(`/products/${productSlug}`);
}

export type DeleteCommentState = { error?: string } | undefined;

/**
 * Removes a comment: its author tidying up after themselves, or an admin
 * clearing something the gate did not catch.
 *
 * Until this existed there was no way to delete a comment at all — not for the
 * author, not for the owner of the site — so anything that got past
 * `moderateComment` was permanent. A gate without a way to undo its misses is
 * only half a moderation story, and the half that ages badly.
 *
 * Authorisation mirrors `deleteProduct`: admins go through the service-role
 * client and may remove any row, everyone else is scoped to their own by both
 * the `user_id` filter and the RLS policy behind it.
 */
export async function deleteComment(
  commentId: string,
  productId: string,
  productSlug: string,
): Promise<DeleteCommentState> {
  const { userId } = await auth();

  if (!userId) {
    return { error: "You must be logged in to delete a comment." };
  }

  const isAdmin = await getIsAdmin();
  const db = isAdmin ? createServiceClient() : createClient();

  let query = db.from("comments").delete().eq("id", commentId);
  if (!isAdmin) {
    query = query.eq("user_id", userId);
  }

  // `select()` makes the delete report what it removed, so a row RLS silently
  // matched nothing for is told apart from a real deletion.
  const { data: deleted, error } = await query.select("id");

  if (error) {
    return { error: `Couldn't delete that comment: ${error.message}` };
  }
  if (!deleted || deleted.length === 0) {
    return { error: "That comment no longer exists, or it isn't yours to delete." };
  }

  /*
   * The counter is corrected but never allowed to fail the delete: the comment
   * is already gone, and a count that is one too high is a smaller problem than
   * an error message telling the user nothing happened when something did.
   */
  const { error: counterError } = await db.rpc("increment_product_counter", {
    target_product_id: productId,
    counter_column: "comment_count",
    delta: -1,
  });
  if (counterError) {
    console.error(
      `[comments] comment_count not decremented for ${productSlug}: ${counterError.message}`,
    );
  }

  revalidatePath(`/products/${productSlug}`);
}
