"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GenLayerTransaction, TransactionFeeEstimate } from "genlayer-js/types";
import { readContractAssessment } from "@/lib/contract-read";
import { GENLAYER_STUDIO_DEVNET, GENLAYER_STUDIO_DEVNET_EIP1193 } from "@/lib/chain";
import type { ValidatedSubmission } from "@/lib/types";
import {
  buildAssessmentId,
  buildEvaluateArgs,
  createWalletClient,
  estimateAssessmentFees,
  formatWei,
  normalizeChainId,
  publicAccounts,
  readGasPrice,
  serializeFeeSummary,
  submitEvaluate,
  verifyWalletBinding,
  type Eip1193Provider,
  type EvaluateArgs,
} from "@/lib/interactive-contract";
import {
  appendSubmissionHistory,
  classifyTransaction,
  clearSubmission,
  isFinalizedPhase,
  isSubmissionTerminal,
  isWalletRejection,
  loadSubmissionHistory,
  nowIso,
  safeLoadSubmission,
  saveSubmission,
  saveSubmissionHistory,
  type StoredSubmission,
  type SubmissionPhase,
} from "@/lib/interactive-tracking";

type Props = { validated: ValidatedSubmission | null };
const EXPECTED_CHAIN_ID = `0x${GENLAYER_STUDIO_DEVNET.chainId.toString(16)}`;

type FeePreview = {
  estimate: TransactionFeeEstimate;
  gasPriceWei: bigint;
  balanceWei: bigint | null;
};

function providerFromWindow(): Eip1193Provider | undefined {
  if (typeof window === "undefined") return undefined;
  const candidate = (window as Window & { ethereum?: Eip1193Provider }).ethereum;
  return candidate;
}

function errorText(value: unknown) {
  if (value instanceof Error && value.message) return value.message;
  if (typeof value === "object" && value !== null && "message" in value && typeof value.message === "string") return value.message;
  return "The wallet or Studio Devnet request failed.";
}

function walletErrorCode(value: unknown) {
  return typeof value === "object" && value !== null && "code" in value && typeof value.code === "number" ? value.code : null;
}

function parseHexBigInt(value: unknown, label: string) {
  if (typeof value !== "string" || !/^0x[0-9a-f]+$/i.test(value)) throw new Error(`Studio Devnet returned an invalid ${label}.`);
  return BigInt(value);
}

function feeFingerprint(preview: FeePreview) {
  const serialized = serializeFeeSummary(preview.estimate);
  return JSON.stringify({
    ...serialized,
    messageAllocations: preview.estimate.messageAllocations ?? null,
    gasPriceWei: preview.gasPriceWei.toString(),
  }, (_, value) => typeof value === "bigint" ? value.toString() : value);
}

function displayStoredValue(value: unknown) {
  if (typeof value === "string") {
    try {
      return JSON.stringify(JSON.parse(value), null, 2);
    } catch {
      return value;
    }
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function phaseLabel(phase: SubmissionPhase) {
  return phase.replaceAll("-", " ").toUpperCase();
}

function transactionSummary(transaction: GenLayerTransaction) {
  return [
    transaction.statusName ? `status=${transaction.statusName}` : null,
    transaction.txExecutionResultName ? `execution=${transaction.txExecutionResultName}` : null,
    transaction.lifecycle ? `lifecycle=${transaction.lifecycle.state}` : null,
  ].filter(Boolean).join(" · ");
}

export function InteractiveAssessmentPanel({ validated }: Props) {
  const providerRef = useRef<Eip1193Provider | undefined>(undefined);
  const submissionInFlight = useRef(false);
  const [providerAvailable, setProviderAvailable] = useState(false);
  const [account, setAccount] = useState("");
  const [accountCount, setAccountCount] = useState(0);
  const [chainId, setChainId] = useState<string | null>(null);
  const [walletError, setWalletError] = useState("");
  const [needsStudioNetworkAdd, setNeedsStudioNetworkAdd] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feePreview, setFeePreview] = useState<FeePreview | null>(null);
  const [submission, setSubmission] = useState<StoredSubmission | null>(null);
  const [history, setHistory] = useState<StoredSubmission[]>([]);
  const [readback, setReadback] = useState<unknown>(null);
  const [readbackError, setReadbackError] = useState("");
  const [statusDetail, setStatusDetail] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);

  useEffect(() => {
    const provider = providerFromWindow();
    providerRef.current = provider;
    void Promise.resolve().then(() => setProviderAvailable(Boolean(provider)));
    if (provider) {
      const handleAccountsChanged = (value: unknown) => {
        const accounts = publicAccounts(value);
        setAccountCount(accounts.length);
        setAccount(accounts[0] ?? "");
        setChainId(null);
        setFeePreview(null);
        setWalletError(accounts.length === 1 ? "Wallet account changed; reconnect to continue." : "Select exactly one wallet account to continue.");
      };
      const handleChainChanged = (value: unknown) => {
        setChainId(normalizeChainId(value));
        setFeePreview(null);
        setNeedsStudioNetworkAdd(false);
        setWalletError("Wallet network changed; reconnect on Studio Devnet before continuing.");
      };
      const handleDisconnect = () => {
        setAccount("");
        setAccountCount(0);
        setChainId(null);
        setFeePreview(null);
        setNeedsStudioNetworkAdd(false);
        setWalletError("Wallet disconnected. Reconnect explicitly before preparing an assessment.");
      };
      provider.on?.("accountsChanged", handleAccountsChanged);
      provider.on?.("chainChanged", handleChainChanged);
      provider.on?.("disconnect", handleDisconnect);
      return () => {
        provider.removeListener?.("accountsChanged", handleAccountsChanged);
        provider.removeListener?.("chainChanged", handleChainChanged);
        provider.removeListener?.("disconnect", handleDisconnect);
      };
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    void Promise.resolve().then(() => {
      const current = safeLoadSubmission(window.localStorage);
      const loadedHistory = loadSubmissionHistory(window.localStorage);
      const historyWithCurrent = current && isFinalizedPhase(current.phase)
        ? appendSubmissionHistory(loadedHistory, current)
        : loadedHistory;
      if (JSON.stringify(historyWithCurrent) !== JSON.stringify(loadedHistory)) saveSubmissionHistory(window.localStorage, historyWithCurrent);
      setSubmission(current);
      setHistory(historyWithCurrent);
    });
  }, []);

  const expectedChainId = EXPECTED_CHAIN_ID;
  const walletReady = Boolean(providerAvailable && account && accountCount === 1 && chainId === expectedChainId);
  const hasLockedAttempt = isSubmissionTerminal(submission);
  const finalized = isFinalizedPhase(submission?.phase);
  const argsForSubmission = useMemo<EvaluateArgs | null>(() => {
    if (!submission) return null;
    return submission.args;
  }, [submission]);

  function persistHistory(record: StoredSubmission) {
    setHistory((current) => {
      const next = appendSubmissionHistory(current, record);
      saveSubmissionHistory(window.localStorage, next);
      return next;
    });
  }

  const connectWallet = useCallback(async () => {
    const provider = providerRef.current ?? providerFromWindow();
    if (!provider) {
      setProviderAvailable(false);
      setWalletError("No injected MetaMask-compatible wallet was detected.");
      return;
    }
    providerRef.current = provider;
    setProviderAvailable(true);
    setWalletError("");
    setNeedsStudioNetworkAdd(false);
    try {
      const accounts = publicAccounts(await provider.request({ method: "eth_requestAccounts" }));
      const selectedChainId = normalizeChainId(await provider.request({ method: "eth_chainId" }));
      setAccountCount(accounts.length);
      setAccount(accounts[0] ?? "");
      setChainId(selectedChainId);
      if (accounts.length !== 1) throw new Error("MetaMask returned multiple accounts; select exactly one account.");
      if (selectedChainId !== EXPECTED_CHAIN_ID) throw new Error(`Unsupported network. Switch MetaMask to Studio Devnet (${GENLAYER_STUDIO_DEVNET.chainId}) manually.`);
    } catch (caught) {
      setWalletError(errorText(caught));
    }
  }, []);

  useEffect(() => {
    const onHeaderConnect = () => { void connectWallet(); };
    window.addEventListener("commitcourt:connect-wallet", onHeaderConnect);
    return () => window.removeEventListener("commitcourt:connect-wallet", onHeaderConnect);
  }, [connectWallet]);

  function disconnectWallet() {
    setAccount("");
    setAccountCount(0);
    setChainId(null);
    setFeePreview(null);
    setWalletError("Wallet disconnected from this page. MetaMask permissions were not changed.");
  }

  async function readBalance(provider: Eip1193Provider) {
    try {
      return parseHexBigInt(await provider.request({ method: "eth_getBalance", params: [account, "latest"] }), "wallet balance");
    } catch {
      return null;
    }
  }

  async function prepareFeePreview() {
    setBusy(true);
    setWalletError("");
    setStatusDetail("");
    try {
      if (!walletReady || !providerRef.current) throw new Error(`Connect one wallet account on Studio Devnet (${GENLAYER_STUDIO_DEVNET.chainId}) first.`);
      if (!validated) throw new Error("Complete the read-only repository preflight before preparing an assessment.");
      if (hasLockedAttempt) throw new Error("This browser already has a one-shot submission in progress or recorded. Resume its hash; do not submit again.");
      if (finalized) throw new Error("Start another assessment explicitly after this transaction's final result has been recorded.");
      if (submission?.phase === "prepared") throw new Error("An assessment is already prepared. Review it or reload the page before preparing another.");
      const assessmentId = buildAssessmentId();
      const args = buildEvaluateArgs(validated, assessmentId);
      const provider = providerRef.current;
      await verifyWalletBinding(provider, account);
      const client = createWalletClient(provider, account);
      const estimate = await estimateAssessmentFees(client, args);
      const gasPriceWei = await readGasPrice(client);
      const balanceWei = await readBalance(provider);
      if (balanceWei !== null && balanceWei < estimate.feeValue) throw new Error(`Wallet balance is below the protocol fee (${formatWei(balanceWei)} < ${formatWei(estimate.feeValue)} wei).`);
      setFeePreview({ estimate, gasPriceWei, balanceWei });
      const prepared: StoredSubmission = { version: 1, assessmentId, args, phase: "prepared", updatedAt: nowIso() };
      saveSubmission(window.localStorage, prepared);
      setSubmission(prepared);
      setAcknowledged(false);
      setStatusDetail(`Prepared ${assessmentId}. The SDK will encode evaluate(${args.length} args) exactly as shown.`);
    } catch (caught) {
      setWalletError(errorText(caught));
    } finally {
      setBusy(false);
    }
  }

  async function switchToStudioDevnet() {
    const provider = providerRef.current ?? providerFromWindow();
    if (!provider) {
      setProviderAvailable(false);
      setWalletError("No injected MetaMask-compatible wallet was detected.");
      return;
    }
    setBusy(true);
    setWalletError("");
    try {
      await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: GENLAYER_STUDIO_DEVNET_EIP1193.chainId }] });
      const selectedChainId = normalizeChainId(await provider.request({ method: "eth_chainId" }));
      const accounts = publicAccounts(await provider.request({ method: "eth_accounts" }));
      setChainId(selectedChainId);
      setAccountCount(accounts.length);
      setAccount(accounts[0] ?? "");
      if (selectedChainId !== expectedChainId) throw new Error(`Wallet did not switch to Studio Devnet (${GENLAYER_STUDIO_DEVNET.chainId}).`);
      if (accounts.length !== 1) throw new Error("Select exactly one wallet account to continue.");
    } catch (caught) {
      if (walletErrorCode(caught) === 4902) {
        setNeedsStudioNetworkAdd(true);
        setWalletError("Studio Devnet is not configured in this wallet. Add it explicitly, then choose Switch to Studio Devnet.");
      } else {
        setWalletError(`Studio Devnet switch was not completed: ${errorText(caught)}`);
      }
    } finally {
      setBusy(false);
    }
  }

  async function addStudioDevnet() {
    const provider = providerRef.current ?? providerFromWindow();
    if (!provider) {
      setProviderAvailable(false);
      setWalletError("No injected MetaMask-compatible wallet was detected.");
      return;
    }
    setBusy(true);
    setWalletError("");
    try {
      await provider.request({ method: "wallet_addEthereumChain", params: [GENLAYER_STUDIO_DEVNET_EIP1193] });
      setNeedsStudioNetworkAdd(false);
      setWalletError("Studio Devnet was added. Choose Switch to Studio Devnet to continue.");
    } catch (caught) {
      setWalletError(`Studio Devnet was not added: ${errorText(caught)}`);
    } finally {
      setBusy(false);
    }
  }

  async function submitOnce() {
    setBusy(true);
    setWalletError("");
    setStatusDetail("");
    let durableSubmissionLocked = false;
    try {
      if (!walletReady || !providerRef.current) throw new Error("Wallet binding is not ready; nothing was submitted.");
      if (!submission || submission.phase !== "prepared" || !feePreview || !argsForSubmission) throw new Error("Prepare and review a fee quote before submitting.");
      if (!acknowledged) throw new Error("Review the fee, method arguments, and wallet confirmation requirement first.");
      if (submissionInFlight.current || hasLockedAttempt) throw new Error("A submission attempt is already locked. Do not retry.");
      submissionInFlight.current = true;
      const provider = providerRef.current;
      await verifyWalletBinding(provider, account);
      const client = createWalletClient(provider, account);
      const freshEstimate = await estimateAssessmentFees(client, argsForSubmission);
      const freshGasPriceWei = await readGasPrice(client);
      const freshBalanceWei = await readBalance(provider);
      const freshPreview = { estimate: freshEstimate, gasPriceWei: freshGasPriceWei, balanceWei: freshBalanceWei };
      if (feeFingerprint(freshPreview) !== feeFingerprint(feePreview)) throw new Error("The fee policy or distribution changed after review; nothing was submitted. Prepare a new assessment and authorization.");
      if (freshBalanceWei !== null && freshBalanceWei < freshEstimate.feeValue) throw new Error("Wallet balance is no longer sufficient for the reviewed protocol fee; nothing was submitted.");
      const locked: StoredSubmission = { ...submission, phase: "submitting", updatedAt: nowIso(), error: undefined };
      saveSubmission(window.localStorage, locked);
      setSubmission(locked);
      durableSubmissionLocked = true;
      const txHash = await submitEvaluate(client, argsForSubmission, freshEstimate);
      if (typeof txHash !== "string" || !/^0x[0-9a-f]{64}$/i.test(txHash)) throw new Error("Wallet returned no usable transaction hash; the attempt is permanently locked.");
      const submitted: StoredSubmission = { ...locked, phase: "submitted", txHash, updatedAt: nowIso() };
      saveSubmission(window.localStorage, submitted);
      setSubmission(submitted);
      setStatusDetail("Wallet returned a transaction hash. No automatic polling or retry was started.");
    } catch (caught) {
      const message = errorText(caught);
      if (submission && submission.phase === "prepared" && durableSubmissionLocked) {
        const failed: StoredSubmission = { ...submission, phase: isWalletRejection(caught) ? "rejected" : "ambiguous", updatedAt: nowIso(), error: message };
        saveSubmission(window.localStorage, failed);
        setSubmission(failed);
      }
      setWalletError(isWalletRejection(caught) ? "MetaMask rejected the confirmation. No transaction hash was received; prepare a new assessment explicitly if desired." : `${message} No retry is allowed for an uncertain provider result.`);
    } finally {
      submissionInFlight.current = false;
      setBusy(false);
    }
  }

  async function checkStatus(waitForFinality: boolean) {
    setBusy(true);
    setWalletError("");
    setReadbackError("");
    const current = submission;
    if (!current?.txHash) {
      setWalletError("No transaction hash is recorded for this browser session.");
      setBusy(false);
      return;
    }
    let transaction: GenLayerTransaction;
    try {
      const provider = providerRef.current;
      const client = provider && account ? createWalletClient(provider, account) : undefined;
      if (!client) throw new Error("Reconnect a wallet to use the SDK read-only status client.");
      const transactionHash = current.txHash as `0x${string}` & { length: 66 };
      transaction = waitForFinality
        ? await client.waitForFinalization({ hash: transactionHash, interval: 3000, retries: 10, fullTransaction: true })
        : await client.getTransaction({ hash: transactionHash });
    } catch (caught) {
      const message = errorText(caught);
      if (waitForFinality && current?.txHash) {
        const timedOut: StoredSubmission = { ...current, phase: "timeout", updatedAt: nowIso(), error: message };
        saveSubmission(window.localStorage, timedOut);
        setSubmission(timedOut);
      }
      setWalletError(waitForFinality ? `Bounded finality check ended without proof of success: ${message}` : `Read-only transaction lookup failed: ${message}`);
      setBusy(false);
      return;
    }

    const phase = classifyTransaction(transaction);
    const next: StoredSubmission = { ...current, phase, updatedAt: nowIso(), error: undefined };
    saveSubmission(window.localStorage, next);
    setSubmission(next);
    setStatusDetail(transactionSummary(transaction));
    if (phase !== "finalized-success") {
      setReadback(null);
      if (isFinalizedPhase(phase)) persistHistory(next);
      setBusy(false);
      return;
    }

    persistHistory(next);
    try {
      const stored = await readContractAssessment(current.assessmentId);
      setReadback(stored);
      setReadbackError("");
      const completed: StoredSubmission = { ...next, result: stored, readbackError: undefined, updatedAt: nowIso() };
      saveSubmission(window.localStorage, completed);
      setSubmission(completed);
      persistHistory(completed);
      setStatusDetail("FINALIZED / FINISHED_WITH_RETURN. Stored assessment read back with get_assessment(assessment_id).");
    } catch (caught) {
      const message = errorText(caught);
      const finalWithReadbackError: StoredSubmission = { ...next, readbackError: message, updatedAt: nowIso() };
      saveSubmission(window.localStorage, finalWithReadbackError);
      setSubmission(finalWithReadbackError);
      persistHistory(finalWithReadbackError);
      setReadback(null);
      setReadbackError(`Finalized transaction is preserved, but the stored assessment lookup failed: ${message}`);
    } finally {
      setBusy(false);
    }
  }

  async function retryResultLookup() {
    const current = submission;
    if (!current || current.phase !== "finalized-success") return;
    setBusy(true);
    setReadbackError("");
    try {
      const stored = await readContractAssessment(current.assessmentId);
      setReadback(stored);
      const completed: StoredSubmission = { ...current, result: stored, readbackError: undefined, updatedAt: nowIso() };
      saveSubmission(window.localStorage, completed);
      setSubmission(completed);
      persistHistory(completed);
      setStatusDetail("FINALIZED / FINISHED_WITH_RETURN. Stored assessment read back with get_assessment(assessment_id).");
    } catch (caught) {
      const message = errorText(caught);
      const stillFinalized: StoredSubmission = { ...current, readbackError: message, updatedAt: nowIso() };
      saveSubmission(window.localStorage, stillFinalized);
      setSubmission(stillFinalized);
      persistHistory(stillFinalized);
      setReadbackError(`Finalized transaction is preserved, but the stored assessment lookup failed: ${message}`);
    } finally {
      setBusy(false);
    }
  }

  function startAnotherAssessment() {
    if (!submission || !isFinalizedPhase(submission.phase)) return;
    clearSubmission(window.localStorage);
    setSubmission(null);
    setFeePreview(null);
    setReadback(null);
    setReadbackError("");
    setAcknowledged(false);
    setWalletError("");
    setStatusDetail("Previous finalized assessment preserved below. Prepare a new assessment for a fresh ID and fee review.");
  }

  const feeSummary = feePreview ? serializeFeeSummary(feePreview.estimate) : null;

  return (
    <section className="panel interactive-panel" aria-labelledby="interactive-title">
      <div className="section-heading">
        <div>
          <p className="section-kicker">CHAIN ACTION / USER-CONTROLLED</p>
          <h2 id="interactive-title">Submit a real assessment</h2>
        </div>
        <span className="read-only-tag">METAMASK CONFIRMATION</span>
      </div>
      <p className="interactive-copy">This successor can request one GenLayer evaluation through the installed SDK. Codex does not connect wallets or sign; MetaMask shows the transaction and the human operator confirms it.</p>

      <div className="interactive-wallet-row">
        <div>
          <span className="card-label">WALLET</span>
          <code className="interactive-address">{account || "No account selected"}</code>
          <span className={walletReady ? "check-match" : "check-pending"}>{walletReady ? `READY · CHAIN ${GENLAYER_STUDIO_DEVNET.chainId}` : chainId ? `CHAIN ${chainId} · EXPECTED ${expectedChainId}` : "NOT CONNECTED"}</span>
        </div>
        <div className="interactive-wallet-actions">
          <button type="button" className="secondary-button" onClick={connectWallet} disabled={busy}>{providerAvailable ? "Connect MetaMask" : "Install / connect wallet"}</button>
          {chainId && chainId !== expectedChainId && <button type="button" className="text-button" onClick={switchToStudioDevnet} disabled={busy}>Switch to Studio Devnet</button>}
          {needsStudioNetworkAdd && <button type="button" className="text-button" onClick={addStudioDevnet} disabled={busy}>Add Studio Devnet to wallet</button>}
          {account && <button type="button" className="text-button" onClick={disconnectWallet} disabled={busy}>Disconnect locally</button>}
        </div>
      </div>

      {walletError && <p className="alert error" role="alert">{walletError}</p>}
      {!walletReady && <p className="alert success">Connect exactly one account and select Studio Devnet {GENLAYER_STUDIO_DEVNET.chainId}. Network switching occurs only after you press “Switch to Studio Devnet”.</p>}

      <div className="interactive-actions">
        <div>
          <span className="card-label">EXACT CONTRACT CALL</span>
          <code className="interactive-call">evaluate(assessment_id, repo_url, commit_sha, criteria_json, evidence_paths_json)</code>
          <p className="field-hint below">Candidate ABI: evaluate has five string arguments. The caller supplies a UUID assessment ID; the contract stores it as the key.</p>
        </div>
        <button type="button" className="primary-button" onClick={prepareFeePreview} disabled={busy || !walletReady || !validated || hasLockedAttempt || finalized || submission?.phase === "prepared"}>{busy ? "Working…" : !validated ? "Complete preflight first" : finalized ? "Start another assessment below" : "Preview fee and prepare"}</button>
      </div>

      {feeSummary && submission?.phase === "prepared" && feePreview && (
        <div className="interactive-review">
          <div className="card-label">FEE REVIEW / NO SUBMISSION YET</div>
          <div className="fee-grid">
            <div><span>Protocol fee</span><strong>{feeSummary.feeValueWei} wei</strong><small>{feeSummary.feeValueGen}</small></div>
            <div><span>Current EVM gas price</span><strong>{feePreview.gasPriceWei.toString()} wei</strong><small>Gas limit is selected by the SDK/wallet transaction path.</small></div>
            <div><span>Potential wallet outlay</span><strong>{feeSummary.feeValueWei} wei + EVM gas</strong><small>MetaMask displays the final gas component before confirmation.</small></div>
            <div><span>Wallet balance</span><strong>{feePreview.balanceWei === null ? "Not available" : `${feePreview.balanceWei.toString()} wei`}</strong><small>Read-only eth_getBalance.</small></div>
          </div>
          <details className="fee-details"><summary>Inspect complete SDK policy and distribution</summary><pre>{JSON.stringify({ distribution: feeSummary.distribution, policy: feeSummary.policy }, null, 2)}</pre></details>
          <div className="argument-review">
            <span className="card-label">ARGUMENTS TO SDK WRITE</span>
            <pre>{JSON.stringify(submission.args, null, 2)}</pre>
          </div>
          <label className="review-check"><input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} /> I reviewed the exact call arguments and fee preview; I will separately inspect and approve the MetaMask confirmation.</label>
          <button type="button" className="primary-button" onClick={submitOnce} disabled={busy || !acknowledged || !walletReady}>{busy ? "Waiting for wallet…" : "Submit once — open MetaMask"}</button>
        </div>
      )}

      {submission && (
        <div className="interactive-tracking" aria-live="polite">
          <div className="card-label">DURABLE TRANSACTION TRACKING <span>{phaseLabel(submission.phase)}</span></div>
          <p className="tracking-id">Assessment ID <code>{submission.assessmentId}</code></p>
          {submission.txHash && <p className="tracking-hash">Transaction hash <code>{submission.txHash}</code></p>}
          {submission.error && <p className="alert error">{submission.error}</p>}
          <div className="tracking-actions">
            <button type="button" className="secondary-button" onClick={() => checkStatus(false)} disabled={busy || !submission.txHash}>Read current lifecycle</button>
            <button type="button" className="secondary-button" onClick={() => checkStatus(true)} disabled={busy || !submission.txHash}>Bounded finality check</button>
          </div>
          {statusDetail && <p className="field-hint below">{statusDetail}</p>}
          {readbackError && <div className="alert error" role="alert"><p>{readbackError}</p><button type="button" className="text-button" onClick={retryResultLookup} disabled={busy || submission.phase !== "finalized-success"}>Retry result lookup</button></div>}
          {readback !== null && <div className="readback"><span className="card-label">FINALIZED STORED ASSESSMENT</span><pre>{displayStoredValue(readback)}</pre></div>}
          {submission.phase === "decided-accepted" && <p className="alert success">Consensus is ACCEPTED/decided. This is not final execution success; wait for FINALIZED / FINISHED_WITH_RETURN.</p>}
          {submission.phase === "decided-undetermined" && <p className="alert error">Consensus is UNDETERMINED. This is neither acceptance nor finalized execution success; reconcile the recorded transaction read-only.</p>}
          {submission.phase === "decided-rejected" && <p className="alert error">Consensus is REJECTED. No retry or resubmission is offered for this recorded transaction.</p>}
          {submission.phase === "finalized-error" && <p className="alert error">The transaction finalized without FINISHED_WITH_RETURN. No retry or resubmission is offered.</p>}
          {submission.phase === "timeout" && <p className="alert error">The bounded status check timed out. The recorded transaction remains the only attempt; reconcile it read-only.</p>}
          {finalized && <button type="button" className="secondary-button start-another-button" onClick={startAnotherAssessment} disabled={busy}>Start another assessment</button>}
        </div>
      )}
      {history.length > 0 && <div className="interactive-history"><div className="card-label">COMPLETED ASSESSMENT HISTORY <span>{history.length}</span></div>{history.map((entry) => <div className="interactive-history-row" key={entry.assessmentId}><div><strong>{phaseLabel(entry.phase)}</strong><span>{entry.assessmentId}</span></div><code>{entry.txHash || "No transaction hash"}</code></div>)}</div>}
    </section>
  );
}
