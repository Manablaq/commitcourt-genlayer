import { describe, expect, it, vi } from "vitest";
import { preflightEvidence } from "@/lib/github";
import type { ValidatedSubmission } from "@/lib/types";

const SHA = "b".repeat(40);
const input: ValidatedSubmission = { title: "Test", criteria: ["The implementation is documented."], owner: "acme", repo: "project", repoUrl: "https://github.com/acme/project", commitSha: SHA, evidencePaths: ["README.md"] };

function response(body: unknown, status = 200, headers: Record<string, string> = { "content-type": "application/json" }) {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers });
}

describe("read-only GitHub preflight", () => {
  it("pins commit metadata, bounds evidence, and returns a checksum", async () => {
    const fetchImpl = vi.fn(async (input: string | URL) => String(input).includes("api.github.com")
      ? response({ sha: SHA.toUpperCase(), html_url: "https://github.com/acme/project/commit/" + SHA, repository: { full_name: "acme/project" }, commit: { message: "docs", author: { name: "Ada", date: "2025-01-01T00:00:00Z" } } })
      : response("hello evidence", 200, { "content-type": "text/plain" }));
    const result = await preflightEvidence(input, fetchImpl);
    expect(result.repository.commitSha).toBe(SHA);
    expect(result.files[0].sha256).toBe("9af4c73b2a919f220f4b008e466b52808a1987122d95ff0f2dde00968e36e844");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("fails closed when the commit SHA does not match", async () => {
    const fetchImpl = vi.fn(async () => response({ sha: "c".repeat(40), commit: {} }));
    await expect(preflightEvidence(input, fetchImpl)).rejects.toMatchObject({ code: "invalid_response", status: 409 });
  });

  it("does not accept oversized or binary evidence", async () => {
    const metadata = response({ sha: SHA, commit: {}, repository: {} });
    const fetchOversized = vi.fn(async (input: string | URL) => String(input).includes("api.github.com") ? metadata : response("x".repeat(80 * 1024 + 1), 200, { "content-type": "text/plain" }));
    await expect(preflightEvidence(input, fetchOversized)).rejects.toMatchObject({ status: 413 });

    const fetchBinary = vi.fn(async (input: string | URL) => String(input).includes("api.github.com") ? response({ sha: SHA, commit: {}, repository: {} }) : new Response(new Uint8Array([0, 1, 2]), { headers: { "content-type": "application/octet-stream" } }));
    await expect(preflightEvidence(input, fetchBinary)).rejects.toMatchObject({ status: 415 });
  });

  it("maps GitHub missing and rate-limited responses without leaking upstream bodies", async () => {
    await expect(preflightEvidence(input, vi.fn(async () => response({ message: "private internal detail" }, 404)))).rejects.toMatchObject({ code: "not_found", status: 404 });
    await expect(preflightEvidence(input, vi.fn(async () => response({ message: "secret rate detail" }, 403)))).rejects.toMatchObject({ code: "rate_limited", status: 429 });
  });
});
