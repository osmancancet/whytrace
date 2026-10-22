// WhyTrace World Model engine
// Clean-room TypeScript reimplementation written from the Meterless/Meterless
// AGENTS.md spec and `notes/ENGINES_FINDINGS.md`. Zero deps. ESM. The
// conformance runner at conformance/world-model/runner.ts (vendored,
// Apache-2.0) exercises this surface via dynamic import.
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve as resolvePath } from "node:path";

export type ISODate = string;
export type EventId = string;

export type ExternalKey = { system: string; id: string };

export type Provenance = {
  kind: "manual" | "rss" | "api" | "file" | "agent" | "pipeline" | "wire" | (string & {});
  by?: string;
  at: ISODate | Date;
  url?: string;
  checksum?: string;
  runId?: string;
};

export type Entity = {
  id: string;
  type: string;
  externalKey?: ExternalKey;
  name?: string;
  attrs: Record<string, unknown>;
  state: "active" | "emerging" | "merged" | "retired";
  createdAt: ISODate;
  updatedAt: ISODate;
};

export type Context = {
  id: string;
  type: string;
  externalKey?: ExternalKey;
  parent?: string;
  attrs: Record<string, unknown>;
  createdAt: ISODate;
  updatedAt: ISODate;
};

export type Relationship = {
  id: string;
  from: string;
  type: string;
  to: string;
  context?: string;
  attrs: Record<string, unknown>;
  validFrom: ISODate;
  validTo?: ISODate;
  createdAt: ISODate;
};

export type Fact = {
  id: string;
  about: string;
  predicate: string;
  value: unknown;
  confidence: number;
  context?: string;
  source: Provenance;
  createdAt: ISODate;
};

export type MergeProposal = {
  id: string;
  from: string;
  to: string;
  similarity: number;
  status: "pending" | "approved" | "rejected";
  createdAt: ISODate;
  approvedBy?: string;
  rejectedBy?: string;
};

export type WorldEvent =
  | { kind: "entity.upserted"; eventId: EventId; at: ISODate; actor: string; entity: Entity; runId?: string }
  | { kind: "context.upserted"; eventId: EventId; at: ISODate; actor: string; context: Context; runId?: string }
  | { kind: "relationship.added"; eventId: EventId; at: ISODate; actor: string; rel: Relationship; runId?: string }
  | { kind: "relationship.closed"; eventId: EventId; at: ISODate; actor: string; relId: string; validTo: ISODate; runId?: string }
  | { kind: "fact.asserted"; eventId: EventId; at: ISODate; actor: string; fact: Fact; runId?: string }
  | { kind: "observation.ingested"; eventId: EventId; at: ISODate; actor: string; observation: IngestObservation; runId?: string };

export type AuditEntry = {
  seq: number;
  at: ISODate;
  kind: string;
  actor: string;
  summary: string;
  eventId?: EventId;
  runId?: string;
};

export type ConflictPolicy = "most-recent-wins" | "highest-confidence-wins" | "source-priority" | "manual";

export type ResolverOptions = {
  strategy?: "name" | "externalKey";
  autoMergeAt?: number;
  reviewBand?: [number, number];
};

export type WorldModelOptions = {
  storage?: "memory" | "local";
  namespace: string;
  directory?: string;
  clock?: () => Date;
  resolver?: ResolverOptions;
  conflictPolicy?: ConflictPolicy;
  sourcePriority?: string[];
};

export type IngestObservation = {
  externalId: string;
  type?: string;
  title: string;
  text?: string;
  at: ISODate;
  source: Provenance;
  entities?: { type: string; name: string }[];
};

export type IngestReport = {
  runId: string;
  processed: number;
  skippedUnchanged: number;
  clusters: number;
  eventsAppended: number;
  changed: boolean;
  stepTimingsMs: { step: number; name: string; ms: number }[];
};

export type ResolutionDecision = "auto-merge" | "review" | "new";

const ZERO_WIDTH_RE = /[​‌‍﻿]/g;
const COMBINING_RE = /[̀-ͯ]/g;

export function normalizeName(name: string): string {
  if (typeof name !== "string") return "";
  return name
    .normalize("NFKD")
    .replace(COMBINING_RE, "")
    .replace(ZERO_WIDTH_RE, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function sha256Hex(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

export function entityIdFromName(type: string, name: string): string {
  return `ent_${sha256Hex(`${type}:${normalizeName(name)}`).slice(0, 16)}`;
}

export function externalId(type: string, system: string, id: string): string {
  return `${type}:${system}:${id}`;
}

export function decide(similarity: number, autoMergeAt = 0.85, reviewLower = 0.82): ResolutionDecision {
  if (similarity >= autoMergeAt) return "auto-merge";
  if (similarity >= reviewLower) return "review";
  return "new";
}

export function nameSimilarity(a: string, b: string): number {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na && !nb) return 1;
  const dist = levenshtein(na, nb);
  const maxLen = Math.max(na.length, nb.length) || 1;
  return 1 - dist / maxLen;
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const prev = new Array(b.length + 1).fill(0).map((_, i) => i);
  const curr = new Array(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min((curr[j - 1] ?? 0) + 1, (prev[j] ?? 0) + 1, (prev[j - 1] ?? 0) + cost);
    }
    for (let j = 0; j <= b.length; j++) prev[j] = curr[j];
  }
  return prev[b.length] ?? 0;
}

function canonicalJson(value: unknown): string {
  const seen = new WeakSet<object>();
  const walk = (v: unknown): unknown => {
    if (v === null || v === undefined) return null;
    if (typeof v !== "object") return v;
    if (seen.has(v as object)) return null;
    seen.add(v as object);
    if (Array.isArray(v)) return v.map(walk);
    const obj = v as Record<string, unknown>;
    const sortedKeys = Object.keys(obj)
      .filter((k) => obj[k] !== undefined)
      .sort();
    const out: Record<string, unknown> = {};
    for (const k of sortedKeys) out[k] = walk(obj[k]);
    return out;
  };
  return JSON.stringify(walk(value));
}

function stableChecksum(parts: unknown): string {
  return sha256Hex(canonicalJson(parts)).slice(0, 16);
}

function toIso(d: ISODate | Date): ISODate {
  if (d instanceof Date) return d.toISOString();
  return new Date(d).toISOString();
}

function requireProvenance(source: unknown): asserts source is Provenance {
  if (!source || typeof source !== "object") throw new Error("provenance required");
  const s = source as Provenance;
  if (!s.kind || s.at === undefined || s.at === null) throw new Error("provenance.kind and provenance.at are required");
}

// --- views -----------------------------------------------------------------
export type GraphView = {
  entity(id: string): Entity | undefined;
  neighborsOf(id: string, opts?: { via?: string; inContext?: string; at?: ISODate }): Entity[];
  incoming(id: string, opts?: { via?: string; inContext?: string; at?: ISODate }): Entity[];
  entitiesInContext(ctxId: string, opts?: { type?: string }): Entity[];
  traverse(startId: string, opts: { via: string; direction: "ancestors" | "descendants"; maxDepth?: number }): Entity[];
  query(opts?: { type?: string; where?: (e: Entity) => boolean }): Entity[];
};

export type FactsView = {
  about(id: string): Fact[];
  byPredicate(predicate: string): Fact[];
};

export type SnapshotView = {
  entityAt(id: string, at: ISODate): Entity | undefined;
};

export type TimelineView = {
  for(id: string): WorldEvent[];
};

// --- store -----------------------------------------------------------------
export class WorldModel {
  private readonly opts: WorldModelOptions;
  private readonly clock: () => Date;
  private readonly entities = new Map<string, Entity>();
  private readonly contexts = new Map<string, Context>();
  private readonly relationships = new Map<string, Relationship>();
  private readonly facts = new Map<string, Fact>();
  private readonly observations = new Map<string, IngestObservation>();
  private readonly stories: unknown[] = [];
  private readonly scores: Record<string, number> = {};
  private readonly mergeQueueList: MergeProposal[] = [];
  private readonly eventsList: WorldEvent[] = [];
  private readonly auditList: AuditEntry[] = [];
  private readonly subscribers = new Set<(e: WorldEvent) => void>();
  private readonly namedViews = new Map<string, { events: string[]; initialState: unknown; reducer: (s: unknown, e: WorldEvent) => unknown }>();
  private writeChain: Promise<unknown> = Promise.resolve();
  private seq = 0;
  private evSeq = 0;
  private readonly storageFile?: string;

  constructor(opts: WorldModelOptions) {
    if (!opts || !opts.namespace) throw new Error("WorldModel requires `namespace`");
    this.opts = { storage: "memory", ...opts };
    this.clock = opts.clock ?? (() => new Date());
    if (this.opts.storage === "local") {
      const dir = resolvePath(opts.directory ?? process.cwd(), ".world");
      mkdirSync(dir, { recursive: true });
      this.storageFile = resolvePath(dir, `${opts.namespace}.json`);
      this.hydrateFromDisk();
    }
  }

  // ---- audit helpers
  private pushAudit(kind: string, actor: string, summary: string, eventId?: EventId, runId?: string) {
    this.seq += 1;
    this.auditList.push({ seq: this.seq, at: this.clock().toISOString(), kind, actor, summary, eventId, runId });
  }

  private pushEvent(e: WorldEvent) {
    this.eventsList.push(e);
    for (const fn of this.subscribers) {
      try { fn(e); } catch { /* ignore */ }
    }
  }

  private nextEventId(prefix: string): EventId {
    this.evSeq += 1;
    return `${prefix}_${this.evSeq.toString(36)}`;
  }

  // ---- public queue
  private enqueue<T>(fn: () => T | Promise<T>): Promise<T> {
    const next = this.writeChain.then(() => fn());
    this.writeChain = next.catch(() => undefined);
    return next;
  }

  // ---- upserts
  upsertEntity(input: {
    type: string;
    externalKey?: ExternalKey;
    name?: string;
    attrs?: Record<string, unknown>;
    source: Provenance;
    state?: Entity["state"];
  }): Promise<Entity> {
    return this.enqueue(() => {
      requireProvenance(input.source);
      const id = input.externalKey
        ? externalId(input.type, input.externalKey.system, input.externalKey.id)
        : entityIdFromName(input.type, input.name ?? "");
      const at = toIso(input.source.at);
      const existing = this.entities.get(id);
      const merged: Entity = existing
        ? { ...existing, attrs: { ...existing.attrs, ...(input.attrs ?? {}) }, updatedAt: at, name: input.name ?? existing.name, state: input.state ?? existing.state }
        : {
            id,
            type: input.type,
            externalKey: input.externalKey,
            name: input.name,
            attrs: { ...(input.attrs ?? {}) },
            state: input.state ?? "active",
            createdAt: at,
            updatedAt: at,
          };
      this.entities.set(id, merged);
      const eventId = this.nextEventId("ent");
      this.pushEvent({ kind: "entity.upserted", eventId, at, actor: input.source.by ?? "system", entity: merged, runId: input.source.runId });
      this.pushAudit("entity.upserted", input.source.by ?? "system", `entity ${id}`, eventId, input.source.runId);
      this.persist();
      return merged;
    });
  }

  upsertContext(input: {
    type: string;
    externalKey?: ExternalKey;
    attrs?: Record<string, unknown>;
    parent?: string;
    source: Provenance;
  }): Promise<Context> {
    return this.enqueue(() => {
      requireProvenance(input.source);
      const id = input.externalKey
        ? externalId(input.type, input.externalKey.system, input.externalKey.id)
        : `${input.type}:local:${entityIdFromName("ctx", JSON.stringify(input.attrs ?? {})).slice(4)}`;
      const at = toIso(input.source.at);
      const existing = this.contexts.get(id);
      const merged: Context = existing
        ? { ...existing, attrs: { ...existing.attrs, ...(input.attrs ?? {}) }, updatedAt: at, parent: input.parent ?? existing.parent }
        : { id, type: input.type, externalKey: input.externalKey, attrs: { ...(input.attrs ?? {}) }, parent: input.parent, createdAt: at, updatedAt: at };
      this.contexts.set(id, merged);
      const eventId = this.nextEventId("ctx");
      this.pushEvent({ kind: "context.upserted", eventId, at, actor: input.source.by ?? "system", context: merged, runId: input.source.runId });
      this.pushAudit("context.upserted", input.source.by ?? "system", `context ${id}`, eventId, input.source.runId);
      this.persist();
      return merged;
    });
  }

  relate(input: {
    from: string;
    type: string;
    to: string;
    context?: string;
    attrs?: Record<string, unknown>;
    validFrom?: string;
    validTo?: string;
    source: Provenance;
  }): Promise<Relationship> {
    return this.enqueue(() => {
      requireProvenance(input.source);
      const at = toIso(input.source.at);
      const validFrom = input.validFrom ?? at;
      // Supersede rule: close any open edge with same (from, type, context).
      for (const r of this.relationships.values()) {
        if (r.from === input.from && r.type === input.type && (r.context ?? null) === (input.context ?? null) && !r.validTo) {
          r.validTo = validFrom;
          const closeEv = this.nextEventId("rel-close");
          this.pushEvent({ kind: "relationship.closed", eventId: closeEv, at, actor: input.source.by ?? "system", relId: r.id, validTo: validFrom, runId: input.source.runId });
          this.pushAudit("relationship.closed", input.source.by ?? "system", `rel ${r.id} closed`, closeEv, input.source.runId);
        }
      }
      const relId = `rel_${stableChecksum([input.from, input.type, input.to, input.context ?? null, validFrom])}`;
      const rel: Relationship = {
        id: relId,
        from: input.from,
        type: input.type,
        to: input.to,
        context: input.context,
        attrs: { ...(input.attrs ?? {}) },
        validFrom,
        validTo: input.validTo,
        createdAt: at,
      };
      this.relationships.set(relId, rel);
      const eventId = this.nextEventId("rel");
      this.pushEvent({ kind: "relationship.added", eventId, at, actor: input.source.by ?? "system", rel, runId: input.source.runId });
      this.pushAudit("relationship.added", input.source.by ?? "system", `rel ${relId}`, eventId, input.source.runId);
      this.persist();
      return rel;
    });
  }

  assertFact(input: {
    about: string;
    predicate: string;
    value: unknown;
    confidence?: number;
    context?: string;
    source: Provenance;
  }): Promise<Fact> {
    return this.enqueue(() => {
      requireProvenance(input.source);
      if (!this.entities.has(input.about)) {
        // Create emerging stub entity, type inferred from id prefix.
        const type = input.about.includes(":") ? (input.about.split(":")[0] ?? "entity") : "entity";
        const at = toIso(input.source.at);
        const stub: Entity = { id: input.about, type, attrs: {}, state: "emerging", createdAt: at, updatedAt: at };
        this.entities.set(input.about, stub);
      }
      const at = toIso(input.source.at);
      const factId = `fact_${stableChecksum([input.about, input.predicate, input.value, input.context ?? null])}`;
      const existing = this.facts.get(factId);
      const next: Fact = {
        id: factId,
        about: input.about,
        predicate: input.predicate,
        value: input.value,
        confidence: input.confidence ?? 1,
        context: input.context,
        source: input.source,
        createdAt: existing?.createdAt ?? at,
      };
      this.facts.set(factId, next);
      const eventId = this.nextEventId("fact");
      this.pushEvent({ kind: "fact.asserted", eventId, at, actor: input.source.by ?? "system", fact: next, runId: input.source.runId });
      this.pushAudit("fact.asserted", input.source.by ?? "system", `fact ${factId}`, eventId, input.source.runId);
      this.persist();
      return next;
    });
  }

  ingest(observations: IngestObservation[]): Promise<IngestReport> {
    return this.enqueue(() => {
      const stepTimings: IngestReport["stepTimingsMs"] = [];
      let processed = 0;
      let skippedUnchanged = 0;
      let eventsAppended = 0;
      let changed = false;
      const start = Date.now();
      const obsIds: string[] = [];
      for (const o of observations) {
        requireProvenance(o.source);
        const checksum = stableChecksum({ externalId: o.externalId, title: o.title, text: o.text ?? "", at: o.at });
        const key = `${o.externalId}#${checksum}`;
        obsIds.push(o.externalId);
        const prior = this.observations.get(o.externalId);
        if (prior && stableChecksum({ externalId: prior.externalId, title: prior.title, text: prior.text ?? "", at: prior.at }) === checksum) {
          skippedUnchanged++;
          continue;
        }
        processed++;
        changed = true;
        this.observations.set(o.externalId, o);
        const atIso = toIso(o.at);
        const observationEntityId = externalId(o.type ?? "observation", "ingest", o.externalId);
        if (!this.entities.has(observationEntityId)) {
          const ent: Entity = { id: observationEntityId, type: o.type ?? "observation", attrs: { title: o.title, text: o.text ?? "", checksum }, state: "active", createdAt: atIso, updatedAt: atIso };
          this.entities.set(observationEntityId, ent);
          const evId = this.nextEventId("ent");
          this.pushEvent({ kind: "entity.upserted", eventId: evId, at: atIso, actor: o.source.by ?? "system", entity: ent, runId: o.source.runId });
          this.pushAudit("entity.upserted", o.source.by ?? "system", `observation ${o.externalId}`, evId, o.source.runId);
          eventsAppended++;
        } else {
          const prev = this.entities.get(observationEntityId)!;
          const updated: Entity = { ...prev, attrs: { ...prev.attrs, title: o.title, text: o.text ?? "", checksum }, updatedAt: atIso };
          this.entities.set(observationEntityId, updated);
        }
        for (const m of o.entities ?? []) {
          const mentionedId = entityIdFromName(m.type, m.name);
          if (!this.entities.has(mentionedId)) {
            const ent: Entity = { id: mentionedId, type: m.type, name: m.name, attrs: {}, state: "active", createdAt: atIso, updatedAt: atIso };
            this.entities.set(mentionedId, ent);
          }
          // Supersede-rule aware: close prior open mention edges with same (from, type, no-context).
          for (const r of this.relationships.values()) {
            if (r.from === observationEntityId && r.type === "mentions" && !r.context && !r.validTo) {
              r.validTo = atIso;
            }
          }
          const relId = `rel_${stableChecksum([observationEntityId, "mentions", mentionedId, null, atIso])}`;
          const rel: Relationship = { id: relId, from: observationEntityId, type: "mentions", to: mentionedId, attrs: {}, validFrom: atIso, createdAt: atIso };
          this.relationships.set(relId, rel);
          const evId = this.nextEventId("rel");
          this.pushEvent({ kind: "relationship.added", eventId: evId, at: atIso, actor: o.source.by ?? "system", rel, runId: o.source.runId });
          eventsAppended++;
        }
        const evObsId = this.nextEventId("obs");
        this.pushEvent({ kind: "observation.ingested", eventId: evObsId, at: atIso, actor: o.source.by ?? "system", observation: o, runId: o.source.runId });
      }
      stepTimings.push({ step: 1, name: "ingest", ms: Date.now() - start });
      const report: IngestReport = {
        runId: sha256Hex(obsIds.join("|")).slice(0, 16),
        processed,
        skippedUnchanged,
        clusters: 0,
        eventsAppended,
        changed,
        stepTimingsMs: stepTimings,
      };
      this.persist();
      return report;
    });
  }

  // ---- views
  view(name: "graph"): GraphView;
  view(name: "facts"): FactsView;
  view(name: "snapshot"): SnapshotView;
  view(name: "timeline"): TimelineView;
  view(name: string): unknown {
    if (name === "graph") return this.graphView();
    if (name === "facts") return this.factsView();
    if (name === "snapshot") return this.snapshotView();
    if (name === "timeline") return this.timelineView();
    const named = this.namedViews.get(name);
    if (!named) throw new Error(`Unknown view: ${name}`);
    let state = named.initialState;
    for (const e of this.eventsList) {
      if (named.events.includes(e.kind)) state = named.reducer(state, e);
    }
    return state as unknown;
  }

  registerView<S>(name: string, spec: { events: string[]; initialState: S; reducer: (s: S, e: WorldEvent) => S }): void {
    this.namedViews.set(name, spec as unknown as { events: string[]; initialState: unknown; reducer: (s: unknown, e: WorldEvent) => unknown });
  }

  private graphView(): GraphView {
    return {
      entity: (id) => this.entities.get(id),
      neighborsOf: (id, opts) => this.neighbors(id, "out", opts),
      incoming: (id, opts) => this.neighbors(id, "in", opts),
      entitiesInContext: (ctxId, opts) => {
        const out: Entity[] = [];
        const seen = new Set<string>();
        for (const r of this.relationships.values()) {
          if (r.context === ctxId) {
            for (const id of [r.from, r.to]) {
              const ent = this.entities.get(id);
              if (!ent || seen.has(id)) continue;
              if (opts?.type && ent.type !== opts.type) continue;
              seen.add(id);
              out.push(ent);
            }
          }
        }
        return out;
      },
      traverse: (startId, opts) => {
        const maxDepth = opts.maxDepth ?? 32;
        const visited = new Set<string>();
        const result: Entity[] = [];
        const walk = (nodeId: string, depth: number) => {
          if (depth > maxDepth || visited.has(nodeId)) return;
          visited.add(nodeId);
          for (const r of this.relationships.values()) {
            if (r.validTo) continue;
            if (r.type !== opts.via) continue;
            const nextId = opts.direction === "descendants" ? (r.from === nodeId ? r.to : undefined) : r.to === nodeId ? r.from : undefined;
            if (!nextId) continue;
            const ent = this.entities.get(nextId);
            if (ent && !visited.has(nextId)) result.push(ent);
            walk(nextId, depth + 1);
          }
        };
        walk(startId, 0);
        return result;
      },
      query: (opts) => {
        const out: Entity[] = [];
        for (const e of this.entities.values()) {
          if (opts?.type && e.type !== opts.type) continue;
          if (opts?.where && !opts.where(e)) continue;
          out.push(e);
        }
        return out;
      },
    };
  }

  private neighbors(id: string, direction: "in" | "out", opts?: { via?: string; inContext?: string; at?: ISODate }): Entity[] {
    const atRef = opts?.at ? Date.parse(toIso(opts.at)) : Number.POSITIVE_INFINITY;
    const seen = new Set<string>();
    const out: Entity[] = [];
    for (const r of this.relationships.values()) {
      if (opts?.via && r.type !== opts.via) continue;
      if (opts?.inContext && r.context !== opts.inContext) continue;
      // Point-in-time filter
      const from = Date.parse(r.validFrom);
      const to = r.validTo ? Date.parse(r.validTo) : Number.POSITIVE_INFINITY;
      if (opts?.at) {
        if (!(from <= atRef && atRef < to)) continue;
      } else if (r.validTo) {
        // Default view: open edges only.
        continue;
      }
      const matchId = direction === "out" ? r.from === id : r.to === id;
      if (!matchId) continue;
      const otherId = direction === "out" ? r.to : r.from;
      if (seen.has(otherId)) continue;
      const ent = this.entities.get(otherId);
      if (!ent) continue;
      seen.add(otherId);
      out.push(ent);
    }
    return out;
  }

  private factsView(): FactsView {
    return {
      about: (id) => Array.from(this.facts.values()).filter((f) => f.about === id),
      byPredicate: (p) => Array.from(this.facts.values()).filter((f) => f.predicate === p),
    };
  }

  private snapshotView(): SnapshotView {
    return {
      entityAt: (id, _at) => this.entities.get(id),
    };
  }

  private timelineView(): TimelineView {
    return {
      for: (id) => this.eventsList.filter((e) => {
        switch (e.kind) {
          case "entity.upserted": return e.entity.id === id;
          case "context.upserted": return e.context.id === id;
          case "relationship.added": return e.rel.from === id || e.rel.to === id;
          case "relationship.closed": {
            const r = this.relationships.get(e.relId);
            return !!r && (r.from === id || r.to === id);
          }
          case "fact.asserted": return e.fact.about === id;
          case "observation.ingested": return e.observation.externalId === id;
        }
      }),
    };
  }

  mergeQueue(): readonly MergeProposal[] { return this.mergeQueueList; }
  approveMerge(id: string, by: string): Promise<void> {
    return this.enqueue(() => {
      const m = this.mergeQueueList.find((p) => p.id === id);
      if (!m) throw new Error(`merge ${id} not found`);
      m.status = "approved"; m.approvedBy = by;
      this.pushAudit("merge.approved", by, `merge ${id}`);
      this.persist();
    });
  }
  rejectMerge(id: string, by: string): Promise<void> {
    return this.enqueue(() => {
      const m = this.mergeQueueList.find((p) => p.id === id);
      if (!m) throw new Error(`merge ${id} not found`);
      m.status = "rejected"; m.rejectedBy = by;
      this.pushAudit("merge.rejected", by, `merge ${id}`);
      this.persist();
    });
  }

  audit(): readonly AuditEntry[] { return this.auditList; }
  events(): readonly WorldEvent[] { return this.eventsList; }
  subscribeEvents(fn: (e: WorldEvent) => void): () => void {
    this.subscribers.add(fn);
    return () => this.subscribers.delete(fn);
  }

  // ---- shape (canonical JSON of durable state only; wall-clock timings excluded)
  stateShape(): unknown {
    return {
      namespace: this.opts.namespace,
      entities: Array.from(this.entities.values()).sort((a, b) => a.id.localeCompare(b.id)),
      contexts: Array.from(this.contexts.values()).sort((a, b) => a.id.localeCompare(b.id)),
      relationships: Array.from(this.relationships.values()).sort((a, b) => a.id.localeCompare(b.id)),
      facts: Array.from(this.facts.values()).sort((a, b) => a.id.localeCompare(b.id)),
      observations: Array.from(this.observations.values()).sort((a, b) => a.externalId.localeCompare(b.externalId)),
      stories: this.stories,
      scores: this.scores,
      mergeQueue: this.mergeQueueList.map((m) => ({ ...m })),
    };
  }

  stateShapeCanonical(): string {
    return canonicalJson(this.stateShape());
  }

  private persist() {
    if (!this.storageFile) return;
    try {
      const payload = {
        events: this.eventsList,
        audit: this.auditList,
        observations: Array.from(this.observations.values()),
        stories: this.stories,
        scores: this.scores,
        mergeQueue: this.mergeQueueList,
      };
      mkdirSync(dirname(this.storageFile), { recursive: true });
      writeFileSync(this.storageFile, JSON.stringify(payload), "utf8");
    } catch { /* local-storage persistence is best-effort */ }
  }

  private hydrateFromDisk() {
    if (!this.storageFile) return;
    try {
      const raw = readFileSync(this.storageFile, "utf8");
      const data = JSON.parse(raw) as { events?: WorldEvent[]; audit?: AuditEntry[]; observations?: IngestObservation[]; mergeQueue?: MergeProposal[] };
      if (data.audit) for (const a of data.audit) { this.auditList.push(a); if (a.seq > this.seq) this.seq = a.seq; }
      if (data.observations) for (const o of data.observations) this.observations.set(o.externalId, o);
      if (data.mergeQueue) for (const m of data.mergeQueue) this.mergeQueueList.push(m);
      if (data.events) for (const e of data.events) {
        this.eventsList.push(e);
        switch (e.kind) {
          case "entity.upserted": this.entities.set(e.entity.id, e.entity); break;
          case "context.upserted": this.contexts.set(e.context.id, e.context); break;
          case "relationship.added": this.relationships.set(e.rel.id, e.rel); break;
          case "relationship.closed": { const r = this.relationships.get(e.relId); if (r) r.validTo = e.validTo; break; }
          case "fact.asserted": this.facts.set(e.fact.id, e.fact); break;
        }
      }
    } catch { /* no prior state */ }
  }
}

export default WorldModel;
