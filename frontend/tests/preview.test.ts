import { describe, expect, it } from "vitest";
import { buildLocalPreview } from "@/lib/preview";
import type { PreflightResult, ValidatedSubmission } from "@/lib/types";

describe("local preview", () => {
  it("never presents source completeness as chain consensus", () => {
    const input = { title: "A title", criteria: ["The feature has a test."], owner: "acme", repo: "project", repoUrl: "https://github.com/acme/project", commitSha: "a".repeat(40), evidencePaths: ["test.ts"] } satisfies ValidatedSubmission;
    const result = { repository: { owner: "acme", name: "project", fullName: "acme/project", htmlUrl: "https://github.com/acme/project", commitSha: input.commitSha, message: "test", author: "Ada", committedAt: null }, files: [{ path: "test.ts", rawUrl: "https://raw.githubusercontent.com/acme/project/a/test.ts", sha256: "a", bytes: 1, contentType: "text/plain", excerpt: "", warnings: [] }], warnings: [], checkedAt: new Date().toISOString() } satisfies PreflightResult;
    const preview = buildLocalPreview(input, result);
    expect(preview.label).toBe("LOCAL PREVIEW");
    expect(preview.verdict).toBe("UNPROVEN");
    expect(preview.criteria[0].status).toBe("NOT_PROVEN");
  });
});
