(() => {
  const D = window.WHYTRACE;
  if (!D) return;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const wait = ms => new Promise(r => setTimeout(r, reduce ? 0 : ms));
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const VERB = { contain: 'Contain', benign: 'Benign', escalate: 'Escalate', monitor: 'Monitor' };
  const SUB = {
    contain: 'Act now: the chain of evidence holds.',
    benign: 'Explained and legitimate. No action.',
    escalate: 'Material risk, not enough to act alone. A human decides.',
    monitor: 'Real but weak. Keep watching.'
  };

  /* ---------------- replay board ---------------- */
  let current = D.cases[0];
  let runToken = 0;
  const tabs = $('.case-tabs');
  D.cases.forEach((c, i) => {
    const b = document.createElement('button');
    b.className = 'case-tab'; b.type = 'button'; b.role = 'tab';
    b.textContent = `${c.id.replace('case-', 'Case ')} · ${VERB[c.verdict]}`;
    b.setAttribute('aria-selected', i === 0);
    b.addEventListener('click', () => { select(c); });
    tabs.appendChild(b);
  });

  function select(c) {
    current = c;
    $$('.case-tab').forEach((b, i) => b.setAttribute('aria-selected', D.cases[i] === c));
    play();
    renderWhy();
    renderMade();
  }

  function orderedFindings(c) {
    const order = [];
    (c.timeline || []).forEach(t => { const m = /^(F\d+)/.exec(t.event || ''); if (m && !order.includes(m[1])) order.push(m[1]); });
    const byId = Object.fromEntries(c.findings.map(f => [f.id, f]));
    const out = order.filter(id => byId[id]).map(id => byId[id]);
    c.findings.forEach(f => { if (!out.includes(f)) out.push(f); });
    return out;
  }

  function card(f, kind, injected) {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'ecard' + (kind === 'rejected' ? ' rejected' : '') + (injected ? ' injection' : '');
    el.style.setProperty('--tilt', ((Math.random() * 1.4) - .7).toFixed(2) + 'deg');
    const sql = (f.sql_ids && f.sql_ids[0]) || f.sql_id || '';
    const attack = (f.attack || []).join(', ');
    const sub = kind === 'rejected' ? (f.reason || '').replace(/^critic:\s*/, 'Critic: ') :
      [f.facts && f.facts.ts ? String(f.facts.ts).slice(0, 16) : '', attack].filter(Boolean).join(' · ');
    el.innerHTML = `<span class="fid">${esc(f.id || '×')}</span><span class="claim">${esc(f.claim)}</span>` +
      (sql ? `<span class="tag">sql ${esc(sql)}</span>` : '<span></span>') +
      (sub ? `<span class="sub">${esc(sub)}</span>` : '');
    el.addEventListener('click', () => openDrawer(f, kind));
    return el;
  }

  async function play(instant = false) {
    const me = ++runToken;
    const c = current;
    $('.ticket-title').textContent = c.title;
    $('.ticket-who').textContent = c.who;
    const models = [...new Set((c.models || []).map(m => (m.routed_model || '').replace('nvidia/', '')))].filter(Boolean);
    $('.ticket-meta').innerHTML = [
      ['run', c.run_id], ['queries', Object.keys(c.sql).length + ' cited'], ['model', models.join(', ') || '—'],
      ['decided by', c.decided_by || '—'], ['time', c.seconds ? Math.round(c.seconds) + ' s' : '—']
    ].map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join('');
    const cards = $('.cards'); cards.innerHTML = '';
    const stamp = $('.stamp'); stamp.className = 'stamp'; stamp.textContent = '';
    const sub = $('.verdict-sub'); sub.className = 'verdict-sub'; sub.textContent = '';
    clearThreads();
    const injIds = new Set((c.injections || []).map(i => i.finding_id));
    const seq = orderedFindings(c).map(f => ({ f, kind: 'finding', inj: injIds.has(f.id) }));
    (c.rejected || []).forEach(r => seq.push({ f: { ...r, id: '' }, kind: 'rejected' }));
    for (const s of seq) {
      if (me !== runToken) return;
      const el = card(s.f, s.kind, s.inj);
      cards.appendChild(el);
      requestAnimationFrame(() => { el.classList.add('in'); drawThread(el); });
      if (!instant) await wait(s.kind === 'rejected' ? 900 : 520);
    }
    if (me !== runToken) return;
    if (!instant) await wait(500);
    stamp.textContent = `${VERB[c.verdict]} ${Math.round(c.confidence * 100)}%`;
    stamp.classList.add(c.verdict, 'in');
    sub.textContent = SUB[c.verdict]; sub.classList.add('in');
  }

  const svg = $('.threads');
  function clearThreads() { svg.innerHTML = ''; }
  function drawThread(el) {
    const board = $('.board').getBoundingClientRect();
    const t = $('.ticket').getBoundingClientRect(); const e = el.getBoundingClientRect();
    if (t.right > e.left) return; // stacked layout on small screens: skip threads
    const x1 = t.right - board.left - 6, y1 = t.top - board.top + 30;
    const x2 = e.left - board.left + 4, y2 = e.top - board.top + e.height / 2;
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    const mx = (x1 + x2) / 2;
    p.setAttribute('d', `M${x1},${y1} C${mx},${y1 + 40} ${mx},${y2 - 20} ${x2},${y2}`);
    svg.appendChild(p);
    if (!reduce) {
      const len = p.getTotalLength(); p.style.strokeDasharray = len; p.style.strokeDashoffset = len;
      p.animate([{ strokeDashoffset: len }, { strokeDashoffset: 0 }], { duration: 500, fill: 'forwards', easing: 'ease-out' });
    }
  }
  addEventListener('resize', () => { clearThreads(); $$('.ecard.in').forEach(drawThread); });
  $('#replay-btn').addEventListener('click', () => play());
  $('#skip-btn').addEventListener('click', () => play(true));

  /* ---------------- evidence drawer ---------------- */
  function openDrawer(f, kind) {
    const ids = f.sql_ids || (f.sql_id ? [f.sql_id] : []);
    const id = ids.find(i => current.sql[i] && current.sql[i].sample) || ids[0];
    const q = current.sql[id] || {};
    const d = $('#drawer'); d.hidden = false;
    $('.drawer-claim').textContent = (kind === 'rejected' ? 'Rejected claim: ' : (f.id ? f.id + ': ' : '')) + f.claim;
    $('.sql').textContent = q.sql ? q.sql : `sql ${id || '—'} (text not in the recorded log)`;
    const s = q.sample;
    $('.rows').innerHTML = s ? `<table><thead><tr>${s.headers.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${
      s.data.map(r => `<tr>${r.map(v => `<td>${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table>` : '<p>Rows for this query are not in the recorded sample.</p>';
    // DAY8 provenance line: Zetaris row count, run timestamp, SHA-256 of
    // canonical JSON of returned rows. All three come from committed samples.
    const total = (q.rows_total != null ? q.rows_total : (s ? s.total : null));
    const ts = q.ts ? q.ts.slice(0, 19) + 'Z' : null;
    const sha = q.sha256;
    const provBits = [];
    if (total != null) provBits.push(`${total} rows`);
    if (ts) provBits.push(ts);
    if (sha) provBits.push(`sha256 ${sha.slice(0, 16)}…${sha.slice(-8)}`);
    const provLine = provBits.length ? `sql_id ${id} · ${provBits.join(' · ')}` : (s ? `Showing ${s.data.length} of ${s.total} rows returned by Zetaris for sql_id ${id}.` : '');
    const noteLine = s ? ' Recorded from a live run; synthetic data.' : '';
    $('.drawer-foot').innerHTML = (provLine ? esc(provLine) : '') + esc(noteLine);
    d.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'nearest' });
  }
  $('#drawer-close').addEventListener('click', () => { $('#drawer').hidden = true; });

  /* ---------------- sources diagram ---------------- */
  const SRC = [['identity', 'Postgres'], ['signin_event', 'Postgres'], ['vpn_session', 'Postgres'], ['mail_event', 'mail gateway REST'], ['device', 'asset CSV'], ['vulnerability', 'CISA KEV (real)']];
  const g = $('.src-nodes');
  SRC.forEach(([n, s], i) => {
    const y = 18 + i * 46;
    g.insertAdjacentHTML('beforeend',
      `<path class="flow" d="M292,${y + 17} C440,${y + 17} 450,150 560,150"></path>
       <g class="src-node"><rect x="20" y="${y}" width="270" height="34" rx="3"></rect>
       <text x="32" y="${y + 21}">${n}</text><text class="s2" x="282" y="${y + 21}" text-anchor="end">${s}</text></g>`);
  });
  new IntersectionObserver((ents, ob) => {
    ents.forEach(async e => {
      if (!e.isIntersecting) return; ob.disconnect();
      for (const p of $$('.flow')) { p.classList.add('live'); await wait(180); }
    });
  }, { threshold: .4 }).observe($('.usl'));

  /* ---------------- pipeline ---------------- */
  const STEPS = [
    ['Planner', 'Opens competing hypotheses — phishing, travel, infrastructure — and picks the first queries. Runs on Nemotron.'],
    ['Investigator', 'Runs SQL through Zetaris and turns rows into findings. Every finding keeps its sql_id and row references.'],
    ['Critic', 'Writes its own, different query to re-check each claim and scores the draft for accuracy, appropriateness and actionability. Unsupported claims are struck out.'],
    ['Scout', 'Scans attacker-controlled text (mail subjects, rule names, user agents) for instructions aimed at the model and quarantines them as data.'],
    ['Risk Gate', 'A deterministic policy over confirmed findings, checked against the model\'s opinion. Weak or conflicting evidence goes to a human.'],
    ['Reporter', 'Writes the report. Every sentence must cite a finding; the validator rejects one that does not.']
  ];
  const ol = $('.steps'); const det = $('.step-detail');
  STEPS.forEach(([n, t], i) => {
    const li = document.createElement('li');
    li.innerHTML = `<button type="button" aria-pressed="${i === 0}"><span>${n}</span></button>`;
    li.firstChild.addEventListener('click', () => showStep(i));
    ol.appendChild(li);
  });
  function showStep(i) {
    $$('.steps button').forEach((b, j) => b.setAttribute('aria-pressed', i === j));
    det.innerHTML = `<p><b>${STEPS[i][0]}.</b> ${STEPS[i][1]}</p>`;
  }
  showStep(0);
  new IntersectionObserver(async (ents, ob) => {
    if (!ents[0].isIntersecting) return; ob.disconnect();
    for (const b of $$('.steps button')) { b.classList.add('pulse'); await wait(260); b.classList.remove('pulse'); }
  }, { threshold: .6 }).observe(ol);

  /* ---------------- why this verdict ---------------- */
  function renderWhy() {
    const x = current.explain; const box = $('.attr');
    if (!x || !x.attribution.length) { box.innerHTML = '<p>No findings to attribute for this case.</p>'; return; }
    const max = Math.max(...x.attribution.map(a => a.shapley), 0.0001);
    const loo = Object.fromEntries((x.loo || []).map(l => [l.id, l]));
    box.innerHTML = `<p class="hint" style="margin:0 0 8px;font-size:14px;color:var(--ink-2)">${esc(current.id)} · verdict ${esc(current.verdict)} · uncheck a finding to remove it</p>` +
      x.attribution.map(a => `<label class="attr-row" data-id="${a.id}">
        <input type="checkbox" checked aria-label="Keep ${a.id}">
        <span class="fid">${a.id}</span><span class="bar"><i data-w="${(a.shapley / max * 100).toFixed(1)}"></i></span>
        <span class="val">${a.shapley.toFixed(3)}</span>
        <span class="lbl">${esc(a.claim)}${a.attack && a.attack !== '—' ? ' · ' + esc(a.attack) : ''}</span></label>`).join('');
    requestAnimationFrame(() => $$('.attr-row .bar i').forEach(i => { i.style.width = i.dataset.w + '%'; }));
    const update = () => {
      const off = $$('.attr-row').filter(r => !r.querySelector('input').checked).map(r => r.dataset.id);
      $$('.attr-row').forEach(r => r.classList.toggle('off', off.includes(r.dataset.id)));
      $$('.attr-row').forEach(r => r.classList.remove('flip'));
      const now = $('.cf-now');
      const minSet = (x.minimal || '').match(/F\d+/g) || [];
      if (!off.length) {
        now.innerHTML = `With all evidence<span class="big">${VERB[current.verdict]} ${Math.round(current.confidence * 100)}%</span>`;
      } else if (off.length === 1 && loo[off[0]]) {
        const l = loo[off[0]];
        now.innerHTML = `Without ${off[0]}<span class="big">${VERB[l.verdict] || l.verdict} ${Math.round(l.conf * 100)}%</span>${l.changes ? 'The verdict changes.' : 'The verdict holds.'}`;
        if (l.changes) $(`.attr-row[data-id="${off[0]}"]`).classList.add('flip');
      } else if (minSet.length && minSet.every(id => off.includes(id)) && off.length === minSet.length) {
        const m = /→\s*(\w+)\s*@\s*([\d.]+)/.exec(x.minimal || '');
        now.innerHTML = `Without ${off.join(' + ')}<span class="big">${m ? (VERB[m[1]] || m[1]) + ' ' + Math.round(+m[2] * 100) + '%' : 'changes'}</span>This is the smallest set that changes the verdict.`;
        off.forEach(id => $(`.attr-row[data-id="${id}"]`).classList.add('flip'));
      } else {
        now.innerHTML = `Without ${off.join(' + ')}<span class="big">—</span>We precomputed single removals and the smallest flipping set; this combination was not computed.`;
      }
    };
    $$('.attr-row input').forEach(i => i.addEventListener('change', update));
    update();
    $('.cf-min').innerHTML = x.minimal ? `<b>Smallest change that flips it:</b> ${esc(x.minimal)}` : '';
    $('.cf-whynot').innerHTML = x.why_not ? `<b>Why not ${esc(x.why_not.verdict)}?</b> ${esc(x.why_not.text)}` : '';
    $('.cf-faith').textContent = x.faithfulness && x.faithfulness !== 'n/a'
      ? `Faithfulness@3 = ${x.faithfulness}: the report cites the three findings that matter most. The report cites most findings, so this bar is easy to clear; a stricter precision measure is being added.`
      : '';
  }

  /* ---------------- how this answer was made ---------------- */
  function renderMade() {
    const c = current;
    const sqlRows = Object.entries(c.sql || {}).map(([sid, q]) => {
      const sha = q && q.sha256 ? q.sha256 : '';
      const total = q && q.rows_total != null ? q.rows_total : (q && q.sample ? q.sample.total : '—');
      const ts = q && q.ts ? q.ts.slice(0, 19) : '—';
      return `<tr><td class="mono">${esc(sid)}</td><td>${esc(total)}</td><td class="mono">${esc(ts)}</td><td class="mono">${sha ? esc(sha.slice(0, 16) + '…' + sha.slice(-8)) : '<span class="muted">(no recorded sample)</span>'}</td></tr>`;
    }).join('');
    $('.made-sql-body').innerHTML = sqlRows || '<tr><td colspan="4" class="muted">No queries cited.</td></tr>';
    const mc = c.model_calls || [];
    const modelRows = mc.map((m, i) => {
      const rm = (m.routed_model || '').replace('nvidia/', '') || '—';
      const r = m.receipt_id || '—';
      const cache = m.cache_hit === true ? 'hit' : (m.cache_hit === false ? 'miss' : '—');
      return `<tr><td>${i + 1}</td><td>${esc(m.agent || '—')}</td><td class="mono">${esc(m.action || '—')}</td><td class="mono">${esc(rm)}</td><td class="mono">${esc(r)}</td><td>${m.ms != null ? esc(m.ms) : '—'}</td><td>${m.completion_tokens != null ? esc(m.completion_tokens) : '—'}</td><td>${esc(cache)}</td></tr>`;
    }).join('');
    if (mc.length) {
      $('.made-models-body').innerHTML = modelRows;
      $('.made-caption').textContent = `Decided by: ${c.decided_by || '—'} · total run time: ${c.seconds ? Math.round(c.seconds) + ' s' : '—'}. Nothing on this page calls a model — these are the receipts recorded during the original live run.`;
    } else {
      $('.made-models-body').innerHTML = (c.models || []).map((m, i) =>
        `<tr><td>${i + 1}</td><td>${esc(m.agent || '—')}</td><td class="muted">(not recorded)</td><td class="mono">${esc((m.routed_model || '').replace('nvidia/', '') || '—')}</td><td class="mono">${esc(m.receipt_id || '—')}</td><td class="muted">—</td><td class="muted">—</td><td class="muted">—</td></tr>`
      ).join('') || '<tr><td colspan="8" class="muted">No model calls recorded.</td></tr>';
      $('.made-caption').textContent = 'The committed trace for this run has only receipts (no per-call ms/tokens/cache); the console shows the live tail when you re-run.';
    }
  }

  /* ---------------- numbers ---------------- */
  const SETS = [];
  if (D.evals.dev) SETS.push(['dev', 'Our 7 dev cases', D.evals.dev, 'Cases we wrote and tuned against. Three independent runs each, no cached model calls.']);
  if (D.evals.heldout_a) SETS.push(['ha', 'Blind set A', D.evals.heldout_a, 'Eight cases written by an analyst who never saw the code, frozen code, run once (3 runs each). Rules were more accurate here — and locked out three innocent users and missed six attacks. WhyTrace locked out none.']);
  if (D.evals.heldout_b) SETS.push(['hb', 'Blind set B (v2)', D.evals.heldout_b, 'A second blind set for the v2 fixes.']);
  else SETS.push(['hb', 'Blind set B (v2)', null, 'Running now: a second blind set measures the v2 fixes. Frozen code, one run. The result will be published here as it comes out.']);
  const st = $('.set-tabs');
  SETS.forEach(([k, l], i) => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'set-tab'; b.role = 'tab';
    b.textContent = l; b.setAttribute('aria-selected', i === 0); b.addEventListener('click', () => showSet(i)); st.appendChild(b);
  });
  const WHO = [['A0', 'WhyTrace', true], ['B0', 'Rules only'], ['M0', 'Nemotron alone']];
  function metric(title, hint, key, set, bad) {
    const n = WHO.map(([k]) => set[k] ? set[k].n : 1);
    return `<div class="metric${bad ? ' bad' : ''}"><h3>${title}</h3><p class="hint">${hint}</p>${WHO.map(([k, w, us], i) => {
      const v = set[k] ? set[k][key] : null; const pct = v == null ? 0 : v / n[i] * 100;
      return `<div class="brow${us ? ' us' : ''}"><span class="who">${w}</span><span class="track"><i data-w="${pct.toFixed(1)}"></i></span><span class="n">${v == null ? '—' : v + '/' + n[i]}</span></div>`;
    }).join('')}</div>`;
  }
  function showSet(i) {
    $$('.set-tab').forEach((b, j) => b.setAttribute('aria-selected', i === j));
    const [, , set, note] = SETS[i]; const ch = $('.chart');
    if (!set) { ch.innerHTML = `<p style="grid-column:1/-1;margin:0">${esc(note)}</p>`; $('.set-note').textContent = ''; return; }
    ch.innerHTML = metric('Correct verdicts', 'Higher is better.', 'ok', set) +
      metric('Innocent accounts locked out', 'Said contain when it should not. Lower is better.', 'fc', set, true) +
      metric('Attacks cleared as benign', 'Said benign when it was not. Lower is better.', 'fb', set, true);
    requestAnimationFrame(() => requestAnimationFrame(() => $$('.chart .track i').forEach(x => { x.style.width = x.dataset.w + '%'; })));
    $('.set-note').textContent = note + (set.label ? ` (${set.label}${D.evals.dev.date && i === 0 ? ', ' + D.evals.dev.date.slice(0, 10) : ''})` : '');
  }
  new IntersectionObserver((e, ob) => { if (e[0].isIntersecting) { ob.disconnect(); showSet(0); } }, { threshold: .3 }).observe($('.chart'));
  const ex = D.extra || {};
  $('.facts').innerHTML = [
    ex.perturbation && [`${ex.perturbation.stable}/${ex.perturbation.n}`, 'verdicts unchanged when users, dates, attacker IPs and travel countries are swapped in the dev cases'],
    ex.adversarial && [`${ex.adversarial.caught}/${ex.adversarial.n}`, 'planted false claims (near-miss IPs, counts, times, CVEs, users) caught by the Critic and validator'],
    ['4 engines', 'World Model 8/8 · H-MEM 13/13 · Markovian 8/8 conformance, Scout Intent passes the official eval gate']
  ].filter(Boolean).map(([b, s]) => `<div class="fact"><b>${b}</b><span>${s}</span></div>`).join('');

  /* ---------------- start ---------------- */
  renderWhy();
  renderMade();
  const boardObs = new IntersectionObserver((e, ob) => { if (e[0].isIntersecting) { ob.disconnect(); play(); } }, { threshold: .25 });
  boardObs.observe($('.board'));
})();
