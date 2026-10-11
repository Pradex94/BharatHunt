import { NextResponse } from "next/server";
import { requireAgentAccount } from "@agentonboard/sdk/next";
import { getAgentAudience, resolveAgentAccount } from "@/lib/agentonboard/auth";
import { createServiceClient } from "@/lib/supabase/service";
import { moderateComment } from "@/lib/moderation";

export async function GET(
  _request: Request,
  props: { params: Promise<{ slug: string }> },
) {
  const { slug } = await props.params;
  const supabase = createServiceClient();

  const { data: product } = await supabase
    .from("products")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();

  if (!product) {
    return NextResponse.json({ error: "Product not found." }, { status: 404 });
  }

  const { data: comments, error } = await supabase
    .from("comments")
    .select("id, body, created_at, user_id, profiles(username, display_name, avatar_url)")
    .eq("product_id", product.id)
    .order("created_at", { ascending: true })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ comments: comments ?? [] });
}

export async function POST(
  request: Request,
  props: { params: Promise<{ slug: string }> },
) {
  const session = await requireAgentAccount(request, {
    audience: getAgentAudience(),
    resolveAccount: resolveAgentAccount,
  });

  if (!session.ok) {
    return session.response;
  }

  const userId = session.user;
  const { slug } = await props.params;

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body." },
      { status: 400 },
    );
  }

  const content = String(body.content ?? body.body ?? "").trim();
  if (!content) {
    return NextResponse.json(
      { error: "Comment content cannot be empty." },
      { status: 422 },
    );
  }
  if (content.length > 1000) {
    return NextResponse.json(
      { error: "Comments must be 1,000 characters or fewer." },
      { status: 422 },
    );
  }

  const moderation = moderateComment(content);
  if (!moderation.ok) {
    return NextResponse.json(
      { error: moderation.message, code: moderation.code },
      { status: 422 },
    );
  }

  const supabase = createServiceClient();

  const { data: product } = await supabase
    .from("products")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();

  if (!product) {
    return NextResponse.json({ error: "Product not found." }, { status: 404 });
  }

  const { data: comment, error: insertError } = await supabase
    .from("comments")
    .insert({
      product_id: product.id,
      user_id: userId,
      body: content,
    })
    .select("id, body, created_at")
    .single();

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json(
    {
      id: comment.id,
      content: comment.body,
      created_at: comment.created_at,
    },
    { status: 201 },
  );
}
