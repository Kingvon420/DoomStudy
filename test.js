// Test mode: a timed exam built from the deck. No hints, and no answers until the end.
// Shared by the app and the phone page, so it carries its own styles.
const Test = (() => {
  const CSS = `
.tm { position: absolute; inset: 0; z-index: 30; display: flex; flex-direction: column; color: var(--pen); background-color: var(--paper); background-image: repeating-linear-gradient(transparent 0 33px, var(--rule) 33px 34px); }
.tm-top { display: flex; align-items: center; gap: 8px; padding: 12px 14px 4px; }
.tm-pill { background: var(--pen); color: var(--paper); border-radius: 99px; padding: 5px 10px; font: 700 .76rem/1.2 var(--body); font-variant-numeric: tabular-nums; white-space: nowrap; }
.tm-pill.low { background: var(--bad); }
.tm-bar { flex: 1; min-width: 0; height: 5px; border-radius: 99px; background: var(--wash); border: 1px solid var(--pen); overflow: hidden; }
.tm-bar i { display: block; height: 100%; width: calc(var(--p, 0) * 100%); background: var(--pen); }
.tm-x { border: 0; background: none; color: var(--pen); font: 700 .8rem/1 var(--body); text-decoration: underline; cursor: pointer; padding: 6px; }
.tm-body { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 14px; padding: 14px 22px 26px; }
.tm-body::before, .tm-body::after { content: ""; flex: 1; }
.tm-body.list::before, .tm-body.list::after { display: none; }
.tm-body p, .tm-body h2, .tm-body h3 { margin: 0; }
.tm-k { font: 700 .74rem/1.2 var(--body); letter-spacing: .13em; text-transform: uppercase; }
.tm-q { font: 800 1.45rem/1.14 var(--display); letter-spacing: -.02em; text-wrap: balance; }
.tm-big { font: 800 2.4rem/1 var(--display); letter-spacing: -.02em; }
.tm-score { font: 800 4.4rem/.9 var(--display); letter-spacing: -.04em; font-variant-numeric: tabular-nums; }
.tm-p { font: 600 1.02rem/1.35 var(--body); }
.tm-opts { display: grid; gap: 9px; }
.tm-opt { text-align: left; padding: 13px 14px; border: 2px solid var(--pen); border-radius: 14px; background: var(--wash); color: var(--pen); font: 600 1rem/1.25 var(--body); cursor: pointer; }
.tm-opt.on { background: var(--pen); color: var(--paper); }
.tm-opt:disabled { cursor: default; opacity: .55; }
.tm-opt.ok, .tm-opt.bad { opacity: 1; color: var(--paper); border-color: transparent; }
.tm-opt.ok { background: var(--good); }
.tm-opt.bad { background: var(--bad); }
.tm-why { font: 600 1rem/1.3 var(--body); background: var(--pen); color: var(--paper); padding: 12px 14px; border-radius: 14px; }
.tm-btn { border: 0; border-radius: 99px; background: var(--pen); color: var(--paper); font: 800 1rem/1 var(--display); padding: 14px 20px; cursor: pointer; align-self: flex-start; }
.tm-btn.ghost { background: none; color: var(--pen); border: 2px solid var(--pen); padding: 10px 14px; font-size: .88rem; }
.tm-row { display: flex; flex-wrap: wrap; gap: 8px; }
.tm-chs { display: grid; gap: 6px; }
.tm-ch { display: flex; justify-content: space-between; gap: 12px; font: 600 .95rem/1.25 var(--body); border-bottom: 2px solid var(--pen); padding-bottom: 5px; }
.tm-ch b { font-variant-numeric: tabular-nums; white-space: nowrap; }
.tm-miss { display: grid; gap: 6px; border-top: 2px solid var(--pen); padding-top: 12px; justify-items: start; }
.tm-miss h3 { font: 800 1.05rem/1.2 var(--display); }
.tm-no { color: var(--bad); font-weight: 700; }
.tm-yes { color: var(--good); font-weight: 700; }`;
  const sheet = document.createElement('style');
  sheet.textContent = CSS;
  document.head.append(sheet);

  const COUNT = 25, PER = 30;
  let box = null, tick = 0, hooks = {}, deck = null, Q = [], given = [], at = 0, left = 0;

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }
  const pick = (a, n) => shuffle(a.slice()).slice(0, n);
  const clock = s => String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');

  // The heart of it: connect each person to their event, in both directions. The wrong answers come
  // from the same chapter first, so they are the people and events most easily mixed up. Dates are
  // never asked.
  function linkQs(d) {
    const L = d.links || [];
    const others = (l, key) => {
      const pool = L.filter(x => x !== l && !(l.also || []).includes(x.p) && !(x.also || []).includes(l.p));
      return shuffle(pool.filter(x => x.c === l.c)).concat(shuffle(pool.filter(x => x.c !== l.c))).slice(0, 3).map(x => x[key]);
    };
    return L.map(l => ({
      who: { c: l.c, term: l.term, q: 'Who goes with this? ' + l.e, options: [l.p].concat(others(l, 'p')), answer: 0, why: l.p + ': ' + l.why },
      what: { c: l.c, term: l.term, q: l.p + '. Which one is theirs?', options: [l.e].concat(others(l, 'e')), answer: 0, why: l.p + ': ' + l.why }
    }));
  }
  // Shuffles a question's options and remembers where the right one landed.
  function ready(q) {
    const right = q.options[q.answer], opts = shuffle(q.options.slice());
    return { c: q.c, term: q.term, q: q.q, opts, ans: opts.indexOf(right), why: q.why || '' };
  }

  function compose(d) {
    // 15 connections (each person at most once, half asked from the person, half from the event),
    // filled out with the hand-written exam questions.
    const links = pick(linkQs(d), 15).map((l, i) => (i % 2 ? l.who : l.what));
    const pool = links.concat(pick(d.test || [], COUNT - links.length));
    return shuffle(pool).slice(0, COUNT).map(ready);
  }

  function frame(k) {
    box.textContent = '';
    const top = el('div', 'tm-top');
    const x = el('button', 'tm-x', 'Leave');
    x.type = 'button';
    x.onclick = () => close();
    box._bar = el('div', 'tm-bar'); box._bar.append(el('i'));
    box._time = el('span', 'tm-pill', clock(left));
    box._n = el('span', 'tm-pill', k);
    top.append(box._n, box._bar, box._time, x);
    const body = el('div', 'tm-body');
    box.append(top, body);
    return body;
  }

  function intro() {
    const body = frame('Test mode');
    const go = el('button', 'tm-btn', 'Start the test');
    go.type = 'button';
    go.onclick = begin;
    let best = null;
    try { best = JSON.parse(localStorage.getItem('doomstudy.test.' + deck.title)); } catch (e) { /* no record */ }
    const n = (deck.links || []).length;
    const practice = el('button', 'tm-btn ghost', 'Practice first: connect all ' + n);
    practice.type = 'button';
    practice.onclick = drill;
    body.append(
      el('p', 'tm-k', deck.title),
      el('h2', 'tm-big', 'Test mode.'),
      el('p', 'tm-p', Q.length + ' questions in ' + clock(Q.length * PER) + '. Mostly one job: connect each person to their event. No dates. Difficulty 8 out of 10, because the wrong answers are the people and events most easily mixed up.'),
      el('p', 'tm-p', 'No hints and no answers until the end. Then you see what you missed and can jump straight to those terms.'),
      best ? el('p', 'tm-p', 'Your best so far: ' + best.right + ' of ' + best.of + '.') : '',
      go,
      n ? practice : ''
    );
  }

  // The connect drill: every person-to-event link, with the answer shown each time. A miss goes
  // back in the pile, so it only ends when every one has been connected.
  let pile = [], linked = 0, linkTotal = 0;
  function drill() {
    clearInterval(tick);
    const all = linkQs(deck);
    pile = shuffle(all.map(l => ({ l, flip: Math.random() < 0.5 })));
    linked = 0; linkTotal = all.length;
    nextLink();
  }
  function nextLink() {
    if (!pile.length) {
      const body = frame('Practice');
      box._time.textContent = linkTotal + ' / ' + linkTotal;
      box._bar.firstElementChild.style.setProperty('--p', 1);
      const test = el('button', 'tm-btn', 'Now take the test');
      test.type = 'button';
      test.onclick = () => { Q = compose(deck); begin(); };
      const again = el('button', 'tm-btn ghost', 'Go again');
      again.type = 'button';
      again.onclick = drill;
      const row = el('div', 'tm-row');
      row.append(test, again);
      body.append(el('p', 'tm-k', 'Practice'), el('h2', 'tm-big', 'All ' + linkTotal + ' connected.'), el('p', 'tm-p', 'Every person is tied to their event. The test asks the same thing with no answers shown.'), row);
      return;
    }
    const item = pile[0], q = ready(item.flip ? item.l.who : item.l.what);
    const body = frame('Practice');
    box._time.textContent = linked + ' / ' + linkTotal;
    box._bar.firstElementChild.style.setProperty('--p', linked / linkTotal);
    const opts = el('div', 'tm-opts'), why = el('p', 'tm-why'), next = el('button', 'tm-btn', 'Next');
    why.hidden = true; next.hidden = true; next.type = 'button';
    next.onclick = nextLink;
    q.opts.forEach((t, i) => {
      const b = el('button', 'tm-opt', t);
      b.type = 'button';
      b.onclick = () => {
        [...opts.children].forEach((x, j) => { x.disabled = true; if (j === q.ans) x.classList.add('ok'); });
        pile.shift();
        if (i === q.ans) linked++; else { b.classList.add('bad'); item.flip = !item.flip; pile.splice(Math.min(pile.length, 4), 0, item); }
        why.textContent = (i === q.ans ? 'Yes. ' : 'Not quite. ') + q.why;
        why.hidden = false; next.hidden = false;
        box._time.textContent = linked + ' / ' + linkTotal;
        next.focus();
      };
      opts.append(b);
    });
    body.append(el('p', 'tm-k', 'Connect'), el('h2', 'tm-q', q.q), opts, why, next);
  }

  function begin() {
    at = 0; given = Q.map(() => -1); left = Q.length * PER;
    clearInterval(tick);
    tick = setInterval(() => {
      left--;
      if (box._time) { box._time.textContent = clock(Math.max(0, left)); box._time.classList.toggle('low', left <= 60); }
      if (left <= 0) results();
    }, 1000);
    ask();
  }

  function ask() {
    const q = Q[at], body = frame((at + 1) + ' / ' + Q.length);
    box._bar.firstElementChild.style.setProperty('--p', at / Q.length);
    const ch = (deck.concepts || []).find(c => c.id === q.c);
    const opts = el('div', 'tm-opts');
    q.opts.forEach((t, i) => {
      const b = el('button', 'tm-opt', t);
      b.type = 'button';
      b.onclick = () => {
        if (given[at] !== -1) return;
        given[at] = i;
        b.classList.add('on');
        // No right or wrong here: the next question simply arrives.
        setTimeout(() => { at++; if (at >= Q.length) results(); else ask(); }, 220);
      };
      opts.append(b);
    });
    body.append(el('p', 'tm-k', ch ? ch.name.split(':')[0] : 'Question'), el('h2', 'tm-q', q.q), opts);
  }

  function results() {
    clearInterval(tick);
    const right = Q.filter((q, i) => given[i] === q.ans).length, pct = Math.round(right / Q.length * 100);
    try {
      const k = 'doomstudy.test.' + deck.title, best = JSON.parse(localStorage.getItem(k));
      if (!best || right > best.right) localStorage.setItem(k, JSON.stringify({ right, of: Q.length }));
    } catch (e) { /* a convenience only */ }
    const body = frame('Results');
    body.classList.add('list');
    box._time.textContent = pct + '%';
    box._bar.firstElementChild.style.setProperty('--p', right / Q.length);
    const verdict = pct >= 90 ? 'Exam ready.' : pct >= 76 ? 'Close. Clean up the misses below.' : pct >= 60 ? 'Getting there. This test is built hard, so this is a normal first score.' : 'Not yet. Go back through the terms below, then try again.';
    const chs = el('div', 'tm-chs');
    for (const c of deck.concepts || []) {
      const mine = Q.map((q, i) => [q, i]).filter(([q]) => q.c === c.id);
      if (!mine.length) continue;
      const row = el('div', 'tm-ch');
      row.append(el('span', '', c.name), el('b', '', mine.filter(([q, i]) => given[i] === q.ans).length + ' / ' + mine.length));
      chs.append(row);
    }
    const again = el('button', 'tm-btn', 'Try a new test');
    again.type = 'button';
    again.onclick = () => { Q = compose(deck); intro(); };
    const back = el('button', 'tm-btn ghost', 'Back to the feed');
    back.type = 'button';
    back.onclick = () => close();
    const row = el('div', 'tm-row');
    row.append(again, back);
    if ((deck.links || []).length) {
      const practice = el('button', 'tm-btn ghost', 'Practice connections');
      practice.type = 'button';
      practice.onclick = drill;
      row.append(practice);
    }
    body.append(el('p', 'tm-k', 'Your score'), el('p', 'tm-score', right + '/' + Q.length), el('p', 'tm-p', verdict), chs, row);

    const missed = Q.map((q, i) => [q, i]).filter(([q, i]) => given[i] !== q.ans);
    if (missed.length) body.append(el('p', 'tm-k', 'What you missed'));
    for (const [q, i] of missed) {
      const m = el('div', 'tm-miss');
      const study = el('button', 'tm-btn ghost', 'Study ' + q.term);
      study.type = 'button';
      study.onclick = () => { const h = hooks; close(true); if (h.study) h.study(q.term); };
      m.append(
        el('h3', '', q.q),
        el('p', 'tm-no', given[i] === -1 ? 'No answer.' : 'You said: ' + q.opts[given[i]]),
        el('p', 'tm-yes', 'Answer: ' + q.opts[q.ans]),
        el('p', 'tm-p', q.why),
        study
      );
      body.append(m);
    }
  }

  // hooks: { exit(): the test closed and the feed should carry on, study(term): jump to that term }
  function start(root, d, h) {
    if (box) return;
    deck = d; hooks = h || {};
    Q = compose(d);
    box = el('div', 'tm');
    root.append(box);
    left = Q.length * PER;
    intro();
  }

  function close(quiet) {
    if (!box) return;
    clearInterval(tick);
    box.remove();
    box = null;
    if (!quiet && hooks.exit) hooks.exit();
  }

  return { start, close, get open() { return !!box; } };
})();
