"use client";

import { FormEvent, useEffect, useState } from "react";
import { getContractReadiness, VERIFIED_V05_ASSESSMENT_ID } from "@/lib/chain";
import { readContractAssessment, readContractTotals } from "@/lib/contract-read";

function displayValue(value: unknown) {
  if (typeof value === "string") {
    try {
      return JSON.stringify(JSON.parse(value));
    } catch {
      return value;
    }
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function DeployedContractReadPanel() {
  const readiness = getContractReadiness();
  const [totals, setTotals] = useState<unknown>(null);
  const [assessmentId, setAssessmentId] = useState<string>(VERIFIED_V05_ASSESSMENT_ID);
  const [assessment, setAssessment] = useState<unknown>(null);
  const [loadingTotals, setLoadingTotals] = useState(true);
  const [loadingAssessment, setLoadingAssessment] = useState(false);
  const [reloadNonce, setReloadNonce] = useState(0);
  const [assessmentMissing, setAssessmentMissing] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void Promise.resolve().then(async () => {
      setLoadingTotals(true);
      setError("");
      setAssessmentMissing(false);
      const [totalsResult, assessmentResult] = await Promise.allSettled([
        readContractTotals(),
        readContractAssessment(VERIFIED_V05_ASSESSMENT_ID),
      ]);
      if (!active) return;
      if (totalsResult.status === "fulfilled") setTotals(totalsResult.value);
      if (assessmentResult.status === "fulfilled") {
        if (assessmentResult.value === "") {
          setAssessment(null);
          setAssessmentMissing(true);
        } else {
          setAssessment(assessmentResult.value);
        }
      }
      const failures = [totalsResult, assessmentResult]
        .filter((result): result is PromiseRejectedResult => result.status === "rejected")
        .map((result) => result.reason instanceof Error ? result.reason.message : "Read-only contract read failed.");
      if (failures.length) setError(failures.join(" "));
      setLoadingTotals(false);
    });
    return () => {
      active = false;
    };
  }, [readiness.contractAddress, readiness.deployed, reloadNonce]);

  async function readAssessment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoadingAssessment(true);
    setError("");
    setAssessmentMissing(false);
    try {
      const value = await readContractAssessment(assessmentId);
      if (value === "") {
        setAssessment(null);
        setAssessmentMissing(true);
      } else {
        setAssessment(value);
      }
    } catch (caught) {
      setAssessment(null);
      setError(caught instanceof Error ? caught.message : "Read-only assessment lookup failed.");
    } finally {
      setLoadingAssessment(false);
    }
  }

  return (
    <section className="panel contract-read-panel" aria-labelledby="contract-read-title">
      <div className="section-heading">
        <div>
          <p className="section-kicker">CHAIN DATA / READ-ONLY</p>
          <h2 id="contract-read-title">Verified CommitCourt contract</h2>
        </div>
        <span className="read-only-tag">WRITES DISABLED</span>
      </div>
      <p className="contract-read-address mono">{readiness.contractAddress || "No verified contract binding"}</p>
      <p className="contract-read-network mono">Studio Devnet {readiness.chainId} · {readiness.rpcUrl}</p>
      {!readiness.deployed ? (
        <p className="alert error" role="alert">{readiness.reason}</p>
      ) : (
        <div className="contract-read-grid">
          <div className="contract-read-result">
            <span className="card-label">GET_TOTALS()</span>
            <strong>{loadingTotals ? "Reading…" : displayValue(totals)}</strong>
            <p>Read from the deployed contract with zero arguments.</p>
          </div>
          <form className="contract-read-result" onSubmit={readAssessment}>
            <label className="field-label" htmlFor="assessment-id">GET_ASSESSMENT(assessment_id)</label>
            <input id="assessment-id" className="text-input mono" value={assessmentId} onChange={(event) => setAssessmentId(event.target.value)} placeholder="assessment identifier" />
            <button className="secondary-button" type="submit" disabled={loadingAssessment || !assessmentId.trim()}>{loadingAssessment ? "Reading…" : "Read assessment"}</button>
            {assessment !== null && <pre className="contract-read-output">{displayValue(assessment)}</pre>}
          </form>
        </div>
      )}
      {(error || assessmentMissing) && readiness.deployed && <button type="button" className="text-button" onClick={() => setReloadNonce((current) => current + 1)} disabled={loadingTotals}>Retry read-only results</button>}
      {assessmentMissing && <p className="alert error" role="alert">No stored assessment was returned for this ID. No on-chain result is inferred.</p>}
      {error && <p className="alert error" role="alert">{error}</p>}
    </section>
  );
}
