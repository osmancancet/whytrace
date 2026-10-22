import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { approveRun, fetchCases, fetchMarkovian, fetchQueries, fetchReport, fetchRuns, sendFeedback, startRun, subscribeStream } from "./api.ts";
import type { MarkovianSummary, Report, SavedRun, TraceEvent } from "./types.ts";

type Case = { id: string; upn: string; expected?: string; description?: string };
type QueryRow = { sql_id: string; sql: string; rows: number; ms: number; ts: string; status: string };

export function App() {
  const [cases, setCases] = useState<Case[]>([]);
  const [runs, setRuns] = useState<SavedRun[]>([]);
  const [selectedCase, setSelectedCase] = useState<string>("case-001");
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [trace, setTrace] = useState<TraceEvent[]>([]);
  const [queries, setQueries] = useState<QueryRow[]>([]);
  const [markovian, setMarkovian] = useState<MarkovianSummary | null>(null);
  const [liveMode, setLiveMode] = useState(false);
  const [replayMode, setReplayMode] = useState(false);
  const [selectedFinding, setSelectedFinding] = useState<string | null>(null);
  const [analyst, setAnalyst] = useState("osman.cetlenbik@aegean.edu");
  const [approvalNote, setApprovalNote] = useState("");
  const [approvalDone, setApprovalDone] = useState(false);
  const [feedbackState, setFeedbackState] = useState<Record<string, "confirmed" | "rejected">>({});
  const [verdictFeedback, setVerdictFeedback] = useState<"confirmed" | "rejected" | null>(null);
  const [feedbackLessons, setFeedbackLessons] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const stopRef = useRef<null | (() => void)>(null);

  const refreshRuns = useCallback(async () => {
    try { setRuns(await fetchRuns()); } catch (err) { setError((err as Error).message); }
  }, []);

  useEffect(() => {
    fetchCases().then(setCases).catch((err) => setError(err.message));
    refreshRuns();
  }, [refreshRuns]);

  const loadRun = useCallback(async (id: string, replay: boolean) => {
    setSelectedRunId(id);
    setReplayMode(replay);
    setLiveMode(false);
    setApprovalDone(false);
    setFeedbackState({});
    setVerdictFeedback(null);
    setFeedbackLessons([]);
    try {
      const [r, q, m] = await Promise.all([fetchReport(id), fetchQueries(id), fetchMarkovian(id)]);
      setReport(r);
      setQueries(q);
      setMarkovian(m);
      setTrace([]);
      if (replay) {
        // Subscribe to the SSE replay stream (API tags it as mode="replay").
        if (stopRef.current) stopRef.current();
        stopRef.current = subscribeStream(id, (e) => setTrace((prev) => [...prev, e]), () => setLiveMode(false));
      }
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  const startLive = useCallback(async () => {
    setError(null);
    setApprovalDone(false);
    setReplayMode(false);
    try {
      const { run_id } = await startRun(selectedCase);
      setSelectedRunId(run_id);
      setReport(null);
      setTrace([]);
      setQueries([]);
      setMarkovian(null);
      setLiveMode(true);
      if (stopRef.current) stopRef.current();
      stopRef.current = subscribeStream(run_id, (e) => {
        setTrace((prev) => [...prev, e]);
        if (e.action === "done") {
          setLiveMode(false);
          // Fetch the finished report and sources.
          Promise.all([fetchReport(run_id).catch(() => null), fetchQueries(run_id), fetchMarkovian(run_id)])
            .then(([r, q, m]) => { if (r) setReport(r); setQueries(q); setMarkovian(m); refreshRuns(); })
            .catch((err) => setError((err as Error).message));
        }
      }, () => setError("stream error — see devtools"));
    } catch (err) {
      setError((err as Error).message);
    }
  }, [selectedCase, refreshRuns]);

  useEffect(() => () => { if (stopRef.current) stopRef.current(); }, []);

  const submitFeedback = useCallback(async (body: { verdict?: "contain" | "monitor" | "benign" | "escalate"; rejected?: string[]; confirmed?: string[]; note?: string }) => {
    if (!selectedRunId) return;
    try {
      const resp = await sendFeedback(selectedRunId, { analyst, ...body });
      setFeedbackLessons((prev) => [...prev, ...resp.lesson_ids]);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [analyst, selectedRunId]);

  const toggleFindingFeedback = useCallback(async (fid: string, kind: "confirmed" | "rejected") => {
    setFeedbackState((prev) => ({ ...prev, [fid]: kind }));
    await submitFeedback(kind === "confirmed" ? { confirmed: [fid] } : { rejected: [fid] });
  }, [submitFeedback]);

  const confirmVerdict = useCallback(async () => {
    if (!report) return;
    setVerdictFeedback("confirmed");
    await submitFeedback({ verdict: report.verdict as "contain" | "monitor" | "benign" | "escalate", note: approvalNote });
  }, [approvalNote, report, submitFeedback]);

  const rejectVerdict = useCallback(async (newVerdict: "contain" | "monitor" | "benign" | "escalate") => {
    if (!report || newVerdict === report.verdict) return;
    setVerdictFeedback("rejected");
    await submitFeedback({ verdict: newVerdict, note: approvalNote });
  }, [approvalNote, report, submitFeedback]);

  const hypothesisBuckets = useMemo(() => {
    if (!report) return [] as Array<{ id: string; support: number; opposing: number; label: string }>;
    const map = new Map<string, { support: number; opposing: number; label?: string }>();
    for (const f of report.findings) {
      const b = map.get(f.hypothesis_id) ?? { support: 0, opposing: 0 };
      if (f.status === "CONFIRMED" || f.status === "LIKELY") b.support += 1;
      map.set(f.hypothesis_id, b);
    }
    for (const rc of report.rejected_claims) {
      const key = rc.claim.length < 60 ? rc.claim : rc.claim.slice(0, 60);
      const b = map.get(key) ?? { support: 0, opposing: 0 };
      b.opposing += 1;
      map.set(key, b);
    }
    return [...map.entries()].map(([id, b]) => ({ id, support: b.support, opposing: b.opposing, label: id })).sort((a, b) => b.support - a.support);
  }, [report]);

  const activeFinding = report?.findings.find((f) => f.id === selectedFinding) ?? null;
  const activeQueries = activeFinding ? queries.filter((q) => activeFinding.sql_ids.includes(q.sql_id)) : [];

  const sponsorLine = report
    ? `Zetaris USL security_usl · ${report.models.length} Nightshift receipts · Markovian ${markovian ? `${markovian.windows.length} pages, ${markovian.totalTokensUsed} ${markovian.tokenLabel}` : "n/a"}`
    : `Zetaris USL security_usl · Nightshift Nemotron lanes · Engines: World Model 8/8 · H-MEM 13/13 · Markovian 8/8`;

  return (
    <div className="app">
      <header className="topbar">
        <span className="logo">WhyTrace</span>
        <span className="badge">University SOC analyst console</span>
        <label htmlFor="case-select" style={{ marginLeft: 12 }}>Case</label>
        <select id="case-select" value={selectedCase} onChange={(e) => setSelectedCase(e.target.value)}>
          {cases.map((c) => <option key={c.id} value={c.id}>{c.id} — {c.upn} ({c.expected ?? "?"})</option>)}
        </select>
        <button onClick={startLive} aria-pressed={liveMode}>Run investigation</button>
        {report && !liveMode && (
          <button className="secondary" onClick={() => loadRun(report.run_id, true)}>Replay recorded run</button>
        )}
        {replayMode && <span className="badge sample">REPLAY (recorded trace, 4× speed)</span>}
        {liveMode && <span className="badge sample" role="status">LIVE</span>}
        {error && <span className="badge" style={{ color: "var(--contain)" }}>⚠ {error}</span>}
      </header>

      <section className="layout" aria-live="polite">
        <aside className="panel case-queue" aria-label="Case queue">
          <h2>Case queue</h2>
          <ul>
            {cases.map((c) => (
              <li key={c.id}>
                <button type="button" aria-current={c.id === selectedCase} onClick={() => setSelectedCase(c.id)}>
                  <div>{c.id} <span style={{ color: "var(--fg-dim)" }}>{c.expected}</span></div>
                  <div className="meta">{c.upn}</div>
                  <div className="meta">{c.description}</div>
                </button>
              </li>
            ))}
          </ul>
          <h2 style={{ marginTop: 16 }}>Recent runs</h2>
          <ul>
            {runs.slice(0, 10).map((r) => (
              <li key={r.id}>
                <button type="button" aria-current={r.id === selectedRunId} onClick={() => loadRun(r.id, false)}>
                  <div>{r.case_id} → <strong>{r.verdict}</strong> ({r.confidence.toFixed(2)})</div>
                  <div className="meta">{r.id}</div>
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <main className="panel">
          <h2>Investigation</h2>
          <HypothesisRace rows={hypothesisBuckets} />
          <h2 style={{ marginTop: 12 }}>Agent timeline</h2>
          <AgentTimeline events={trace} liveMode={liveMode} replayMode={replayMode} />
          {report?.memory_used?.length ? (
            <div className="memory-panel">
              <strong>Memory recalled ({report.memory_used.length} lesson(s)):</strong>
              <ul style={{ margin: 0, paddingLeft: 16 }}>
                {report.memory_used.map((l, i) => <li key={i} className="lesson">{l}</li>)}
              </ul>
            </div>
          ) : null}
          <h2 style={{ marginTop: 12 }}>Rejected claims</h2>
          <RejectedList items={report?.rejected_claims ?? []} />
        </main>

        <aside className="panel" aria-label="Verdict">
          <h2>Verdict</h2>
          <VerdictPanel report={report} />
          <FeedbackPanel report={report} verdictFeedback={verdictFeedback} onConfirm={confirmVerdict} onReject={rejectVerdict} lessons={feedbackLessons} />
          <h2 style={{ marginTop: 12 }}>Markovian long sweep</h2>
          <MarkovianBlock markovian={markovian} />
          <h2 style={{ marginTop: 12 }}>Actions</h2>
          <ActionBlock report={report} analyst={analyst} setAnalyst={setAnalyst} note={approvalNote} setNote={setApprovalNote} done={approvalDone} setDone={setApprovalDone} runId={selectedRunId} onApproved={() => refreshRuns()} />
        </aside>
      </section>

      <section className="panel" aria-label="Evidence chain">
        <h2>Evidence chain: claim → [sql_id] → SQL → rows</h2>
        <div className="evidence-chain">
          <div>
            <ClaimList findings={report?.findings ?? []} selected={selectedFinding} onSelect={setSelectedFinding} verdicts={report?.critic_verdicts ?? []} queries={queries} feedback={feedbackState} onFeedback={toggleFindingFeedback} />
          </div>
          <div>
            <EvidenceDetail finding={activeFinding} queries={activeQueries} verdicts={report?.critic_verdicts ?? []} />
          </div>
        </div>
        <h2 style={{ marginTop: 12 }}>Data quality</h2>
        <DqStrip dq={report?.dq ?? []} />
      </section>

      <footer className="sponsor-strip" aria-label="Sponsor strip">
        <div>{sponsorLine}</div>
        <div>Engines: World Model 8/8 · H-MEM 13/13 · Markovian 8/8</div>
      </footer>
    </div>
  );
}

function HypothesisRace({ rows }: { rows: Array<{ id: string; support: number; opposing: number; label: string }> }) {
  if (!rows.length) return <p style={{ color: "var(--fg-dim)" }}>Run an investigation to see hypotheses stack up.</p>;
  const max = Math.max(1, ...rows.map((r) => Math.max(r.support, r.opposing)));
  return (
    <div className="hypothesis-list">
      {rows.map((r) => (
        <div key={r.id} className={`bar-row ${r.opposing > r.support ? "rejected" : ""}`}>
          <div>
            <div style={{ fontFamily: "var(--mono)", fontSize: 12 }}>{r.id}</div>
            <div className="bar"><div className="bar-fill" style={{ width: `${((r.opposing > r.support ? r.opposing : r.support) / max) * 100}%` }} /></div>
          </div>
          <div style={{ fontFamily: "var(--mono)", fontSize: 11 }}>support {r.support} · rejected {r.opposing}</div>
        </div>
      ))}
    </div>
  );
}

function AgentTimeline({ events, liveMode, replayMode }: { events: TraceEvent[]; liveMode: boolean; replayMode: boolean }) {
  const scrollRef = useRef<HTMLUListElement>(null);
  useEffect(() => { scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight); }, [events.length]);
  if (!events.length) return <p style={{ color: "var(--fg-dim)" }}>{liveMode ? "Waiting for first event…" : replayMode ? "Replaying…" : "No events yet. Start a live run or pick a saved run."}</p>;
  return (
    <ul className="timeline" ref={scrollRef} style={{ maxHeight: 260, overflowY: "auto" }}>
      {events.map((e, i) => (
        <li key={i} className={e.status === "degraded" ? "row-degraded" : e.status === "error" ? "row-error" : ""}>
          <span>{(e.ts ?? "").slice(11, 19)}</span>
          <span><strong>{e.agent}</strong>·{e.action}</span>
          {e.routed_model ? <span className="model-chip">{e.routed_model.split("/").pop()} · {e.receipt_id?.slice(0, 10) ?? ""}</span> : <span />}
          <span>{e.output_summary ?? e.input_summary ?? ""}</span>
        </li>
      ))}
    </ul>
  );
}

function VerdictPanel({ report }: { report: Report | null }) {
  if (!report) return <p style={{ color: "var(--fg-dim)" }}>No verdict yet.</p>;
  const r = report;
  return (
    <div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <span className={`verdict-chip ${r.verdict}`}>{r.verdict}</span>
        <span className="badge">confidence {r.confidence.toFixed(2)}</span>
        {r.critic_score && <span className="badge">critic {r.critic_score.accuracy + r.critic_score.appropriateness + r.critic_score.actionability}/9</span>}
      </div>
      {r.risk && (
        <p style={{ fontSize: 12, color: "var(--fg-dim)", marginTop: 8 }}>
          Risk Gate: policy <strong>{r.risk.policy_decision}</strong> · model <strong>{r.risk.model_decision ?? "—"}</strong> → <strong>{r.risk.decision}</strong>
          {r.risk.escalate_reasons.length ? ` (${r.risk.escalate_reasons.join("; ")})` : ""}
        </p>
      )}
      <p style={{ marginTop: 8 }}>{r.summary}</p>
      {r.critic_score && (
        <div className="rubric" style={{ marginTop: 8 }}>
          <div>Accuracy <span className="score">{r.critic_score.accuracy}</span>/3</div>
          <div>Appropriateness <span className="score">{r.critic_score.appropriateness}</span>/3</div>
          <div>Actionability <span className="score">{r.critic_score.actionability}</span>/3</div>
        </div>
      )}
      {r.limitations.length ? (
        <div style={{ marginTop: 8 }}>
          <strong>Limitations</strong>
          <ul style={{ fontSize: 12, color: "var(--fg-dim)", margin: 0, paddingLeft: 16 }}>{r.limitations.map((l, i) => <li key={i}>{l}</li>)}</ul>
        </div>
      ) : null}
      {r.not_checked.length ? (
        <div style={{ marginTop: 8 }}>
          <strong>Not checked</strong>
          <ul style={{ fontSize: 12, color: "var(--fg-dim)", margin: 0, paddingLeft: 16 }}>{r.not_checked.map((l, i) => <li key={i}>{l}</li>)}</ul>
        </div>
      ) : null}
    </div>
  );
}

function MarkovianBlock({ markovian }: { markovian: MarkovianSummary | null }) {
  if (!markovian) return <p style={{ color: "var(--fg-dim)" }}>No long-sweep for this run.</p>;
  return (
    <div style={{ fontSize: 12 }}>
      <div>Pages: {markovian.windows.length} · tokens {markovian.totalTokensUsed} ({markovian.tokenLabel}) · model calls {markovian.measured.model_calls}</div>
      <div>Victims found: {markovian.victim_count}</div>
      <div style={{ fontFamily: "var(--mono)", color: "var(--fg-dim)", marginTop: 4 }}>Efficiency vs. flat prompt: {markovian.efficiencyPercent.toFixed(1)}%</div>
    </div>
  );
}

function ActionBlock({ report, analyst, setAnalyst, note, setNote, done, setDone, runId, onApproved }: {
  report: Report | null;
  analyst: string;
  setAnalyst: (s: string) => void;
  note: string;
  setNote: (s: string) => void;
  done: boolean;
  setDone: (b: boolean) => void;
  runId: string | null;
  onApproved: () => void;
}) {
  const [busy, setBusy] = useState(false);
  if (!report) return <p style={{ color: "var(--fg-dim)" }}>Actions appear once a run completes.</p>;
  const approve = async () => {
    if (!runId) return;
    setBusy(true);
    try {
      await approveRun(runId, { analyst, action: `confirm_${report.verdict}`, note });
      setDone(true);
      onApproved();
    } finally {
      setBusy(false);
    }
  };
  return (
    <div>
      <ul style={{ margin: 0, paddingLeft: 16 }}>
        {report.actions.map((a, i) => (
          <li key={i}>{a.action} {a.attack.length ? <span className="model-chip">{a.attack.join(",")}</span> : null}</li>
        ))}
      </ul>
      <div className="actions-row" style={{ marginTop: 8 }}>
        <input value={analyst} onChange={(e) => setAnalyst(e.target.value)} aria-label="Analyst email" style={{ flex: 1, minWidth: 160, background: "var(--panel-2)", border: "1px solid var(--border)", color: "var(--fg)", padding: 4, borderRadius: 4 }} />
      </div>
      <div className="actions-row" style={{ marginTop: 8 }}>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Audit note (optional)" aria-label="Audit note" style={{ flex: 1, background: "var(--panel-2)", border: "1px solid var(--border)", color: "var(--fg)", padding: 4, borderRadius: 4 }} />
      </div>
      <div className="actions-row" style={{ marginTop: 8 }}>
        <button className="approve" onClick={approve} disabled={busy || done} aria-live="polite">{done ? "Audit entry written" : busy ? "Writing…" : `Approve: ${report.verdict}`}</button>
        <span style={{ color: "var(--fg-dim)", fontSize: 12 }}>Writes an audit entry only. No live IdP calls.</span>
      </div>
    </div>
  );
}

function ClaimList({ findings, selected, onSelect, verdicts, queries, feedback, onFeedback }: {
  findings: Report["findings"];
  selected: string | null;
  onSelect: (id: string) => void;
  verdicts: Report["critic_verdicts"];
  queries: QueryRow[];
  feedback: Record<string, "confirmed" | "rejected">;
  onFeedback: (id: string, kind: "confirmed" | "rejected") => void;
}) {
  if (!findings.length) return <p style={{ color: "var(--fg-dim)" }}>No surviving claims.</p>;
  const vmap = new Map(verdicts.map((v) => [v.finding_id, v]));
  return (
    <div className="claim-list">
      {findings.map((f) => {
        const criticRejected = vmap.get(f.id)?.status === "rejected";
        const fb = feedback[f.id];
        return (
          <div key={f.id} className={`claim-card ${criticRejected ? "critic-rejected" : ""} ${fb === "confirmed" ? "fb-confirmed" : fb === "rejected" ? "fb-rejected" : ""}`}>
            <button type="button" aria-pressed={selected === f.id} onClick={() => onSelect(f.id)} style={{ background: "transparent", border: "none", color: "inherit", textAlign: "left", padding: 0, cursor: "pointer", width: "100%" }}>
              <div>
                <strong className={f.status === "CONFIRMED" ? "confirmed" : f.status === "LIKELY" ? "likely" : "suspected"}>[{f.status}]</strong> {f.claim}
              </div>
              <div className="meta">
                {f.id} · sql {f.sql_ids.map((id) => id.slice(0, 8)).join(", ")} · attack {f.attack.join(", ") || "—"} · conf {f.confidence}
                {queries.filter((q) => f.sql_ids.includes(q.sql_id)).map((q) => <span key={q.sql_id} className="model-chip" style={{ marginLeft: 6 }}>{q.rows} rows</span>)}
              </div>
              {vmap.get(f.id) && (
                <div className="meta">critic re-query: <span className={criticRejected ? "rejected" : "confirmed"}>{vmap.get(f.id)!.status}</span> — {vmap.get(f.id)!.reason}</div>
              )}
            </button>
            <div className="feedback-row" style={{ marginTop: 6, display: "flex", gap: 6 }}>
              <button type="button" className="secondary" aria-pressed={fb === "confirmed"} onClick={() => onFeedback(f.id, "confirmed")} title="Confirm this finding is correct">
                ✓ Confirm
              </button>
              <button type="button" className="secondary" aria-pressed={fb === "rejected"} onClick={() => onFeedback(f.id, "rejected")} title="Reject this finding — stored as an analyst correction">
                ✗ Reject
              </button>
              {fb && <span style={{ fontSize: 11, color: fb === "confirmed" ? "var(--benign)" : "var(--contain)" }}>analyst-confirmed lesson written</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function FeedbackPanel({ report, verdictFeedback, onConfirm, onReject, lessons }: {
  report: Report | null;
  verdictFeedback: "confirmed" | "rejected" | null;
  onConfirm: () => void;
  onReject: (v: "contain" | "monitor" | "benign" | "escalate") => void;
  lessons: string[];
}) {
  if (!report) return null;
  const choices: Array<"contain" | "monitor" | "benign" | "escalate"> = ["contain", "monitor", "benign", "escalate"];
  return (
    <div className="feedback-panel" style={{ marginTop: 10, padding: 8, background: "var(--panel-2)", border: "1px solid var(--border)", borderRadius: 6 }}>
      <strong style={{ fontSize: 12 }}>Analyst feedback on this verdict</strong>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
        <button type="button" className="secondary" aria-pressed={verdictFeedback === "confirmed"} onClick={onConfirm} title="Agree with the agent's verdict — stored as a high-confidence lesson">
          ✓ Confirm
        </button>
        {choices.filter((v) => v !== report.verdict).map((v) => (
          <button key={v} type="button" className="secondary" onClick={() => onReject(v)} title={`Mark the correct verdict as ${v}`}>
            → {v}
          </button>
        ))}
      </div>
      {lessons.length > 0 && <p style={{ fontSize: 11, color: "var(--benign)", marginTop: 6 }}>{lessons.length} analyst-confirmed lesson(s) stored in H-MEM.</p>}
      <p style={{ fontSize: 11, color: "var(--fg-dim)", marginTop: 4 }}>Lessons are stored with origin <code>user_correction</code>, higher confidence (≥0.9) and cited in future runs under <code>[MEMORY CONTEXT]</code>.</p>
    </div>
  );
}

function EvidenceDetail({ finding, queries, verdicts }: { finding: Report["findings"][number] | null; queries: QueryRow[]; verdicts: Report["critic_verdicts"] }) {
  if (!finding) return <p style={{ color: "var(--fg-dim)" }}>Pick a claim to see the SQL and the cited rows.</p>;
  const v = verdicts.find((x) => x.finding_id === finding.id);
  const citedIndexes = new Set(finding.row_refs.map((r) => Number(r.split("#")[1])));
  return (
    <div>
      <h3 style={{ margin: "0 0 6px", fontFamily: "var(--mono)" }}>{finding.id}</h3>
      {queries.length === 0 ? (
        <p style={{ color: "var(--fg-dim)" }}>No queries loaded for this claim.</p>
      ) : queries.map((q) => (
        <div key={q.sql_id} style={{ marginBottom: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span className="badge">{q.sql_id}</span>
            <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--fg-dim)" }}>{q.rows} rows · {q.ms} ms · {q.status}</span>
          </div>
          <pre className="sql">{q.sql}</pre>
        </div>
      ))}
      {v?.check_sql_id && (
        <p style={{ fontSize: 12, color: "var(--fg-dim)" }}>
          Critic re-query sql_id: <span className="badge">{v.check_sql_id}</span> · verdict {v.status}
        </p>
      )}
      <div style={{ marginTop: 8 }}>
        <strong>Entities</strong>
        <ul style={{ margin: 0, paddingLeft: 16, fontFamily: "var(--mono)", fontSize: 11 }}>
          {finding.entity_ids.map((id, i) => <li key={i}>{id}</li>)}
        </ul>
      </div>
      <div style={{ marginTop: 8 }}>
        <strong>Facts</strong>
        <table className="row-table">
          <thead><tr><th>key</th><th>value</th></tr></thead>
          <tbody>
            {Object.entries(finding.facts).map(([k, v]) => <tr key={k}><td>{k}</td><td>{String(v)}</td></tr>)}
          </tbody>
        </table>
      </div>
      <p style={{ marginTop: 6, color: "var(--fg-dim)", fontSize: 12 }}>Cited row offsets: {[...citedIndexes].join(", ") || "—"}</p>
    </div>
  );
}

function RejectedList({ items }: { items: Array<{ claim: string; reason: string }> }) {
  if (!items.length) return <p style={{ color: "var(--fg-dim)" }}>No rejected claims.</p>;
  return (
    <ul className="rejected-list">
      {items.map((r, i) => (
        <li key={i}>
          <div>{r.claim}</div>
          <div className="reason">↳ {r.reason}</div>
        </li>
      ))}
    </ul>
  );
}

function DqStrip({ dq }: { dq: Report["dq"] }) {
  if (!dq.length) return <p style={{ color: "var(--fg-dim)" }}>No DQ checks ran for this run.</p>;
  return (
    <div className="dq-strip">
      {dq.map((d, i) => (
        <span key={i} className={`dq-chip ${d.invalid > 0 ? "bad" : ""}`} aria-label={`${d.rule} invalid ${d.invalid}`}>
          {d.table}·{d.rule}{d.scope ? `@${d.scope}` : ""} · valid {d.valid} · invalid {d.invalid}
        </span>
      ))}
    </div>
  );
}
