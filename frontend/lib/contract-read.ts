import { createClient } from "genlayer-js";
import { studioDevnet } from "genlayer-js/chains";
import type { Address, GenLayerClient } from "genlayer-js/types";
import { GENLAYER_STUDIO_DEVNET, getContractReadiness } from "@/lib/chain";

export const COMMITCOURT_READ_METHODS = Object.freeze({
  get_totals: { args: [] as const },
  get_assessment: { args: ["assessment_id"] as const },
});

type ReadClient = Pick<GenLayerClient<typeof studioDevnet>, "readContract">;

function readClient(): ReadClient {
  const readiness = getContractReadiness();
  const configuredRpc = studioDevnet.rpcUrls.default.http[0];
  if (!readiness.deployed || readiness.chainId !== GENLAYER_STUDIO_DEVNET.chainId || readiness.rpcUrl !== GENLAYER_STUDIO_DEVNET.rpcUrl || configuredRpc !== GENLAYER_STUDIO_DEVNET.rpcUrl) {
    throw new Error("verified CommitCourt read-only configuration is unavailable");
  }
  return createClient({ chain: studioDevnet });
}

function contractAddress(): Address {
  const address = getContractReadiness().contractAddress;
  if (!address) throw new Error("verified CommitCourt contract address is unavailable");
  return address as Address;
}

/** Reads the deployed contract without an account, signer, or write transport. */
export async function readContractTotals() {
  return readClient().readContract({
    address: contractAddress(),
    functionName: "get_totals",
    args: [],
  });
}

/** Reads one assessment by its exact string identifier; this is a view call. */
export async function readContractAssessment(assessmentId: string) {
  const normalized = assessmentId.trim();
  if (!normalized) throw new Error("assessment ID is required");
  return readClient().readContract({
    address: contractAddress(),
    functionName: "get_assessment",
    args: [normalized],
  });
}
