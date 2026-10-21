export const GENLAYER_STUDIO_DEVNET = {
  chainId: 61997,
  rpcUrl: "https://studio-dev.genlayer.com/api",
} as const;

export const GENLAYER_STUDIO_DEVNET_EIP1193 = {
  chainId: "0xf22d",
  chainName: "GenLayer Studio Devnet",
  rpcUrls: [GENLAYER_STUDIO_DEVNET.rpcUrl],
  nativeCurrency: { name: "GEN", symbol: "GEN", decimals: 18 },
  blockExplorerUrls: ["https://explorer-studio-dev.genlayer.com"],
} as const;

/** Verified Studio Devnet v05 contract. Environment overrides must match it exactly. */
export const VERIFIED_COMMITCOURT_CONTRACT_ADDRESS = "0xEe22361e7b2c50741cbbcc0e5bA357BBC05133E3" as const;

/** Public, finalized assessment supplied by the verified v05 deployment record. */
export const VERIFIED_V05_ASSESSMENT_ID = "cc-v05-live-20261021-a1" as const;

export type ContractReadiness = {
  deployed: boolean;
  contractAddress: string | null;
  chainId: number;
  rpcUrl: string;
  writesEnabled: false;
  reason: string;
};

export function getContractReadiness(): ContractReadiness {
  const configured = process.env.NEXT_PUBLIC_COMMITCOURT_CONTRACT_ADDRESS?.trim() || VERIFIED_COMMITCOURT_CONTRACT_ADDRESS;
  const configuredRpc = process.env.NEXT_PUBLIC_GENLAYER_RPC_URL?.trim() || GENLAYER_STUDIO_DEVNET.rpcUrl;
  const configuredChainId = process.env.NEXT_PUBLIC_GENLAYER_CHAIN_ID?.trim() || String(GENLAYER_STUDIO_DEVNET.chainId);
  const looksLikeAddress = /^0x[0-9a-fA-F]{40}$/.test(configured);
  const addressMatches = configured.toLowerCase() === VERIFIED_COMMITCOURT_CONTRACT_ADDRESS.toLowerCase();
  const networkMatches = configuredRpc === GENLAYER_STUDIO_DEVNET.rpcUrl && configuredChainId === String(GENLAYER_STUDIO_DEVNET.chainId);
  const verified = looksLikeAddress && addressMatches && networkMatches;
  return {
    deployed: verified,
    contractAddress: verified ? configured : null,
    chainId: GENLAYER_STUDIO_DEVNET.chainId,
    rpcUrl: configuredRpc,
    writesEnabled: false,
    reason: verified
      ? "Verified Studio Devnet v05 contract; reads are available and any assessment submission requires a deliberate wallet confirmation."
      : "The configured contract or Studio Devnet identity does not match the verified deployment.",
  };
}
