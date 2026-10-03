import { cache } from "react";

import { createClient, createPublicClient } from "@/lib/supabase/server";
import { LIST_SLUG_PATTERN, MIN_PRODUCTS_TO_INDEX_LIST } from "@/lib/lists";
import { INTEL_PRODUCT_COLUMNS } from "@/services/intelligence";
import type { ProductCardProduct } from "@/components/products/product-card";

/**
 * CollectionService, read side. Through the user-scoped client, so RLS decides
 * visibility: a public list is readable by anyone, a private one only by its
 * owner. A private list someone else asks for simply does not exist.
 */

export type ListPage = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  isPublic: boolean;
  ownerId: string;
  ownerName: string;
  updatedAt: string;
  products: ProductCardProduct[];
};

export const getListBySlug = cache(async (slug: string): Promise<ListPage | null> => {
  if (!LIST_SLUG_PATTERN.test(slug)) return null;
  const supabase = createClient();
  const { data, error } = await supabase
    .from("user_lists")
    .select(
      `id, slug, title, description, is_public, owner_id, updated_at,
       owner:profiles!user_lists_owner_id_fkey(display_name, username),
       items:user_list_items(added_at, product:products!inner(${INTEL_PRODUCT_COLUMNS}, status))`,
    )
    .eq("slug", slug)
    .maybeSingle();
  if (error || !data) return null;

  const owner = data.owner as unknown as { display_name: string | null; username: string | null } | null;
  const items = ((data.items ?? []) as unknown as { added_at: string; product: ProductCardProduct & { status?: string } }[])
    .filter((item) => item.product?.status === "published")
    .sort((a, b) => b.added_at.localeCompare(a.added_at));

  return {
    id: data.id,
    slug: data.slug,
    title: data.title,
    description: data.description,
    isPublic: data.is_public,
    ownerId: data.owner_id,
    ownerName: owner?.display_name || owner?.username || "A BharatHunt member",
    updatedAt: data.updated_at,
    products: items.map(({ product }) => {
      const card = { ...product };
      delete card.status;
      return card as ProductCardProduct;
    }),
  };
});

export type MyList = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  isPublic: boolean;
  count: number;
  updatedAt: string;
};

/** A signed-in user's lists for /saved. Uncached — personal data. */
export async function getMyLists(userId: string): Promise<MyList[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("user_lists")
    .select("id, slug, title, description, is_public, updated_at, user_list_items(count)")
    .eq("owner_id", userId)
    .order("updated_at", { ascending: false })
    .limit(50);
  if (error) return [];
  return (data ?? []).map((list) => ({
    id: list.id,
    slug: list.slug,
    title: list.title,
    description: list.description,
    isPublic: list.is_public,
    count: ((list.user_list_items as unknown as { count: number }[] | null)?.[0]?.count) ?? 0,
    updatedAt: list.updated_at,
  }));
}

/**
 * Public collections worth indexing, for the sitemap — the same threshold the
 * list page applies to its own robots tag, so the sitemap never advertises a
 * page that asks not to be indexed. Anon client: only public lists are visible.
 */
export async function getIndexableLists(): Promise<{ slug: string; updatedAt: string }[]> {
  const supabase = createPublicClient();
  const { data, error } = await supabase
    .from("user_lists")
    .select("slug, updated_at, user_list_items(count)")
    .eq("is_public", true)
    .order("updated_at", { ascending: false })
    .limit(1000);
  if (error) return [];
  return (data ?? [])
    .filter((list) => (((list.user_list_items as unknown as { count: number }[] | null)?.[0]?.count) ?? 0) >= MIN_PRODUCTS_TO_INDEX_LIST)
    .map((list) => ({ slug: list.slug, updatedAt: list.updated_at }));
}
