/* ===========================================================
   Imposter Challenge — client-side only.
   Routing is hash-based so it works on GitHub Pages.
   Host plans the whole game up front and ships each player a
   self-contained link: #player=NAME&round=N&q=OBFUSCATED
   =========================================================== */

(() => {
  'use strict';

  // ---------- tiny DOM helpers ----------
  const $ = (id) => document.getElementById(id);

  // Screen partials live in screens/*.html and are fetched once, then cached.
  const screenCache = {};
  let currentScreen = null;
  // Per-screen binder — wired after the partial is injected (its DOM is now live).
  const BINDERS = {
    setup: bindSetup,
    links: bindLinks,
    timer: bindTimer,
    vote: bindVote,
    reveal: bindReveal,
    final: bindFinal,
  };

  async function loadScreenHtml(name) {
    if (screenCache[name]) return screenCache[name];
    const res = await fetch('screens/' + name + '.html');
    if (!res.ok) throw new Error('Failed to load screen: ' + name);
    const html = await res.text();
    screenCache[name] = html;
    return html;
  }

  // Inject a screen into #app and bind its events. Idempotent per visit.
  async function show(name) {
    const app = $('app');
    const html = await loadScreenHtml(name);
    app.innerHTML = html;
    currentScreen = name;
    if (BINDERS[name]) BINDERS[name]();
    window.scrollTo(0, 0);
  }
  let toastTimer = null;
  function toast(msg) {
    const t = $('toast');
    t.textContent = msg; t.hidden = false;
    requestAnimationFrame(() => t.classList.add('show'));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      t.classList.remove('show');
      setTimeout(() => { t.hidden = true; }, 250);
    }, 1600);
  }

  // ---------- question obfuscation ----------
  // Not cryptographic — just keeps the question out of plain sight in the URL.
  // Reversible: XOR with a rolling key, then URL-safe base64 of UTF-8 bytes.
  const KEY = 'imp0ster-challenge-saltyy';
  function toBytes(str) { return new TextEncoder().encode(str); }
  function fromBytes(bytes) { return new TextDecoder().decode(bytes); }
  function xorBytes(bytes) {
    const out = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) {
      out[i] = bytes[i] ^ KEY.charCodeAt(i % KEY.length);
    }
    return out;
  }
  function b64urlEncode(bytes) {
    let bin = '';
    bytes.forEach((b) => { bin += String.fromCharCode(b); });
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function b64urlDecode(str) {
    str = str.replace(/-/g, '+').replace(/_/g, '/');
    while (str.length % 4) str += '=';
    const bin = atob(str);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }
  function encodeQuestion(text) { return b64urlEncode(xorBytes(toBytes(text))); }
  function decodeQuestion(enc) {
    try { return fromBytes(xorBytes(b64urlDecode(enc))); }
    catch (e) { return null; }
  }

  // ---------- persistence (host game state survives refresh) ----------
  const SAVE_KEY = 'imposter-game-v1';
  function saveGame() {
    if (!game) return;
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(game)); } catch (e) {}
  }
  function loadGame() {
    try { const raw = localStorage.getItem(SAVE_KEY); return raw ? JSON.parse(raw) : null; }
    catch (e) { return null; }
  }
  function clearGame() {
    try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
  }

  // ---------- state ----------
  let QUESTIONS = null;
  let game = null; // active host game
  const setup = {
    players: [],
    vibe: 'icebreaker',
    rounds: 3,
    timer: 90,
    allowRepeat: false,
  };
  const TIMER_STEPS = [30, 45, 60, 90, 120, 180, 240, 300];

  // ===========================================================
  //  PLAYER ROUTE — if the hash names a player, show only that.
  // ===========================================================
  function parseHash() {
    const h = window.location.hash.replace(/^#/, '');
    if (!h) return null;
    const params = new URLSearchParams(h);
    if (!params.has('player')) return null;
    return {
      player: params.get('player'),
      round: params.get('round'),
      q: params.get('q'),
    };
  }

  async function renderPlayer(info) {
    const q = info.q ? decodeQuestion(info.q) : null;
    if (!info.player || !q) { await show('error'); return; }
    await show('player');
    $('player-name').textContent = info.player;
    $('player-round').textContent = info.round || '1';
    $('player-question').textContent = q;
  }

  // ===========================================================
  //  HOST: SETUP SCREEN
  // ===========================================================
  function renderPlayers() {
    const list = $('player-list');
    list.innerHTML = '';
    setup.players.forEach((name, i) => {
      const chip = document.createElement('div');
      chip.className = 'player-chip';
      const span = document.createElement('span');
      span.textContent = name;
      const x = document.createElement('button');
      x.className = 'x'; x.type = 'button'; x.textContent = '×';
      x.setAttribute('aria-label', 'Remove ' + name);
      x.addEventListener('click', () => { setup.players.splice(i, 1); renderPlayers(); });
      chip.appendChild(span); chip.appendChild(x);
      list.appendChild(chip);
    });
  }

  function addPlayer() {
    const input = $('player-input');
    const name = input.value.trim();
    if (!name) return;
    if (setup.players.some((p) => p.toLowerCase() === name.toLowerCase())) {
      toast('That name is already in'); return;
    }
    if (setup.players.length >= 12) { toast('12 players max'); return; }
    setup.players.push(name);
    input.value = '';
    renderPlayers();
    input.focus();
  }

  function renderVibes() {
    const grid = $('vibe-grid');
    grid.innerHTML = '';
    QUESTIONS.meta.vibes.forEach((key) => {
      const v = QUESTIONS.vibes[key];
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'vibe' + (setup.vibe === key ? ' sel' : '');
      btn.innerHTML =
        `<div class="v-emoji">${v.emoji}</div>` +
        `<div class="v-label">${v.label}</div>` +
        `<div class="v-blurb">${v.blurb}</div>`;
      btn.addEventListener('click', () => { setup.vibe = key; renderVibes(); });
      grid.appendChild(btn);
    });
  }

  function renderSettings() {
    $('rounds-val').textContent = setup.rounds;
    $('timer-val').textContent = setup.timer + 's';
    const tog = $('toggle-repeat');
    tog.setAttribute('aria-pressed', String(setup.allowRepeat));
  }

  function bindSetup() {
    $('btn-add-player').addEventListener('click', addPlayer);
    $('player-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') addPlayer(); });

    document.querySelectorAll('.step').forEach((b) => {
      b.addEventListener('click', () => {
        const dir = parseInt(b.dataset.dir, 10);
        if (b.dataset.step === 'rounds') {
          setup.rounds = Math.max(1, Math.min(20, setup.rounds + dir));
        } else {
          const idx = TIMER_STEPS.indexOf(setup.timer);
          const ni = Math.max(0, Math.min(TIMER_STEPS.length - 1, idx + dir));
          setup.timer = TIMER_STEPS[ni];
        }
        renderSettings();
      });
    });

    $('toggle-repeat').addEventListener('click', () => {
      setup.allowRepeat = !setup.allowRepeat;
      renderSettings();
    });

    $('btn-start').addEventListener('click', startGame);

    // Populate the freshly-injected setup screen from current state.
    renderPlayers();
    renderVibes();
    renderSettings();
  }

  // ===========================================================
  //  HOST: BUILD THE GAME PLAN
  // ===========================================================
  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function startGame() {
    const err = $('setup-error');
    err.textContent = '';
    if (setup.players.length < 3) {
      err.textContent = 'Add at least 3 players.'; return;
    }
    const pool = QUESTIONS.vibes[setup.vibe].questions;
    if (setup.rounds > pool.length) {
      err.textContent = `Only ${pool.length} questions in ${QUESTIONS.vibes[setup.vibe].label}. Lower the round count.`;
      return;
    }

    // Pick distinct questions (no duplicates within the game).
    const chosenQs = shuffle(pool).slice(0, setup.rounds);

    // Assign an imposter per round, honoring the repeat toggle.
    const imposters = [];
    let prev = null;
    for (let r = 0; r < setup.rounds; r++) {
      let candidates = setup.players;
      if (!setup.allowRepeat && setup.players.length > 1 && prev !== null) {
        candidates = setup.players.filter((p) => p !== prev);
      }
      const imp = candidates[Math.floor(Math.random() * candidates.length)];
      imposters.push(imp);
      prev = imp;
    }

    game = {
      players: setup.players.slice(),
      vibe: setup.vibe,
      timer: setup.timer,
      allowRepeat: setup.allowRepeat,
      totalRounds: setup.rounds,
      current: 0, // 0-based round index
      rounds: chosenQs.map((q, i) => ({
        real: q.real,
        imposter: q.imposter,
        imp: imposters[i],
        votedFor: null,
        resolved: false,
      })),
      scores: Object.fromEntries(setup.players.map((p) => [p, 0])),
      phase: 'links', // links | timer | vote | reveal | final
    };
    saveGame();
    goToPhase('links');
  }

  // ===========================================================
  //  HOST: PHASE ROUTER
  // ===========================================================
  async function goToPhase(phase) {
    game.phase = phase;
    saveGame();
    await show(phase); // inject + bind the screen, THEN populate it
    if (phase === 'links') renderLinks();
    else if (phase === 'timer') renderTimer();
    else if (phase === 'vote') renderVote();
    else if (phase === 'reveal') renderReveal();
    else if (phase === 'final') renderFinal();
  }

  function baseUrl() {
    // Strip any existing hash/query so player links are clean.
    return window.location.origin + window.location.pathname;
  }

  function playerLink(name, roundNum, questionText) {
    const params = new URLSearchParams();
    params.set('player', name);
    params.set('round', String(roundNum));
    params.set('q', encodeQuestion(questionText));
    return baseUrl() + '#' + params.toString();
  }

  // ---------- LINKS ----------
  function renderLinks() {
    const round = game.rounds[game.current];
    $('links-round').textContent = game.current + 1;
    const list = $('links-list');
    list.innerHTML = '';

    game.players.forEach((name) => {
      const isImp = name === round.imp;
      const qText = isImp ? round.imposter : round.real;
      const url = playerLink(name, game.current + 1, qText);

      const item = document.createElement('div');
      item.className = 'link-item';
      const head = document.createElement('div');
      head.className = 'li-head';
      head.innerHTML = `<span class="li-name">${escapeHtml(name)}</span>`;
      const urlEl = document.createElement('div');
      urlEl.className = 'li-url';
      urlEl.textContent = url;
      const actions = document.createElement('div');
      actions.className = 'li-actions';

      const copyBtn = document.createElement('button');
      copyBtn.className = 'btn btn-ghost btn-copy';
      copyBtn.type = 'button';
      copyBtn.textContent = 'Copy link';
      copyBtn.addEventListener('click', () => {
        copyText(url).then(() => {
          copyBtn.textContent = 'Copied!';
          copyBtn.classList.add('copied');
          setTimeout(() => { copyBtn.textContent = 'Copy link'; copyBtn.classList.remove('copied'); }, 1400);
        });
      });

      const shareBtn = document.createElement('button');
      shareBtn.className = 'btn btn-ghost';
      shareBtn.type = 'button';
      shareBtn.textContent = 'Share';
      shareBtn.addEventListener('click', () => {
        if (navigator.share) {
          navigator.share({ title: 'Imposter Challenge', text: `${name}, here's your question:`, url })
            .catch(() => {});
        } else {
          copyText(url).then(() => toast('Link copied — paste it to ' + name));
        }
      });

      actions.appendChild(copyBtn);
      actions.appendChild(shareBtn);
      item.appendChild(head);
      item.appendChild(urlEl);
      item.appendChild(actions);
      list.appendChild(item);
    });
  }

  function bindLinks() {
    $('btn-copy-all').addEventListener('click', () => {
      const round = game.rounds[game.current];
      const lines = game.players.map((name) => {
        const isImp = name === round.imp;
        const qText = isImp ? round.imposter : round.real;
        return `${name}: ${playerLink(name, game.current + 1, qText)}`;
      });
      copyText(lines.join('\n')).then(() => toast('All links copied'));
    });
    $('btn-links-done').addEventListener('click', () => goToPhase('timer'));
  }

  // ---------- TIMER ----------
  let timerState = null;
  function renderTimer() {
    $('timer-round').textContent = game.current + 1;
    stopTimer();
    timerState = { remaining: game.timer, total: game.timer, running: true, raf: null };
    $('btn-timer-toggle').textContent = 'Pause';
    updateTimerUI();
    tickLoop();
  }
  function updateTimerUI() {
    const ring = $('timer-ring');
    const disp = $('timer-display');
    disp.textContent = Math.ceil(timerState.remaining);
    const pct = Math.max(0, (timerState.remaining / timerState.total) * 100);
    ring.style.setProperty('--pct', pct + '%');
    const low = timerState.remaining <= 10;
    ring.classList.toggle('low', low);
    ring.classList.toggle('pulsing', low && timerState.running);
    if (low) {
      ring.style.background =
        'radial-gradient(closest-side, var(--bg) 79%, transparent 80%),' +
        'conic-gradient(var(--bad) ' + pct + '%, var(--line) 0)';
    } else {
      ring.style.background =
        'radial-gradient(closest-side, var(--bg) 79%, transparent 80%),' +
        'conic-gradient(var(--accent) ' + pct + '%, var(--line) 0)';
    }
  }
  let lastTs = null;
  function tickLoop() {
    lastTs = null;
    function frame(ts) {
      if (!timerState || !timerState.running) return;
      if (lastTs != null) {
        timerState.remaining -= (ts - lastTs) / 1000;
        if (timerState.remaining <= 0) {
          timerState.remaining = 0;
          updateTimerUI();
          timerState.running = false;
          toast("Time's up!");
          return;
        }
      }
      lastTs = ts;
      updateTimerUI();
      timerState.raf = requestAnimationFrame(frame);
    }
    timerState.raf = requestAnimationFrame(frame);
  }
  function stopTimer() {
    if (timerState && timerState.raf) cancelAnimationFrame(timerState.raf);
  }
  function bindTimer() {
    $('btn-timer-toggle').addEventListener('click', () => {
      if (!timerState) return;
      if (timerState.remaining <= 0) return;
      timerState.running = !timerState.running;
      $('btn-timer-toggle').textContent = timerState.running ? 'Pause' : 'Resume';
      if (timerState.running) tickLoop(); else stopTimer();
      updateTimerUI();
    });
    $('btn-timer-reset').addEventListener('click', () => {
      if (!timerState) return;
      stopTimer();
      timerState.remaining = timerState.total;
      timerState.running = true;
      $('btn-timer-toggle').textContent = 'Pause';
      updateTimerUI();
      tickLoop();
    });
    $('btn-to-vote').addEventListener('click', () => { stopTimer(); goToPhase('vote'); });
  }

  // ---------- VOTE ----------
  let voteChoice = null;
  function renderVote() {
    voteChoice = null;
    $('vote-error').textContent = '';
    const list = $('vote-list');
    list.innerHTML = '';
    game.players.forEach((name) => {
      const opt = document.createElement('button');
      opt.className = 'vote-opt';
      opt.type = 'button';
      opt.innerHTML = `<span>${escapeHtml(name)}</span><span class="tick">✓</span>`;
      opt.addEventListener('click', () => {
        voteChoice = name;
        list.querySelectorAll('.vote-opt').forEach((o) => o.classList.remove('sel'));
        opt.classList.add('sel');
      });
      list.appendChild(opt);
    });
  }
  function bindVote() {
    $('btn-reveal').addEventListener('click', () => {
      if (!voteChoice) { $('vote-error').textContent = 'Tap who the group voted for.'; return; }
      const round = game.rounds[game.current];
      round.votedFor = voteChoice;
      // Scoring: group catches imposter -> nobody scores the point here (group win).
      // Imposter escapes -> imposter gets a point.
      round.caught = voteChoice === round.imp;
      if (!round.caught) game.scores[round.imp] += 1;
      round.resolved = true;
      saveGame();
      goToPhase('reveal');
    });
  }

  // ---------- REVEAL ----------
  function renderReveal() {
    const round = game.rounds[game.current];
    const verdict = $('reveal-verdict');
    if (round.caught) {
      verdict.textContent = '🎯 Imposter caught!';
      verdict.className = 'reveal-verdict caught';
    } else {
      verdict.textContent = '🕵️ Imposter escaped! +1';
      verdict.className = 'reveal-verdict escaped';
    }
    $('reveal-imposter').textContent = round.imp;
    $('reveal-voted').textContent = round.votedFor;
    $('reveal-q-real').textContent = round.real;
    $('reveal-q-imp').textContent = round.imposter;
    renderScoreboard($('reveal-scoreboard'));

    const last = game.current >= game.totalRounds - 1;
    $('btn-next-round').textContent = last ? 'See Final Scores' : 'Next Round';
  }
  function bindReveal() {
    $('btn-next-round').addEventListener('click', () => {
      if (game.current >= game.totalRounds - 1) {
        goToPhase('final');
      } else {
        game.current += 1;
        goToPhase('links');
      }
    });
  }

  // ---------- SCOREBOARD ----------
  function sortedScores() {
    return Object.entries(game.scores)
      .map(([name, pts]) => ({ name, pts }))
      .sort((a, b) => b.pts - a.pts || a.name.localeCompare(b.name));
  }
  function renderScoreboard(container) {
    const rows = sortedScores();
    const top = rows.length ? rows[0].pts : 0;
    container.innerHTML = '';
    rows.forEach((r) => {
      const row = document.createElement('div');
      row.className = 'score-row' + (r.pts === top && top > 0 ? ' lead' : '');
      row.innerHTML = `<span class="s-name">${escapeHtml(r.name)}</span><span class="s-pts">${r.pts} pt${r.pts === 1 ? '' : 's'}</span>`;
      container.appendChild(row);
    });
  }

  // ---------- FINAL ----------
  function renderFinal() {
    const rows = sortedScores();
    const medals = ['🥇', '🥈', '🥉'];
    const podium = $('final-podium');
    podium.innerHTML = '';
    // Podium order visually: 2nd, 1st, 3rd
    const order = [1, 0, 2];
    order.forEach((idx) => {
      if (!rows[idx]) return;
      const r = rows[idx];
      const pod = document.createElement('div');
      pod.className = 'pod pod-' + (idx + 1);
      pod.innerHTML =
        `<div class="p-medal">${medals[idx] || ''}</div>` +
        `<div class="p-name">${escapeHtml(r.name)}</div>` +
        `<div class="p-pts">${r.pts} pt${r.pts === 1 ? '' : 's'}</div>`;
      podium.appendChild(pod);
    });

    const top = rows[0];
    const tagline = $('final-tagline');
    if (top && top.pts === 0) {
      tagline.textContent = 'Nobody fooled anyone. Honest crew. Suspicious.';
    } else if (top) {
      tagline.textContent = `${top.name} is the master of deception. 🃏`;
    }
    renderScoreboard($('final-scoreboard'));
  }
  function bindFinal() {
    $('btn-play-again').addEventListener('click', () => {
      // Keep the same players/vibe/settings, replan a fresh game.
      setup.players = game.players.slice();
      setup.vibe = game.vibe;
      setup.timer = game.timer;
      setup.allowRepeat = game.allowRepeat;
      setup.rounds = game.totalRounds;
      startGame();
    });
    $('btn-new-game').addEventListener('click', () => {
      clearGame();
      game = null;
      show('setup');
    });
  }

  // ---------- utils ----------
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }
  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
    }
    return fallbackCopy(text);
  }
  function fallbackCopy(text) {
    return new Promise((resolve) => {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.focus(); ta.select();
      try { document.execCommand('copy'); } catch (e) {}
      document.body.removeChild(ta);
      resolve();
    });
  }

  // ===========================================================
  //  BOOT
  // ===========================================================
  function resumePhase() {
    // Returning host with a saved in-progress game.
    if (!game) return false;
    if (game.phase === 'final') { goToPhase('final'); return true; }
    if (['links', 'timer', 'vote', 'reveal'].includes(game.phase)) {
      // Re-entering timer mid-game just restarts the timer; safe default.
      goToPhase(game.phase === 'timer' ? 'links' : game.phase);
      return true;
    }
    return false;
  }

  function boot() {
    // 1) Player link? That takes absolute priority and shows nothing else.
    const info = parseHash();
    if (info) { renderPlayer(info); return; }

    // 2) Host. Each screen binds itself when injected by show(), so just
    //    resume an in-progress game or open setup.
    game = loadGame();
    if (game && resumePhase()) return;
    show('setup');
  }

  // React if the hash changes while open (e.g. host pastes a player link).
  window.addEventListener('hashchange', () => {
    const info = parseHash();
    if (info) renderPlayer(info);
  });

  fetch('questions.json')
    .then((r) => r.json())
    .then((data) => { QUESTIONS = data; boot(); })
    .catch(() => {
      document.body.innerHTML =
        '<div style="padding:40px;text-align:center;color:#fff;font-family:sans-serif">' +
        "Couldn't load questions.json. If you're opening this as a file, run it from a local server or GitHub Pages.</div>";
    });
})();
