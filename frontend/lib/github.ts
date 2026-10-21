import { createHash } from "node:crypto";
import type { PreflightResult, ValidatedSubmission, EvidenceFile } from "./types";
import {
  MAX_EVIDENCE_BYTES,
  MAX_TOTAL_EVIDENCE_BYTES,
  isAllowedGitHubApiUrl,
  isAllowedRawGitHubUrl,
} from "./validation";

const FETCH_TIMEOUT_MS = 8_000;
const EXCERPT_BYTES = 1_200;

export type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

export class GitHubPreflightError extends Error {
  status: number;
  code: "not_found" | "rate_limited" | "forbidden" | "timeout" | "invalid_response" | "unavailable";

  constructor(message: string, code: GitHubPreflightError["code"], status = 502) {
    super(message);
    this.name = "GitHubPreflightError";
    this.code = code;
    this.status = status;
  }
}

function makeHeaders(): HeadersInit {
  return {
    Accept: "application/vnd.github+json",
    "User-Agent": "CommitCourt-local-preview/0.1",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

function withTimeout(fetchImpl: FetchLike, url: string, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  return fetchImpl(url, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer));
}

function classifyHttp(status: number): GitHubPreflightError {
  if (status === 404) return new GitHubPreflightError("GitHub could not find the pinned repository or file.", "not_found", 404);
  if (status === 403 || status === 429) return new GitHubPreflightError("GitHub refused the read-only request, often due to a rate limit.", "rate_limited", 429);
  return new GitHubPreflightError("GitHub returned an unexpected response.", "unavailable", 502);
}

async function readJson(response: Response): Promise<unknown> {
  try {
    const body = await readBoundedText(response);
    return JSON.parse(body.text);
  } catch {
    throw new GitHubPreflightError("GitHub returned invalid metadata.", "invalid_response", 502);
  }
}

async function readBoundedText(response: Response): Promise<{ text: string; bytes: number; contentType: string }> {
  const declaredLength = response.headers.get("content-length");
  if (declaredLength && Number(declaredLength) > MAX_EVIDENCE_BYTES) {
    throw new GitHubPreflightError("An evidence file exceeds the 80 KiB limit.", "invalid_response", 413);
  }
  let buffer: Uint8Array;
  if (response.body) {
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
      while (true) {
        const next = await reader.read();
        if (next.done) break;
        if (!next.value) continue;
        total += next.value.byteLength;
        if (total > MAX_EVIDENCE_BYTES) {
          await reader.cancel();
          throw new GitHubPreflightError("An evidence file exceeds the 80 KiB limit.", "invalid_response", 413);
        }
        chunks.push(next.value);
      }
    } finally {
      reader.releaseLock();
    }
    buffer = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      buffer.set(chunk, offset);
      offset += chunk.byteLength;
    }
  } else {
    buffer = new Uint8Array(await response.arrayBuffer());
    if (buffer.byteLength > MAX_EVIDENCE_BYTES) {
      throw new GitHubPreflightError("An evidence file exceeds the 80 KiB limit.", "invalid_response", 413);
    }
  }
  if (buffer.includes(0)) {
    throw new GitHubPreflightError("Binary evidence files are not accepted.", "invalid_response", 415);
  }
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    throw new GitHubPreflightError("Evidence must be valid UTF-8 text.", "invalid_response", 415);
  }
  return { text, bytes: buffer.byteLength, contentType: response.headers.get("content-type") ?? "unknown" };
}

function hashText(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function excerpt(value: string): string {
  return value.slice(0, EXCERPT_BYTES).replace(/\r\n/g, "\n");
}

function isTextualContentType(contentType: string): boolean {
  const normalized = contentType.toLowerCase();
  return normalized.startsWith("text/") || normalized.includes("json") || normalized.includes("javascript") || normalized.includes("xml");
}

export function buildRawEvidenceUrl(input: ValidatedSubmission, path: string): string {
  const url = `https://raw.githubusercontent.com/${input.owner}/${input.repo}/${input.commitSha}/${path}`;
  if (!isAllowedRawGitHubUrl(url)) throw new GitHubPreflightError("Generated evidence URL failed host validation.", "invalid_response", 400);
  return url;
}

export async function preflightEvidence(input: ValidatedSubmission, fetchImpl: FetchLike = fetch): Promise<PreflightResult> {
  const apiUrl = `https://api.github.com/repos/${input.owner}/${input.repo}/commits/${input.commitSha}`;
  if (!isAllowedGitHubApiUrl(apiUrl)) throw new GitHubPreflightError("Generated GitHub API URL failed host validation.", "invalid_response", 400);

  let commitResponse: Response;
  try {
    commitResponse = await withTimeout(fetchImpl, apiUrl, { headers: makeHeaders(), redirect: "error" });
  } catch (error) {
    if (error instanceof GitHubPreflightError) throw error;
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new GitHubPreflightError("GitHub did not respond before the read-only timeout.", "timeout", 504);
    }
    throw new GitHubPreflightError("GitHub is unavailable for this read-only preflight.", "unavailable", 502);
  }
  if (!commitResponse.ok) throw classifyHttp(commitResponse.status);
  const metadata = await readJson(commitResponse) as Record<string, unknown>;
  const metadataSha = typeof metadata.sha === "string" ? metadata.sha.toLowerCase() : "";
  if (metadataSha !== input.commitSha) {
    throw new GitHubPreflightError("GitHub metadata did not match the requested full SHA.", "invalid_response", 409);
  }
  const repository = (metadata.repository ?? {}) as Record<string, unknown>;
  const author = ((metadata.commit ?? {}) as Record<string, unknown>).author as Record<string, unknown> | undefined;
  const commitMessage = ((metadata.commit ?? {}) as Record<string, unknown>).message;
  const htmlUrl = typeof metadata.html_url === "string" ? metadata.html_url : input.repoUrl;

  const files: EvidenceFile[] = [];
  let totalBytes = 0;
  const warnings: string[] = [];
  for (const path of input.evidencePaths) {
    const rawUrl = buildRawEvidenceUrl(input, path);
    let response: Response;
    try {
      response = await withTimeout(fetchImpl, rawUrl, { headers: { "User-Agent": "CommitCourt-local-preview/0.1" }, redirect: "error" });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new GitHubPreflightError(`GitHub timed out while reading ${path}.`, "timeout", 504);
      }
      throw new GitHubPreflightError(`GitHub could not read ${path}.`, "unavailable", 502);
    }
    if (!response.ok) throw classifyHttp(response.status);
    const content = await readBoundedText(response);
    if (!isTextualContentType(content.contentType)) {
      warnings.push(`${path} was served as ${content.contentType}; it was accepted only because it decoded as bounded UTF-8 text.`);
    }
    totalBytes += content.bytes;
    if (totalBytes > MAX_TOTAL_EVIDENCE_BYTES) {
      throw new GitHubPreflightError("The selected evidence exceeds the combined 160 KiB limit.", "invalid_response", 413);
    }
    files.push({
      path,
      rawUrl,
      sha256: hashText(content.text),
      bytes: content.bytes,
      contentType: content.contentType,
      excerpt: excerpt(content.text),
      warnings: [],
    });
  }

  if (files.some((file) => file.bytes === 0)) warnings.push("One or more selected files are empty; empty files cannot prove a criterion.");
  if (files.some((file) => /ignore|instruction|prompt/i.test(file.excerpt))) {
    warnings.push("Evidence contains instruction-like text. It is displayed as untrusted source text and is never executed.");
  }
  return {
    repository: {
      owner: input.owner,
      name: input.repo,
      fullName: typeof repository.full_name === "string" ? repository.full_name : `${input.owner}/${input.repo}`,
      htmlUrl,
      commitSha: input.commitSha,
      message: typeof commitMessage === "string" ? commitMessage.split("\n")[0].slice(0, 240) : "Commit message unavailable",
      author: author && typeof author.name === "string" ? author.name : "Author unavailable",
      committedAt: author && typeof author.date === "string" ? author.date : null,
    },
    files,
    warnings,
    checkedAt: new Date().toISOString(),
  };
}
