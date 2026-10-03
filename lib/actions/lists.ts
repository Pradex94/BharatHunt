"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@clerk/nextjs/server";

import { ensureProfile } from "@/lib/ensure-profile";
import { cleanListDescription, cleanListTitle, listSlug } from "@/lib/lists";
import { checkRateLimitByIpAndUser } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";

/**
 * CollectionService, write side. Every write runs through the user-scoped
 * client, so RLS (20261004000000) is what decides ownership — these checks
 * only shape friendly errors. Signed-in only: an anonymous visitor has Save,
 * which lives in the browser; a list is a thing you share, so it needs an owner.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ListSummary = {
  id: string;
  slug: string;
  title: string;
  isPublic: boolean;
  count: number;
  /** Whether the product the menu was opened for is already in this list. */
  contains: boolean;
};

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

async function requireUser(): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  const { userId } = await auth();
  if (!userId) return { ok: false, error: "Sign in to create collections." };
  const limit = await checkRateLimitByIpAndUser("lists", userId);
  if (!limit.ok) return { ok: false, error: limit.message };
  return { ok: true, userId };
}

function friendly(message: string): string {
  if (/up to 50 lists/i.test(message)) return "You can have up to 50 collections.";
  if (/up to 200 products/i.test(message)) return "A collection can hold up to 200 products.";
  return "Something went wrong. Please try again.";
}

/** The signed-in user's lists, newest first — the "Add to collection" menu. */
export async function listMyLists(productId?: string): Promise<ListSummary[]> {
  const { userId } = await auth();
  if (!userId) return [];
  const supabase = createClient();
  const { data, error } = await supabase
    .from("user_lists")
    .select("id, slug, title, is_public, user_list_items(product_id)")
    .eq("owner_id", userId)
    .order("updated_at", { ascending: false })
    .limit(50);
  if (error) return [];
  return (data ?? []).map((list) => {
    const items = (list.user_list_items ?? []) as { product_id: string }[];
    return {
      id: list.id,
      slug: list.slug,
      title: list.title,
      isPublic: list.is_public,
      count: items.length,
      contains: Boolean(productId && items.some((item) => item.product_id === productId)),
    };
  });
}

export async function createList(input: {
  title: string;
  description?: string;
  isPublic?: boolean;
  productId?: string;
}): Promise<Result<{ list: ListSummary }>> {
  const access = await requireUser();
  if (!access.ok) return access;
  const title = cleanListTitle(input.title);
  if (!title) return { ok: false, error: "Give your collection a name." };

  try {
    await ensureProfile();
  } catch {
    return { ok: false, error: "Could not prepare your profile." };
  }

  const supabase = createClient();
  let created: { id: string; slug: string } | null = null;
  // The random suffix makes a collision vanishingly rare; retry anyway.
  for (let attempt = 0; attempt < 3 && !created; attempt += 1) {
    const { data, error } = await supabase
      .from("user_lists")
      .insert({
        owner_id: access.userId,
        title,
        slug: listSlug(title),
        description: cleanListDescription(input.description),
        is_public: Boolean(input.isPublic),
      })
      .select("id, slug")
      .single();
    if (data) created = data;
    else if (error && error.code !== "23505") return { ok: false, error: friendly(error.message) };
  }
  if (!created) return { ok: false, error: "Could not create the collection." };

  let count = 0;
  if (input.productId && UUID.test(input.productId)) {
    const { error } = await supabase.from("user_list_items").insert({ list_id: created.id, product_id: input.productId });
    if (!error) count = 1;
  }

  revalidatePath("/saved");
  return {
    ok: true,
    list: { id: created.id, slug: created.slug, title, isPublic: Boolean(input.isPublic), count, contains: count > 0 },
  };
}

export async function setListMembership(listId: string, productId: string, member: boolean): Promise<Result> {
  const access = await requireUser();
  if (!access.ok) return access;
  if (!UUID.test(listId) || !UUID.test(productId)) return { ok: false, error: "Unknown collection or product." };

  const supabase = createClient();
  const { error } = member
    ? await supabase
        .from("user_list_items")
        .upsert({ list_id: listId, product_id: productId }, { onConflict: "list_id,product_id", ignoreDuplicates: true })
    : await supabase.from("user_list_items").delete().eq("list_id", listId).eq("product_id", productId);
  if (error) return { ok: false, error: friendly(error.message) };
  revalidatePath("/saved");
  return { ok: true };
}

export async function updateList(
  listId: string,
  input: { title?: string; description?: string | null; isPublic?: boolean },
): Promise<Result<{ slug: string }>> {
  const access = await requireUser();
  if (!access.ok) return access;
  if (!UUID.test(listId)) return { ok: false, error: "Unknown collection." };

  const patch: { title?: string; description?: string | null; is_public?: boolean } = {};
  if (input.title !== undefined) {
    const title = cleanListTitle(input.title);
    if (!title) return { ok: false, error: "Give your collection a name." };
    patch.title = title;
  }
  if (input.description !== undefined) patch.description = cleanListDescription(input.description);
  if (input.isPublic !== undefined) patch.is_public = input.isPublic;

  const supabase = createClient();
  const { data, error } = await supabase
    .from("user_lists")
    .update(patch)
    .eq("id", listId)
    .eq("owner_id", access.userId)
    .select("slug")
    .maybeSingle();
  if (error || !data) return { ok: false, error: "Could not update the collection." };
  revalidatePath(`/lists/${data.slug}`);
  revalidatePath("/saved");
  return { ok: true, slug: data.slug };
}

export async function deleteList(listId: string): Promise<Result> {
  const access = await requireUser();
  if (!access.ok) return access;
  if (!UUID.test(listId)) return { ok: false, error: "Unknown collection." };
  const supabase = createClient();
  const { error } = await supabase.from("user_lists").delete().eq("id", listId).eq("owner_id", access.userId);
  if (error) return { ok: false, error: "Could not delete the collection." };
  revalidatePath("/saved");
  return { ok: true };
}
