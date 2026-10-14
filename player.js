// Owns the video players. One YouTube player and one TikTok frame share a "screen" that lives inside
// the scrolling feed, parked exactly over the current slide's video box, and they swap videos as you move.
// (Several YouTube players at once made later videos stall, so there is exactly one.)
//
// This follows YouTube's rules for embedded players: nothing is drawn in front of the player, taps on it
// belong to YouTube, it never starts until more than half of it is on screen, and only one ever plays.
const Player = (() => {
  let hooks = { gesture: () => true, dead() {}, skip() {} };
  let p = null, ready = false, muted = false, blocked = false, active = null;
  let state = -1, played = false, userPaused = false, kick = 0, stuck = 0, began = 0, watchT = 0;
  const screen = document.getElementById('screen');
  const feed = screen.parentElement;
  const tt = document.getElementById('ttp');
  const TT = 'https://www.tiktok.com';
  const isTT = s => !!(s && s._it && s._it.t === 'tt');

  window.onYouTubeIframeAPIReady = () => {
    p = new YT.Player('ytp', {
      width: '100%', height: '100%',
      playerVars: { autoplay: 0, controls: 1, playsinline: 1, rel: 0, fs: 0, origin: location.origin },
      events: {
        onReady: () => { ready = true; if (active && !isTT(active)) start(active); },
        onStateChange: e => { if (!isTT(active)) onState(e.data); },
        // 100, 101 and 150 mean the video is gone or may not be embedded: drop it for good.
        // Anything else can be a passing glitch, so just move on and try it again next time.
        onError: e => {
          if (!active || isTT(active)) return;
          if ([100, 101, 150].includes(e.data)) hooks.dead(active); else hooks.skip(active);
        }
      }
    });
  };
  const tag = document.createElement('script');
  tag.src = 'https://www.youtube.com/iframe_api';
  document.head.append(tag);

  // TikTok's player is driven by messages: we post commands in and it posts its state back.
  const ttPost = (type, value) => {
    try { tt.contentWindow.postMessage({ type, value, 'x-tiktok-player': true }, TT); } catch (e) { /* frame not ready */ }
  };
  const ttLoad = url => {
    // replace() keeps each video out of the browser's Back history.
    try { tt.contentWindow.location.replace(url); } catch (e) { tt.src = url; }
  };
  const ttStop = () => { if (!tt.hidden) { tt.hidden = true; ttLoad('about:blank'); } };
  const ytPause = () => { if (ready) { try { p.pauseVideo(); } catch (e) { /* player gone */ } } };

  window.addEventListener('message', e => {
    if (e.origin !== TT || !isTT(active)) return;
    let d = e.data;
    if (typeof d === 'string') { try { d = JSON.parse(d); } catch (x) { return; } }
    if (!d || !d['x-tiktok-player']) return;
    if (d.type === 'onStateChange') onState(d.value);
    else if (d.type === 'onPlayerError') {
      // 3002 means the browser refused to start it; anything else means the video is unusable.
      if (d.value && d.value.errorCode === 3002) quiet(active); else hooks.dead(active);
    }
  });

  // The status line under the video ("Playing without sound" and so on). It is never drawn over the player.
  const badge = (s, text) => {
    const b = s && s.querySelector('.badge');
    if (!b) return;
    b.textContent = text;
    b.hidden = !text;
  };
  const NOSOUND = 'Playing without sound. Tap Sound to hear it.';
  const showing = () => { try { return p.getVideoData().video_id; } catch (e) { return null; } };
  const play = s => { if (isTT(s)) ttPost('play'); else { try { p.playVideo(); } catch (e) { /* player gone */ } } };
  const pause = s => { if (isTT(s)) ttPost('pause'); else ytPause(); };
  const sound = (s, on) => {
    if (isTT(s)) ttPost(on ? 'unMute' : 'mute');
    else { try { if (on) p.unMute(); else p.mute(); } catch (e) { /* player gone */ } }
  };

  // Falls back to silent playback when the browser will not start a video with sound.
  function quiet(s) {
    if (!muted) blocked = true;
    sound(s, false);
    play(s);
    if (!muted) badge(s, NOSOUND);
    if (hooks.sound) hooks.sound();
  }

  function onState(st) {
    state = st;
    if (!active) return;
    // A quick move can leave the previous video's events in flight; ignore them.
    if (!isTT(active) && (st === 1 || st === 5)) { const id = showing(); if (id && id !== active._it.id) return; }
    if (st === 1 || st === 5) screen.classList.add('live');
    if (st === 1) {
      const first = !played;
      played = true;
      // TikTok always starts silent, so turn the sound on once it is running.
      if (first && isTT(active) && !muted && !blocked) ttPost('unMute');
      badge(active, blocked && !muted ? NOSOUND : '');
    } else if (st === 2 && !played && !userPaused && !blocked && !muted && !document.hidden && Date.now() - began < 6000) {
      // Stopped before it ever played, with nobody touching it: the browser refused sound. Carry on silently.
      quiet(active);
    } else if (st === 0 && !isTT(active)) {
      // Loop like every short-video app does. (TikTok loops by itself.)
      try { p.seekTo(0, true); p.playVideo(); } catch (e) { /* player gone */ }
    }
  }

  // Places the screen exactly over a slide's video box.
  function place(s) {
    s = s || active;
    const box = s && s.querySelector('.vbox');
    if (!box) return;
    screen.style.top = (s.offsetTop + box.offsetTop) + 'px';
    screen.style.left = box.offsetLeft + 'px';
    screen.style.width = box.offsetWidth + 'px';
    screen.style.height = box.offsetHeight + 'px';
  }

  // True once more than half of the player is on screen.
  function seen() {
    const f = feed.getBoundingClientRect(), r = screen.getBoundingClientRect();
    if (!r.width || !r.height) return false;
    const h = Math.min(f.bottom, r.bottom) - Math.max(f.top, r.top), w = Math.min(f.right, r.right) - Math.max(f.left, r.left);
    return h > 0 && w > 0 && (h * w) / (r.width * r.height) > 0.5;
  }

  function start(s) {
    played = false; userPaused = false; state = -1;
    // Browsers only let a video start with sound after the person has touched the page.
    if (!muted && !hooks.gesture()) blocked = true;
    if (hooks.sound) hooks.sound();
    let begin;
    if (isTT(s)) {
      ytPause();
      tt.hidden = false;
      begin = () => { screen.classList.add('live'); ttLoad(TT + '/player/v1/' + s._it.id + '?autoplay=1&loop=1&music_info=0&description=0&rel=0'); };
    } else {
      ttStop();
      if (!ready) return;
      try {
        if (muted || blocked) p.mute(); else p.unMute();
        p.cueVideoById(s._it.id);
      } catch (e) { /* player gone */ }
      begin = () => { try { p.playVideo(); } catch (e) { /* player gone */ } };
    }
    badge(s, blocked && !muted ? NOSOUND : '');
    // Wait until more than half of the player is on screen, then play.
    let tries = 0;
    clearInterval(watchT);
    watchT = setInterval(() => {
      if (active !== s) { clearInterval(watchT); return; }
      if (!seen()) { if (++tries > 75) clearInterval(watchT); return; }
      clearInterval(watchT);
      began = Date.now();
      begin();
      kick = setTimeout(() => {
        if (active !== s || played || state === 1 || state === 3 || userPaused) return;
        quiet(s);
      }, isTT(s) ? 3500 : 2500);
      stuck = setTimeout(() => {
        if (active === s && !played && !userPaused && !document.hidden) hooks.skip(s);
      }, 9000);
    }, 80);
  }

  function stop() {
    clearInterval(watchT); clearTimeout(kick); clearTimeout(stuck);
    screen.classList.remove('live');
  }

  // Called whenever a different slide becomes the current one.
  function focus(s) {
    stop();
    if (active && active !== s) badge(active, '');
    if (s && s._it && (s._it.t === 'yt' || s._it.t === 'tt')) {
      active = s;
      place(s);
      start(s);
    } else {
      active = null;
      ytPause();
      ttStop();
    }
  }

  // The slide is being removed from the feed.
  function drop(s) {
    if (active !== s) return;
    stop();
    active = null;
    ytPause();
    ttStop();
  }

  // Pause or play from the keyboard. Taps on the video itself go straight to YouTube's own controls.
  function tap(s) {
    if (s !== active || (!isTT(s) && !ready)) return;
    if (state === 1 || state === 3) { userPaused = true; pause(s); }
    else { userPaused = false; play(s); }
  }

  function setMuted(m) {
    muted = m;
    blocked = false;
    if (active) { sound(active, !m); badge(active, ''); }
    if (hooks.sound) hooks.sound();
  }

  function hide() {
    if (active && state === 1) { userPaused = true; pause(active); }
  }

  return { init(h) { hooks = h; }, focus, place, tap, drop, setMuted, hide, get muted() { return muted; }, get silent() { return muted || blocked; }, get active() { return active; }, get state() { return state; } };
})();
