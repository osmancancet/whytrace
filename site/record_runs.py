#!/usr/bin/env python3
"""Scrub local run logs into site/recorded/<run_id>/ so the public GitHub
Pages replay has the SQL text and model-call receipts it needs, even though
logs/ itself is git-ignored.

Run locally from repo root (not CI):
    python3 site/record_runs.py

Writes two files per run_id used by the site:
    site/recorded/<run_id>/queries.jsonl        (sql_id, sql, rows, ms, status, ts)
    site/recorded/<run_id>/model_calls.jsonl    (agent, routed_model, receipt_id,
                                                 ms, completion_tokens, cache_hit)

Scrubs absolute user-home paths, Meterless runtime tokens, and the builder's
personal email anywhere they might appear. Synthetic @aegean.edu addresses
in the recorded cases are kept.
"""
import json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LOGS = os.path.join(ROOT, 'logs')
OUT_BASE = os.path.join(ROOT, 'site', 'recorded')

# Keep in sync with site/export_data.py CASES.
RUN_IDS = [
    'mvkpcv7i_5b2ce0bc39',   # case-001
    'mvkop4ww_ef8b857b21',   # case-002
    'mvkpwabw_095790bc2d',   # case-003
    'mvkpsitu_a27519248c',   # case-007
]

QUERY_FIELDS = ('sql_id', 'sql', 'rows', 'ms', 'status', 'ts')
MODEL_FIELDS = ('agent', 'routed_model', 'receipt_id', 'ms',
                'completion_tokens', 'cache_hit')

SCRUBS = [
    (re.compile(r'/Users/[^\s"\']+'), '<path>'),
    (re.compile(r'/home/[^\s"\']+'), '<path>'),
    (re.compile(r'\brt-[A-Za-z0-9_-]{10,}\b'), '<token>'),
    (re.compile(r'Bearer\s+[A-Za-z0-9._-]{10,}'), 'Bearer <token>'),
    (re.compile(r'osmancan[a-z.]*@[A-Za-z0-9.-]+\.[A-Za-z]{2,}', re.I), '<email>'),
]

def scrub(value):
    if isinstance(value, str):
        out = value
        for pat, rep in SCRUBS:
            out = pat.sub(rep, out)
        return out
    if isinstance(value, dict):
        return {k: scrub(v) for k, v in value.items()}
    if isinstance(value, list):
        return [scrub(v) for v in value]
    return value

def pick(record, fields):
    return {k: record.get(k) for k in fields}

def convert_queries(run_id):
    src = os.path.join(LOGS, run_id, 'queries.jsonl')
    if not os.path.exists(src):
        print(f'ERROR: missing {src}', file=sys.stderr)
        sys.exit(2)
    rows = []
    with open(src, encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                r = json.loads(line)
            except Exception:
                continue
            if not r.get('sql_id'):
                continue
            rows.append(scrub(pick(r, QUERY_FIELDS)))
    return rows

def convert_model_calls(run_id):
    src = os.path.join(LOGS, run_id, 'trace.jsonl')
    if not os.path.exists(src):
        print(f'ERROR: missing {src}', file=sys.stderr)
        sys.exit(2)
    rows = []
    with open(src, encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                e = json.loads(line)
            except Exception:
                continue
            if not str(e.get('action', '')).startswith('chat_nightshift'):
                continue
            rows.append(scrub(pick(e, MODEL_FIELDS)))
    return rows

def write_jsonl(path, rows):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8') as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False) + '\n')

def main():
    for run_id in RUN_IDS:
        qrows = convert_queries(run_id)
        mrows = convert_model_calls(run_id)
        qpath = os.path.join(OUT_BASE, run_id, 'queries.jsonl')
        mpath = os.path.join(OUT_BASE, run_id, 'model_calls.jsonl')
        write_jsonl(qpath, qrows)
        write_jsonl(mpath, mrows)
        print(run_id, 'queries', len(qrows), 'model_calls', len(mrows))

if __name__ == '__main__':
    main()
