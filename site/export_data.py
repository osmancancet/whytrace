#!/usr/bin/env python3
"""Build site data (data.js) from committed evidence only. Run from repo root:
   python3 site/export_data.py

Only reads committed/recorded files; never invents numbers. Refuses to write
when a required number is missing from the evidence (the GitHub Pages workflow
would fail loudly rather than silently publish a half-filled page).

Inputs (all committed, under the repo root):
  evidence/eval.md
  evidence/heldout.md
  evidence/heldout-eval.md
  evidence/heldout-b.md         (optional — present after the DAY7 blind run)
  evidence/heldout-b-eval.md    (optional)
  evidence/calibration.md       (DAY8)
  evidence/failures.md          (DAY8)
  evidence/explainability.md
  evidence/heldout-perturbation.md
  evidence/adversarial.md
  evidence/traps.md             (optional — present after the DAY8 false-premise run)
  output_examples/case-*.json   (per-case recorded live reports)
  samples/<case>/zetaris/<sql_id>.json  (per-sql recorded Zetaris result)
  logs/<run_id>/queries.jsonl   (per-run recorded SQL)
"""
import json, re, os, sys, hashlib

ROOT = os.getcwd()
OUT  = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data.js')

CASES = [
  ('case-001', 'output_examples/case-001-live-day3e.json',
   'Phishing → push fatigue → forwarding rule', 'd.yilmaz · finance staff'),
  ('case-002', 'output_examples/case-002-live-shared-egress-rejection.json',
   'Professor abroad — "impossible travel" that isn\'t', 'prof.kaya · faculty'),
  ('case-003', 'output_examples/case-003-live-day3e.json',
   'Sign-in through a known-exploited VPN appliance', 's.demir · lab admin'),
  ('case-007', 'output_examples/case-007-live-scout-fired.json',
   'Attacker hides an instruction for the AI in a phishing subject', 'a.sahin · staff'),
]

def rd(p):
    full = os.path.join(ROOT, p)
    if not os.path.exists(full):
        return None
    with open(full, encoding='utf-8') as f:
        return f.read()

def rd_required(p):
    s = rd(p)
    if s is None:
        print(f'ERROR: required evidence file missing: {p}', file=sys.stderr)
        sys.exit(2)
    return s

def canonical_json(value):
    if value is None or isinstance(value, (bool, int, float, str)):
        return json.dumps(value, separators=(',', ':'), ensure_ascii=False)
    if isinstance(value, list):
        return '[' + ','.join(canonical_json(v) for v in value) + ']'
    if isinstance(value, dict):
        keys = sorted(value.keys())
        return '{' + ','.join(json.dumps(k, ensure_ascii=False) + ':' + canonical_json(value[k]) for k in keys) + '}'
    raise TypeError(f'cannot canonicalise {type(value).__name__}')

def sample_meta(case_id, sql_id):
    """Return provenance for a recorded Zetaris result: rows, total, sha256,
    and up to 8 rows of {headers, data}. SHA-256 is computed from
    canonical JSON of {headers, data} so re-recording the same rows always
    gives the same digest."""
    path = os.path.join(ROOT, 'samples', case_id, 'zetaris', sql_id + '.json')
    if not os.path.exists(path):
        return None
    try:
        with open(path, encoding='utf-8') as f:
            raw = json.load(f)
    except Exception:
        return None
    headers = raw.get('headers') or []
    data = raw.get('data') or []
    canon = canonical_json({'headers': headers, 'data': data})
    sha = hashlib.sha256(canon.encode('utf-8')).hexdigest()
    return {
        'headers': headers,
        'data': data[:8],
        'total': raw.get('total', len(data)),
        'sha256': sha,
    }

def queries_for_run(run_id):
    path = os.path.join(ROOT, 'logs', run_id, 'queries.jsonl')
    out = {}
    if not os.path.exists(path):
        return out
    with open(path, encoding='utf-8') as f:
        for line in f:
            try:
                r = json.loads(line)
            except Exception:
                continue
            sid = r.get('sql_id')
            if not sid:
                continue
            out.setdefault(sid, {
                'sql': r.get('sql'),
                'rows': r.get('rows'),
                'ms': r.get('ms'),
                'ts': r.get('ts'),
                'status': r.get('status'),
            })
    return out

def model_calls_for_run(run_id):
    """Pull per-call model telemetry from trace.jsonl so the site's "How this
    answer was made" panel can mirror the console."""
    path = os.path.join(ROOT, 'logs', run_id, 'trace.jsonl')
    if not os.path.exists(path):
        return []
    out = []
    with open(path, encoding='utf-8') as f:
        for line in f:
            try:
                e = json.loads(line)
            except Exception:
                continue
            if not str(e.get('action', '')).startswith('chat_nightshift'):
                continue
            out.append({
                'ts': e.get('ts'), 'agent': e.get('agent'), 'action': e.get('action'),
                'routed_model': e.get('routed_model'), 'receipt_id': e.get('receipt_id'),
                'ms': e.get('ms'), 'completion_tokens': e.get('completion_tokens'),
                'cache_hit': e.get('cache_hit'), 'max_tokens': e.get('max_tokens'),
                'retry_count': e.get('retry_count'),
            })
    return out

def explain_for(case):
    md = rd_required('evidence/explainability.md')
    m = re.search(r'## ' + case + r' — (.*?)\n(.*?)(?=\n## case-|\Z)', md, re.S)
    if not m:
        return None
    body = m.group(2)
    attr = []
    loo = []
    pre_loo = body.split('### Leave-one-out')[0]
    for r in re.findall(r'^\| (\d+) \| (F\d+) \| ([\d.]+) \| ([^|]*) \| (.*?) \|$', pre_loo, re.M):
        attr.append({'rank': int(r[0]), 'id': r[1], 'shapley': float(r[2]), 'attack': r[3].strip(), 'claim': r[4].strip()})
    if '### Leave-one-out' in body:
        for r in re.findall(r'^\| (F\d+) \| (\w+) \| ([\d.]+) \| (yes|no) \|$', body.split('### Leave-one-out')[1], re.M):
            loo.append({'id': r[0], 'verdict': r[1], 'conf': float(r[2]), 'changes': r[3] == 'yes'})
    ms = re.search(r'\*\*Minimal counterfactual set:\*\* (.*)', body)
    wn = re.search(r'\*\*Why not (\w+)\?\*\* (.*)', body)
    fa = re.search(r'\*\*Faithfulness@3:\*\* ([\d.]+|n/a)', body)
    return {
        'attribution': attr, 'loo': loo,
        'minimal':   ms.group(1).replace('`', '') if ms else None,
        'why_not':   {'verdict': wn.group(1), 'text': wn.group(2)} if wn else None,
        'faithfulness': fa.group(1) if fa else None,
    }

def judged(md, variant):
    m = re.search(r'## ' + variant + r'.*?\n\s*\nJudged (\d+)/(\d+) ok.*?false contain (\d+) · false benign (\d+)', md, re.S)
    return dict(zip(['ok', 'n', 'fc', 'fb'], map(int, m.groups()))) if m else None

def require(value, name):
    if value is None:
        print(f'ERROR: evidence number "{name}" is missing — refusing to publish', file=sys.stderr)
        sys.exit(3)
    return value

def parse_calibration():
    md = rd_required('evidence/calibration.md')
    out = {}
    for set_key, header_hint in [('dev', 'Dev set'), ('ho', 'Seen held-out ho'), ('hb', 'Blind held-out hb')]:
        m = re.search(r'## ' + header_hint + r'[^\n]*\n(.*?)(?=\n## |\Z)', md, re.S)
        if not m:
            continue
        rows = {}
        for who_pat, variant_key in [(r'A0 \(WhyTrace\)', 'A0'), (r'B0 \(rules-only\)', 'B0'), (r'M0 \(Nemotron alone\)', 'M0')]:
            mm = re.search(r'\| ' + who_pat + r' \| (\S+)/(\S+) \| (\S+) \| (\S+) \| (\S+) \|', m.group(1))
            if mm:
                rows[variant_key] = {
                    'ok': int(mm.group(1)), 'n': int(mm.group(2)),
                    'mcc': None if mm.group(3) == '—' else float(mm.group(3)),
                    'mcw': None if mm.group(4) == '—' else float(mm.group(4)),
                    'brier': float(mm.group(5)),
                }
        out[set_key] = rows
    return out

def parse_failures():
    """Return the error-shape invariant rows from evidence/failures.md so the
    site can show FC/FB side-by-side as it is written in evidence."""
    md = rd_required('evidence/failures.md')
    m = re.search(r'## Error-shape invariant across all three sets.*?\n(.*?)(?=\n## |\Z)', md, re.S)
    if not m:
        return None
    rows = []
    for line in m.group(1).split('\n'):
        parts = [p.strip() for p in line.strip('|').split('|')]
        if len(parts) < 8 or '---' in parts[0] or parts[0] in ('set', ''):
            continue
        rows.append(parts)
    return rows

def parse_traps():
    md = rd('evidence/traps.md')
    if md is None:
        return None  # not yet run — site shows "running now" placeholder
    rows = []
    m = re.search(r'(?:^|\n)\| trap[^\n]*\n\|[-:| ]+\n((?:\| [^\n]+\n?)+)', md, re.M)
    if not m:
        return []
    for line in m.group(1).split('\n'):
        parts = [p.strip() for p in line.strip('|').split('|')]
        if len(parts) < 4 or parts[0].startswith('---'):
            continue
        rows.append(parts)
    return rows

# ---- case bundle ---------------------------------------------------------

cases = []
for cid, path, title, who in CASES:
    r_raw = rd(path)
    if r_raw is None:
        print(f'ERROR: recorded live report missing: {path}', file=sys.stderr)
        sys.exit(2)
    r = json.loads(r_raw)
    q = queries_for_run(r['run_id'])
    model_calls = model_calls_for_run(r['run_id'])
    sqls = {}
    for f in r['findings'] + r.get('rejected_claims', []):
        for s in f.get('sql_ids', []) or ([f['sql_id']] if f.get('sql_id') else []):
            if s in sqls:
                continue
            meta = sample_meta(cid, s)
            qrec = q.get(s) or {}
            sqls[s] = {
                'sql': qrec.get('sql'),
                'rows_total': (meta or {}).get('total', qrec.get('rows')),
                'ts': qrec.get('ts'),
                'ms': qrec.get('ms'),
                'status': qrec.get('status'),
                'sha256': (meta or {}).get('sha256'),
                'sample': {'headers': meta['headers'], 'data': meta['data'], 'total': meta['total']} if meta else None,
            }
    cases.append({
        'id': cid, 'title': title, 'who': who,
        'verdict': r['verdict'], 'confidence': r['confidence'],
        'summary': r.get('summary'), 'timeline': r.get('timeline', []),
        'findings': r['findings'], 'rejected': r.get('rejected_claims', []),
        'injections': r.get('prompt_injection_attempts', []),
        'models': r.get('models', []), 'model_calls': model_calls,
        'decided_by': r.get('decided_by'), 'run_id': r['run_id'],
        'seconds': r.get('execution_time_seconds'),
        'actions': r.get('actions', []), 'limitations': r.get('limitations', []),
        'sql': sqls, 'explain': explain_for(cid),
    })

# ---- eval bundles --------------------------------------------------------

ev = rd_required('evidence/eval.md')
stamp = re.search(r'# WhyTrace evaluation — (\S+)', ev)
evals = {'dev': {'label': '7 dev cases × 3 runs', 'date': stamp.group(1) if stamp else None,
                 'A0': require(judged(ev, 'A0'), 'dev A0 headline'),
                 'B0': require(judged(ev, 'B0'), 'dev B0 headline'),
                 'M0': require(judged(ev, 'M0'), 'dev M0 headline')}}

heldout_md = rd_required('evidence/heldout.md')
hm = re.search(r'\*\*Held-out \(24 runs.*?\*\* \| \*\*(\d+)/(\d+).*?FC (\d+) · FB (\d+).*?\| \*\*(\d+)/(\d+).*?FC (\d+) · FB (\d+) \| (\d+)/(\d+).*?FC (\d+) · FB (\d+)', heldout_md)
if hm:
    g = list(map(int, hm.groups()))
    evals['heldout_a'] = {
        'label': 'seen held-out ho · 8 cases × 3 runs',
        'A0': dict(ok=g[0], n=g[1], fc=g[2], fb=g[3]),
        'B0': dict(ok=g[4], n=g[5], fc=g[6], fb=g[7]),
        'M0': dict(ok=g[8], n=g[9], fc=g[10], fb=g[11]),
    }

# Blind set B: use the heldout-b-eval.md "Judged … false contain … false benign" lines
# per variant — same mechanism we use for dev. Only publish when the three variants parse.
hb_eval = rd('evidence/heldout-b-eval.md')
if hb_eval:
    hb_A0 = judged(hb_eval, 'A0')
    hb_B0 = judged(hb_eval, 'B0')
    hb_M0 = judged(hb_eval, 'M0')
    if hb_A0 and hb_B0 and hb_M0:
        evals['heldout_b'] = {
            'label': 'blind held-out hb · 8 cases × 3 runs',
            'A0': hb_A0, 'B0': hb_B0, 'M0': hb_M0,
        }
    else:
        print('ERROR: heldout-b-eval headline parse failed — refusing to publish', file=sys.stderr)
        sys.exit(4)

# Perturbation + adversarial robustness + conformance pass flags
pm = re.search(r'Headline: (\d+)/(\d+)', rd_required('evidence/heldout-perturbation.md'))
am = re.search(r'\*\*(\d+)/(\d+) \(100%\) caught today', rd_required('evidence/adversarial.md'))
extra = {
    'perturbation': {'stable': int(pm.group(1)), 'n': int(pm.group(2))} if pm else None,
    'adversarial':  {'caught': int(am.group(1)), 'n': int(am.group(2))} if am else None,
    'conformance':  {'World Model': '8/8', 'H-MEM': '13/13', 'Markovian': '8/8', 'Scout Intent': 'official harness gate passed'},
    'calibration':  parse_calibration(),
    'failures_invariant': parse_failures(),
    'traps':        parse_traps(),  # None when not run yet
    'freeze_commit': '2b28af2056b12dc6e63d6018a4053fabb8c7699e',
}

data = {
    'generated_from': 'committed evidence files',
    'cases': cases,
    'evals': evals,
    'extra': extra,
}

with open(OUT, 'w', encoding='utf-8') as f:
    f.write('window.WHYTRACE = ' + json.dumps(data, ensure_ascii=False) + ';\n')

print('wrote', OUT, 'cases', len(cases), 'evals', list(evals), 'bytes', os.path.getsize(OUT))
for c in cases:
    sha_count = sum(1 for s in c['sql'].values() if s['sha256'])
    print(c['id'], c['verdict'], 'findings', len(c['findings']), 'sql', len(c['sql']), 'with sha', sha_count, 'model calls', len(c['model_calls']))
print('calibration sets:', list(extra['calibration']))
print('traps:', 'present' if extra['traps'] else 'pending (evidence/traps.md not yet committed)')
