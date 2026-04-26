import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, normalize, relative, resolve, sep } from "node:path";
import type { ResolvedProjectContext } from "./types.ts";

interface ExecApi {
	exec(command: string, args: string[], options?: { cwd?: string; timeout?: number }): Promise<{
		stdout: string;
		code: number;
	}>;
}

const mutationQueues = new Map<string, Promise<void>>();

async function withMutationQueue(path: string, work: () => Promise<void>): Promise<void> {
	const previous = mutationQueues.get(path) ?? Promise.resolve();
	const next = previous.then(work, work);
	mutationQueues.set(path, next);
	try {
		await next;
	} finally {
		if (mutationQueues.get(path) === next) mutationQueues.delete(path);
	}
}

function trimTrailingWhitespace(value: string): string {
	return value
		.replace(/\r\n/g, "\n")
		.split("\n")
		.map((line) => line.replace(/[ \t]+$/g, ""))
		.join("\n")
		.trim();
}

/** Normalize markdown content before diffing or writing. */
export function normalizeDocumentContent(value: string): string {
	return `${trimTrailingWhitespace(value)}\n`;
}

async function getGitRoot(pi: ExecApi, cwd: string): Promise<string | undefined> {
	const result = await pi.exec("git", ["rev-parse", "--show-toplevel"], { cwd, timeout: 4000 });
	if (result.code !== 0) return undefined;
	const root = result.stdout.trim();
	return root.length > 0 ? root : undefined;
}

function sanitizeRepoRelativePath(projectRoot: string, configuredPath: string, fallback: string): string {
	const trimmed = normalize(configuredPath.trim()).replace(/^\.\//, "");
	if (trimmed.length === 0) return fallback;
	if (isAbsolute(trimmed)) return fallback;
	const resolved = resolve(projectRoot, trimmed);
	const rel = relative(projectRoot, resolved);
	if (rel === "" || rel === ".." || rel.startsWith(`..${sep}`)) return fallback;
	return trimmed;
}

function readOptionalFile(path: string): string | undefined {
	return existsSync(path) ? readFileSync(path, "utf8") : undefined;
}

/** Resolve repo-local continuation and agent-guide targets plus current content. */
export async function resolveProjectContext(
	pi: ExecApi,
	cwd: string,
	configuredDocPath: string,
	configuredAgentGuidePath = "AGENTS.md",
): Promise<ResolvedProjectContext> {
	const projectRoot = (await getGitRoot(pi, cwd)) ?? cwd;
	const repoRelativeDocPath = sanitizeRepoRelativePath(projectRoot, configuredDocPath, "CONTINUE.md");
	const repoRelativeAgentGuidePath = sanitizeRepoRelativePath(projectRoot, configuredAgentGuidePath, "AGENTS.md");
	const continuationDocPath = join(projectRoot, repoRelativeDocPath);
	const agentGuidePath = join(projectRoot, repoRelativeAgentGuidePath);
	return {
		projectRoot,
		continuationDocPath,
		existingContinuationDoc: readOptionalFile(continuationDocPath),
		agentGuidePath,
		existingAgentGuide: readOptionalFile(agentGuidePath),
	};
}

/** Write a durable repo-local document only when normalized content changes. */
export async function writeRepoDocument(path: string, content: string): Promise<"updated" | "unchanged"> {
	const normalized = normalizeDocumentContent(content);
	const existing = existsSync(path) ? readFileSync(path, "utf8") : undefined;
	if (existing !== undefined && normalizeDocumentContent(existing) === normalized) {
		return "unchanged";
	}
	await withMutationQueue(path, async () => {
		await mkdir(dirname(path), { recursive: true });
		await writeFile(path, normalized, "utf8");
	});
	return "updated";
}
