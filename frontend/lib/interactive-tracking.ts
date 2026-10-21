import type { GenLayerTransaction } from "genlayer-js/types";

export const INTERACTIVE_SUBMISSION_KEY = "commitcourt.interactive.submission.v1";
export const INTERACTIVE_SUBMISSION_HISTORY_KEY = "commitcourt.interactive.submission-history.v1";

export type SubmissionPhase =
  | "prepared"
  | "submitting"
  | "submitted"
  | "pending"
  | "decided-accepted"
  | "decided-undetermined"
  | "decided-rejected"
  | "finalized-success"
  | "finalized-error"
  | "timeout"
  | "rejected"
  | "ambiguous";

export type StoredSubmission = {
  version: 1;
  assessmentId: string;
  args: [string, string, string, string, string];
  phase: SubmissionPhase;
  txHash?: string;
  updatedAt: string;
  error?: string;
  result?: unknown;
  readbackError?: string;
};

export function isSubmissionTerminal(record: StoredSubmission | null) {
  return Boolean(record && [
    "submitting",
    "submitted",
    "pending",
    "decided-accepted",
    "decided-undetermined",
    "decided-rejected",
    "timeout",
    "ambiguous",
  ].includes(record.phase));
}

export function isFinalizedPhase(phase: SubmissionPhase | undefined): phase is "finalized-success" | "finalized-error" {
  return phase === "finalized-success" || phase === "finalized-error";
}

export function classifyTransaction(transaction: Pick<GenLayerTransaction, "statusName" | "txExecutionResultName" | "lifecycle">): SubmissionPhase {
  const status = String(transaction.statusName ?? "").toUpperCase();
  const execution = String(transaction.txExecutionResultName ?? "").toUpperCase();
  if (status === "FINALIZED" || transaction.lifecycle?.state === "finalized") {
    return execution === "FINISHED_WITH_RETURN" ? "finalized-success" : "finalized-error";
  }
  if (status === "ACCEPTED" || (transaction.lifecycle?.state === "decided" && transaction.lifecycle.outcome === "accepted")) {
    return "decided-accepted";
  }
  if (status === "REJECTED") {
    return "decided-rejected";
  }
  if (status === "UNDETERMINED" || (transaction.lifecycle?.state === "decided" && transaction.lifecycle.outcome === "undetermined")) {
    return "decided-undetermined";
  }
  return "pending";
}

export function safeLoadSubmission(storage: Pick<Storage, "getItem">): StoredSubmission | null {
  try {
    const raw = storage.getItem(INTERACTIVE_SUBMISSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredSubmission>;
    if (parsed.version !== 1 || typeof parsed.assessmentId !== "string" || !Array.isArray(parsed.args) || parsed.args.length !== 5 || typeof parsed.phase !== "string") return null;
    return parsed as StoredSubmission;
  } catch {
    return null;
  }
}

export function saveSubmission(storage: Pick<Storage, "setItem">, record: StoredSubmission) {
  storage.setItem(INTERACTIVE_SUBMISSION_KEY, JSON.stringify(record));
}

export function clearSubmission(storage: Pick<Storage, "removeItem">) {
  storage.removeItem(INTERACTIVE_SUBMISSION_KEY);
}

function isStoredSubmission(value: unknown): value is StoredSubmission {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<StoredSubmission>;
  return record.version === 1 && typeof record.assessmentId === "string" && Array.isArray(record.args) && record.args.length === 5 && record.args.every((arg) => typeof arg === "string") && typeof record.phase === "string" && typeof record.updatedAt === "string";
}

export function loadSubmissionHistory(storage: Pick<Storage, "getItem">): StoredSubmission[] {
  try {
    const raw = storage.getItem(INTERACTIVE_SUBMISSION_HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter(isStoredSubmission) : [];
  } catch {
    return [];
  }
}

export function saveSubmissionHistory(storage: Pick<Storage, "setItem">, history: StoredSubmission[]) {
  storage.setItem(INTERACTIVE_SUBMISSION_HISTORY_KEY, JSON.stringify(history));
}

export function appendSubmissionHistory(history: StoredSubmission[], record: StoredSubmission) {
  const withoutRecord = history.filter((entry) => entry.assessmentId !== record.assessmentId && (!record.txHash || entry.txHash !== record.txHash));
  return [...withoutRecord, record];
}

export function nowIso() {
  return new Date().toISOString();
}

export function isWalletRejection(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === 4001;
}
