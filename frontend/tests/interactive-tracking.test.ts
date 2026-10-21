import { describe, expect, it } from "vitest";
import { appendSubmissionHistory, classifyTransaction, isFinalizedPhase, isSubmissionTerminal, loadSubmissionHistory, safeLoadSubmission, saveSubmission, saveSubmissionHistory, type StoredSubmission } from "@/lib/interactive-tracking";

const base = { version: 1 as const, assessmentId: "assessment-1", args: ["assessment-1", "repo", "sha", "[]", "[]"] as [string, string, string, string, string], phase: "submitted" as const, updatedAt: "2026-10-21T00:00:00.000Z", txHash: "0x" + "a".repeat(64) };

describe("durable interactive transaction tracking", () => {
  it("distinguishes accepted from finalized execution success", () => {
    expect(classifyTransaction({ statusName: "ACCEPTED", txExecutionResultName: undefined, lifecycle: { state: "decided", outcome: "accepted" } } as never)).toBe("decided-accepted");
    expect(classifyTransaction({ statusName: "FINALIZED", txExecutionResultName: "FINISHED_WITH_RETURN", lifecycle: { state: "finalized" } } as never)).toBe("finalized-success");
    expect(classifyTransaction({ statusName: "FINALIZED", txExecutionResultName: "FINISHED_WITH_ERROR", lifecycle: { state: "finalized" } } as never)).toBe("finalized-error");
    expect(classifyTransaction({ statusName: "PENDING", txExecutionResultName: undefined, lifecycle: { state: "processing", phase: "pending" } } as never)).toBe("pending");
    expect(classifyTransaction({ statusName: "UNDETERMINED", txExecutionResultName: undefined, lifecycle: { state: "decided", outcome: "undetermined" } } as never)).toBe("decided-undetermined");
    expect(classifyTransaction({ statusName: "REJECTED", txExecutionResultName: undefined, lifecycle: { state: "decided", outcome: "rejected" } } as never)).toBe("decided-rejected");
  });

  it("persists one submission record and ignores malformed storage", () => {
    const values = new Map<string, string>();
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) };
    saveSubmission(storage, base);
    expect(safeLoadSubmission(storage)).toEqual(base);
    values.set("commitcourt.interactive.submission.v1", "not-json");
    expect(safeLoadSubmission(storage)).toBeNull();
  });

  it("allows a new assessment after finalization while locking uncertain records", () => {
    expect(isSubmissionTerminal({ ...base, phase: "submitted" })).toBe(true);
    expect(isSubmissionTerminal({ ...base, phase: "ambiguous" })).toBe(true);
    expect(isSubmissionTerminal({ ...base, phase: "decided-undetermined" })).toBe(true);
    expect(isSubmissionTerminal({ ...base, phase: "decided-rejected" })).toBe(true);
    expect(isSubmissionTerminal({ ...base, phase: "finalized-success" })).toBe(false);
    expect(isSubmissionTerminal({ ...base, phase: "finalized-error" })).toBe(false);
    expect(isFinalizedPhase("finalized-success")).toBe(true);
    expect(isFinalizedPhase("pending")).toBe(false);
  });

  it("keeps finalized assessment IDs and hashes in durable history without duplicates", () => {
    const values = new Map<string, string>();
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) };
    const completed: StoredSubmission = { ...base, phase: "finalized-success", result: "COMPLETE" };
    saveSubmissionHistory(storage, appendSubmissionHistory([], completed));
    saveSubmissionHistory(storage, appendSubmissionHistory(loadSubmissionHistory(storage), { ...completed, result: "PARTIAL" }));
    const history = loadSubmissionHistory(storage);
    expect(history).toHaveLength(1);
    expect(history[0].txHash).toBe(base.txHash);
    expect(history[0].result).toBe("PARTIAL");
  });

  it("preserves an ambiguous outcome as evidence instead of making a retryable state", () => {
    const ambiguous: StoredSubmission = { ...base, phase: "ambiguous", error: "provider timeout" };
    const values = new Map<string, string>();
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) };
    saveSubmission(storage, ambiguous);
    expect(safeLoadSubmission(storage)?.phase).toBe("ambiguous");
  });
});
