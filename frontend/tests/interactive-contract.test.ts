import { describe, expect, it, vi } from "vitest";
import type { TransactionFeeEstimate } from "genlayer-js/types";
import {
  COMMITCOURT_BOOTSTRAP_FEE_OPTIONS,
  COMMITCOURT_WRITE_METHOD,
  buildEvaluateArgs,
  encodeEvaluateCalldata,
  estimateAssessmentFees,
  submitEvaluate,
  validateFeeEstimate,
  verifyWalletBinding,
} from "@/lib/interactive-contract";

const input = {
  repoUrl: "https://github.com/acme/project",
  commitSha: "a".repeat(40),
  criteria: ["The endpoint is documented."],
  evidencePaths: ["README.md"],
};

function feeEstimate() {
  return {
    distribution: {
      leaderTimeunitsAllocation: 100n,
      validatorTimeunitsAllocation: 200n,
      appealRounds: 0n,
      executionBudgetPerRound: 0n,
      executionConsumed: 0n,
      totalMessageFees: 0n,
      rotations: [1n],
      maxPriceGenPerTimeUnit: 0n,
      storageFeeMaxGasPrice: 0n,
      receiptFeeMaxGasPrice: 0n,
    },
    feeValue: 123n,
    policy: {
      enabled: true,
      genPerTimeUnit: 1n,
      storageUnitPrice: 2n,
      receiptGasPrice: 3n,
      executionBudgetFloor: 4n,
      timeUnitOverlayBps: 0n,
    },
  } as TransactionFeeEstimate;
}

describe("interactive CommitCourt SDK boundary", () => {
  it("builds the exact five evaluate arguments without inventing an on-chain ID", () => {
    expect(buildEvaluateArgs(input, "assessment-42")).toEqual([
      "assessment-42",
      input.repoUrl,
      input.commitSha,
      JSON.stringify(input.criteria),
      JSON.stringify(input.evidencePaths),
    ]);
    expect(() => buildEvaluateArgs(input, "bad id")).toThrow("assessment ID");
  });

  it("uses the installed SDK fee API with the exact deployed method and arguments", async () => {
    const estimate = feeEstimate();
    const estimateTransactionFeesForWrite = vi.fn(async () => estimate);
    const args = buildEvaluateArgs(input, "assessment-42");
    await expect(estimateAssessmentFees({ estimateTransactionFeesForWrite }, args)).resolves.toBe(estimate);
    expect(estimateTransactionFeesForWrite).toHaveBeenCalledWith({
      ...COMMITCOURT_BOOTSTRAP_FEE_OPTIONS,
      address: "0xEe22361e7b2c50741cbbcc0e5bA357BBC05133E3",
      functionName: COMMITCOURT_WRITE_METHOD,
      args,
      value: 0n,
    });
  });

  it("passes the reviewed fee envelope and exact args to writeContract", async () => {
    const writeContract = vi.fn(async () => "0x" + "1".repeat(64));
    const args = buildEvaluateArgs(input, "assessment-42");
    const estimate = feeEstimate();
    await expect(submitEvaluate({ writeContract }, args, estimate)).resolves.toBe("0x" + "1".repeat(64));
    expect(writeContract).toHaveBeenCalledWith({
      address: "0xEe22361e7b2c50741cbbcc0e5bA357BBC05133E3",
      functionName: "evaluate",
      args,
      value: 0n,
      consensusMaxRotations: 1,
      fees: {
        distribution: estimate.distribution,
        messageAllocations: undefined,
        feeValue: 123n,
      },
    });
  });

  it("rejects unsafe or incomplete fee data before a write", () => {
    const estimate = feeEstimate();
    expect(() => validateFeeEstimate({ ...estimate, feeValue: 123 } as never)).toThrow("unsafe feeValue");
    expect(() => validateFeeEstimate({ ...estimate, policy: { enabled: true } } as never)).toThrow("policy");
  });

  it("blocks wrong chain and account selection through the EIP-1193 preflight", async () => {
    const request = vi.fn<(args: { method: string }) => Promise<unknown>>();
    request.mockImplementation(async ({ method }) => method === "eth_chainId" ? "0x1" : ["0x1111111111111111111111111111111111111111"]);
    const provider = { request };
    await expect(verifyWalletBinding(provider, "0x1111111111111111111111111111111111111111")).rejects.toThrow("Unsupported wallet network");
    provider.request.mockImplementation(async ({ method }: { method: string }) => method === "eth_chainId" ? "0xf22d" : ["0x1111111111111111111111111111111111111111", "0x2222222222222222222222222222222222222222"]);
    await expect(verifyWalletBinding(provider, "0x1111111111111111111111111111111111111111")).rejects.toThrow("uniquely selected");
  });

  it("encodes the same GenLayer call data shape used by the SDK", () => {
    const args = buildEvaluateArgs(input, "assessment-42");
    const encoded = encodeEvaluateCalldata(args);
    expect(encoded).toMatch(/^0x[0-9a-f]+$/i);
    expect(encoded.length).toBeGreaterThan(10);
  });
});
