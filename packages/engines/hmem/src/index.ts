// WhyTrace H-MEM engine
// Clean-room TypeScript reimplementation written from the Meterless/Meterless
// AGENTS.md spec and `notes/ENGINES_FINDINGS.md`. Synchronous surface (except
// `mine`). Zero deps. ESM.
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, resolve as resolvePath } from "node:path";

export type MemoryType = "factual" | "procedural" | "preference" | "episodic";
export type MemoryLayer = "short_term" | "working" | "long_term";

export type Provenance = {
  origin?: "document" | "manual" | "plan_completion" | "chat" | (string & {});
  learnedAt?: number;
  label?: string;
  refs?: string[];
};

export type MemoryRecord = {
  id: string;
  content: string;
  type: MemoryType;
  layer: MemoryLayer;
  timestamp: number;
  lastAccessed: number;
  accessCount: number;
  tags: string[];
  embedding: number[];
  confidence: number;
  source: string;
  provenance?: Provenance;
  domain?: string;
  namespace?: string;
  entities: string[];
  relatedTo: string[];
  supersedes?: string;
  supersededBy?: string;
  derivedFrom?: string[];
  chatId?: string;
  missionId?: string;
  goalRunId?: string;
};

export type AddInput = {
  content: string;
  type?: MemoryType;
  layer?: MemoryLayer;
  tags?: string[];
  confidence?: number;
  source: string;
  provenance?: Provenance;
  chatId?: string;
  missionId?: string;
  goalRunId?: string;
  supersedes?: string;
  derivedFrom?: string[];
};

export type FeedbackKind = "helpful" | "not_helpful" | "wrong";
export type LedgerAction =
  | "create" | "read" | "update" | "delete"
  | "feedback" | "promote" | "demote" | "merge"
  | "conflict_detected" | "conflict_resolved"
  | "sleep_consolidate" | "sleep_archive" | "sleep_synthesize"
  | "dream_proposed" | "dream_approved" | "dream_rejected" | "restore";

export type LedgerEntry = {
  memoryId: string;
  action: LedgerAction;
  actor: string;
  timestamp: number;
  previousState?: Partial<MemoryRecord>;
  newState?: Partial<MemoryRecord>;
  details?: Record<string, unknown>;
};

export type MiningEventType = "chat" | "document" | "plan_completion";

export type HMEMOptions = {
  clock?: () => number;
  persistDir?: string;
  actor?: string;
  minerFn?: (prompt: string) => Promise<string>;
};

export type QueryResult = {
  memories: { memory: MemoryRecord; relevance: number }[];
  context: string;
  trace: { retrievalReason: string; strategy: "minimal" | "personal" | "comprehensive"; scores: Record<string, number> };
};

export type ConflictRecord = { a: MemoryRecord; b: MemoryRecord; reason: string; similarity: number };

export type SleepPreview = { toConsolidate: string[]; toArchive: string[]; toSynthesize: string[][] };
export type SleepReport = { backupId: string; consolidated: number; archived: number; synthesized: number; actionLog: string[] };

export type DreamProposal = { id: string; content: string; layer: MemoryLayer; derivedFrom: string[] };

const DEFAULTS = {
  topN: 5,
  threshold: 0.35,
  consolidationDays: 7,
  archiveDays: 30,
  archiveAccessMax: 2,
  synthesisCosine: 0.82,
  dreamClusterMin: 2,
  autoResolveGate: 0.70,
  recencyTauDays: 14,
};

const LAYER_WEIGHT: Record<MemoryLayer, number> = { long_term: 1.0, working: 0.8, short_term: 0.6 };

function clamp01(n: number): number { return Math.max(0, Math.min(1, n)); }
function sha256Hex(s: string): string { return createHash("sha256").update(s).digest("hex"); }
function nextId(): string { return `mem_${sha256Hex(`${Date.now()}-${Math.random()}`).slice(0, 16)}`; }

// FNV-1a bag-of-words embedder, 64 dims, L2 normalized. Deterministic.
function tokenize(text: string): string[] {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((t) => t.length > 1);
}
function embed(text: string): number[] {
  const vec = new Array<number>(64).fill(0);
  const toks = tokenize(text);
  for (const t of toks) {
    let h = 0x811c9dc5;
    for (let i = 0; i < t.length; i++) {
      h ^= t.charCodeAt(i);
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    vec[h % 64] += 1;
  }
  let norm = 0;
  for (const v of vec) norm += v * v;
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < vec.length; i++) vec[i] /= norm;
  return vec;
}
function cosine(a: number[], b: number[]): number {
  let s = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) s += a[i] * b[i];
  return s;
}

function jaccard(a: Iterable<string>, b: Iterable<string>): number {
  const sa = new Set(a); const sb = new Set(b);
  if (sa.size === 0 && sb.size === 0) return 0;
  let inter = 0;
  for (const t of sa) if (sb.has(t)) inter++;
  return inter / (sa.size + sb.size - inter || 1);
}

export class HMEM {
  private readonly opts: HMEMOptions;
  readonly clock: () => number;
  private readonly actor: string;
  private readonly persistDir?: string;
  private readonly recs = new Map<string, MemoryRecord>();
  private readonly ledgerEntries: LedgerEntry[] = [];
  private readonly conflictQueue: ConflictRecord[] = [];
  private readonly dreamPending: DreamProposal[] = [];
  readonly ledger: TrustLedgerService;
  readonly store: MemoryStoreService;
  readonly mining: MemoryMiningService;
  readonly retrieval: MemoryRetrievalService;
  readonly conflicts: ConflictDetectionService;
  readonly sleep: SleepCycleService;
  readonly dreaming: DreamingService;

  constructor(opts: HMEMOptions = {}) {
    this.opts = opts;
    this.clock = opts.clock ?? (() => Date.now());
    this.actor = opts.actor ?? "system";
    if (opts.persistDir) {
      this.persistDir = resolvePath(opts.persistDir);
      mkdirSync(this.persistDir, { recursive: true });
      this.hydrateFromDisk();
    }
    this.ledger = new TrustLedgerService(this.ledgerEntries, this.recs);
    this.store = new MemoryStoreService(this.recs, (id, prev) => this.persistState(), this.clock);
    this.mining = new MemoryMiningService(this.opts.minerFn, (input) => this.add(input));
    this.retrieval = new MemoryRetrievalService(this.recs, this.clock);
    this.conflicts = new ConflictDetectionService(this.recs, this.ledgerEntries, this.actor, this.clock, this.conflictQueue, () => this.persist());
    this.sleep = new SleepCycleService(this.recs, this.ledgerEntries, this.actor, this.clock, () => this.persist());
    this.dreaming = new DreamingService(this.recs, this.dreamPending, this.ledgerEntries, this.actor, this.clock, () => this.persist());
  }

  add(input: AddInput): MemoryRecord {
    if (!input.source || typeof input.source !== "string" || input.source.length === 0) {
      throw new Error("source is required");
    }
    const now = this.clock();
    const rec: MemoryRecord = {
      id: nextId(),
      content: input.content,
      type: input.type ?? "factual",
      layer: input.layer ?? "working",
      timestamp: now,
      lastAccessed: now,
      accessCount: 0,
      tags: [...(input.tags ?? [])],
      embedding: embed(input.content),
      confidence: clamp01(input.confidence ?? 0.7),
      source: input.source,
      provenance: input.provenance,
      domain: inferDomain(input.content, input.tags ?? []),
      namespace: input.missionId,
      entities: extractEntities(input.content).slice(0, 10),
      relatedTo: [],
      supersedes: input.supersedes,
      derivedFrom: input.derivedFrom ? [...input.derivedFrom] : undefined,
      chatId: input.chatId,
      missionId: input.missionId,
      goalRunId: input.goalRunId,
    };
    if (input.supersedes && this.recs.has(input.supersedes)) {
      const prior = this.recs.get(input.supersedes)!;
      prior.supersededBy = rec.id;
    }
    this.recs.set(rec.id, rec);
    this.ledgerEntries.push({ memoryId: rec.id, action: "create", actor: this.actor, timestamp: now, newState: { ...rec } });
    this.persist();
    return rec;
  }

  async mine(event: MiningEventType, text: string, opts?: { chatId?: string }): Promise<MemoryRecord[]> {
    return this.mining.mine(event, text, opts);
  }

  query(q: string, opts?: { topN?: number; threshold?: number; chatId?: string }): QueryResult {
    return this.retrieval.query(q, opts);
  }

  feedback(memoryId: string, kind: FeedbackKind): void {
    const rec = this.recs.get(memoryId);
    if (!rec) return;
    const prev: Partial<MemoryRecord> = { confidence: rec.confidence, accessCount: rec.accessCount, tags: [...rec.tags] };
    const now = this.clock();
    switch (kind) {
      case "helpful":
        rec.confidence = clamp01(rec.confidence + 0.05);
        rec.accessCount += 1;
        break;
      case "not_helpful":
        rec.confidence = clamp01(rec.confidence - 0.03);
        break;
      case "wrong":
        rec.confidence = clamp01(rec.confidence - 0.20);
        if (!rec.tags.includes("review")) rec.tags.push("review");
        break;
    }
    rec.lastAccessed = now;
    const next: Partial<MemoryRecord> = { confidence: rec.confidence, accessCount: rec.accessCount, tags: [...rec.tags] };
    this.ledgerEntries.push({ memoryId: rec.id, action: "feedback", actor: this.actor, timestamp: now, previousState: prev, newState: next, details: { kind } });
    this.persist();
  }

  private persist() { this.persistState(); }
  private persistState() {
    if (!this.persistDir) return;
    const stateFile = resolvePath(this.persistDir, "state.json");
    writeFileSync(stateFile, JSON.stringify({ seq: this.ledgerEntries.length, records: Array.from(this.recs.values()) }), "utf8");
    const ledgerFile = resolvePath(this.persistDir, "ledger.jsonl");
    // Append-only: we only ever append the last entry if it hasn't been persisted.
    // Simpler: rewrite on every persist to keep order deterministic. Append would require a tail cursor.
    const body = this.ledgerEntries.map((e) => JSON.stringify(e)).join("\n") + (this.ledgerEntries.length ? "\n" : "");
    writeFileSync(ledgerFile, body, "utf8");
  }

  private hydrateFromDisk() {
    if (!this.persistDir) return;
    const stateFile = resolvePath(this.persistDir, "state.json");
    if (existsSync(stateFile)) {
      try {
        const raw = readFileSync(stateFile, "utf8");
        const parsed = JSON.parse(raw) as { records?: MemoryRecord[] };
        for (const r of parsed.records ?? []) this.recs.set(r.id, r);
      } catch { /* ignore */ }
    }
    const ledgerFile = resolvePath(this.persistDir, "ledger.jsonl");
    if (existsSync(ledgerFile)) {
      try {
        const lines = readFileSync(ledgerFile, "utf8").split("\n").filter((l) => l.trim().length);
        for (const l of lines) this.ledgerEntries.push(JSON.parse(l));
      } catch { /* ignore */ }
    }
  }
}

function inferDomain(_content: string, tags: string[]): string | undefined {
  for (const t of tags) if (t.startsWith("domain:")) return t.slice(7);
  return undefined;
}

function extractEntities(content: string): string[] {
  const out = new Set<string>();
  // IP / CVE / email / id-style tokens.
  const patterns = [
    /\b\d{1,3}(?:\.\d{1,3}){3}\b/g,
    /\bCVE-\d{4}-\d{3,7}\b/gi,
    /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
    /\bT\d{4}(?:\.\d{3})?\b/g,
  ];
  for (const p of patterns) {
    const m = content.match(p);
    if (m) for (const x of m) out.add(x);
  }
  return Array.from(out);
}

class TrustLedgerService {
  constructor(private readonly entries: LedgerEntry[], private readonly recs: Map<string, MemoryRecord>) {}
  log(entry: LedgerEntry) { this.entries.push(entry); }
  history(memoryId: string): LedgerEntry[] { return this.entries.filter((e) => e.memoryId === memoryId); }
  all(): LedgerEntry[] { return [...this.entries]; }
  stats() { return { totalEntries: this.entries.length, uniqueMemories: new Set(this.entries.map((e) => e.memoryId)).size }; }
}

class MemoryStoreService {
  constructor(private readonly recs: Map<string, MemoryRecord>, private readonly persist: (id: string, prev?: MemoryRecord) => void, private readonly clock: () => number) {}
  add(r: MemoryRecord) { this.recs.set(r.id, r); }
  get(id: string): MemoryRecord | undefined { return this.recs.get(id); }
  all(): MemoryRecord[] { return Array.from(this.recs.values()); }
  update(id: string, patch: Partial<MemoryRecord>): MemoryRecord | undefined {
    const r = this.recs.get(id);
    if (!r) return undefined;
    Object.assign(r, patch);
    this.persist(id);
    return r;
  }
  delete(id: string) { this.recs.delete(id); this.persist(id); }
  touch(id: string) { const r = this.recs.get(id); if (r) { r.lastAccessed = this.clock(); r.accessCount += 1; this.persist(id); } }
  promote(id: string, layer: MemoryLayer) { const r = this.recs.get(id); if (r) { r.layer = layer; this.persist(id); } }
  snapshotAll(): MemoryRecord[] { return JSON.parse(JSON.stringify(Array.from(this.recs.values()))); }
  restoreAll(snapshot: MemoryRecord[]) {
    this.recs.clear();
    for (const r of snapshot) this.recs.set(r.id, r);
  }
}

class MemoryMiningService {
  constructor(private readonly minerFn: HMEMOptions["minerFn"], private readonly addFn: (i: AddInput) => MemoryRecord) {}
  async mine(_event: MiningEventType, text: string, opts?: { chatId?: string }): Promise<MemoryRecord[]> {
    const extracted: string[] = [];
    if (this.minerFn) {
      try {
        const raw = await this.minerFn(text);
        const cleaned = raw.replace(/```json\s*|```/g, "").trim();
        const parsed = JSON.parse(cleaned) as unknown;
        if (Array.isArray(parsed)) for (const s of parsed) if (typeof s === "string") extracted.push(s);
      } catch { /* fallback */ }
    }
    if (!extracted.length) {
      for (const line of text.split(/\n+/)) {
        const t = line.trim();
        if (t.length > 10 && /[.!?]$/.test(t)) extracted.push(t);
      }
    }
    const out: MemoryRecord[] = [];
    for (const content of extracted.slice(0, 8)) {
      out.push(this.addFn({ content, source: "miner", chatId: opts?.chatId, layer: "working", type: "factual" }));
    }
    return out;
  }
}

class MemoryRetrievalService {
  constructor(private readonly recs: Map<string, MemoryRecord>, private readonly clock: () => number) {}
  query(q: string, opts?: { topN?: number; threshold?: number; chatId?: string }): QueryResult {
    const topN = opts?.topN ?? DEFAULTS.topN;
    const threshold = opts?.threshold ?? DEFAULTS.threshold;
    const qEmb = embed(q);
    const qToks = new Set(tokenize(q));
    const qEnts = new Set(extractEntities(q));
    const scores: Record<string, number> = {};
    const now = this.clock();
    const ranked: { memory: MemoryRecord; relevance: number }[] = [];
    for (const r of this.recs.values()) {
      const semantic = cosine(qEmb, r.embedding);
      const keyword = jaccard(qToks, new Set(tokenize(r.content)));
      const tag = jaccard(qToks, new Set(r.tags.map((t) => t.toLowerCase())));
      const domain = r.domain && qToks.has(r.domain.toLowerCase()) ? 1 : 0;
      const entity = jaccard(qEnts, new Set(r.entities));
      const layer = LAYER_WEIGHT[r.layer];
      const ageDays = (now - r.timestamp) / (1000 * 60 * 60 * 24);
      const recency = Math.exp(-ageDays / DEFAULTS.recencyTauDays);
      const supersededPenalty = r.supersededBy ? 0.20 : 0;
      const raw = 0.35 * semantic + 0.20 * keyword + 0.10 * tag + 0.10 * domain + 0.15 * entity + 0.05 * layer + 0.05 * recency - supersededPenalty;
      const relevance = clamp01(raw) * r.confidence;
      scores[r.id] = relevance;
      if (relevance >= threshold) ranked.push({ memory: r, relevance });
    }
    ranked.sort((a, b) => {
      if (b.relevance !== a.relevance) return b.relevance - a.relevance;
      return b.memory.confidence - a.memory.confidence;
    });
    const memories = ranked.slice(0, topN);
    const context = memories.map((m, i) => `- [${i + 1}] (${m.relevance.toFixed(2)}) ${m.memory.content}`).join("\n");
    return {
      memories,
      context,
      trace: { retrievalReason: `topN=${topN} threshold=${threshold}`, strategy: memories.length <= 1 ? "minimal" : memories.length <= 3 ? "personal" : "comprehensive", scores },
    };
  }
}

class ConflictDetectionService {
  constructor(
    private readonly recs: Map<string, MemoryRecord>,
    private readonly ledgerEntries: LedgerEntry[],
    private readonly actor: string,
    private readonly clock: () => number,
    private readonly queueList: ConflictRecord[],
    private readonly persist: () => void,
  ) {}
  scan(): ConflictRecord[] {
    const found: ConflictRecord[] = [];
    const arr = Array.from(this.recs.values());
    for (let i = 0; i < arr.length; i++) {
      for (let j = i + 1; j < arr.length; j++) {
        const a = arr[i]!, b = arr[j]!;
        if (a.supersededBy || b.supersededBy) continue;
        const sim = cosine(a.embedding, b.embedding);
        if (sim < 0.5) continue;
        if (hasOpposingPhrase(a.content, b.content)) {
          found.push({ a, b, reason: "opposing-phrase", similarity: sim });
        }
      }
    }
    return found;
  }
  autoResolve(c: ConflictRecord): "resolved" | "queued" {
    const now = this.clock();
    const winner = c.a.confidence >= c.b.confidence ? c.a : c.b;
    const loser = winner === c.a ? c.b : c.a;
    if (Math.abs(winner.confidence - loser.confidence) >= 0.25) {
      loser.supersededBy = winner.id;
      this.ledgerEntries.push({ memoryId: loser.id, action: "conflict_resolved", actor: this.actor, timestamp: now, newState: { supersededBy: winner.id }, details: { winner: winner.id, reason: c.reason } });
      this.persist();
      return "resolved";
    }
    this.queueList.push(c);
    this.ledgerEntries.push({ memoryId: loser.id, action: "conflict_detected", actor: this.actor, timestamp: now, details: { other: winner.id, reason: c.reason } });
    this.persist();
    return "queued";
  }
  queue(): ConflictRecord[] { return [...this.queueList]; }
}

function hasOpposingPhrase(a: string, b: string): boolean {
  const pairs: Array<[RegExp, RegExp]> = [
    [/\balways\b/i, /\bnever\b/i],
    [/\benable(d)?\b/i, /\bdisable(d)?\b/i],
    [/\bprefer\b/i, /\bavoid\b/i],
    [/\bon\b/i, /\boff\b/i],
    [/\byes\b/i, /\bno\b/i],
  ];
  for (const [p, q] of pairs) {
    if ((p.test(a) && q.test(b)) || (p.test(b) && q.test(a))) return true;
  }
  return false;
}

class SleepCycleService {
  private backups: Record<string, MemoryRecord[]> = {};
  constructor(
    private readonly recs: Map<string, MemoryRecord>,
    private readonly ledgerEntries: LedgerEntry[],
    private readonly actor: string,
    private readonly clock: () => number,
    private readonly persist: () => void,
  ) {}
  preview(): SleepPreview {
    const now = this.clock();
    const consolidate: string[] = [];
    const archive: string[] = [];
    const toSynthesize: string[][] = [];
    const referenced = new Set<string>();
    for (const r of this.recs.values()) {
      for (const id of r.derivedFrom ?? []) referenced.add(id);
      if (r.supersedes) referenced.add(r.supersedes);
    }
    for (const r of this.recs.values()) {
      const ageDays = (now - r.timestamp) / (1000 * 60 * 60 * 24);
      if (r.derivedFrom && r.derivedFrom.length) continue;
      if (ageDays >= DEFAULTS.archiveDays && r.accessCount <= DEFAULTS.archiveAccessMax && !referenced.has(r.id)) {
        archive.push(r.id);
        continue;
      }
      if (ageDays >= DEFAULTS.consolidationDays && r.layer === "short_term") consolidate.push(r.id);
    }
    return { toConsolidate: consolidate, toArchive: archive, toSynthesize };
  }
  execute(preview?: SleepPreview): SleepReport {
    const now = this.clock();
    const p = preview ?? this.preview();
    const backupId = `bk_${sha256Hex(`${now}-${Math.random()}`).slice(0, 12)}`;
    const log: string[] = [];
    this.backups[backupId] = JSON.parse(JSON.stringify(Array.from(this.recs.values())));
    for (const id of p.toConsolidate) {
      const r = this.recs.get(id);
      if (r) { r.layer = "working"; this.ledgerEntries.push({ memoryId: id, action: "sleep_consolidate", actor: this.actor, timestamp: now }); log.push(`consolidate ${id}`); }
    }
    for (const id of p.toArchive) {
      if (this.recs.delete(id)) { this.ledgerEntries.push({ memoryId: id, action: "sleep_archive", actor: this.actor, timestamp: now }); log.push(`archive ${id}`); }
    }
    this.persist();
    return { backupId, consolidated: p.toConsolidate.length, archived: p.toArchive.length, synthesized: p.toSynthesize.length, actionLog: log };
  }
  restore(backupId: string) {
    const snap = this.backups[backupId];
    if (!snap) return;
    this.recs.clear();
    for (const r of snap) this.recs.set(r.id, r);
    this.persist();
  }
}

class DreamingService {
  constructor(
    private readonly recs: Map<string, MemoryRecord>,
    private readonly pending: DreamProposal[],
    private readonly ledgerEntries: LedgerEntry[],
    private readonly actor: string,
    private readonly clock: () => number,
    private readonly persist: () => void,
  ) {}
  dream(): DreamProposal[] {
    const now = this.clock();
    const prefs = Array.from(this.recs.values()).filter((r) => r.type === "preference");
    const proposals: DreamProposal[] = [];
    if (prefs.length >= DEFAULTS.dreamClusterMin) {
      const content = `invariant: ${prefs.map((p) => p.content).join(" + ")}`;
      const prop: DreamProposal = { id: `dream_${sha256Hex(content).slice(0, 12)}`, content, layer: "long_term", derivedFrom: prefs.map((p) => p.id) };
      proposals.push(prop);
      this.pending.push(prop);
      this.ledgerEntries.push({ memoryId: prop.id, action: "dream_proposed", actor: this.actor, timestamp: now, details: { from: prop.derivedFrom } });
      this.persist();
    }
    return proposals;
  }
  pending_(): DreamProposal[] { return [...this.pending]; }
  pending(): DreamProposal[] { return [...this.pending]; }
  approve(id: string): MemoryRecord | undefined {
    const idx = this.pending.findIndex((p) => p.id === id);
    if (idx === -1) return undefined;
    const prop = this.pending.splice(idx, 1)[0]!;
    const now = this.clock();
    const rec: MemoryRecord = {
      id: nextId(),
      content: prop.content,
      type: "factual",
      layer: prop.layer,
      timestamp: now,
      lastAccessed: now,
      accessCount: 0,
      tags: ["dream"],
      embedding: embed(prop.content),
      confidence: 0.8,
      source: "dream",
      entities: [],
      relatedTo: [],
      derivedFrom: [...prop.derivedFrom],
    };
    this.recs.set(rec.id, rec);
    this.ledgerEntries.push({ memoryId: rec.id, action: "dream_approved", actor: this.actor, timestamp: now, newState: { ...rec } });
    this.persist();
    return rec;
  }
  reject(id: string) {
    const idx = this.pending.findIndex((p) => p.id === id);
    if (idx === -1) return;
    const [prop] = this.pending.splice(idx, 1);
    const now = this.clock();
    if (prop) this.ledgerEntries.push({ memoryId: prop.id, action: "dream_rejected", actor: this.actor, timestamp: now });
    this.persist();
  }
}

export default HMEM;
