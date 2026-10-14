// Decks, the one-swipe feed, quiz cards between videos, and the 30 minute session clock.
(() => {
  const $ = id => document.getElementById(id);
  const feed = $('feed');
  const GOAL = 1800;
  const Cards = typeof Motion !== 'undefined' ? Motion : null;
  const HL = ['yellow', 'mint', 'pink', 'blue', 'orange', 'lilac'];
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ICON = {
    on: '<path d="M4 10v4h4l5 4V6L8 10H4z"/><path d="M16.5 9a4 4 0 0 1 0 6"/><path d="M19 6.5a8 8 0 0 1 0 11"/>',
    off: '<path d="M4 10v4h4l5 4V6L8 10H4z"/><path d="M17 9.5l5 5M22 9.5l-5 5"/>',
    out: '<path d="M14 5h5v5"/><path d="M19 5l-8 8"/><path d="M18 14v4a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h4"/>'
  };
  let source = 'yt';
  try { if (localStorage.getItem('doomstudy.app') === 'tt') source = 'tt'; } catch (e) { /* stays on YouTube */ }
  let decks = [], deck = null, file = '', S = null, cur = 0, gesture = false, lock = false, hue = 0, watchT = 0, toastT = 0, target = null, targetT = 0, lastH = feed.clientHeight, settleT = 0, tl = null;

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  const svg = name => '<svg class="ic ' + name + '" viewBox="0 0 24 24">' + ICON[name] + '</svg>';
  const slides = () => [...feed.querySelectorAll(':scope > .slide')];
  const clampI = i => Math.max(0, Math.min(slides().length - 1, i));
  const concept = id => (deck && id ? deck.concepts.find(c => c.id === id) : null);
  const cmOf = id => S.cm[id] || (S.cm[id] = { seen: 0, right: 0, wrong: 0 });
  const tidy = t => (t || '').replace(/#[^\s#]+/g, ' ').replace(/\s+/g, ' ').replace(/^[\s|:–-]+|[\s|:–-]+$/g, '') || 'Short';

  // ---- saved progress, one record per deck ----
  const key = f => 'doomstudy.v2.' + f;
  function loadState(f) {
    try {
      const j = JSON.parse(localStorage.getItem(key(f)));
      if (j && j.stats && Array.isArray(j.dead)) return j;
    } catch (e) { /* start fresh */ }
    return { pos: 1, stats: { seen: 0, right: 0, wrong: 0, streak: 0, best: 0 }, cm: {}, elapsed: 0, dead: [], doneShown: false };
  }
  function save() {
    if (!deck) return;
    try { localStorage.setItem(key(file), JSON.stringify(S)); } catch (e) { /* storage is a convenience */ }
  }

  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastT);
    toastT = setTimeout(() => { t.hidden = true; }, 2600);
  }

  // ---- slides ----
  function makeVideo(it) {
    const s = el('section', 'slide vid');
    s._it = it;
    const tik = it.t === 'tt';
    // Above the video: the term and its exam fact.
    const top = el('div', 'vtop');
    const c = concept(it.c);
    if (c) {
      const chip = el('span', 'chipc', it.term || c.name);
      chip.dataset.c = HL[deck.concepts.indexOf(c) % HL.length];
      top.append(chip);
    }
    const note = deck.notes && it.term ? deck.notes[it.term] : '';
    if (note) top.append(el('p', 'note', note));
    // The video box. The shared player is parked exactly over it, and nothing else is ever drawn
    // in front of it: YouTube's rules for embedded players forbid overlays and borrowed taps.
    const box = el('div', 'vbox');
    if (!tik) {
      // YouTube hands out each Short's first frame, which fills the box until the player arrives.
      const poster = el('img', 'poster');
      poster.alt = '';
      poster.loading = 'lazy';
      poster.onerror = () => { poster.onerror = null; poster.src = 'https://i.ytimg.com/vi/' + it.id + '/hqdefault.jpg'; };
      poster.src = 'https://i.ytimg.com/vi/' + it.id + '/frame0.jpg';
      box.append(poster);
    }
    // Below the video: where it came from, its status, and the controls.
    const bot = el('div', 'vbot');
    const badge = el('p', 'badge');
    badge.hidden = true;
    const snd = el('button', 'vb');
    snd.type = 'button';
    snd.innerHTML = svg('on') + svg('off');
    snd.append('Sound');
    snd.onclick = () => setSound(Player.silent);
    const out = el('a', 'vb');
    // The one way out: this exact video, in the app it came from.
    out.href = tik ? 'https://www.tiktok.com/@' + it.user + '/video/' + it.id : 'https://www.youtube.com/shorts/' + it.id;
    out.target = '_blank';
    out.rel = 'noopener';
    out.innerHTML = svg('out');
    out.append(tik ? 'TikTok' : 'YouTube');
    const next = el('button', 'vb next', 'Next');
    next.type = 'button';
    next.onclick = () => go(cur + 1);
    const btns = el('div', 'vbtns');
    btns.append(snd, out, next);
    bot.append(el('h2', 'vt', tidy(it.title)), el('p', 'by', (it.by || '') + (tik ? ' · TikTok' : ' · YouTube Shorts')), badge, btns);
    s.append(top, box, bot);
    return s;
  }

  function settle(s, ok, why) {
    s.dataset.done = '1';
    const p = s.querySelector('.why');
    p.textContent = (ok ? 'Yes. ' : 'Not quite. ') + why;
    p.hidden = false;
    s.querySelector('.swipe').hidden = false;
    score(s, ok);
  }

  function makeQuiz(it) {
    const s = el('section', 'slide card quiz');
    s._it = it;
    s.dataset.c = HL[hue++ % HL.length];
    const body = el('div', 'body');
    const c = concept(it.c);
    body.append(el('p', 'kind', 'Quick check' + (c ? ' · ' + (it.term || c.name) : '') + (it.redo ? ' · round two' : '')));
    const why = el('p', 'why');
    why.hidden = true;
    const swipe = el('p', 'swipe', 'Keep scrolling.');
    swipe.hidden = true;
    const pick = (group, i, right) => {
      if (s.dataset.done) return;
      [...group.children].forEach((x, j) => { x.disabled = true; if (j === right) x.classList.add('right'); });
      if (i !== right) group.children[i].classList.add('wrong');
      settle(s, i === right, it.why || '');
    };
    if (it.t === 'myth') {
      body.append(el('h2', 'head q', '"' + it.claim + '"'));
      const pair = el('div', 'pair opts');
      ['Fact', 'Cap'].forEach((t, i) => {
        const b = el('button', 'opt', t);
        b.type = 'button';
        b.onclick = () => pick(pair, i, it.verdict ? 0 : 1);
        pair.append(b);
      });
      body.append(pair);
    } else {
      body.append(el('h2', 'head q', it.question));
      const opts = el('div', 'opts');
      it.options.forEach((o, i) => {
        const b = el('button', 'opt');
        b.type = 'button';
        b.append(el('span', 'key', 'ABCD'[i]), el('span', '', o));
        b.onclick = () => pick(opts, i, it.answer);
        opts.append(b);
      });
      body.append(opts);
    }
    body.append(why, swipe);
    s.append(body);
    return s;
  }

  function makeNote(head, lines) {
    const s = el('section', 'slide card note');
    s.dataset.c = HL[hue++ % HL.length];
    const body = el('div', 'body');
    body.append(el('p', 'kind', 'Session'), el('h2', 'head', head));
    for (const t of lines) body.append(el('p', '', t));
    s.append(body);
    return s;
  }

  function makeEnd() {
    const s = el('section', 'slide card end');
    const body = el('div', 'body');
    const again = el('button', 'go', 'Run it back');
    again.type = 'button';
    again.onclick = () => go(1);
    const all = el('button', 'ghost', 'All decks');
    all.type = 'button';
    all.onclick = () => go(0);
    body.append(el('p', 'kind', 'End of deck'), el('h2', 'head', "That's every video in this deck."), el('p', 'endStats'), again, all);
    s.append(body);
    return s;
  }

  function build() {
    slides().forEach(s => { if (s.id !== 'home') { Player.drop(s); s.remove(); } });
    hue = 0;
    const mo = deck.motion || {}, notes = deck.notes || {}, tiks = (source === 'tt' && deck.tiktok) || {};
    // Group the deck by term: its videos (the first is the pick, the rest are backups in case it
    // stops working) and the checks about it.
    const units = [], byTerm = new Map(), loose = [];
    for (const it of deck.items) {
      const k = it.term || (it.t === 'yt' ? it.id : '');
      if (!k) { loose.push(it); continue; }
      let u = byTerm.get(k);
      if (!u) { u = { term: it.term, n: units.length, c: it.c, vids: [], checks: [] }; byTerm.set(k, u); units.push(u); }
      if (it.t === 'yt') u.vids.push(it); else if (it.t === 'quiz' || it.t === 'myth') u.checks.push(it);
    }
    // Chronological order, so the deck tells one story. Terms with no date keep their place at the end.
    const yr = u => (mo[u.term] ? mo[u.term].when.y1 : Infinity);
    const tag = u => (u && mo[u.term] ? u.term + ' (' + mo[u.term].when.y1 + ')' : '');
    units.sort((a, b) => yr(a) - yr(b) || a.n - b.n);
    // The side timeline lists the same terms in the same order and can jump to any of them.
    const kindOf = {};
    for (const [k, terms] of Object.entries(deck.kinds || {})) for (const t of terms) kindOf[t] = k;
    const dated = units.filter(u => mo[u.term]).map(u => ({ term: u.term, year: mo[u.term].when.y1, c: u.c, kind: kindOf[u.term] }));
    // The YouTube compilation: every term's video in feed order, as one playlist and one per chapter.
    for (const u of units) { const v = u.vids.find(x => !S.dead.includes(x.id)); u.vid = v ? v.id : null; }
    const lists = Timeline.playlists(units, deck.concepts);
    $('ytAll').hidden = !lists.length;
    if (lists.length) { $('ytAll').href = lists[0].href; $('ytAll').textContent = 'Full compilation on YouTube · ' + units.filter(u => u.vid).length + ' videos'; }
    tl = dated.length ? Timeline.mount($('timeline'), { units: dated, chapters: deck.concepts, onJump: jump, watch: lists }) : null;
    if (!tl) $('timeline').textContent = '';
    $('testBtn').hidden = !(deck.test && deck.test.length);
    units.forEach((u, i) => {
      // Each term is a watch, then a check when there is one. The animated reading cards are
      // optional: they only appear when motion.js is loaded by the page.
      if (Cards && mo[u.term]) {
        const before = tag(units[i - 1]), next = tag(units[i + 1]);
        const chain = [before && 'Before: ' + before, next && 'Next: ' + next].filter(Boolean).join('. ');
        // The person-to-event link for this term (two at most, so the notes card stays short).
        const connect = (deck.links || []).filter(l => l.term === u.term).slice(0, 2).map(l => l.p + ' → ' + l.e).join('. ');
        const r = Cards.build(Object.assign({ term: u.term, note: notes[u.term] || '', chain: chain && chain + '.', connect }, mo[u.term]));
        r._it = { t: 'read', c: u.c, term: u.term };
        feed.append(r);
      }
      const tk = tiks[u.term], v = u.vids.find(x => !S.dead.includes(x.id));
      if (tk && !S.dead.includes(tk.id)) {
        if (!tk.it) tk.it = { t: 'tt', id: tk.id, user: tk.user, c: u.c, term: u.term, title: tk.title, by: tk.by };
        feed.append(makeVideo(tk.it));
      } else if (v) feed.append(makeVideo(v));
      for (const q of u.checks) feed.append(makeQuiz(q));
    });
    for (const q of loose) if (q.t === 'quiz' || q.t === 'myth') feed.append(makeQuiz(q));
    feed.append(makeEnd());
    renderSide();
  }

  // ---- side panel and hud ----
  function mastery(id) {
    const m = S.cm[id];
    if (!m) return 0;
    return Math.max(0, Math.min(1, Math.min(m.seen, 4) * 0.12 + m.right * 0.35 - m.wrong * 0.2));
  }

  function renderSide() {
    $('togSound').textContent = 'Sound: ' + (Player.silent ? 'off' : 'on');
    if (!deck) return;
    $('deckTitle').textContent = deck.title;
    $('stSeen').textContent = S.stats.seen;
    $('stQuiz').textContent = S.stats.right + '/' + (S.stats.right + S.stats.wrong);
    $('stBest').textContent = S.stats.best;
    const ul = $('concepts');
    ul.textContent = '';
    for (const c of deck.concepts) {
      const li = el('li'), m = el('div', 'meter'), bar = el('i');
      bar.style.setProperty('--v', mastery(c.id));
      m.append(bar);
      li.append(el('b', '', c.name), m);
      li.title = c.gist || '';
      ul.append(li);
    }
  }

  function renderHud() {
    const e = S ? S.elapsed : 0, left = GOAL - e, t = Math.abs(left);
    $('time').textContent = (left < 0 ? '+' : '') + String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0');
    $('bar').firstElementChild.style.setProperty('--p', Math.min(1, e / GOAL));
    $('bar').setAttribute('aria-valuenow', Math.min(30, Math.floor(e / 60)));
    const n = slides().length - 2;
    $('nav').hidden = cur === 0;
    $('pos').hidden = !(deck && cur > 0 && cur <= n);
    $('pos').textContent = cur + ' / ' + n;
  }

  function renderHome() {
    const box = $('decks');
    box.textContent = '';
    for (const b of $('apps').children) b.setAttribute('aria-pressed', String(b.dataset.app === source));
    for (const d of decks) {
      const st = loadState(d.file);
      const row = el('div', 'deckrow');
      const b = el('button', 'deck');
      b.type = 'button';
      b.append(el('b', '', d.title), el('span', '', d.videos + ' videos' + (st.pos > 1 ? ' · pick up at ' + st.pos : '') + ' · tap to start'));
      b.onclick = () => openDeck(d.file);
      row.append(b);
      const t = el('button', 'ghost', 'Test mode · difficulty 8/10');
      t.type = 'button';
      t.onclick = async () => { await openDeck(d.file); startTest(); };
      row.append(t);
      if (source === 'yt' && d.ids && d.ids.length) {
        // One link that hands the whole deck to the YouTube app as a playlist.
        const a = el('a', 'inapp', 'Full compilation on YouTube · ' + d.ids.length + ' videos');
        a.href = 'https://www.youtube.com/watch_videos?video_ids=' + d.ids.join(',');
        a.target = '_blank';
        a.rel = 'noopener';
        row.append(a);
      }
      box.append(row);
    }
    if (!decks.length) $('homeHint').textContent = 'No decks yet. Send Claude a photo of your study guide and your first deck shows up here.';
  }

  // ---- moving through the feed ----
  function activate(i, force) {
    i = clampI(i);
    if (i === cur && !force) return;
    cur = i;
    const list = slides(), s = list[i], it = s._it;
    Player.focus(s, i);
    const reading = s.classList.contains('mo');
    if (Cards) { if (reading) Cards.play(s); else Cards.stop(); }
    if (tl && it && it.term) tl.setCurrent(it.term);
    $('nav').classList.toggle('low', reading);
    clearTimeout(watchT);
    if (deck && i > 0) { S.pos = Math.min(i, list.length - 2); save(); }
    if (it && (it.t === 'yt' || it.t === 'tt') && !it.seen) {
      watchT = setTimeout(() => {
        if (slides()[cur] !== s || it.seen) return;
        it.seen = true;
        S.stats.seen++;
        if (concept(it.c)) cmOf(it.c).seen++;
        renderSide(); save();
      }, 4000);
    }
    if (s.classList.contains('end')) {
      const st = S.stats, total = st.right + st.wrong;
      s.querySelector('.endStats').textContent = (deck.closing ? deck.closing + ' ' : '') + st.seen + ' videos watched' + (total ? ', ' + st.right + ' of ' + total + ' checks right' : '') + '. Run it back to lock it in.';
    }
    renderHud();
  }

  function go(i, instant) {
    i = clampI(i);
    const top = i * feed.clientHeight;
    if (instant || reduce) { target = null; feed.scrollTop = top; activate(i, true); return; }
    // Start the next video right away, while the slide is still gliding into place.
    target = i;
    clearTimeout(targetT);
    // If the glide has not finished by now, finish it, so the slide and the video never disagree.
    targetT = setTimeout(() => { target = null; feed.scrollTop = cur * feed.clientHeight; }, 900);
    activate(i);
    feed.scrollTo({ top, behavior: 'smooth' });
  }

  // Finger swipes land here: whichever slide fills most of the screen becomes the current one.
  function sync() {
    const h = feed.clientHeight;
    if (!h) return;
    // A resized window, a turned phone or a phone's address bar sliding away changes the height
    // mid-scroll. Never pull the feed back for that: wait for it to settle, then go by where it rests.
    if (h !== lastH) {
      lastH = h;
      clearTimeout(settleT);
      settleT = setTimeout(() => { if (target === null && feed.clientHeight) activate(Math.round(feed.scrollTop / feed.clientHeight)); }, 350);
      return;
    }
    const i = Math.round(feed.scrollTop / h);
    if (target !== null) { if (i === target) target = null; return; }
    activate(i);
  }
  feed.addEventListener('scroll', sync);

  // One wheel flick or trackpad swipe moves exactly one video, never part of one.
  feed.addEventListener('wheel', e => {
    if (e.ctrlKey) return;
    const body = e.target.closest('.body');
    if (body && body.scrollHeight > body.clientHeight + 2) {
      const atEnd = e.deltaY > 0 ? body.scrollTop + body.clientHeight >= body.scrollHeight - 2 : body.scrollTop <= 0;
      if (!atEnd) return;
    }
    e.preventDefault();
    if (lock || Math.abs(e.deltaY) < 10) return;
    lock = true;
    setTimeout(() => { lock = false; }, 650);
    go(cur + (e.deltaY > 0 ? 1 : -1));
  }, { passive: false });

  // Tapping past a reading card's last scene moves on to its video.
  if (Cards) Cards.hooks.past = () => go(cur + 1);

  // The timeline and the test's "Study this" buttons land on a term's reading card.
  function jump(term) {
    const i = slides().findIndex(s => s._it && s._it.term === term);
    if (i < 1) return;
    $('app').classList.remove('sheet');
    go(i, true);
  }

  // Test mode covers the feed. Whatever was playing stops, and picks up again when the test closes.
  function startTest() {
    if (!deck || Test.open) return;
    $('app').classList.remove('sheet');
    Player.drop(Player.active);
    if (Cards) Cards.stop();
    Test.start(document.querySelector('.stage'), deck, { exit: () => activate(cur, true), study: jump });
  }
  $('testBtn').onclick = startTest;
  document.addEventListener('visibilitychange', () => { if (document.hidden) Player.hide(); });
  document.addEventListener('pointerdown', () => { gesture = true; }, true);
  document.addEventListener('keydown', e => {
    gesture = true;
    if (e.metaKey || e.ctrlKey || e.altKey || Test.open) return;
    const k = e.key.toLowerCase();
    const s = slides()[cur];
    if (k === 'arrowdown' || k === 'j' || k === 'pagedown') { e.preventDefault(); go(cur + 1); }
    else if (k === 'arrowup' || k === 'k' || k === 'pageup') { e.preventDefault(); go(cur - 1); }
    else if (k === ' ' && e.target.tagName !== 'BUTTON' && s.classList.contains('vid')) { e.preventDefault(); Player.tap(s); }
    else if (k === ' ' && s.classList.contains('mo')) { e.preventDefault(); Cards.toggle(); }
    else if ((k === 'arrowright' || k === 'arrowleft') && s.classList.contains('mo')) { e.preventDefault(); Cards.step(k === 'arrowright' ? 1 : -1); }
    else if (k === 'm') setSound(Player.silent);
    else if ('abcd'.includes(k) && k.length === 1 && s.classList.contains('quiz')) {
      const b = s.querySelectorAll('.opt')['abcd'.indexOf(k)];
      if (b) b.click();
    }
  });

  function setSound(on) {
    Player.setMuted(!on);
  }
  // The player reports whenever it goes silent or gets its sound back, including when the
  // browser refuses sound by itself, so the buttons always show the truth.
  function soundChanged() {
    feed.classList.toggle('muted', Player.silent);
    $('togSound').textContent = 'Sound: ' + (Player.silent ? 'off' : 'on');
  }

  // ---- scoring ----
  function score(s, ok) {
    const it = s._it, st = S.stats;
    if (ok) { st.right++; st.streak++; st.best = Math.max(st.best, st.streak); } else { st.wrong++; st.streak = 0; }
    if (concept(it.c)) cmOf(it.c)[ok ? 'right' : 'wrong']++;
    if (!ok && !it.redo) {
      // A missed check comes back a few videos later.
      const copy = Object.assign({}, it, { redo: true });
      const list = slides(), at = Math.min(list.indexOf(s) + 5, list.length - 1);
      feed.insertBefore(makeQuiz(copy), list[at]);
    }
    if (ok && st.streak >= 3) toast(st.streak + ' in a row.');
    renderSide(); renderHud(); save();
  }

  // ---- videos that turn out to be unplayable are dropped without anyone having to tap ----
  function dead(s) {
    const it = s._it, list = slides(), i = list.indexOf(s);
    if (!it || i < 0) return;
    if (!S.dead.includes(it.id)) S.dead.push(it.id);
    Player.drop(s);
    s.remove();
    if (i < cur) { cur--; Player.place(); }
    feed.scrollTop = cur * feed.clientHeight;
    if (i === cur) activate(cur, true);
    renderHud(); save();
  }

  Player.init({
    gesture: () => gesture,
    dead,
    skip: s => { if (slides()[cur] === s) go(cur + 1); },
    sound: soundChanged
  });
  // The player sits over a box on the slide, so it has to follow when the window changes size.
  addEventListener('resize', () => Player.place());

  // On the public site there is one app (YouTube) and nobody to send a photo to yet.
  const local = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  if (!local) { source = 'yt'; $('pickRow').hidden = true; $('homeHint').textContent = 'New decks are added by request.'; }

  // ---- decks ----
  // Deck files normally live in the feeds folder. If they were uploaded next to the app instead,
  // they are found there too.
  async function feedFile(name) {
    const r = await fetch('feeds/' + name, { cache: 'no-store' });
    return r.ok ? r : fetch(name, { cache: 'no-store' });
  }
  async function openDeck(f) {
    try {
      if (file !== f || !deck) {
        const r = await feedFile(encodeURIComponent(f));
        if (!r.ok) throw 0;
        const d = await r.json();
        deck = d; file = f; S = loadState(f);
        build();
      }
      const last = slides().length - 2;
      go(S.pos >= 1 && S.pos <= last ? S.pos : 1, true);
    } catch (e) {
      toast("Couldn't open that deck.");
    }
  }

  async function boot() {
    try {
      const r = await feedFile('index.json');
      decks = r.ok ? await r.json() : [];
    } catch (e) { decks = []; }
    if (!Array.isArray(decks)) decks = [];
    renderHome();
  }

  // Switching apps rebuilds the open deck and lands on the same term.
  function setSource(v) {
    if (v === source) return;
    source = v;
    try { localStorage.setItem('doomstudy.app', v); } catch (e) { /* storage is a convenience */ }
    renderHome();
    if (!deck) return;
    const at = slides()[cur], term = at && at._it && at._it.term;
    build();
    const i = term ? slides().findIndex(s => s._it && s._it.term === term) : -1;
    if (cur > 0) go(i > 0 ? i : 1, true);
  }
  for (const b of $('apps').children) b.onclick = () => setSource(b.dataset.app);

  $('navUp').onclick = () => go(cur - 1);
  $('navDown').onclick = () => go(cur + 1);
  $('togSound').onclick = () => setSound(Player.silent);
  $('allDecks').onclick = () => { $('app').classList.remove('sheet'); renderHome(); go(0); };
  $('openSide').onclick = () => $('app').classList.add('sheet');
  $('closeSide').onclick = () => $('app').classList.remove('sheet');

  // The session clock runs only while a deck slide is on screen and the tab is visible.
  setInterval(() => {
    if (!deck || cur === 0 || document.hidden) return;
    S.elapsed++;
    renderHud();
    if (S.elapsed % 10 === 0) save();
    if (S.elapsed >= GOAL && !S.doneShown) {
      S.doneShown = true;
      const st = S.stats, total = st.right + st.wrong, list = slides();
      feed.insertBefore(makeNote('Thirty minutes. You actually studied.', [
        st.seen + ' videos watched.',
        total ? st.right + ' of ' + total + ' checks right.' : 'No checks answered yet.',
        'Keep scrolling if you want. The clock just counts up now.'
      ]), list[Math.min(cur + 1, list.length - 1)]);
      save();
    }
  }, 1000);

  renderHud();
  boot();
})();
