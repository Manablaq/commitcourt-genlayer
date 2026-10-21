# CommitCourt — AI-Assessed GitHub Delivery Evidence

**Public beta | GenLayer Intelligent Contract + Next.js**

**Live app:** https://commitcourt-genlayer.vercel.app  
**GenLayer network:** Studio Devnet, chain ID `61997`  
**Intelligent Contract:** `0xEe22361e7b2c50741cbbcc0e5bA357BBC05133E3`  
**Verified contract SHA-256:** `1c080d6ba32393fd07fdcbe555b0f558abced13c1e0fd1709568d74aa9f26fe5`

CommitCourt is a proof-of-delivery interface that asks whether a specific GitHub commit satisfies stated acceptance criteria. Instead of trusting an unverified self-report, a GenLayer Intelligent Contract retrieves pinned public repository evidence, evaluates natural-language criteria, and uses validator consensus to finalize an assessment stored on-chain.

## Why an Intelligent Contract?

Many software delivery criteria are written in natural language and require interpretation of real code or documentation. Deterministic smart contracts cannot readily fetch immutable GitHub evidence and reason about its relevance to a human-written criterion. CommitCourt uses GenLayer's web-aware AI execution plus independent validator checks to make this narrow assessment auditable. It is *not* an automatic proof that arbitrary code is secure, correct, or complete beyond the submitted criteria.

## Functionality

- Connect an EIP-1193-compatible wallet using an explicit user action.
- Guide wallet users to Studio Devnet; no automatic account or network switching.
- Enter a GitHub repository URL, full commit SHA, criteria, and evidence paths.
- Run a read-only repository preflight and show a fee preview before user-approved assessment submission.
- Track consensus and distinguish **ACCEPTED** from **UNDETERMINED**, **REJECTED**, and pending results.
- Read stored finalized assessments without a wallet; the public reference result loads by default.
- Show previously recorded browser-side assessment history and allow safe read-only lookup retries.

## Certified example

| Field | Verified value |
| --- | --- |
| Assessment ID | `cc-v05-live-20261021-a1` |
| GitHub repository | https://github.com/octocat/Hello-World |
| Pinned commit | `7fd1a60b01f91b314f59955a4e4d4e80d8edf11d` |
| File | `README` |
| Criterion | The README file contains the text `Hello World!` |
| Verdict | **COMPLETE** |
| Criterion status | **MET** |
| Evidence SHA-256 | `03ba204e50d126e4674c005e04d82e84c21366780af1f43bd54a37816b6ab340` |
| GenLayer transaction | `0x4c02b42ffa742cd701bc283e847a08a720323c724e78da96bc8424236fe80c9e` |
| Lifecycle | FINALIZED / FINISHED_WITH_RETURN / consensus **accepted** |
| Finalized totals | `{"assessment_count":1}` |

The deployed contract's source was read back from Studio Devnet and matched the frozen SHA-256 above. The certified read-only verification reported `R8_BACKEND_ONCHAIN_LIFECYCLE=PASS`, with the stored assessment and immutable evidence digest matching the test case. See [`REVIEWER_EVIDENCE.md`](./REVIEWER_EVIDENCE.md).

## Repository layout

- `contracts/commit_court_studio_v05.py` — exact source deployed on Studio Devnet.
- `frontend/` — Next.js user interface and automated TypeScript/React tests.
- `REVIEWER_EVIDENCE.md` — deployment, consensus, readback and limitations.
- `SUBMISSION_FORM.md` — copy-ready project description and submission references.
- `DEMO_SCRIPT.md` — safe, read-only demo for reviewers.

## Run locally

Requirements: Node.js 24, npm, and a compatible browser with optional EIP-1193 wallet.

```bash
cd frontend
npm ci
npm run lint
npm test
npm run typecheck
npm run build
npm run dev
```

Browse http://localhost:3000. The read-only assessment does **not** need a wallet. All live writes require user confirmation and test GEN. Do not send real assets to Studio Devnet.

## Scope and important limitation

**Studio Devnet (61997) is a release-candidate development preview that can be reset without retaining state.** The live contract address and reference result are certified as of October 21, 2026, not promised to persist forever. This is a working public beta, not a mainnet product, escrow service, security audit tool, or payment-settlement system. Publishing this source does not imply that every possible GitHub repository or criterion has been tested. The source license is intentionally not asserted without the owner's selection.

The demonstration should use the saved read-only result; **do not submit additional paid assessments for the purpose of reviewing this repository**.

## Helpful links

- [Live public beta](https://commitcourt-genlayer.vercel.app)
- [GenLayer Studio Devnet](https://studio-dev.genlayer.com/)
- [GenLayer Studio environments](https://docs.genlayer.com/developers/intelligent-contracts/tools/genlayer-studio)
- [GenLayer Builder Portal](https://portal.genlayer.foundation/)
