import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { PiCompactionSettings } from "./types.ts";
import { resolveAgentDir } from "./agent-dir.ts";

const DEFAULT_PI_COMPACTION_SETTINGS: PiCompactionSettings = {
	enabled: true,
	reserveTokens: 68000,
	keepRecentTokens: 20000,
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function asNumber(value: unknown): number | undefined {
	return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function readJson(path: string): unknown {
	if (!existsSync(path)) return undefined;
	try {
		return JSON.parse(readFileSync(path, "utf8"));
	} catch (error) {
		throw new Error(`Failed to read Pi settings at ${path}: ${errorMessage(error)}`);
	}
}

function readCompactionConfig(path: string): Partial<PiCompactionSettings> {
	const payload = readJson(path);
	if (!isRecord(payload) || !isRecord(payload.compaction)) return {};
	return {
		enabled: typeof payload.compaction.enabled === "boolean" ? payload.compaction.enabled : undefined,
		reserveTokens: asNumber(payload.compaction.reserveTokens),
		keepRecentTokens: asNumber(payload.compaction.keepRecentTokens),
	};
}

/** Read effective Pi core compaction settings from global and project settings files. */
export function readEffectivePiCompactionSettings(projectRoot: string): PiCompactionSettings {
	const globalPath = join(resolveAgentDir(), "settings.json");
	const projectPath = join(projectRoot, ".pi", "settings.json");
	const globalConfig = readCompactionConfig(globalPath);
	const projectConfig = readCompactionConfig(projectPath);
	return {
		enabled: projectConfig.enabled ?? globalConfig.enabled ?? DEFAULT_PI_COMPACTION_SETTINGS.enabled,
		reserveTokens:
			projectConfig.reserveTokens ?? globalConfig.reserveTokens ?? DEFAULT_PI_COMPACTION_SETTINGS.reserveTokens,
		keepRecentTokens:
			projectConfig.keepRecentTokens ?? globalConfig.keepRecentTokens ?? DEFAULT_PI_COMPACTION_SETTINGS.keepRecentTokens,
	};
}
