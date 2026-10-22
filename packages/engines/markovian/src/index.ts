// WhyTrace Markovian engine
// Clean-room TypeScript reimplementation written from the Meterless/Meterless
// AGENTS.md spec and `notes/ENGINES_FINDINGS.md`. Zero deps. ESM.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve as resolvePath } from "node:path";
import { createHash } from "node:crypto";

export type Mode = "ARCHITECT" | "RESEARCH";

export type ChunkConfig = { chunkSize: number; maxChunks: number; carryoverTokens: number; overlapTokens: number };

export const DEFAULT_CONFIG: ChunkConfig = { chunkSize: 8000, maxChunks: 24, carryoverTokens: 800, overlapTokens: 0 };

export const BOUNDS = {
  chunkSize: { min: 1000, max: 128000 },
  maxChunks: { min: 1, max: 32 },
  carryoverTokens: { min: 128, max: 32768 },
  overlapTokens: { min: 0, max: 4096 },
};

export const FRAMING_TOKENS = 400;
export const OUTPUT_BUDGET = 1200;

export const estimateTokens = (text: string): number => Math.ceil(text.length / 4);

export type Attachment = { kind: string; data: unknown };

export type Generator = (
  prompt: string,
  attachments: Attachment[],
  systemPrompt?: string,
  onStream?: (delta: string) => void,
  abortSignal?: AbortSignal,
  extras?: unknown,
) => Promise<{ text: string; metadata?: unknown }>;

export type StepFn = (args: { goal: string; carryover: string; step: number; prompt: string })
  => Promise<{ content: string }> | { content: string };

export type RunOptions = {
  prompt?: string;
  goal?: string;
  mode?: Mode;
  stepFn?: StepFn;
  generator?: Generator;
  stopWhen?: (args: { step: number; carryover: string }) => boolean;
  memoryContext?: string;
  attachments?: Attachment[];
  abortSignal?: AbortSignal;
  onStream?: (delta: string) => void;
  reflect?: boolean;
};

export type MarkovianOptions = {
  chunkConfig?: Partial<ChunkConfig>;
  generator?: Generator;
  compressorFn?: (prompt: string, systemPrompt: string) => Promise<string>;
  clock?: () => number;
  historyDir?: string;
};

export type ChunkRecord = { id: number; tokens: number; carryover: string; content: string };

export type MarkovianRun = {
  id: string;
  timestamp: number;
  prompt: string;
  mode: Mode;
  chunkConfig: ChunkConfig;
  chunks: ChunkRecord[];
  totalTokensUsed: number;
  totalTokensSaved: number;
  efficiencyPercent: number;
  durationMs: number;
  status: "completed" | "max-chunks" | "errored" | "aborted";
  tokenLabel: "estimated" | "measured";
  output: string;
  reflection?: string;
  error?: string;
};

export class ConfigValidationError extends Error {
  constructor(message: string) { super(message); this.name = "ConfigValidationError"; }
}

export type ProgressState = { step: number; totalSteps: number; status: string };

let RUN_SEQ = 0;
export function resetRunSeq() { RUN_SEQ = 0; }
function nextRunId(): string {
  RUN_SEQ += 1;
  return `mkv_${RUN_SEQ.toString().padStart(4, "0")}`;
}

function validateConfig(cfg: ChunkConfig): void {
  if (cfg.chunkSize < BOUNDS.chunkSize.min || cfg.chunkSize > BOUNDS.chunkSize.max) {
    throw new ConfigValidationError(`chunkSize out of bounds: ${cfg.chunkSize}`);
  }
  if (cfg.maxChunks < BOUNDS.maxChunks.min || cfg.maxChunks > BOUNDS.maxChunks.max) {
    throw new ConfigValidationError(`maxChunks out of bounds: ${cfg.maxChunks}`);
  }
  if (cfg.carryoverTokens < BOUNDS.carryoverTokens.min || cfg.carryoverTokens > BOUNDS.carryoverTokens.max) {
    throw new ConfigValidationError(`carryoverTokens out of bounds: ${cfg.carryoverTokens}`);
  }
  if (cfg.overlapTokens < BOUNDS.overlapTokens.min || cfg.overlapTokens > BOUNDS.overlapTokens.max) {
    throw new ConfigValidationError(`overlapTokens out of bounds: ${cfg.overlapTokens}`);
  }
  const minSize = FRAMING_TOKENS + cfg.carryoverTokens + OUTPUT_BUDGET;
  if (cfg.chunkSize < minSize) {
    throw new ConfigValidationError(`chunkSize ${cfg.chunkSize} must be >= framing(${FRAMING_TOKENS}) + carryover(${cfg.carryoverTokens}) + output(${OUTPUT_BUDGET}) = ${minSize}`);
  }
}

export class HistoryService {
  private readonly file?: string;
  private readonly runs: MarkovianRun[] = [];
  constructor(dir?: string) {
    if (dir) {
      const abs = resolvePath(dir);
      mkdirSync(abs, { recursive: true });
      this.file = resolvePath(abs, "history.json");
      try { this.runs = JSON.parse(readFileSync(this.file, "utf8")); } catch { /* no prior history */ }
    }
  }
  append(run: MarkovianRun) {
    this.runs.push(run);
    if (this.file) {
      mkdirSync(dirname(this.file), { recursive: true });
      writeFileSync(this.file, JSON.stringify(this.runs), "utf8");
    }
  }
  all(): MarkovianRun[] { return [...this.runs]; }
}

export class ProgressService {
  private subscribers = new Set<(s: ProgressState) => void>();
  update(state: ProgressState) { for (const fn of this.subscribers) { try { fn(state); } catch { /* ignore */ } } }
  subscribe(fn: (s: ProgressState) => void): () => void {
    this.subscribers.add(fn);
    return () => this.subscribers.delete(fn);
  }
}

type ModelTotalsConstants = { F: number; G: number; S: number; O: number; C: number };
const DEFAULT_K: ModelTotalsConstants = { F: 400, G: 200, S: 300, O: 1200, C: 800 };

export function modelTotals(N: number, k?: Partial<ModelTotalsConstants>) {
  const K = { ...DEFAULT_K, ...(k ?? {}) };
  const naiveTotal = N * (K.F + K.G + K.S) + K.O * (N * (N - 1)) / 2;
  const markovianTotal = N * (K.F + K.G + K.C + K.S);
  const savings = naiveTotal - markovianTotal;
  const efficiency = naiveTotal === 0 ? 0 : savings / naiveTotal;
  return { naiveTotal, markovianTotal, savings, efficiency };
}

export type ChunkInfo = { tokens: number };

export function runEfficiency(chunks: ChunkInfo[], cfg: ChunkConfig) {
  const totalTokensUsed = chunks.reduce((s, c) => s + c.tokens, 0);
  // Standard = prefix sum (every chunk sees all prior content)
  let standardCost = 0;
  let running = 0;
  for (const c of chunks) {
    running += c.tokens;
    standardCost += running;
  }
  // Markovian = each chunk pays its own tokens + carryover
  const markovianCost = chunks.length * cfg.carryoverTokens + totalTokensUsed;
  const tokensSaved = standardCost - markovianCost;
  const efficiencyPercent = standardCost === 0 ? 0 : (tokensSaved / standardCost) * 100;
  return { totalTokensUsed, standardCost, markovianCost, tokensSaved, efficiencyPercent };
}

function clampCarryover(prev: string, cfg: ChunkConfig): string {
  const budgetChars = cfg.carryoverTokens * 4;
  if (prev.length <= budgetChars) return prev;
  return prev.slice(-budgetChars);
}

const STATE_RE = /\[STATE_CHECKPOINT\][\s\S]*?(?=(\n\[|$))/;
const COMPLETE_RE = /\[TASK_COMPLETE\]/;

function extractState(text: string): string | undefined {
  const m = text.match(STATE_RE);
  if (!m) return undefined;
  const chunk = m[0];
  if (chunk.length < 24) return undefined;
  return chunk;
}

function stripMarkers(text: string): string {
  return text
    .replace(/\[STATE_CHECKPOINT\][\s\S]*?(?=(\n\[|$))/g, "")
    .replace(/\[TASK_COMPLETE\]/g, "")
    .trim();
}

export class Markovian {
  readonly config: ChunkConfig;
  readonly history: HistoryService;
  readonly progress: ProgressService;
  private readonly options: MarkovianOptions;
  private readonly clock: () => number;

  constructor(opts: MarkovianOptions = {}) {
    this.options = opts;
    this.config = { ...DEFAULT_CONFIG, ...(opts.chunkConfig ?? {}) };
    validateConfig(this.config);
    this.history = new HistoryService(opts.historyDir);
    this.progress = new ProgressService();
    this.clock = opts.clock ?? (() => Date.now());
  }

  onProgress(fn: (s: ProgressState) => void): () => void { return this.progress.subscribe(fn); }

  async run(options: RunOptions): Promise<MarkovianRun> {
    const start = this.clock();
    const prompt = options.goal ?? options.prompt ?? "";
    const mode = options.mode ?? "RESEARCH";
    const cfg: ChunkConfig = { ...this.config };
    const reflectEnabled = options.reflect !== false;
    const generator = options.generator ?? this.options.generator;
    const stepFn = options.stepFn;
    const attachments = options.attachments ?? [];
    const sys = defaultSystemPrompt(mode);
    const chunks: ChunkRecord[] = [];
    let carryover = "";
    let status: MarkovianRun["status"] = "max-chunks";
    let errMsg: string | undefined;
    let step = 0;
    let runId = nextRunId();
    try {
      while (step < cfg.maxChunks) {
        step += 1;
        this.progress.update({ step, totalSteps: cfg.maxChunks, status: "chunk-start" });
        const promptForStep = buildPrompt({ step, prompt, memoryContext: options.memoryContext, carryover, cfg, mode });
        let text: string;
        if (stepFn) {
          const r = await stepFn({ goal: prompt, carryover, step, prompt: promptForStep });
          text = r.content;
        } else if (generator) {
          const r = await generator(promptForStep, attachments, sys, options.onStream, options.abortSignal);
          text = r.text;
        } else {
          throw new Error("run() requires either a generator or a stepFn");
        }
        // marker handling before stripping
        const stateCarry = extractState(text);
        const complete = COMPLETE_RE.test(text);
        const cleaned = stripMarkers(text);
        const chunkRec: ChunkRecord = { id: step, tokens: estimateTokens(cleaned), carryover, content: cleaned };
        chunks.push(chunkRec);
        if (complete) { status = "completed"; break; }
        if (options.stopWhen?.({ step, carryover })) { status = "completed"; break; }
        carryover = await this.updateCarryover({ previous: carryover, latest: cleaned, stateCarry, cfg });
      }
      if (status !== "completed" && step >= cfg.maxChunks) status = "max-chunks";
    } catch (e) {
      if ((e as Error).name === "AbortError") status = "aborted";
      else { status = "errored"; errMsg = (e as Error).message; }
    }
    // reflection — never fails the run
    let reflection: string | undefined;
    if (reflectEnabled && (options.generator ?? this.options.generator)) {
      try {
        const gen = options.generator ?? this.options.generator!;
        const r = await gen(`Reflect on the task "${prompt}" after ${step} chunks.`, [], sys, undefined, options.abortSignal);
        reflection = r.text;
      } catch { /* swallow */ }
    }
    const { totalTokensUsed, tokensSaved, efficiencyPercent } = runEfficiency(chunks, cfg);
    const output = chunks.map((c) => c.content).join("\n").trim();
    const run: MarkovianRun = {
      id: runId,
      timestamp: start,
      prompt,
      mode,
      chunkConfig: cfg,
      chunks,
      totalTokensUsed,
      totalTokensSaved: Math.max(0, tokensSaved),
      efficiencyPercent,
      durationMs: this.clock() - start,
      status,
      tokenLabel: "estimated",
      output,
      reflection,
      error: errMsg,
    };
    this.history.append(run);
    return run;
  }

  private async updateCarryover(args: { previous: string; latest: string; stateCarry?: string; cfg: ChunkConfig }): Promise<string> {
    if (args.stateCarry && args.stateCarry.length >= 24) {
      const budgetChars = args.cfg.carryoverTokens * 4;
      if (args.stateCarry.length <= budgetChars) return args.stateCarry;
    }
    if (this.options.compressorFn) {
      try {
        const compressed = await this.options.compressorFn(args.latest, "Summarise state for the next chunk.");
        return clampCarryover(compressed, args.cfg);
      } catch { /* swallow */ }
    }
    // heuristic: keep key phrases (lines starting with marker words), tail-truncated.
    const keep = args.latest.split(/\n+/).filter((l) => /^(?:DECISION|SUSPECT|HYPOTHESIS|NEXT|OPEN)/i.test(l)).join("\n");
    const combined = keep ? `${keep}\n\n${args.latest}` : args.latest;
    return clampCarryover(combined, args.cfg);
  }
}

function defaultSystemPrompt(mode: Mode): string {
  if (mode === "ARCHITECT") return "/no_think You are a planning assistant. Decompose tasks step by step.";
  return "/no_think You are a research assistant. Answer concisely with evidence.";
}

function buildPrompt(args: { step: number; prompt: string; memoryContext?: string; carryover: string; cfg: ChunkConfig; mode: Mode }): string {
  const parts: string[] = [];
  if (args.step === 1) {
    parts.push(`[GOAL]\n${args.prompt}`);
    if (args.memoryContext) parts.push(`[MEMORY CONTEXT]\n${args.memoryContext}`);
  } else {
    parts.push(`[GOAL]\n${args.prompt.slice(0, 200)}`);
    parts.push(`[CARRYOVER STATE]\n${args.carryover}`);
    if (args.cfg.overlapTokens > 0) parts.push(`[OVERLAP]\n(tokens: ${args.cfg.overlapTokens})`);
  }
  parts.push(`[STEP ${args.step}]`);
  return parts.join("\n\n");
}

export default Markovian;
