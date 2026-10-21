import { NextResponse } from "next/server";
import { preflightEvidence, GitHubPreflightError } from "@/lib/github";
import { InputValidationError, validateDraft } from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > 32_000) {
    return NextResponse.json({ error: "Request is too large." }, { status: 413 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }
  try {
    const input = validateDraft(body as Parameters<typeof validateDraft>[0]);
    const result = await preflightEvidence(input);
    return NextResponse.json({ input, result }, { status: 200 });
  } catch (error) {
    if (error instanceof InputValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof GitHubPreflightError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    return NextResponse.json({ error: "Read-only preflight failed without exposing upstream details." }, { status: 502 });
  }
}
