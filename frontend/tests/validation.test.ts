import { describe, expect, it } from "vitest";
import { InputValidationError, parseGitHubRepoUrl, validateDraft, validateEvidencePath } from "@/lib/validation";

const SHA = "a".repeat(40);

describe("CommitCourt input validation", () => {
  it("accepts a canonical public GitHub repository and normalizes the SHA", () => {
    const result = validateDraft({
      title: "Ship the API",
      criteria: ["The API has a documented health endpoint."],
      repoUrl: "https://github.com/acme/project",
      commitSha: SHA.toUpperCase(),
      evidencePaths: ["src/health.ts"],
    });
    expect(result.repoUrl).toBe("https://github.com/acme/project");
    expect(result.commitSha).toBe(SHA);
  });

  it.each([
    "http://github.com/acme/project",
    "https://github.com/acme/project/tree/main",
    "https://github.com/acme/project?token=secret",
    "https://github.com.evil.example/acme/project",
    "https://user:pass@github.com/acme/project",
  ])("rejects unsafe repository URL %s", (repoUrl) => {
    expect(() => parseGitHubRepoUrl(repoUrl)).toThrow(InputValidationError);
  });

  it.each(["../secret.txt", "/etc/passwd", "src\\secret.ts", "src//file.ts", "src/\u202eevil.ts", "src/./file.ts"])('rejects unsafe evidence path "%s"', (path) => {
    expect(() => validateEvidencePath(path, 0)).toThrow(InputValidationError);
  });

  it("rejects repeated criteria and malformed SHA", () => {
    expect(() => validateDraft({ title: "Valid title", criteria: ["Document the endpoint", "document the endpoint"], repoUrl: "https://github.com/acme/project", commitSha: SHA, evidencePaths: ["README.md"] })).toThrow("distinct");
    expect(() => validateDraft({ title: "Valid title", criteria: ["Document the endpoint"], repoUrl: "https://github.com/acme/project", commitSha: "short", evidencePaths: ["README.md"] })).toThrow("40-character");
  });
});
