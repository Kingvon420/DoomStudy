// The timeline: every term in date order, with buttons to skip to a chapter and filters for
// people, events, ideas and empires. Shared by the app and the phone page, so it carries its own styles.
const Timeline = (() => {
  const CSS = `
.tl { display: grid; gap: 12px; min-height: 0; grid-template-rows: auto minmax(0, 1fr); }
.tl-head { display: grid; gap: 12px; }
.tl-row[hidden] { display: none; }
.tl-chip.yt { text-decoration: none; background: var(--hl-yellow); border-color: var(--hl-yellow); color: var(--pen); font-weight: 700; }
.tl-row { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.tl-lab { width: 100%; margin: 0; font: 700 .7rem/1.2 var(--body); letter-spacing: .12em; text-transform: uppercase; color: var(--mute); }
.tl-chip { border: 2px solid var(--ink-3); background: none; color: var(--text); border-radius: 99px; padding: 5px 11px; font: 600 .82rem/1.2 var(--body); cursor: pointer; }
.tl-chip[aria-pressed="true"] { background: var(--text); color: var(--ink); border-color: var(--text); }
.tl-chip.ch { border-color: var(--dot); }
.tl-list { list-style: none; margin: 0; padding: 0 0 0 16px; overflow-y: auto; min-height: 0; max-height: var(--tl-max, none); }
.tl-item { position: relative; display: grid; grid-template-columns: 2.9em minmax(0, 1fr) auto; gap: 8px; align-items: baseline; width: 100%; text-align: left; background: none; border: 0; color: var(--text); padding: 7px 8px 7px 12px; border-radius: 10px; cursor: pointer; font: 600 .92rem/1.2 var(--body); }
.tl-item::before { content: ""; position: absolute; left: -9px; top: 0; bottom: 0; width: 2px; background: var(--ink-3); }
.tl-item::after { content: ""; position: absolute; left: -13px; top: .8em; width: 10px; height: 10px; border-radius: 50%; background: var(--dot, var(--mute)); }
.tl-item b { font: 800 .82rem/1.2 var(--display); color: var(--mute); font-variant-numeric: tabular-nums; }
.tl-item small { font: 700 .68rem/1.2 var(--body); color: var(--mute); white-space: nowrap; }
.tl-item:hover { background: var(--ink-2); }
.tl-item[aria-current="true"] { background: var(--ink-3); }
.tl-item[aria-current="true"] b { color: var(--text); }
.tl-item[hidden] { display: none; }
.tl-none { margin: 0; color: var(--mute); font-size: .9rem; }`;
  const sheet = document.createElement('style');
  sheet.textContent = CSS;
  document.head.append(sheet);

  const DOTS = ['--hl-yellow', '--hl-mint', '--hl-pink', '--hl-orange', '--hl-blue'];
  const KINDS = { person: 'People', event: 'Events', idea: 'Ideas', group: 'Empires and groups' };
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  // opts: { units: [{term, year, c, kind}] in date order, chapters: [{id, name}], onJump(term) }
  function mount(root, opts) {
    root.textContent = '';
    root.classList.add('tl');
    const color = id => 'var(' + DOTS[Math.max(0, opts.chapters.findIndex(c => c.id === id)) % DOTS.length] + ')';
    const short = c => c.name.split(':')[0];

    const skip = el('div', 'tl-row');
    skip.append(el('p', 'tl-lab', 'Skip to chapter'));
    for (const c of opts.chapters) {
      const first = opts.units.find(u => u.c === c.id);
      if (!first) continue;
      const b = el('button', 'tl-chip ch', short(c));
      b.type = 'button';
      b.title = c.name;
      b.style.setProperty('--dot', color(c.id));
      b.onclick = () => opts.onJump(first.term);
      skip.append(b);
    }

    // Optional row of YouTube playlists (the whole deck, then one per chapter): opts.watch = [{label, href}].
    const yt = el('div', 'tl-row');
    if (opts.watch && opts.watch.length) {
      yt.append(el('p', 'tl-lab', 'Play the compilation on YouTube'));
      for (const w of opts.watch) {
        const a = el('a', 'tl-chip yt', w.label);
        a.href = w.href; a.target = '_blank'; a.rel = 'noopener';
        yt.append(a);
      }
    } else yt.hidden = true;

    const show = el('div', 'tl-row');
    show.append(el('p', 'tl-lab', 'Show on the timeline'));
    const kinds = ['all'].concat(Object.keys(KINDS).filter(k => opts.units.some(u => u.kind === k)));
    let filter = 'all';
    const chips = kinds.map(k => {
      const b = el('button', 'tl-chip', k === 'all' ? 'Everything' : KINDS[k]);
      b.type = 'button';
      b.setAttribute('aria-pressed', String(k === 'all'));
      b.onclick = () => { filter = k; apply(); };
      show.append(b);
      return b;
    });

    const list = el('ul', 'tl-list');
    const none = el('p', 'tl-none', 'Nothing of that kind in this deck.');
    none.hidden = true;
    const rows = opts.units.map(u => {
      const li = el('li');
      const b = el('button', 'tl-item');
      b.type = 'button';
      b.style.setProperty('--dot', color(u.c));
      const ch = opts.chapters.find(c => c.id === u.c);
      b.append(el('b', '', u.year), el('span', '', u.term), el('small', '', ch ? short(ch) : ''));
      b.onclick = () => opts.onJump(u.term);
      li.append(b);
      list.append(li);
      return { u, b };
    });

    function apply() {
      chips.forEach((b, i) => b.setAttribute('aria-pressed', String(kinds[i] === filter)));
      let shown = 0;
      for (const r of rows) { r.b.hidden = filter !== 'all' && r.u.kind !== filter; if (!r.b.hidden) shown++; }
      none.hidden = shown > 0;
    }

    const head = el('div', 'tl-head');
    head.append(yt, skip, show);
    root.append(head, list, none);
    return {
      // Marks where the feed is now and keeps that row in view inside the list.
      setCurrent(term) {
        for (const r of rows) {
          const on = r.u.term === term;
          if (on) r.b.setAttribute('aria-current', 'true'); else r.b.removeAttribute('aria-current');
          if (on && !r.b.hidden && list.clientHeight) {
            const top = r.b.offsetTop - list.offsetTop;
            if (top < list.scrollTop || top + r.b.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = top - list.clientHeight / 3;
          }
        }
      }
    };
  }

  // One link that plays a list of videos in order on YouTube (it takes 50 at most).
  const playlist = ids => 'https://www.youtube.com/watch_videos?video_ids=' + ids.slice(0, 50).join(',');
  // The playlists a deck offers: everything, then each chapter. units: [{c, vid}] in feed order.
  function playlists(units, chapters) {
    const have = units.filter(u => u.vid), out = [];
    if (have.length) out.push({ label: 'Everything (' + Math.min(50, have.length) + ')', href: playlist(have.map(u => u.vid)) });
    for (const c of chapters) {
      const mine = have.filter(u => u.c === c.id);
      if (mine.length) out.push({ label: c.name.split(':')[0] + ' (' + mine.length + ')', href: playlist(mine.map(u => u.vid)) });
    }
    return out;
  }

  return { mount, DOTS, playlist, playlists };
})();
