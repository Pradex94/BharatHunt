import test, { describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { getAgentAudience } from "../lib/agentonboard/config.ts";

describe("AgentOnboard Discovery (auth.md)", () => {
  const authMdPath = path.join(process.cwd(), "public", "auth.md");

  test("public/auth.md exists and is readable", () => {
    assert.ok(fs.existsSync(authMdPath), "public/auth.md must exist");
    const content = fs.readFileSync(authMdPath, "utf-8");
    assert.ok(content.length > 100, "auth.md must not be empty");
  });

  test("contains all required AgentOnboard sections in order", () => {
    const content = fs.readFileSync(authMdPath, "utf-8");

    const audienceIdx = content.indexOf("## Audience");
    const endpointsIdx = content.indexOf("## Endpoints");
    const rejectionsIdx = content.indexOf("## When a request is rejected");

    assert.ok(audienceIdx !== -1, "auth.md must have ## Audience section");
    assert.ok(endpointsIdx !== -1, "auth.md must have ## Endpoints section");
    assert.ok(rejectionsIdx !== -1, "auth.md must have ## When a request is rejected section");

    assert.ok(audienceIdx < endpointsIdx, "## Audience must precede ## Endpoints");
    assert.ok(endpointsIdx < rejectionsIdx, "## Endpoints must precede ## When a request is rejected");
  });

  test("documents all /api/agent endpoints and canonical error codes", () => {
    const content = fs.readFileSync(authMdPath, "utf-8");

    assert.ok(content.includes("POST /api/agent/signup"), "documents signup");
    assert.ok(content.includes("GET /api/agent/products"), "documents products GET");
    assert.ok(content.includes("POST /api/agent/products"), "documents products POST");
    assert.ok(content.includes("POST /api/agent/products/{slug}/upvote"), "documents upvote POST");
    assert.ok(content.includes("DELETE /api/agent/products/{slug}/upvote"), "documents upvote DELETE");
    assert.ok(content.includes("POST /api/agent/products/{slug}/save"), "documents save POST");
    assert.ok(content.includes("DELETE /api/agent/products/{slug}/save"), "documents save DELETE");
    assert.ok(content.includes("GET /api/agent/products/{slug}/comments"), "documents comments GET");
    assert.ok(content.includes("POST /api/agent/products/{slug}/comments"), "documents comments POST");

    assert.ok(content.includes("ACCOUNT_REQUIRED"), "documents ACCOUNT_REQUIRED");
    assert.ok(content.includes("403"), "documents 403 status");
  });
});

describe("AgentOnboard Audience Resolution", () => {
  const originalAudience = process.env.AGENTONBOARD_AUDIENCE;
  const originalSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;

  test("prioritizes AGENTONBOARD_AUDIENCE when present", () => {
    process.env.AGENTONBOARD_AUDIENCE = "custom-test-audience.com";
    assert.equal(getAgentAudience(), "custom-test-audience.com");
  });

  test("falls back to NEXT_PUBLIC_SITE_URL hostname", () => {
    delete process.env.AGENTONBOARD_AUDIENCE;
    process.env.NEXT_PUBLIC_SITE_URL = "https://preview.bharathunt.org/subpath";
    assert.equal(getAgentAudience(), "preview.bharathunt.org");
  });

  test("cleanup environment variables", () => {
    if (originalAudience) process.env.AGENTONBOARD_AUDIENCE = originalAudience;
    else delete process.env.AGENTONBOARD_AUDIENCE;

    if (originalSiteUrl) process.env.NEXT_PUBLIC_SITE_URL = originalSiteUrl;
    else delete process.env.NEXT_PUBLIC_SITE_URL;
  });
});
