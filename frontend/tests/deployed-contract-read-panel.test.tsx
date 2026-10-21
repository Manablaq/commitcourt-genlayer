import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DeployedContractReadPanel } from "@/components/DeployedContractReadPanel";

const mocks = vi.hoisted(() => ({
  readContractTotals: vi.fn(),
  readContractAssessment: vi.fn(),
}));

vi.mock("@/lib/contract-read", () => mocks);

describe("v05 read-only assessment panel", () => {
  beforeEach(() => {
    mocks.readContractTotals.mockReset();
    mocks.readContractAssessment.mockReset();
  });

  it("loads the certified assessment without a wallet", async () => {
    mocks.readContractTotals.mockResolvedValue({ assessment_count: 1 });
    mocks.readContractAssessment.mockResolvedValue({ assessment_id: "cc-v05-live-20261021-a1", verdict: "COMPLETE", status: "MET" });
    render(<DeployedContractReadPanel />);
    await waitFor(() => expect(screen.getByText(/"verdict":"COMPLETE"/)).toBeInTheDocument());
    expect(mocks.readContractAssessment).toHaveBeenCalledWith("cc-v05-live-20261021-a1");
  });

  it("keeps unavailable reads visible and retries them without a wallet action", async () => {
    mocks.readContractTotals.mockRejectedValueOnce(new Error("Studio RPC unavailable")).mockResolvedValueOnce({ assessment_count: 1 });
    mocks.readContractAssessment.mockRejectedValueOnce(new Error("Studio RPC unavailable")).mockResolvedValueOnce({ assessment_id: "cc-v05-live-20261021-a1", verdict: "COMPLETE" });
    render(<DeployedContractReadPanel />);
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Studio RPC unavailable"));
    fireEvent.click(screen.getByRole("button", { name: /retry read-only results/i }));
    await waitFor(() => expect(screen.getByText(/"assessment_count":1/)).toBeInTheDocument());
    expect(mocks.readContractAssessment).toHaveBeenCalledTimes(2);
  });

  it("does not invent a result when get_assessment returns an empty value", async () => {
    mocks.readContractTotals.mockResolvedValue({ assessment_count: 1 });
    mocks.readContractAssessment.mockResolvedValue("");
    render(<DeployedContractReadPanel />);
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/no stored assessment was returned/i));
    expect(screen.queryByText(/COMPLETE/)).not.toBeInTheDocument();
  });
});
