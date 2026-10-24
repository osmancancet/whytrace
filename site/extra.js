(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* scroll progress */
  const bar = $('.progress i');
  const onScroll = () => {
    const h = document.documentElement;
    const p = h.scrollTop / Math.max(1, h.scrollHeight - h.clientHeight);
    if (bar) bar.style.transform = `scaleX(${Math.min(1, Math.max(0, p))})`;
    $('.top')?.classList.toggle('scrolled', h.scrollTop > 8);
  };
  addEventListener('scroll', onScroll, { passive: true }); onScroll();

  /* active nav link */
  const links = $$('.top nav a');
  const targets = links.map(a => $(a.getAttribute('href'))).filter(Boolean);
  const navObs = new IntersectionObserver(ents => {
    ents.forEach(e => {
      if (!e.isIntersecting) return;
      links.forEach(a => a.classList.toggle('active', a.getAttribute('href') === '#' + e.target.id));
    });
  }, { rootMargin: '-45% 0px -50% 0px' });
  targets.forEach(t => navObs.observe(t));

  /* reveal on scroll, staggered within a parent */
  const revObs = new IntersectionObserver((ents, ob) => {
    ents.forEach(e => {
      if (!e.isIntersecting) return;
      const sibs = $$(':scope > .reveal', e.target.parentElement);
      const i = Math.max(0, sibs.indexOf(e.target));
      e.target.style.transitionDelay = reduce ? '0ms' : (i * 70) + 'ms';
      e.target.classList.add('shown');
      ob.unobserve(e.target);
    });
  }, { threshold: .15 });
  $$('.reveal').forEach(el => revObs.observe(el));

  /* headline: words rise in */
  const h1 = $('.hero h1');
  if (h1 && !reduce) {
    h1.innerHTML = h1.textContent.split(' ').map((w, i) =>
      `<span class="w"><span style="animation-delay:${80 + i * 55}ms">${w}</span></span>`).join(' ');
    h1.classList.add('split');
  }

  /* KPI count-up */
  const kpiObs = new IntersectionObserver((ents, ob) => {
    ents.forEach(e => {
      if (!e.isIntersecting) return; ob.unobserve(e.target);
      const b = e.target; const to = +b.dataset.count; const suf = b.dataset.suffix || '';
      if (reduce || to === 0) { b.textContent = to + suf; b.classList.add('done'); return; }
      const t0 = performance.now(), dur = 1100 + Math.min(900, to * 2);
      const step = t => {
        const k = Math.min(1, (t - t0) / dur); const v = Math.round(to * (1 - Math.pow(1 - k, 3)));
        b.textContent = v + suf;
        if (k < 1) requestAnimationFrame(step); else b.classList.add('done');
      };
      requestAnimationFrame(step);
    });
  }, { threshold: .6 });
  $$('.kpi b[data-count]').forEach(b => kpiObs.observe(b));

  /* calibration chart — values from evidence/calibration.md */
  const CAL = [
    ['Dev set', '7 cases × 3 runs', [0.0905, 0.2950, 0.2572]],
    ['Blind set A', '8 cases × 3 runs', [0.2556, 0.2662, 0.3544]],
    ['Blind set B (v2)', '8 cases × 3 runs', [0.2104, 0.2256, 0.2365]]
  ];
  const WHO = ['WhyTrace', 'Rules only', 'Nemotron alone'];
  const box = $('.calib-chart');
  if (box) {
    const max = 0.4;
    box.innerHTML = `<p class="calib-legend">${WHO.map((w, i) => `<span class="lg lg${i}">${w}</span>`).join('')}<span class="lg-note">Brier score · lower is better</span></p>` +
      CAL.map(([set, sub, v]) => `<div class="cgroup"><div class="cg-head"><b>${set}</b><span>${sub}</span></div>${
        v.map((x, i) => `<div class="cbar c${i}"><span class="cw">${WHO[i]}</span><span class="ct"><i data-w="${(x / max * 100).toFixed(1)}"></i></span><span class="cv">${x.toFixed(3)}</span></div>`).join('')
      }</div>`).join('') +
      `<p class="calib-src">Source: <a href="https://github.com/osmancancet/whytrace/blob/main/evidence/calibration.md">evidence/calibration.md</a>, computed from the committed per-row tables.</p>`;
    new IntersectionObserver((e, ob) => {
      if (!e[0].isIntersecting) return; ob.disconnect();
      $$('.ct i', box).forEach((i, n) => setTimeout(() => { i.style.width = i.dataset.w + '%'; }, reduce ? 0 : n * 90));
    }, { threshold: .3 }).observe(box);
  }

  /* subtle tilt on sponsor + trust cards */
  if (!reduce && matchMedia('(hover:hover)').matches) {
    $$('.sponsor, .tcard').forEach(c => {
      c.addEventListener('pointermove', ev => {
        const r = c.getBoundingClientRect();
        const x = (ev.clientX - r.left) / r.width - .5, y = (ev.clientY - r.top) / r.height - .5;
        c.style.setProperty('--rx', (-y * 4).toFixed(2) + 'deg');
        c.style.setProperty('--ry', (x * 5).toFixed(2) + 'deg');
        c.style.setProperty('--mx', ((x + .5) * 100).toFixed(1) + '%');
      });
      c.addEventListener('pointerleave', () => { c.style.setProperty('--rx', '0deg'); c.style.setProperty('--ry', '0deg'); });
    });
  }
})();
