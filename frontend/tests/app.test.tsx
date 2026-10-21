import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CommitCourtApp } from "@/components/CommitCourtApp";

vi.mock("@/lib/contract-read", () => ({
  readContractTotals: vi.fn(async () => ({ assessment_count: 1 })),
  readContractAssessment: vi.fn(async (assessmentId: string) => assessmentId === "cc-v05-live-20261021-a1"
    ? { assessment_id: assessmentId, verdict: "COMPLETE", status: "MET" }
    : { assessment_id: assessmentId }),
}));

describe("CommitCourt app", () => {
  it("exposes the verified read-only contract binding and form controls", async () => {
    render(<CommitCourtApp />);
    expect(screen.getByText("CONTRACT VERIFIED")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(/\{"assessment_count":1\}/)).toBeInTheDocument());
    expect(screen.getByText(/cc-v05-live-20261021-a1/)).toBeInTheDocument();
    expect(screen.getByText(/"verdict":"COMPLETE"/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Connect wallet" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /submit once/i })).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Exact commit SHA/)).toBeInTheDocument();
  });

  it("shows a safe preflight error from the server", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ error: "Only canonical public GitHub URLs are allowed." }), { status: 400 })) as typeof fetch;
    render(<CommitCourtApp />);
    fireEvent.change(screen.getByLabelText("Milestone title"), { target: { value: "Ship the API" } });
    fireEvent.change(screen.getByLabelText("Public GitHub repository"), { target: { value: "https://github.com/acme/project" } });
    fireEvent.change(screen.getByLabelText(/Exact commit SHA/), { target: { value: "a".repeat(40) } });
    fireEvent.click(screen.getByRole("button", { name: /run read-only preflight/i }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Only canonical public GitHub URLs are allowed."));
    globalThis.fetch = originalFetch;
  });
});
