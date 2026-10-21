import type { MilestoneDraft, ValidatedSubmission } from "./types";

export const MAX_CRITERIA = 5;
export const MAX_EVIDENCE_PATHS = 3;
export const MAX_CRITERION_LENGTH = 400;
export const MAX_PATH_LENGTH = 240;
export const MAX_EVIDENCE_BYTES = 80 * 1024;
export const MAX_TOTAL_EVIDENCE_BYTES = 160 * 1024;

const SHA_PATTERN = /^[a-f0-9]{40}$/i;
const OWNER_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const REPO_PATTERN = /^[A-Za-z0-9._-]{1,100}$/;
const PATH_PATTERN = /^[A-Za-z0-9._/-]+$/;
const BIDI_CONTROL_PATTERN = /[\u202a-\u202e\u2066-\u2069]/;

export class InputValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InputValidationError";
  }
}

function text(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== "string") {
    throw new InputValidationError(`${field} must be text.`);
  }
  const normalized = value.normalize("NFC").trim();
  if (!normalized || normalized.length > maxLength) {
    throw new InputValidationError(`${field} is empty or too long.`);
  }
  if (/\p{Cc}/u.test(normalized)) {
    throw new InputValidationError(`${field} contains a control character.`);
  }
  return normalized;
}

export function parseGitHubRepoUrl(value: unknown): {
  owner: string;
  repo: string;
  canonicalUrl: string;
} {
  const input = text(value, "Repository URL", 200);
  let parsed: URL;
  try {
    parsed = new URL(input);
  } catch {
    throw new InputValidationError("Repository URL must be a full HTTPS GitHub URL.");
  }

  if (parsed.protocol !== "https:" || parsed.hostname !== "github.com" || parsed.port || parsed.username || parsed.password) {
    throw new InputValidationError("Only https://github.com/OWNER/REPO is allowed.");
  }
  if (parsed.search || parsed.hash) {
    throw new InputValidationError("Repository URL cannot include a query or fragment.");
  }
  const segments = parsed.pathname.split("/").filter(Boolean);
  if (segments.length !== 2 || segments.some((segment) => segment === "." || segment === "..")) {
    throw new InputValidationError("Repository URL must contain exactly one owner and repo.");
  }
  const [owner, repo] = segments;
  if (!OWNER_PATTERN.test(owner) || !REPO_PATTERN.test(repo)) {
    throw new InputValidationError("Repository owner or name contains unsupported characters.");
  }
  return { owner, repo, canonicalUrl: `https://github.com/${owner}/${repo}` };
}

export function validateCommitSha(value: unknown): string {
  const sha = text(value, "Commit SHA", 40).toLowerCase();
  if (!SHA_PATTERN.test(sha)) {
    throw new InputValidationError("Commit SHA must be the exact 40-character hexadecimal SHA.");
  }
  return sha;
}

export function validateCriterion(value: unknown, index: number): string {
  const criterion = text(value, `Criterion ${index + 1}`, MAX_CRITERION_LENGTH);
  if (criterion.length < 8 || !/[A-Za-z0-9]/.test(criterion)) {
    throw new InputValidationError(`Criterion ${index + 1} must be specific and testable.`);
  }
  return criterion;
}

export function validateEvidencePath(value: unknown, index: number): string {
  const path = text(value, `Evidence path ${index + 1}`, MAX_PATH_LENGTH);
  if (
    path.startsWith("/") ||
    path.includes("\\") ||
    path.includes("//") ||
    BIDI_CONTROL_PATTERN.test(path) ||
    !PATH_PATTERN.test(path)
  ) {
    throw new InputValidationError(`Evidence path ${index + 1} must be a safe repo-relative path.`);
  }
  const parts = path.split("/");
  if (parts.some((part) => !part || part === "." || part === "..")) {
    throw new InputValidationError(`Evidence path ${index + 1} cannot traverse directories.`);
  }
  return path;
}

export function validateDraft(draft: MilestoneDraft): ValidatedSubmission {
  const title = text(draft.title, "Milestone title", 120);
  if (title.length < 3) {
    throw new InputValidationError("Milestone title must be at least 3 characters.");
  }
  if (!Array.isArray(draft.criteria) || draft.criteria.length < 1 || draft.criteria.length > MAX_CRITERIA) {
    throw new InputValidationError(`Add between 1 and ${MAX_CRITERIA} criteria.`);
  }
  const criteria = draft.criteria.map(validateCriterion);
  const normalizedCriteria = new Set(criteria.map((criterion) => criterion.toLocaleLowerCase()));
  if (normalizedCriteria.size !== criteria.length) {
    throw new InputValidationError("Criteria must be distinct.");
  }
  const repo = parseGitHubRepoUrl(draft.repoUrl);
  const commitSha = validateCommitSha(draft.commitSha);
  if (!Array.isArray(draft.evidencePaths) || draft.evidencePaths.length < 1 || draft.evidencePaths.length > MAX_EVIDENCE_PATHS) {
    throw new InputValidationError(`Add between 1 and ${MAX_EVIDENCE_PATHS} evidence paths.`);
  }
  const evidencePaths = draft.evidencePaths.map(validateEvidencePath);
  if (new Set(evidencePaths).size !== evidencePaths.length) {
    throw new InputValidationError("Evidence paths must be distinct.");
  }
  return {
    title,
    criteria,
    owner: repo.owner,
    repo: repo.repo,
    repoUrl: repo.canonicalUrl,
    commitSha,
    evidencePaths,
  };
}

export function isAllowedGitHubApiUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "api.github.com" && !url.username && !url.password && !url.port;
  } catch {
    return false;
  }
}

export function isAllowedRawGitHubUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "raw.githubusercontent.com" && !url.username && !url.password && !url.port;
  } catch {
    return false;
  }
}
