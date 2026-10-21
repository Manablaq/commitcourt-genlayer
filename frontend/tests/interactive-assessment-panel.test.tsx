import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { InteractiveAssessmentPanel } from "@/components/InteractiveAssessmentPanel";

const mocks = vi.hoisted(() => ({
  createWalletClient: vi.fn(),
  estimateAssessmentFees: vi.fn(),
  readGasPrice: vi.fn(),
  submitEvaluate: vi.fn(),
  readContractAssessment: vi.fn(),
}));

vi.mock("@/lib/interactive-contract", async () => {
  const actual = await vi.importActual<typeof import("@/lib/interactive-contract")>("@/lib/interactive-contract");
  return { ...actual, createWalletClient: mocks.createWalletClient, estimateAssessmentFees: mocks.estimateAssessmentFees, readGasPrice: mocks.readGasPrice, submitEvaluate: mocks.submitEvaluate };
});

vi.mock("@/lib/contract-read", () => ({ readContractAssessment: mocks.readContractAssessment }));

const ACCOUNT = "0x1111111111111111111111111111111111111111";
const fee = {
  distribution: { leaderTimeunitsAllocation: 100n, validatorTimeunitsAllocation: 200n, appealRounds: 0n, executionBudgetPerRound: 0n, executionConsumed: 0n, totalMessageFees: 0n, rotations: [1n], maxPriceGenPerTimeUnit: 0n, storageFeeMaxGasPrice: 0n, receiptFeeMaxGasPrice: 0n },
  feeValue: 123n,
  policy: { enabled: true, genPerTimeUnit: 1n, storageUnitPrice: 2n, receiptGasPrice: 3n, executionBudgetFloor: 4n, timeUnitOverlayBps: 0n },
};

const validated = {
  title: "Ship the API",
  criteria: ["The endpoint is documented."],
  owner: "acme",
  repo: "project",
  repoUrl: "https://github.com/acme/project",
  commitSha: "a".repeat(40),
  evidencePaths: ["README.md"],
};

describe("InteractiveAssessmentPanel wallet boundary", () => {
  beforeEach(() => {
    window.localStorage.clear();
    const provider = {
      request: vi.fn(async ({ method }: { method: string }) => {
        if (method === "eth_requestAccounts" || method === "eth_accounts") return [ACCOUNT];
        if (method === "eth_chainId") return "0xf22d";
        if (method === "eth_getBalance") return "0x1000000000000000000";
        throw new Error(`unexpected ${method}`);
      }),
      on: vi.fn(),
      removeListener: vi.fn(),
    };
    Object.defineProperty(window, "ethereum", { configurable: true, value: provider });
    mocks.createWalletClient.mockReturnValue({ request: vi.fn() });
    mocks.estimateAssessmentFees.mockResolvedValue(fee);
    mocks.readGasPrice.mockResolvedValue(0n);
    mocks.submitEvaluate.mockResolvedValue("0x" + "b".repeat(64));
    mocks.readContractAssessment.mockReset();
    mocks.readContractAssessment.mockResolvedValue({ assessment_id: "assessment-1", verdict: "COMPLETE" });
  });

  it("blocks the wrong chain before fee preview", async () => {
    const provider = (window as Window & { ethereum?: { request: ReturnType<typeof vi.fn> } }).ethereum;
    provider?.request.mockImplementation(async ({ method }: { method: string }) => method === "eth_requestAccounts" || method === "eth_accounts" ? [ACCOUNT] : "0x1");
    render(<InteractiveAssessmentPanel validated={validated} />);
    fireEvent.click(screen.getByRole("button", { name: /connect metamask|install \/ connect wallet/i }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/unsupported network/i));
    expect(mocks.estimateAssessmentFees).not.toHaveBeenCalled();
  });

  it("switches only on an explicit Studio Devnet action and rechecks the selected chain", async () => {
    const provider = (window as Window & { ethereum?: { request: ReturnType<typeof vi.fn> } }).ethereum;
    let switched = false;
    provider?.request.mockImplementation(async ({ method }: { method: string }) => {
      if (method === "eth_requestAccounts" || method === "eth_accounts") return [ACCOUNT];
      if (method === "eth_chainId") return switched ? "0xf22d" : "0x1";
      if (method === "wallet_switchEthereumChain") {
        switched = true;
        return null;
      }
      if (method === "eth_getBalance") return "0x1000000000000000000";
      throw new Error(`unexpected ${method}`);
    });
    render(<InteractiveAssessmentPanel validated={validated} />);
    fireEvent.click(screen.getByRole("button", { name: /connect metamask|install \/ connect wallet/i }));
    await waitFor(() => expect(screen.getByRole("button", { name: /switch to studio devnet/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /switch to studio devnet/i }));
    await waitFor(() => expect(screen.getByText(/READY · CHAIN 61997/i)).toBeInTheDocument());
    expect(provider?.request).toHaveBeenCalledWith({ method: "wallet_switchEthereumChain", params: [{ chainId: "0xf22d" }] });
  });

  it("offers a separately user-triggered add-network action when the wallet reports 4902", async () => {
    const provider = (window as Window & { ethereum?: { request: ReturnType<typeof vi.fn> } }).ethereum;
    provider?.request.mockImplementation(async ({ method }: { method: string }) => {
      if (method === "eth_requestAccounts" || method === "eth_accounts") return [ACCOUNT];
      if (method === "eth_chainId") return "0x1";
      if (method === "wallet_switchEthereumChain") throw { code: 4902, message: "Unknown chain" };
      if (method === "wallet_addEthereumChain") return null;
      throw new Error(`unexpected ${method}`);
    });
    render(<InteractiveAssessmentPanel validated={validated} />);
    fireEvent.click(screen.getByRole("button", { name: /connect metamask|install \/ connect wallet/i }));
    await waitFor(() => expect(screen.getByRole("button", { name: /switch to studio devnet/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /switch to studio devnet/i }));
    await waitFor(() => expect(screen.getByRole("button", { name: /add studio devnet to wallet/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /add studio devnet to wallet/i }));
    await waitFor(() => expect(provider?.request).toHaveBeenCalledWith({
      method: "wallet_addEthereumChain",
      params: [{
        chainId: "0xf22d",
        chainName: "GenLayer Studio Devnet",
        rpcUrls: ["https://studio-dev.genlayer.com/api"],
        nativeCurrency: { name: "GEN", symbol: "GEN", decimals: 18 },
        blockExplorerUrls: ["https://explorer-studio-dev.genlayer.com"],
      }],
    }));
  });

  it("makes the header connection event functional without a repository preflight", async () => {
    render(<InteractiveAssessmentPanel validated={null} />);
    window.dispatchEvent(new Event("commitcourt:connect-wallet"));
    await waitFor(() => expect(screen.getByText(/READY · CHAIN 61997/i)).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /complete preflight first/i })).toBeDisabled();
  });

  it("keeps the submission control unavailable when the Studio fee API fails", async () => {
    mocks.estimateAssessmentFees.mockRejectedValueOnce(new Error("fee RPC unavailable"));
    render(<InteractiveAssessmentPanel validated={validated} />);
    fireEvent.click(screen.getByRole("button", { name: /connect metamask|install \/ connect wallet/i }));
    await waitFor(() => expect(screen.getByText(/READY · CHAIN 61997/i)).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /preview fee and prepare/i }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("fee RPC unavailable"));
    expect(screen.queryByRole("button", { name: /submit once/i })).not.toBeInTheDocument();
    expect(mocks.submitEvaluate).not.toHaveBeenCalled();
  });

  it("opens MetaMask only from the explicit submit action and prevents duplicate clicks", async () => {
    render(<InteractiveAssessmentPanel validated={validated} />);
    fireEvent.click(screen.getByRole("button", { name: /connect metamask|install \/ connect wallet/i }));
    await waitFor(() => expect(screen.getByText(/READY · CHAIN 61997/i)).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /preview fee and prepare/i }));
    await waitFor(() => expect(screen.getByText(/FEE REVIEW \/ NO SUBMISSION YET/i)).toBeInTheDocument());
    fireEvent.click(screen.getByRole("checkbox"));
    const submit = screen.getByRole("button", { name: /submit once/i });
    fireEvent.click(submit);
    fireEvent.click(submit);
    await waitFor(() => expect(mocks.submitEvaluate).toHaveBeenCalledTimes(1));
    expect(window.localStorage.getItem("commitcourt.interactive.submission.v1")).toContain("0xbbbbbb");
  });

  it("preserves finalized status when result readback fails and retries lookup read-only", async () => {
    const oldHash = "0x" + "c".repeat(64);
    window.localStorage.setItem("commitcourt.interactive.submission.v1", JSON.stringify({ version: 1, assessmentId: "assessment-final", args: ["assessment-final", "repo", "sha", "[]", "[]"], phase: "submitted", txHash: oldHash, updatedAt: new Date().toISOString() }));
    mocks.readContractAssessment.mockRejectedValueOnce(new Error("temporary read failure"));
    const finalizedTransaction = { statusName: "FINALIZED", txExecutionResultName: "FINISHED_WITH_RETURN", lifecycle: { state: "finalized" } };
    mocks.createWalletClient.mockReturnValue({ request: vi.fn(), waitForFinalization: vi.fn(async () => finalizedTransaction), getTransaction: vi.fn(async () => finalizedTransaction) });
    render(<InteractiveAssessmentPanel validated={validated} />);
    fireEvent.click(screen.getByRole("button", { name: /connect metamask|install \/ connect wallet/i }));
    await waitFor(() => expect(screen.getByText(/READY · CHAIN 61997/i)).toBeInTheDocument());
    await waitFor(() => expect(screen.getByRole("button", { name: /bounded finality check/i })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: /bounded finality check/i }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/finalized transaction is preserved/i));
    expect(screen.getAllByText("FINALIZED SUCCESS").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole("button", { name: /retry result lookup/i })).toBeInTheDocument();
    expect(JSON.parse(window.localStorage.getItem("commitcourt.interactive.submission.v1") || "{}").phase).toBe("finalized-success");
    mocks.readContractAssessment.mockResolvedValueOnce({ assessment_id: "assessment-final", verdict: "COMPLETE" });
    fireEvent.click(screen.getByRole("button", { name: /retry result lookup/i }));
    await waitFor(() => expect(screen.getByText(/FINALIZED \/ FINISHED_WITH_RETURN/i)).toBeInTheDocument());
    expect(mocks.submitEvaluate).not.toHaveBeenCalled();
  });

  it("starts a fresh assessment while preserving the previous finalized hash", async () => {
    const oldHash = "0x" + "d".repeat(64);
    window.localStorage.setItem("commitcourt.interactive.submission.v1", JSON.stringify({ version: 1, assessmentId: "assessment-old", args: ["assessment-old", "repo", "sha", "[]", "[]"], phase: "finalized-error", txHash: oldHash, updatedAt: new Date().toISOString() }));
    render(<InteractiveAssessmentPanel validated={validated} />);
    fireEvent.click(screen.getByRole("button", { name: /connect metamask|install \/ connect wallet/i }));
    await waitFor(() => expect(screen.getByText(/READY · CHAIN 61997/i)).toBeInTheDocument());
    await waitFor(() => expect(screen.getByRole("button", { name: /^start another assessment$/i })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: /^start another assessment$/i }));
    expect(screen.getByText(oldHash)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /preview fee and prepare/i }));
    await waitFor(() => expect(screen.getByText(/FEE REVIEW \/ NO SUBMISSION YET/i)).toBeInTheDocument());
    const current = JSON.parse(window.localStorage.getItem("commitcourt.interactive.submission.v1") || "{}");
    expect(current.assessmentId).not.toBe("assessment-old");
    expect(screen.getByText(oldHash)).toBeInTheDocument();
  });
});
