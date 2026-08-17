"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@clerk/nextjs/server";
import { createClient } from "@/lib/supabase/server";
import { ensureProfile } from "@/lib/ensure-profile";
import { checkRateLimitByUser } from "@/lib/rate-limit";

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

  const { userId } = await auth();

  if (!userId) {
    return { error: "You must be logged in to comment." };
  }

  // Checked after auth so the limiter is keyed by identity rather than by IP,
  // and before any database work so a flood costs one Redis INCR.
  const limit = await checkRateLimitByUser("comment", userId);
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
