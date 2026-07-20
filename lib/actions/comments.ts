"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@clerk/nextjs/server";
import { createClient } from "@/lib/supabase/server";

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

  const supabase = createClient();

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
