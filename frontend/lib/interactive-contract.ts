import { createClient } from "genlayer-js";
import { abi, chains } from "genlayer-js";
import type { Address, GenLayerClient, TransactionFeeEstimate } from "genlayer-js/types";
import { GENLAYER_STUDIO_DEVNET, VERIFIED_COMMITCOURT_CONTRACT_ADDRESS } from "@/lib/chain";
import type { ValidatedSubmission } from "@/lib/types";

export const COMMITCOURT_WRITE_METHOD = "evaluate" as const;
export const COMMITCOURT_WRITE_ARG_COUNT = 5 as const;
export const COMMITCOURT_CONSTRUCTOR_ARGS: readonly [] = [];
export const COMMITCOURT_CONSENSUS_MAX_ROTATIONS = 1 as const;

export const COMMITCOURT_BOOTSTRAP_FEE_OPTIONS = Object.freeze({
  leaderTimeunitsAllocation: 100n,
  validatorTimeunitsAllocation: 200n,
  totalMessageFees: 0n,
  rotations: [1n],
});

export type Eip1193Provider = {
  request(args: { method: string; params?: readonly unknown[] }): Promise<unknown>;
  on?: (event: "accountsChanged" | "chainChanged" | "disconnect", listener: (value: unknown) => void) => void;
  removeListener?: (event: "accountsChanged" | "chainChanged" | "disconnect", listener: (value: unknown) => void) => void;
};

export type CommitCourtClient = GenLayerClient<typeof chains.studioDevnet>;
export type EvaluateArgs = [assessmentId: string, repoUrl: string, commitSha: string, criteriaJson: string, evidencePathsJson: string];

type SdkProvider = NonNullable<NonNullable<Parameters<typeof createClient>[0]>["provider"]>;

function assertAssessmentId(assessmentId: string) {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(assessmentId)) {
    throw new Error("assessment ID must contain only letters, numbers, underscores, or hyphens");
  }
}

export function buildAssessmentId(randomUuid: () => string = () => crypto.randomUUID()) {
  const id = randomUuid();
  assertAssessmentId(id);
  return id;
}

/**
 * The deployed contract has no on-chain ID constructor. The caller supplies
 * this identifier, and evaluate stores it as the assessment key.
 */
export function buildEvaluateArgs(input: Pick<ValidatedSubmission, "repoUrl" | "commitSha" | "criteria" | "evidencePaths">, assessmentId: string): EvaluateArgs {
  assertAssessmentId(assessmentId);
  return [
    assessmentId,
    input.repoUrl,
    input.commitSha,
    JSON.stringify(input.criteria),
    JSON.stringify(input.evidencePaths),
  ];
}

export function createWalletClient(provider: Eip1193Provider, address: string): CommitCourtClient {
  return createClient({
    chain: chains.studioDevnet,
    account: address as Address,
    provider: provider as SdkProvider,
  });
}

export function normalizeChainId(value: unknown): string | null {
  return typeof value === "string" && /^0x[0-9a-f]+$/i.test(value) ? value.toLowerCase() : null;
}

export function publicAccounts(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string" && /^0x[0-9a-f]{40}$/i.test(entry));
}

export async function verifyWalletBinding(provider: Eip1193Provider, address: string) {
  const chainId = normalizeChainId(await provider.request({ method: "eth_chainId" }));
  if (chainId !== `0x${GENLAYER_STUDIO_DEVNET.chainId.toString(16)}`) {
    throw new Error(`Unsupported wallet network: expected chain ${GENLAYER_STUDIO_DEVNET.chainId}.`);
  }
  const accounts = publicAccounts(await provider.request({ method: "eth_accounts" }));
  if (accounts.length !== 1 || accounts[0].toLowerCase() !== address.toLowerCase()) {
    throw new Error("The selected wallet account changed or is not uniquely selected.");
  }
  return { chainId, accounts };
}

function requireBigInt(value: unknown, label: string): bigint {
  if (typeof value !== "bigint") throw new Error(`SDK fee estimate returned an unsafe ${label}.`);
  return value;
}

function validateFeeDistribution(distribution: unknown) {
  if (!distribution || typeof distribution !== "object" || Array.isArray(distribution)) {
    throw new Error("SDK fee estimate omitted its distribution.");
  }
  const record = distribution as Record<string, unknown>;
  for (const field of [
    "leaderTimeunitsAllocation",
    "validatorTimeunitsAllocation",
    "appealRounds",
    "executionBudgetPerRound",
    "executionConsumed",
    "totalMessageFees",
    "maxPriceGenPerTimeUnit",
    "storageFeeMaxGasPrice",
    "receiptFeeMaxGasPrice",
  ]) {
    requireBigInt(record[field], `distribution.${field}`);
  }
  if (!Array.isArray(record.rotations) || record.rotations.length === 0 || record.rotations.some((value) => typeof value !== "bigint")) {
    throw new Error("SDK fee estimate returned an unsafe distribution.rotations value.");
  }
}

function validateFeePolicy(policy: unknown) {
  if (!policy || typeof policy !== "object" || Array.isArray(policy)) throw new Error("SDK fee estimate omitted its policy.");
  const record = policy as Record<string, unknown>;
  if (typeof record.enabled !== "boolean") throw new Error("SDK fee policy has no enabled flag.");
  for (const field of ["genPerTimeUnit", "storageUnitPrice", "receiptGasPrice", "executionBudgetFloor"]) {
    requireBigInt(record[field], `policy.${field}`);
  }
  if (record.timeUnitOverlayBps !== undefined) requireBigInt(record.timeUnitOverlayBps, "policy.timeUnitOverlayBps");
}

export function validateFeeEstimate(estimate: TransactionFeeEstimate): TransactionFeeEstimate {
  requireBigInt(estimate.feeValue, "feeValue");
  validateFeeDistribution(estimate.distribution);
  validateFeePolicy(estimate.policy);
  return estimate;
}

export async function estimateAssessmentFees(client: Pick<CommitCourtClient, "estimateTransactionFeesForWrite">, args: EvaluateArgs) {
  const estimate = await client.estimateTransactionFeesForWrite({
    ...COMMITCOURT_BOOTSTRAP_FEE_OPTIONS,
    address: VERIFIED_COMMITCOURT_CONTRACT_ADDRESS as Address,
    functionName: COMMITCOURT_WRITE_METHOD,
    args: [...args],
    value: 0n,
  });
  return validateFeeEstimate(estimate);
}

export async function readGasPrice(client: Pick<CommitCourtClient, "request">): Promise<bigint> {
  const value = await client.request({ method: "eth_gasPrice" });
  if (typeof value !== "string" || !/^0x[0-9a-f]+$/i.test(value)) throw new Error("Studio Devnet returned an invalid gas price.");
  return BigInt(value);
}

export async function submitEvaluate(
  client: Pick<CommitCourtClient, "writeContract">,
  args: EvaluateArgs,
  estimate: TransactionFeeEstimate,
) {
  validateFeeEstimate(estimate);
  return client.writeContract({
    address: VERIFIED_COMMITCOURT_CONTRACT_ADDRESS as Address,
    functionName: COMMITCOURT_WRITE_METHOD,
    args: [...args],
    value: 0n,
    consensusMaxRotations: COMMITCOURT_CONSENSUS_MAX_ROTATIONS,
    fees: {
      distribution: estimate.distribution,
      messageAllocations: estimate.messageAllocations,
      feeValue: estimate.feeValue,
    },
  });
}

export function encodeEvaluateCalldata(args: EvaluateArgs): `0x${string}` {
  const encoded = abi.calldata.encode(abi.calldata.makeCalldataObject(COMMITCOURT_WRITE_METHOD, [...args], undefined));
  return abi.transactions.serialize([encoded, false]) as `0x${string}`;
}

export function formatWei(value: bigint): string {
  return value.toString();
}

export function formatGen(value: bigint): string {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const whole = absolute / 1_000_000_000_000_000_000n;
  const fraction = (absolute % 1_000_000_000_000_000_000n).toString().padStart(18, "0").replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""} GEN`;
}

export function serializeFeeSummary(estimate: TransactionFeeEstimate) {
  return {
    feeValueWei: formatWei(estimate.feeValue),
    feeValueGen: formatGen(estimate.feeValue),
    distribution: Object.fromEntries(Object.entries(estimate.distribution).map(([key, value]) => [key, Array.isArray(value) ? value.map(String) : String(value)])),
    policy: Object.fromEntries(Object.entries(estimate.policy).map(([key, value]) => [key, typeof value === "bigint" ? String(value) : value])),
  };
}

export { GENLAYER_STUDIO_DEVNET };
