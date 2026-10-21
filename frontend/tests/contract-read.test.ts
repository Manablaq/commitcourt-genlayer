import { describe, expect, it, vi } from "vitest";

const readContract = vi.fn();

vi.mock("genlayer-js", () => ({
  createClient: vi.fn(() => ({ readContract })),
}));

import { readContractAssessment, readContractTotals } from "@/lib/contract-read";

describe("deployed CommitCourt read-only client", () => {
  it("calls get_totals with zero arguments", async () => {
    readContract.mockResolvedValueOnce({ assessment_count: 0 });
    await expect(readContractTotals()).resolves.toEqual({ assessment_count: 0 });
    expect(readContract).toHaveBeenCalledWith({
      address: "0xEe22361e7b2c50741cbbcc0e5bA357BBC05133E3",
      functionName: "get_totals",
      args: [],
    });
  });

  it("calls get_assessment with exactly one string argument", async () => {
    readContract.mockResolvedValueOnce({ assessment_id: "assessment-1" });
    await expect(readContractAssessment(" assessment-1 ")).resolves.toEqual({ assessment_id: "assessment-1" });
    expect(readContract).toHaveBeenCalledWith({
      address: "0xEe22361e7b2c50741cbbcc0e5bA357BBC05133E3",
      functionName: "get_assessment",
      args: ["assessment-1"],
    });
  });

  it("rejects an empty assessment identifier before any read", async () => {
    await expect(readContractAssessment("   ")).rejects.toThrow("assessment ID is required");
  });
});
