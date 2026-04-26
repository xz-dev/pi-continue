import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { normalizeDocumentContent, resolveProjectContext, writeRepoDocument } from "../extensions/continue/src/project.ts";

test("normalizeDocumentContent trims trailing whitespace and ensures newline", () => {
	assert.equal(normalizeDocumentContent("a  \n\nb\t\n"), "a\n\nb\n");
});

test("writeRepoDocument avoids rewrites for normalized-equal content", async () => {
	const root = mkdtempSync(join(tmpdir(), "pi-continuation-doc-"));
	const docPath = join(root, "CONTINUE.md");
	try {
		const first = await writeRepoDocument(docPath, "line\n");
		const second = await writeRepoDocument(docPath, "line  \n");
		assert.equal(first, "updated");
		assert.equal(second, "unchanged");
		assert.equal(readFileSync(docPath, "utf8"), "line\n");
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("resolveProjectContext rejects project-root continuation document paths", async () => {
	const root = mkdtempSync(join(tmpdir(), "pi-continuation-root-path-"));
	try {
		const pi = {
			exec: async () => ({ stdout: `${root}\n`, code: 0 }),
		};
		const context = await resolveProjectContext(pi, root, ".", "/outside/AGENTS.md");
		assert.equal(context.continuationDocPath, join(root, "CONTINUE.md"));
		assert.equal(context.agentGuidePath, join(root, "AGENTS.md"));
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});
