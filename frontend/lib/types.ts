export type CriterionStatus = "MET" | "PARTIAL" | "NOT_PROVEN";
export type Verdict = "COMPLETE" | "PARTIAL" | "UNPROVEN";

export type MilestoneDraft = {
  title: string;
  criteria: string[];
  repoUrl: string;
  commitSha: string;
  evidencePaths: string[];
};

export type ValidatedSubmission = {
  title: string;
  criteria: string[];
  owner: string;
  repo: string;
  repoUrl: string;
  commitSha: string;
  evidencePaths: string[];
};

export type EvidenceFile = {
  path: string;
  rawUrl: string;
  sha256: string;
  bytes: number;
  contentType: string;
  excerpt: string;
  warnings: string[];
};

export type PreflightResult = {
  repository: {
    owner: string;
    name: string;
    fullName: string;
    htmlUrl: string;
    commitSha: string;
    message: string;
    author: string;
    committedAt: string | null;
  };
  files: EvidenceFile[];
  warnings: string[];
  checkedAt: string;
};

export type PreviewCriterion = {
  criterion: string;
  status: CriterionStatus;
  explanation: string;
  citations: string[];
};

export type LocalPreview = {
  verdict: "UNPROVEN";
  label: "LOCAL PREVIEW";
  explanation: string;
  criteria: PreviewCriterion[];
  generatedAt: string;
};

export type HistoryItem = {
  id: string;
  title: string;
  repoUrl: string;
  commitSha: string;
  evidenceCount: number;
  verdict: Verdict;
  savedAt: string;
};
