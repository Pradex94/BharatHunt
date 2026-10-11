import { NextResponse } from "next/server";
import { createAgentAccount } from "@agentonboard/sdk";
import {
  getAgentAudience,
  resolveAgentAccount,
  createAgentAccountRecord,
} from "@/lib/agentonboard/auth";

export async function POST(request: Request) {
  const token = request.headers.get("Authorization") ?? "";

  const outcome = await createAgentAccount({
    token,
    audience: getAgentAudience(),
    resolveAccount: resolveAgentAccount,
    createAccount: createAgentAccountRecord,
  });

  if (!outcome.ok) {
    const status = outcome.code === "RESOLVER_ERROR" ? 500 : 401;
    return NextResponse.json(
      { code: outcome.code, error: outcome.error },
      { status },
    );
  }

  return NextResponse.json(
    { user: outcome.user, created: outcome.created },
    { status: outcome.created ? 201 : 200 },
  );
}
