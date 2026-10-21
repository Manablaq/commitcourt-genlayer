# CommitCourt — copy-ready Builder contribution

## Project name
CommitCourt

## Tagline
AI-validator consensus for GitHub delivery evidence.

## Short description
CommitCourt turns natural-language software delivery criteria into transparent, on-chain assessments. It pins a GitHub repository to a specific commit, gathers named evidence files, uses GenLayer Intelligent Contract AI reasoning and validator consensus to decide whether the submitted criterion is met, and stores the accepted verdict for anyone to verify.

## Longer description
Software acceptance criteria often demand judgment: did the submitted code or documentation actually satisfy the agreed requirement? CommitCourt provides a narrow, verifiable workflow for this problem. A user supplies a public GitHub repository, immutable commit SHA, explicit criterion and evidence paths. GenLayer's web-aware Intelligent Contract retrieves the pinned evidence, produces a criterion-level judgment, and validates it through AI-enabled consensus. The frontend previews the fee, requires an explicit wallet confirmation for a write, distinguishes accepted outcomes from inconclusive consensus, and offers wallet-free readback of the accepted result. A real Devnet assessment reached finalized accepted consensus with verdict COMPLETE, criterion MET, matching evidence digest and persisted storage. It is a public beta on an explicitly temporary development-preview chain; it does not certify arbitrary code quality or provide payment escrow.

## Why GenLayer?
Natural-language code acceptance is not purely deterministic. GenLayer enables an Intelligent Contract to inspect web evidence and have independent AI validators agree on a judgment before storage finalizes. The source evidence is bound to a commit and SHA-256 digest, so review can be reproduced and scoped to what was actually assessed.

## Category / use case
AI adjudication / developer tooling / subjective consensus / software delivery verification. Select the closest *available* category shown in the actual submission portal.

## Links
- Live app: https://commitcourt-genlayer.vercel.app
- Public GitHub repository: https://github.com/Manablaq/commitcourt-genlayer
- GenLayer Builder Portal: https://portal.genlayer.foundation/
- Source documentation: README.md and REVIEWER_EVIDENCE.md in the public repository

## Network and chain evidence
- Network: Studio Devnet, chain ID `61997`, RPC `https://studio-dev.genlayer.com/api`.
- Contract: `0xEe22361e7b2c50741cbbcc0e5bA357BBC05133E3`
- Deployment tx: `0xfd1183c59d58d61b560568a44c2dbe6342a66e0a6d03031e77c52607132cdce5`
- Accepted assessment tx: `0x4c02b42ffa742cd701bc283e847a08a720323c724e78da96bc8424236fe80c9e`
- Assessment ID: `cc-v05-live-20261021-a1`
- Stored verdict: `COMPLETE`, criterion `MET`, finalized `assessment_count=1`.

## Test evidence
- Frontend: 45 passing automated tests; lint, TypeScript and production build passed.
- Intelligent Contract: R7 deployment integrity certification PASS and R8 accepted consensus plus finalized stored assessment certification PASS.
- Exact deployed contract source SHA-256: `1c080d6ba32393fd07fdcbe555b0f558abced13c1e0fd1709568d74aa9f26fe5`.

## Disclosures
Studio Devnet is a release-candidate development preview that may reset or lose state. The single published fixture does not show comprehensive coverage of all criteria and repositories. The frontend is a beta and requires explicit wallet approval for paid on-chain writes. No security audit, mainnet availability, escrow, payout, or permanent storage is claimed.

## Submission status
**Ready for portal submission — not yet submitted.** The source repository URL is published. Supply any portal-required proof (e.g. screenshots or demo video) before final submission. Portal authentication and final submit action are performed by the account owner.
