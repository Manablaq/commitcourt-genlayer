import type { LocalPreview, PreflightResult, ValidatedSubmission } from "./types";

export function buildLocalPreview(input: ValidatedSubmission, preflight: PreflightResult): LocalPreview {
  return {
    label: "LOCAL PREVIEW",
    verdict: "UNPROVEN",
    explanation: "The pinned commit and evidence files were fetched read-only. This browser preview does not run validator consensus or make a qualitative GenLayer decision.",
    criteria: input.criteria.map((criterion) => ({
      criterion,
      status: "NOT_PROVEN",
      explanation: "Evidence is available for inspection, but source presence alone cannot prove that this criterion is satisfied.",
      citations: preflight.files.map((file) => file.path),
    })),
    generatedAt: new Date().toISOString(),
  };
}
