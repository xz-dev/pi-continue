import type { ParsedHistoryArtifacts } from "./types.ts";

const HISTORY_ARTIFACT_VERSION = "pi-continue-artifacts/v3";

const DURABLE_PROMOTION_STATUSES = new Set<string>([
	"apply",
	"reject",
	"defer",
	"already-covered",
	"none",
]);

const RECENCY_LEDGER_STATUSES = new Set<string>([
	"active",
	"amended",
	"superseded",
	"stale",
	"confirmed",
	"unknown",
]);

interface ContextMapEntry {
	source: string;
	relevance: string;
	use: string;
}

interface DurablePromotion {
	status: string;
	targetSurface: string;
	proposal: string;
	evidence: string;
	durability: string;
	risk: string;
	nextAction: string;
}

interface RecencyLedgerEntry {
	status: string;
	subject: string;
	evidence: string;
	resolution: string;
}

interface StructuredContinuation {
	task: string;
	initiativeCharter: string[];
	definitionOfDone: string[];
	recencyLedger: RecencyLedgerEntry[];
	currentPlan: string[];
	progress: string[];
	state: string[];
	decisions: string[];
	contextMap: ContextMapEntry[];
	workingEdge: string[];
	validation: string[];
	risks: string[];
	dormantContext: string[];
	retiredContext: string[];
	antiRework: string[];
	durableLearnings: string[];
	durablePromotions: DurablePromotion[];
	agentGuideUpdates: string[];
}

function escapeTag(tag: string): string {
	return tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): string | undefined {
	if (typeof value !== "string") return undefined;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : undefined;
}

function nullableString(value: unknown): string | undefined {
	return value === null ? undefined : nonEmptyString(value);
}

function stringList(value: unknown): string[] | undefined {
	if (!Array.isArray(value)) return undefined;
	const result: string[] = [];
	for (const entry of value) {
		const trimmed = nonEmptyString(entry);
		if (!trimmed) return undefined;
		result.push(trimmed);
	}
	return result;
}

function parseContextMap(value: unknown): ContextMapEntry[] | undefined {
	if (!Array.isArray(value)) return undefined;
	const result: ContextMapEntry[] = [];
	for (const entry of value) {
		if (!isRecord(entry)) return undefined;
		const source = nonEmptyString(entry.source);
		const relevance = nonEmptyString(entry.relevance);
		const use = nonEmptyString(entry.use);
		if (!source || !relevance || !use) return undefined;
		result.push({ source, relevance, use });
	}
	return result;
}

function parseDurablePromotions(value: unknown): DurablePromotion[] | undefined {
	if (!Array.isArray(value)) return undefined;
	const result: DurablePromotion[] = [];
	for (const entry of value) {
		if (!isRecord(entry)) return undefined;
		const status = nonEmptyString(entry.status);
		const targetSurface = nonEmptyString(entry.targetSurface);
		const proposal = nonEmptyString(entry.proposal);
		const evidence = nonEmptyString(entry.evidence);
		const durability = nonEmptyString(entry.durability);
		const risk = nonEmptyString(entry.risk);
		const nextAction = nonEmptyString(entry.nextAction);
		if (!status || !DURABLE_PROMOTION_STATUSES.has(status) || !targetSurface || !proposal || !evidence || !durability || !risk || !nextAction) {
			return undefined;
		}
		result.push({ status, targetSurface, proposal, evidence, durability, risk, nextAction });
	}
	return result;
}

function parseRecencyLedger(value: unknown): RecencyLedgerEntry[] | undefined {
	if (!Array.isArray(value)) return undefined;
	const result: RecencyLedgerEntry[] = [];
	for (const entry of value) {
		if (!isRecord(entry)) return undefined;
		const status = nonEmptyString(entry.status);
		const subject = nonEmptyString(entry.subject);
		const evidence = nonEmptyString(entry.evidence);
		const resolution = nonEmptyString(entry.resolution);
		if (!status || !RECENCY_LEDGER_STATUSES.has(status) || !subject || !evidence || !resolution) {
			return undefined;
		}
		result.push({ status, subject, evidence, resolution });
	}
	return result.length > 0 ? result : undefined;
}

function parseStructuredContinuation(value: unknown): StructuredContinuation | undefined {
	if (!isRecord(value)) return undefined;
	const task = nonEmptyString(value.task);
	const initiativeCharter = stringList(value.initiativeCharter);
	const definitionOfDone = stringList(value.definitionOfDone);
	const recencyLedger = parseRecencyLedger(value.recencyLedger);
	const currentPlan = stringList(value.currentPlan);
	const progress = stringList(value.progress);
	const state = stringList(value.state);
	const decisions = stringList(value.decisions);
	const contextMap = parseContextMap(value.contextMap);
	const workingEdge = stringList(value.workingEdge);
	const validation = stringList(value.validation);
	const risks = stringList(value.risks);
	const dormantContext = stringList(value.dormantContext);
	const retiredContext = stringList(value.retiredContext);
	const antiRework = stringList(value.antiRework);
	const durableLearnings = stringList(value.durableLearnings);
	const durablePromotions = parseDurablePromotions(value.durablePromotions);
	const agentGuideUpdates = stringList(value.agentGuideUpdates);
	if (!task || !initiativeCharter || !definitionOfDone || !recencyLedger || !currentPlan || !progress || !state || !decisions || !contextMap || !workingEdge || !validation || !risks || !dormantContext || !retiredContext || !antiRework || !durableLearnings || !durablePromotions || !agentGuideUpdates) {
		return undefined;
	}
	return {
		task,
		initiativeCharter,
		definitionOfDone,
		recencyLedger,
		currentPlan,
		progress,
		state,
		decisions,
		contextMap,
		workingEdge,
		validation,
		risks,
		dormantContext,
		retiredContext,
		antiRework,
		durableLearnings,
		durablePromotions,
		agentGuideUpdates,
	};
}

function renderStringSection(title: string, values: string[]): string | undefined {
	if (values.length === 0) return undefined;
	return [`## ${title}`, ...values.map((value) => `- ${value}`)].join("\n");
}

function renderContextMap(values: ContextMapEntry[]): string | undefined {
	if (values.length === 0) return undefined;
	return [
		`## Context Map`,
		...values.map((entry) => `- ${entry.source} — ${entry.relevance}; use it to ${entry.use}.`),
	].join("\n");
}

function renderDurablePromotions(values: DurablePromotion[]): string | undefined {
	if (values.length === 0) return undefined;
	return [
		`## Durable Promotions`,
		...values.map((entry) => `- ${entry.status}: ${entry.targetSurface} — ${entry.proposal}; evidence: ${entry.evidence}; durability: ${entry.durability}; risk: ${entry.risk}; next: ${entry.nextAction}`),
	].join("\n");
}

function renderRecencyLedger(values: RecencyLedgerEntry[]): string | undefined {
	if (values.length === 0) return undefined;
	return [
		`## Recency And Supersession`,
		...values.map((entry) => `- ${entry.status}: ${entry.subject} — evidence: ${entry.evidence}; resolution: ${entry.resolution}`),
	].join("\n");
}

function renderStructuredContinuation(value: StructuredContinuation, title: string | undefined): string {
	const sections = [
		title,
		`## Task\n${value.task}`,
		renderStringSection("Initiative Charter", value.initiativeCharter),
		renderStringSection("Definition Of Done", value.definitionOfDone),
		renderRecencyLedger(value.recencyLedger),
		renderStringSection("Current Plan", value.currentPlan),
		renderStringSection("Progress And Milestone Trail", value.progress),
		renderStringSection("Current State", value.state),
		renderStringSection("Decisions and Constraints", value.decisions),
		renderContextMap(value.contextMap),
		renderStringSection("Working Edge", value.workingEdge),
		renderStringSection("Validation", value.validation),
		renderStringSection("Risks", value.risks),
		renderStringSection("Dormant But Important", value.dormantContext),
		renderStringSection("Retired Or Obsolete", value.retiredContext),
		renderStringSection("Anti-Rework", value.antiRework),
		renderStringSection("Durable Learnings", value.durableLearnings),
		renderDurablePromotions(value.durablePromotions),
		renderStringSection("Agent Guide Updates", value.agentGuideUpdates),
	].filter((section): section is string => section !== undefined && section.length > 0);
	return sections.join("\n\n");
}

/** Extract the first XML-style tagged block from model output. */
export function extractTaggedBlock(text: string, tag: string): string | undefined {
	const pattern = new RegExp(`<${escapeTag(tag)}>([\\s\\S]*?)</${escapeTag(tag)}>`, "i");
	const match = text.match(pattern);
	const content = match?.[1]?.trim();
	return content && content.length > 0 ? content : undefined;
}

/** Parse the strict provider-portable JSON history artifact response. */
export function parseHistoryArtifacts(text: string): ParsedHistoryArtifacts | undefined {
	let parsed: unknown;
	try {
		parsed = JSON.parse(text.trim());
	} catch (error) {
		if (error instanceof SyntaxError) return undefined;
		throw error;
	}
	if (!isRecord(parsed)) return undefined;
	if (parsed.version !== HISTORY_ARTIFACT_VERSION) return undefined;
	const brief = parseStructuredContinuation(parsed.brief);
	const document = parseStructuredContinuation(parsed.document);
	const agentGuideMd = nullableString(parsed.agentGuideMarkdown);
	const agentGuideChangeReason = nonEmptyString(parsed.agentGuideChangeReason);
	if (!brief || !document || !agentGuideChangeReason) return undefined;
	if (parsed.agentGuideMarkdown !== null && agentGuideMd === undefined) return undefined;
	return {
		continuation: renderStructuredContinuation(brief, undefined),
		continuationMd: renderStructuredContinuation(document, "# Continuation"),
		agentGuideMd,
		agentGuideChangeReason,
	};
}

/** Parse the split-prefix response. */
export function parseSplitPrefix(text: string): string | undefined {
	return extractTaggedBlock(text, "split-prefix");
}
