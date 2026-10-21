# CommitCourt — Verified on-chain evidence (2026-10-21)

This file records the release evidence captured from the GenLayer Studio transaction page and two subsequent **read-only** `genlayer-js@2.0.0-rc.1` certification guards. It does not claim independent post-submission revalidation or future permanence.

## Network and deployed contract

| Attribute | Value |
| --- | --- |
| Network | GenLayer Studio Devnet (release-candidate preview) |
| Chain ID | `61997` / `0xf22d` |
| RPC | `https://studio-dev.genlayer.com/api` |
| Contract | `0xEe22361e7b2c50741cbbcc0e5bA357BBC05133E3` |
| Contract source SHA-256 | `1c080d6ba32393fd07fdcbe555b0f558abced13c1e0fd1709568d74aa9f26fe5` |
| Deployed source bytes | `16432` |
| Deployment transaction | `0xfd1183c59d58d61b560568a44c2dbe6342a66e0a6d03031e77c52607132cdce5` |
| Deployment lifecycle | `FINALIZED`, `FINISHED_WITH_RETURN`, consensus `accepted` |
| Deployment fee reported | `94,778,700,002,588` wei / `0.000094778700002588` GEN |

The `R7` read-only verification reported:

```text
DEPLOY_TX_ADDRESS_MATCH=PASS
DEPLOY_EXECUTION_SUCCESS=PASS
DEPLOY_CONSENSUS_ACCEPTED=PASS
DEPLOYED_SOURCE_MATCH=PASS
NEW_CONTRACT_INITIALIZED_READABLE=PASS
R7_DEPLOYMENT_CERTIFICATION=PASS
```

## Live assessment: one accepted case

| Attribute | Value |
| --- | --- |
| Assessment ID | `cc-v05-live-20261021-a1` |
| Method | `evaluate(assessment_id, repo_url, commit_sha, criteria_json, evidence_paths_json)` |
| Repository | `https://github.com/octocat/Hello-World` |
| Full commit | `7fd1a60b01f91b314f59955a4e4d4e80d8edf11d` |
| Criterion | `The README file contains the text Hello World!` |
| Evidence path | `README` |
| Expected file content | `Hello World!` plus newline |
| Evidence SHA-256 | `03ba204e50d126e4674c005e04d82e84c21366780af1f43bd54a37816b6ab340` |
| Assessment transaction | `0x4c02b42ffa742cd701bc283e847a08a720323c724e78da96bc8424236fe80c9e` |
| Transaction lifecycle | `FINALIZED`, `FINISHED_WITH_RETURN`, consensus `accepted` |
| Studio result | `COMPLETE` |
| Recorded criterion | `MET` |
| Assessment fee reported | `96,966,300,002,588` wei / `0.000096966300002588` GEN |
| Finalized contract total | `{"assessment_count":1}` |

The GenLayer Studio history reported three validator agreements, with two other validators cancelled after quorum. The `R8` read-only verification confirmed that `get_assessment` returned the expected ID, repository, pinned commit, criterion record, verdict, evidence digest and stored total:

```text
TX_RECIPIENT_MATCH=PASS
TX_EXECUTION_FINISHED_WITH_RETURN=PASS
TX_CONSENSUS_ACCEPTED=PASS
FINALIZED_ASSESSMENT_OBJECT_PRESENT=PASS
ASSESSMENT_ID_REPO_COMMIT_MATCH=PASS
CRITERION_RECORD_VALID=PASS
VERDICT_RECORD_VALID=PASS
IMMUTABLE_EVIDENCE_DIGEST_MATCH=PASS
ASSESSMENT_COUNT_NOW_ONE=PASS
GITHUB_HELLO_WORLD_FIXTURE_CLASSIFICATION=PASS
R8_BACKEND_ONCHAIN_LIFECYCLE=PASS
R8_SEMANTIC_FIXTURE_EXPECTATION=PASS
```

## Frontend release

- Production URL: `https://commitcourt-genlayer.vercel.app`
- Vercel project: `prj_UoiJdFNyO2a9mWwmnvsXQA08okkN`
- Certified production deployment: `dpl_DVt61BNEchYGoZkDQfXwFAZzGqYk`
- Frontend locally reported: ESLint PASS; TypeScript PASS; optimized Next.js build PASS; **45 / 45 tests passed** (9 files).
- Production deployment: READY; primary domain alias independently verified to point at the cited deployment.
- Owner confirmed desktop/mobile preview visually acceptable and reported no visitor complaints.

## Boundaries

The v05 semantic fixture verifies **one simple criterion against one immutable GitHub commit**, not all possible assessment scenarios. Mocked wallet tests do not equal a full automated real-browser E2E suite. The Studio Devnet may reset or redeploy without preserving storage or addresses; the release must not be described as mainnet or permanent. No funds are escrowed or transferred by the demonstration. Browser submission is deliberately user-confirmed; never auto-retry an uncertain transaction.
