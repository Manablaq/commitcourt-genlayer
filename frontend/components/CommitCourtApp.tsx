"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import type { HistoryItem, LocalPreview, MilestoneDraft, PreflightResult, ValidatedSubmission } from "@/lib/types";
import { buildLocalPreview } from "@/lib/preview";
import { validateDraft } from "@/lib/validation";
import { getContractReadiness } from "@/lib/chain";
import { DeployedContractReadPanel } from "@/components/DeployedContractReadPanel";
import { InteractiveAssessmentPanel } from "@/components/InteractiveAssessmentPanel";

const EMPTY_SHA = "";
const DEFAULT_CRITERIA = ["The milestone has a specific, inspectable implementation outcome."];
const DEFAULT_PATHS = ["README.md"];
const HISTORY_KEY = "commitcourt.history.v1";

function shortSha(sha: string) {
  return sha ? `${sha.slice(0, 10)}…${sha.slice(-8)}` : "Awaiting SHA";
}

function formatBytes(bytes: number) {
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KiB`;
}

export function CommitCourtApp() {
  const contractReadiness = getContractReadiness();
  const [draft, setDraft] = useState<MilestoneDraft>({
    title: "",
    criteria: DEFAULT_CRITERIA,
    repoUrl: "https://github.com/",
    commitSha: EMPTY_SHA,
    evidencePaths: DEFAULT_PATHS,
  });
  const [preflight, setPreflight] = useState<PreflightResult | null>(null);
  const [validated, setValidated] = useState<ValidatedSubmission | null>(null);
  const [preview, setPreview] = useState<LocalPreview | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    void Promise.resolve().then(() => {
      try {
        const saved = window.localStorage.getItem(HISTORY_KEY);
        if (saved) setHistory(JSON.parse(saved) as HistoryItem[]);
      } catch {
        setNotice("Browser history is unavailable in this session; the preview still works.");
      }
    });
  }, []);

  const canPreview = Boolean(preflight && validated);
  const stepState = useMemo(() => ({
    criteria: draft.criteria.filter(Boolean).length >= 1,
    commit: draft.commitSha.length === 40,
    evidence: draft.evidencePaths.filter(Boolean).length >= 1,
  }), [draft]);

  function updateDraft<K extends keyof MilestoneDraft>(key: K, value: MilestoneDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
    setError("");
    setNotice("");
    if (key !== "title") {
      setPreflight(null);
      setValidated(null);
      setPreview(null);
    }
  }

  function updateArray(key: "criteria" | "evidencePaths", index: number, value: string) {
    const values = [...draft[key]];
    values[index] = value;
    updateDraft(key, values);
  }

  function addArrayItem(key: "criteria" | "evidencePaths", limit: number) {
    if (draft[key].length >= limit) return;
    updateDraft(key, [...draft[key], ""]);
  }

  function removeArrayItem(key: "criteria" | "evidencePaths", index: number) {
    if (draft[key].length <= 1) return;
    updateDraft(key, draft[key].filter((_, itemIndex) => itemIndex !== index));
  }

  async function runPreflight(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    setPreflight(null);
    setValidated(null);
    setPreview(null);
    try {
      const input = validateDraft(draft);
      const response = await fetch("/api/preflight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const payload = await response.json() as { error?: string; input?: ValidatedSubmission; result?: PreflightResult };
      if (!response.ok || !payload.input || !payload.result) throw new Error(payload.error || "Preflight failed.");
      setValidated(input);
      setPreflight(payload.result);
      setNotice("Read-only preflight passed. The next step is a local evidence preview.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Preflight failed safely.");
    } finally {
      setBusy(false);
    }
  }

  function createPreview() {
    if (!validated || !preflight) return;
    const result = buildLocalPreview(validated, preflight);
    setPreview(result);
    const item: HistoryItem = {
      id: `${validated.commitSha}-${Date.now()}`,
      title: validated.title,
      repoUrl: validated.repoUrl,
      commitSha: validated.commitSha,
      evidenceCount: validated.evidencePaths.length,
      verdict: result.verdict,
      savedAt: result.generatedAt,
    };
    const nextHistory = [item, ...history.filter((entry) => entry.id !== item.id)].slice(0, 8);
    setHistory(nextHistory);
    try {
      window.localStorage.setItem(HISTORY_KEY, JSON.stringify(nextHistory));
    } catch {
      setNotice("Preview complete; browser storage was unavailable, so this item was not persisted.");
    }
  }

  function requestWalletConnection() {
    window.dispatchEvent(new Event("commitcourt:connect-wallet"));
    document.getElementById("interactive-title")?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  return (
    <main className="shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="CommitCourt home">
          <span className="brand-mark" aria-hidden="true">CC</span>
          <span>CommitCourt</span>
        </a>
        <div className="topbar-actions">
          <span className="mode-pill"><span className="status-dot" /> STUDIO DEVNET BETA</span>
          <span className="network-label">STUDIO DEVNET <b>61997</b></span>
          <button type="button" className="header-wallet-button" onClick={requestWalletConnection}>Connect wallet</button>
        </div>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <p className="eyebrow">Evidence before verdicts</p>
          <h1>Make a milestone <em>inspectable.</em></h1>
          <p className="hero-lede">Anchor a delivery to one immutable commit, show the exact files that matter, and prepare a bounded evaluation for GenLayer validator consensus.</p>
          <p className="beta-disclosure">Public beta on Studio Devnet. Use test GEN only; Devnet state may be reset and is not a permanent record.</p>
          <div className="hero-notes" aria-label="Product guarantees">
            <span><i>01</i> Full SHA anchoring</span>
            <span><i>02</i> Public evidence only</span>
            <span><i>03</i> No invented consensus</span>
          </div>
        </div>
        <aside className="status-card" aria-label="Contract deployment status">
          <div className="status-card-top"><span className={`status-dot ${contractReadiness.deployed ? "" : "amber"}`} /> CHAIN READINESS</div>
          <strong>{contractReadiness.deployed ? "CONTRACT VERIFIED" : "CONTRACT NOT DEPLOYED"}</strong>
          <p>{contractReadiness.deployed ? "A verified Studio Devnet address is configured. Reads are automatic; any write requires a deliberate human wallet confirmation in the submission panel." : "Local evidence tools are available. Chain submission stays disabled until a verified CommitCourt address is configured."}</p>
          {contractReadiness.deployed && <code className="status-card-address">{contractReadiness.contractAddress}</code>}
          <div className="status-card-foot"><span>Writes</span><b>HUMAN WALLET ONLY</b></div>
        </aside>
      </section>

      <DeployedContractReadPanel />

      <section className="workspace-grid" aria-label="CommitCourt workspace">
        <form className="panel form-panel" onSubmit={runPreflight}>
          <div className="panel-heading">
            <div>
              <p className="section-kicker">01 / CREATE MILESTONE</p>
              <h2>Define the finish line</h2>
            </div>
            <span className="step-count">{draft.criteria.length}/5 criteria</span>
          </div>
          <label className="field-label" htmlFor="milestone-title">Milestone title</label>
          <input id="milestone-title" className="text-input" value={draft.title} onChange={(event) => updateDraft("title", event.target.value)} placeholder="e.g. Ship the audit-ready API" />

          <div className="field-row-label"><label className="field-label" htmlFor="criterion-0">Acceptance criteria</label><span className="field-hint">Specific + testable</span></div>
          <div className="repeat-list">
            {draft.criteria.map((criterion, index) => (
              <div className="repeat-row" key={`criterion-${index}`}>
                <span className="row-index">{String(index + 1).padStart(2, "0")}</span>
                <input id={`criterion-${index}`} className="text-input" value={criterion} onChange={(event) => updateArray("criteria", index, event.target.value)} placeholder="What must be true?" />
                <button type="button" className="icon-button" onClick={() => removeArrayItem("criteria", index)} aria-label={`Remove criterion ${index + 1}`} disabled={draft.criteria.length <= 1}>×</button>
              </div>
            ))}
          </div>
          <button type="button" className="text-button" onClick={() => addArrayItem("criteria", 5)} disabled={draft.criteria.length >= 5}>+ Add criterion</button>

          <div className="rule" />
          <div className="panel-heading compact">
            <div><p className="section-kicker">02 / ATTACH EVIDENCE</p><h2>Pin what can be checked</h2></div>
            <span className="step-count">{draft.evidencePaths.length}/3 files</span>
          </div>
          <label className="field-label" htmlFor="repo-url">Public GitHub repository</label>
          <input id="repo-url" className="text-input mono" value={draft.repoUrl} onChange={(event) => updateDraft("repoUrl", event.target.value)} placeholder="https://github.com/owner/repository" autoComplete="off" />
          <p className="field-hint below">Only canonical public GitHub URLs are accepted. No tokens, private repos, redirects, or arbitrary hosts.</p>
          <label className="field-label" htmlFor="commit-sha">Exact commit SHA <span className="required">required</span></label>
          <input id="commit-sha" className="text-input mono" value={draft.commitSha} onChange={(event) => updateDraft("commitSha", event.target.value)} placeholder="40 hexadecimal characters" inputMode="text" autoComplete="off" />
          <p className="field-hint below">A branch, tag, short SHA, or moving URL is not enough.</p>
          <div className="field-row-label"><label className="field-label" htmlFor="evidence-0">Repo-relative evidence paths</label><span className="field-hint">Max 80 KiB each</span></div>
          <div className="repeat-list">
            {draft.evidencePaths.map((path, index) => (
              <div className="repeat-row" key={`evidence-${index}`}>
                <span className="path-prefix">/</span>
                <input id={`evidence-${index}`} className="text-input mono" value={path} onChange={(event) => updateArray("evidencePaths", index, event.target.value)} placeholder="src/feature.ts" />
                <button type="button" className="icon-button" onClick={() => removeArrayItem("evidencePaths", index)} aria-label={`Remove evidence path ${index + 1}`} disabled={draft.evidencePaths.length <= 1}>×</button>
              </div>
            ))}
          </div>
          <button type="button" className="text-button" onClick={() => addArrayItem("evidencePaths", 3)} disabled={draft.evidencePaths.length >= 3}>+ Add evidence path</button>

          <div className="form-footer">
            <div className="form-status" aria-live="polite">
              <span className={stepState.criteria ? "status-check done" : "status-check"}>✓</span> criteria
              <span className={stepState.commit ? "status-check done" : "status-check"}>✓</span> full SHA
              <span className={stepState.evidence ? "status-check done" : "status-check"}>✓</span> evidence
            </div>
            <button className="primary-button" type="submit" disabled={busy}>{busy ? "Checking…" : "Run read-only preflight →"}</button>
          </div>
          {error && <div className="alert error" role="alert">{error}</div>}
          {notice && !error && <div className="alert success" role="status">{notice}</div>}
        </form>

        <aside className="side-column">
          <div className="panel flow-panel">
            <div className="panel-heading"><div><p className="section-kicker">HOW IT WORKS</p><h2>Three layers of proof</h2></div></div>
            <div className="flow-step"><span className="flow-number">01</span><div><strong>Pin the source</strong><p>Commit SHA + bounded paths lock the evidence surface.</p></div></div>
            <div className="flow-line" />
            <div className="flow-step"><span className="flow-number">02</span><div><strong>Preview locally</strong><p>See fetched files, checksums, warnings, and citations.</p></div></div>
            <div className="flow-line" />
            <div className="flow-step muted"><span className="flow-number">03</span><div><strong>Review + submit once</strong><p>MetaMask shows the exact GenLayer call; a human decides whether to confirm it.</p></div></div>
          </div>
          <div className="panel guardrail-panel">
            <div className="guardrail-icon" aria-hidden="true">⌁</div>
            <div><strong>Commit ≠ deployment</strong><p>Source evidence can show intent and implementation. It cannot prove a live service works.</p></div>
          </div>
        </aside>
      </section>

      <section className="results-section" aria-label="Preflight results">
        <div className="section-heading"><div><p className="section-kicker">03 / VERIFY & PREVIEW</p><h2>Evidence desk</h2></div><span className="read-only-tag">READ-ONLY</span></div>
        {!preflight && <div className="empty-state"><div className="empty-orbit" aria-hidden="true">◎</div><div><strong>Nothing pinned yet</strong><p>Run a preflight to see exactly what was fetched from GitHub. Network failures stay visible and do not become a verdict.</p></div></div>}
        {preflight && validated && (
          <div className="results-grid">
            <div className="panel commit-card">
              <div className="card-label">VERIFIED COMMIT METADATA</div>
              <div className="commit-repo"><span className="repo-glyph">⌘</span><strong>{preflight.repository.fullName}</strong><a href={preflight.repository.htmlUrl} target="_blank" rel="noreferrer">Open ↗</a></div>
              <code className="sha-block">{shortSha(preflight.repository.commitSha)}</code>
              <p className="commit-message">{preflight.repository.message}</p>
              <div className="commit-meta"><span>by {preflight.repository.author}</span><span>{preflight.repository.committedAt ? new Date(preflight.repository.committedAt).toLocaleDateString() : "date unavailable"}</span></div>
              <button type="button" className="secondary-button" onClick={createPreview} disabled={!canPreview}>Generate local preview</button>
            </div>
            <div className="panel files-card"><div className="card-label">FETCHED EVIDENCE <span>{preflight.files.length} FILES</span></div>{preflight.files.map((file) => <div className="file-row" key={file.path}><span className="file-icon">▧</span><div className="file-main"><strong>{file.path}</strong><span>{formatBytes(file.bytes)} · SHA-256 <code>{file.sha256.slice(0, 12)}…</code></span><details className="file-excerpt"><summary>Inspect bounded excerpt</summary><pre>{file.excerpt}</pre></details></div><span className="file-ok">OK</span></div>)}{preflight.warnings.map((warning) => <div className="warning-line" key={warning}>⚠ {warning}</div>)}</div>
          </div>
        )}
        {preview && <div className="preview-card panel"><div className="preview-summary"><div><span className="preview-label"><span className="status-dot" /> LOCAL PREVIEW</span><h3>{preview.verdict}</h3><p>{preview.explanation}</p></div><div className="preview-seal" aria-hidden="true">LC<br /><small>NO CHAIN</small></div></div><div className="criteria-results">{preview.criteria.map((criterion, index) => <div className="criterion-result" key={criterion.criterion}><span className="result-number">{String(index + 1).padStart(2, "0")}</span><div><strong>{criterion.criterion}</strong><p>{criterion.explanation}</p><span className="citation-list">{criterion.citations.map((citation) => <code key={citation}>{citation}</code>)}</span></div><span className="criterion-status">{criterion.status}</span></div>)}</div><div className="disabled-chain"><span>CHAIN SUBMISSION</span><strong>{contractReadiness.deployed ? "Available below — human wallet confirmation required" : "Unavailable — contract not verified"}</strong></div></div>}
        {contractReadiness.deployed && <InteractiveAssessmentPanel validated={validated} />}
      </section>

      <section className="history-section" aria-label="Local history">
        <div className="section-heading"><div><p className="section-kicker">LOCAL MEMORY</p><h2>Recent previews</h2></div><span className="storage-note">Browser local storage · no account</span></div>
        {history.length === 0 ? <p className="history-empty">Your previews will appear here on this device.</p> : <div className="history-list">{history.map((item) => <div className="history-row" key={item.id}><span className="history-status">{item.verdict}</span><div><strong>{item.title}</strong><span>{item.repoUrl} · {shortSha(item.commitSha)}</span></div><span>{item.evidenceCount} file{item.evidenceCount === 1 ? "" : "s"}</span></div>)}</div>}
      </section>

      <footer className="footer"><span>CommitCourt / evidence + user-controlled GenLayer assessments</span><span>NO SERVER KEYS · NO AUTOMATIC RETRIES · HUMAN WALLET CONFIRMATION</span></footer>
    </main>
  );
}
