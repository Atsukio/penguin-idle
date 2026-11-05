/* Penguin Idle — startup, game loop, settings, hotkeys and the offline app (service worker). */
(function (PI) {
  "use strict";

  const E = PI.engine, ui = () => PI.ui, fmt = PI.fmt;
  const S = () => E.state;
  const $ = id => document.getElementById(id);

  // ---------- Settings ----------
  function applySettings() {
    const st = S().settings;
    PI.fmtOptions.scientific = st.scientific;
    document.documentElement.classList.toggle("reduce-motion", st.reduceMotion);
    document.documentElement.classList.toggle("cozy-cursor", st.cozyCursor);
    $("optCursor").checked = st.cozyCursor;
    document.documentElement.style.fontSize = `${st.textSize * 100}%`;
    PI.fx.Sound.setVolume();
    if (PI.fx.Sound.ctx || !st.ambience) PI.fx.Sound.setAmbience(st.ambience && st.sound);
    if (PI.fx.Sound.ctx) { PI.fx.Music.set(st.music); PI.fx.Music.setVolume(); }   // before the first click, audio isn't allowed yet
    $("optSound").checked = st.sound;
    $("optMusic").checked = st.music;
    updateMusicBtn();
    $("optMusicVolume").value = st.musicVolume;
    $("optVolume").value = st.volume;
    $("optAmbience").checked = st.ambience;
    $("optShake").value = st.shake;
    $("optReduceMotion").checked = st.reduceMotion;
    $("optParticles").checked = st.particles;
    $("optScientific").checked = st.scientific;
    $("optHoldToPat").checked = st.holdToPat;
    $("optTextSize").value = String(st.textSize);
    PI.fx.Particles.start();
  }

  // The 🎵 button in the top bar (and Shift+M): one tap to mute or unmute the music
  function updateMusicBtn() {
    const on = S().settings.music, btn = $("musicBtn");
    btn.setAttribute("aria-pressed", String(on));
    btn.classList.toggle("off", !on);
    btn.title = on ? `Now playing: ${PI.fx.Music.label()} lofi. Click to mute (Shift+M).` : "Music is off. Click to play some lofi (Shift+M).";
  }
  function toggleMusic() {
    // Before the first click the music is "on" but browsers haven't let it play yet: a press starts it rather than muting
    const canPlay = !!PI.fx.Sound.ensure();
    if (!(S().settings.music && !PI.fx.Music.on && canPlay)) S().settings.music = !S().settings.music;
    applySettings();
    ui().toast(S().settings.music ? `🎵 Music on: ${PI.fx.Music.label()} lofi.` : "🔇 Music off.");
  }

  function bindSettings() {
    $("musicBtn").addEventListener("click", toggleMusic);
    PI.bus.on("musicMood", updateMusicBtn);
    const bind = (id, key, read, after) => $(id).addEventListener($(id).type === "range" ? "input" : "change", e => {
      S().settings[key] = read(e.target);
      applySettings();
      if (after) after();
    });
    bind("optSound", "sound", el => el.checked, () => PI.fx.Sound.play("tick"));
    bind("optVolume", "volume", el => Number(el.value));
    $("optVolume").addEventListener("change", () => PI.fx.Sound.play("pop"));
    bind("optAmbience", "ambience", el => el.checked, () => PI.fx.Sound.setAmbience(S().settings.ambience && S().settings.sound));
    bind("optMusic", "music", el => el.checked, () => { PI.fx.Sound.ensure(); PI.fx.Music.set(S().settings.music); });
    bind("optMusicVolume", "musicVolume", el => Number(el.value));
    bind("optShake", "shake", el => Number(el.value));
    $("optShake").addEventListener("change", () => PI.fx.Shake.add(0.5));   // preview the chosen strength
    bind("optReduceMotion", "reduceMotion", el => el.checked, () => ui().refreshStructure());
    bind("optParticles", "particles", el => el.checked);
    bind("optCursor", "cozyCursor", el => el.checked);
    bind("optScientific", "scientific", el => el.checked, () => ui().refreshStructure());
    bind("optHoldToPat", "holdToPat", el => el.checked);
    $("whatsNewBtn").addEventListener("click", openWhatsNew);
    $("moveBtn").addEventListener("click", openMove);
    bind("optTextSize", "textSize", el => Number(el.value));
  }

  // ---------- Save controls ----------
  function bindSaves() {
    $("saveBtn").addEventListener("click", () => {
      if (E.savingBlocked) { ui().toast("⚠️ Saving is paused because the stored save is from a newer version. Refresh the page."); return; }
      E.save(); ui().toast("💾 Saved. Your colony is tucked in.");
    });
    $("exportBtn").addEventListener("click", () => {
      const ta = $("saveText");
      ta.classList.remove("hidden");
      ta.value = E.encodeSave();
      ta.select();
      if (navigator.clipboard) navigator.clipboard.writeText(ta.value).then(() => ui().toast("📋 Save copied to clipboard."), () => {});
    });
    $("downloadBtn").addEventListener("click", () => {
      const blob = new Blob([E.encodeSave()], { type: "text/plain" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `penguin-idle-${E.dayKey()}.txt`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    });
    $("importBtn").addEventListener("click", () => {
      const ta = $("saveText");
      if (ta.classList.contains("hidden") || !ta.value.trim()) {
        ta.classList.remove("hidden");
        ta.value = "";
        ta.placeholder = "Paste your save here, then press Import save again.";
        ta.focus();
        return;
      }
      try {
        E.replaceState(E.decodeSave(ta.value));
        applySettings();
        ta.value = "";
        ta.classList.add("hidden");
        ui().toast("✅ Save imported. Welcome back!");
      } catch (e) {
        ui().toast(`❌ ${e.message || "That save couldn't be read."}`);
      }
    });
    $("resetBtn").addEventListener("click", () => ui().openModal({
      title: "Start over completely?",
      body: "<p>This wipes <b>everything</b>, including feathers, heirlooms, helpers and memories. It can't be undone.</p>",
      danger: true,
      actions: [
        { label: "Keep my colony", cancel: true },
        { label: "Wipe everything", danger: true, onClick: () => { const keep = S().settings; const s = E.freshState(); s.settings = keep; E.replaceState(s); E.ensureLetters(); } },
      ],
    }));
  }

  // ---------- What's new ----------
  const esc = t => String(t).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const fmtDate = iso => new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
  // Entries newer than the one last seen ("" = played before What's new existed, so only the latest counts as new)
  function isNew(c, seen) {
    const list = PI.data.CHANGELOG, at = list.findIndex(x => x.version === seen), i = list.indexOf(c);
    return at < 0 ? i === 0 && seen !== PI.data.GAME_VERSION : i < at;
  }
  function openWhatsNew() {
    const seen = S().seenVersion;
    const entry = (c, open) => `<details class="news"${open ? " open" : ""}>
        <summary><b>${esc(c.version)}</b> · ${esc(c.title)} <small class="muted">${fmtDate(c.date)}</small>${isNew(c, seen) ? ' <span class="pill">New</span>' : ""}</summary>
        <ul>${c.notes.map(n => `<li>${esc(n)}</li>`).join("")}</ul></details>`;
    ui().openModal({
      title: "What's new",
      body: `<div class="news-list">${PI.data.CHANGELOG.map((c, i) => entry(c, i === 0 || isNew(c, seen))).join("")}</div>`,
      actions: [{ label: "Lovely!", primary: true, cancel: true }],
    });
    S().seenVersion = PI.data.GAME_VERSION;
    ui().updateBadges();
    E.save();
  }
  // After an update: a gentle toast (not a dialog), and the big penguin mentions it
  function announceNews() {
    if (S().seenVersion === PI.data.GAME_VERSION) return;
    const c = PI.data.CHANGELOG[0];
    setTimeout(() => {
      ui().toast(`✨ <b>The colony has news!</b> Version ${esc(c.version)}: ${esc(c.title)}. <button class="btn small" id="newsToastBtn">See what's new</button>`);
      const b = $("newsToastBtn");
      if (b) b.addEventListener("click", openWhatsNew);
      setTimeout(() => PI.penguin.say(`Psst! ${c.title}! Have a peek at What's new in Settings.`), 2500);
    }, 1500);
  }

  // ---------- Moving to another device: a link (and QR code) that carries a copy of the save ----------
  const b64url = bytes => { let s = ""; bytes.forEach(b => { s += String.fromCharCode(b); }); return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); };
  const fromB64url = str => Uint8Array.from(atob(str.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));
  const pipe = async (bytes, stream) => new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());
  async function packMove(json) {
    const raw = new TextEncoder().encode(json);
    if (typeof CompressionStream === "undefined") return "j" + b64url(raw);
    return "z" + b64url(await pipe(raw, new CompressionStream("deflate-raw")));
  }
  async function unpackMove(code) {
    const bytes = fromB64url(code.slice(1));
    const raw = code[0] === "z" ? await pipe(bytes, new DecompressionStream("deflate-raw")) : bytes;
    return new TextDecoder().decode(raw);
  }
  const pageUrl = () => location.href.split("#")[0];

  async function openMove() {
    let link;
    try { link = `${pageUrl()}#move=${await packMove(E.transferJSON())}`; }
    catch (e) { ui().toast("❌ Couldn't make a link on this browser. Try Export save instead."); return; }
    const qr = PI.qr.svg(link);
    ui().openModal({
      title: "Move to another device",
      body: `${qr ? `<div class="move-qr" role="img" aria-label="QR code for the link">${qr}</div>
             <p>Scan this with your other device's camera, or send yourself the link.</p>`
             : "<p>Send yourself this link and open it on your other device. (Your colony has grown too big for a QR code.)</p>"}
             <label class="visually-hidden" for="moveLink">Link</label>
             <input id="moveLink" class="move-link" type="text" readonly value="${esc(link)}">
             <p class="muted">The link carries a <b>copy</b> of your colony as it is right now. This browser keeps its own, and opening the link asks before replacing anything.
             Anyone with the link can load the copy, so only send it to yourself.</p>`,
      actions: [
        ...(navigator.share ? [{ label: "Share…", onClick: () => navigator.share({ title: "My Penguin Idle colony", url: link }).catch(() => {}) }] : []),
        { label: "Copy link", onClick: () => {
          if (navigator.clipboard) navigator.clipboard.writeText(link).then(() => ui().toast("📋 Link copied."), () => ui().toast("Select the link and copy it."));
        } },
        { label: "Done", primary: true, cancel: true },
      ],
      onOpen: wrap => { const i = wrap.querySelector("#moveLink"); i.addEventListener("focus", () => i.select()); },
    });
  }

  // Opening a move link: show what's in it and ask before replacing this browser's colony
  async function checkMoveLink() {
    const m = location.hash.match(/^#move=([jz][A-Za-z0-9_-]+)$/);
    if (!m) return;
    history.replaceState(null, "", pageUrl());   // a refresh shouldn't ask again
    let incoming;
    try { incoming = E.fromTransferJSON(await unpackMove(m[1])); }
    catch (e) {
      ui().openModal({ title: "That link didn't work", body: `<p>${esc(e && e.kind ? e.message : "The colony in this link couldn't be read. It may have been cut short when it was copied.")}</p>`, actions: [{ label: "Okay", primary: true, cancel: true }] });
      return;
    }
    const sum = s => `🐟 ${fmt(s.fish)} fish · 🪶 ${fmt(s.feathersEarned)} feathers · ${s.achievements.length} memories · ${fmt(s.migrations)} migration${s.migrations === 1 ? "" : "s"}`;
    ui().openModal({
      title: "Bring this colony here?",
      danger: true,
      body: `<p><b>From the link:</b><br>${sum(incoming)}</p><p><b>In this browser now:</b><br>${sum(S())}</p>
             <p class="muted">Bringing it here replaces the colony in this browser.</p>`,
      actions: [
        { label: "Keep the one here", cancel: true },
        { label: "Bring it here", primary: true, onClick: () => {
          incoming.settings = S().settings;   // keep this device's sound and display settings
          E.replaceState(incoming);
          applySettings();
          ui().toast("🐧 Your colony has arrived. Welcome back!");
        } },
      ],
    });
  }

  // ---------- Hotkeys (ignored while typing or when a dialog is open) ----------
  function bindHotkeys() {
    const TABS = ["colony", "workshop", "heritage", "home", "achievements", "stats"];
    document.addEventListener("keydown", e => {
      if (e.ctrlKey || e.metaKey || e.altKey || ui().modalOpen) return;
      if (e.target.closest("input, textarea, select")) return;
      const k = e.key.toLowerCase();
      if (k === "m" && e.shiftKey) { toggleMusic(); e.preventDefault(); }
      else if (/^[1-6]$/.test(k)) { ui().selectTab(TABS[Number(k) - 1], true); e.preventDefault(); }
      else if (k === "b") { E.buyAllUpgrades(); e.preventDefault(); }
      else if (k === "m") { ui().cycleBuyAmount(); e.preventDefault(); }
      else if (k === "p") { $("bigPenguin").focus(); e.preventDefault(); }
    });
  }

  // ---------- Offline app ----------
  let installPrompt = null;
  function setupPWA() {
    window.addEventListener("beforeinstallprompt", e => {
      e.preventDefault();
      installPrompt = e;
      $("installRow").classList.remove("hidden");
    });
    $("installBtn").addEventListener("click", async () => {
      if (!installPrompt) return;
      installPrompt.prompt();
      await installPrompt.userChoice.catch(() => null);
      installPrompt = null;
      $("installRow").classList.add("hidden");
    });
    if (!("serviceWorker" in navigator) || !/^https?:$/.test(location.protocol)) return;   // not available from file://
    navigator.serviceWorker.register("sw.js").then(reg => {
      reg.addEventListener("updatefound", () => {
        const w = reg.installing;
        w && w.addEventListener("statechange", () => {
          if (w.state === "installed" && navigator.serviceWorker.controller) {
            ui().toast('✨ A new version of Penguin Idle is ready. <button class="btn small" id="reloadBtn">Refresh</button>');
            setTimeout(() => { const b = $("reloadBtn"); if (b) b.addEventListener("click", () => { E.save(); location.reload(); }); }, 0);
          }
        });
      });
    }).catch(() => {});
  }

  // ---------- Loop ----------
  let lastFrame = performance.now(), uiTimer = 0, slowTimer = 0, saveTimer = 0, minuteTimer = 0;
  let nextGolden = 0;

  // Real time passed since the last tick. Browsers run hidden tabs' timers only about once a minute, and
  // nothing runs at all while the computer sleeps or the browser freezes the tab. A short gap is a throttled
  // background tab, so it counts at full rate. A long one means the game wasn't running, so it counts as
  // time away and gets offline rewards with a welcome-home note.
  const ASLEEP_AFTER = 120;   // seconds
  function catchUp() {
    const away = (Date.now() - S().lastTick) / 1000;
    if (away > ASLEEP_AFTER) {
      const offline = E.applyOffline();
      if (offline) welcomeHome(offline);
      E.save();
    } else if (away > 1) {
      E.gain(E.fishPerSecond(false) * away);
      S().lastTick = Date.now();
    }
    lastFrame = performance.now();
  }

  // What the colony friends got up to while you were away, in their own words
  const AWAY_LINES = {
    short: ["kept the fire crackling.", "tidied the fish basket (twice).", "practised waddling in a straight line.", "made everyone a fresh mug of cocoa."],
    night: ["counted the stars until the fish started biting.", "told ghost stories by the fire.", "stayed up to watch the aurora.", "fell asleep holding a fishing rod, and still caught something."],
    long: ["built a snow penguin in your honour.", "knitted a scarf long enough for three.", "taught the chicks a new song.", "kept your favourite spot by the fire warm."],
  };
  const shuffled = list => list.map(x => [Math.random(), x]).sort((a, b) => a[0] - b[0]).map(x => x[1]);
  function awayNews(offline) {
    const named = E.residentNames();
    const friends = shuffled(named.length >= 2 ? named : [...named, ...shuffled(PI.data.LETTER_SENDERS.map(([n]) => n)).slice(0, 2 - named.length)]).slice(0, 2);
    const h = new Date().getHours();
    const kind = offline.away >= 8 * 3600 ? "long" : h >= 21 || h < 6 ? "night" : "short";
    const lines = shuffled(AWAY_LINES[kind]);
    const affordable = E.availableUpgrades().filter(u => E.upgradeCost(u) <= S().fish).length;
    return `<ul class="away-news">${friends.map((n, i) => `<li><b>${esc(n)}</b> ${lines[i]}</li>`).join("")}</ul>
      ${affordable ? `<p>That's enough for <b>${affordable} upgrade${affordable > 1 ? "s" : ""}</b> waiting in the Colony tab.</p>` : ""}`;
  }

  function welcomeHome(offline) {
    if (welcomeModal && document.contains(welcomeModal.wrap)) welcomeModal.cancel();   // after several sleeps, show only the latest
    welcomeModal = ui().openModal({
      title: "Welcome home!",
      body: `<p>You were away for <b>${PI.fmtTime(offline.away)}</b>. The colony kept the fire going and fished at ${Math.round(offline.eff * 100)}% pace,
             catching <b>🐟 ${fmt(offline.earned)}</b>.</p>
             ${awayNews(offline)}
             ${offline.away > offline.cap ? `<p class="muted">Time away counts for up to ${offline.cap / 3600} hours.</p>` : ""}`,
      actions: [{ label: "Cozy!", primary: true, cancel: true,
        onClick: () => setTimeout(() => PI.penguin.say(["Welcome back! We missed you!", "You're home! We saved you some fish.", "There you are! The fire's still warm."][Math.floor(Math.random() * 3)], true), 300) }],
    });
  }
  let welcomeModal = null;

  // Timer-driven (not requestAnimationFrame) so the colony keeps fishing in background tabs
  function frame() {
    if (Date.now() - S().lastTick > 1000) catchUp();
    const now = performance.now();
    const dt = Math.min(5, (now - lastFrame) / 1000);
    lastFrame = now;
    E.tick(dt);
    if (PI.fx.Music.on && PI.fx.Sound.ctx && PI.fx.Sound.ctx.state === "running") S().stats.musicSeconds += dt;
    if (Date.now() >= nextGolden) {
      if (!document.hidden) ui().spawnGolden();
      nextGolden = Date.now() + E.goldenDelay();
    }
    uiTimer += dt; slowTimer += dt; saveTimer += dt; minuteTimer += dt;
    if (uiTimer >= 0.1) { uiTimer = 0; ui().tick(); }
    if (slowTimer >= 1) { slowTimer = 0; E.checkAchievements(); ui().slowTick(); }
    if (minuteTimer >= 60) { minuteTimer = 0; E.recompute(); if (E.ensureLetters()) ui().toast("💌 New penguin letters have arrived!"); }   // seasons and letters follow the date
    if (saveTimer >= 15) { saveTimer = 0; E.save(); }
  }

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) { E.save(); return; }
    catchUp();
  });
  window.addEventListener("beforeunload", () => E.save());

  function init() {
    const params = new URLSearchParams(location.search);
    if (params.has("season")) E.setSeasonOverride(params.get("season") || null);   // e.g. ?season=midwinter to preview an event
    const loadProblem = E.load();
    PI.fmtOptions.scientific = S().settings.scientific;
    const offline = loadProblem && loadProblem.kind === "newer" ? null : E.applyOffline();
    E.ensureLetters();

    PI.fx.init();
    PI.penguin.init();
    ui().init();
    bindSettings();
    applySettings();
    bindSaves();
    bindHotkeys();
    setupPWA();

    // Browsers only allow audio after a user gesture: start ambience on the first interaction
    const unlockAudio = e => {
      if (S().settings.sound && S().settings.ambience) PI.fx.Sound.setAmbience(true);
      else if (PI.fx.Sound.ctx) PI.fx.Sound.ensure();
      // A first press of the music button or Shift+M is about the music itself, so leave it to the toggle
      const aboutMusic = (e.target && e.target.closest && e.target.closest("#musicBtn")) || (e.key && e.key.toLowerCase() === "m" && e.shiftKey);
      if (S().settings.music && !aboutMusic) PI.fx.Music.start();
      document.removeEventListener("pointerdown", unlockAudio);
      document.removeEventListener("keydown", unlockAudio);
    };
    document.addEventListener("pointerdown", unlockAudio);
    document.addEventListener("keydown", unlockAudio);

    // Every screen opens with something focused; focusVisible:false hides the ring until the keyboard is used
    $("bigPenguin").focus({ preventScroll: true, focusVisible: false });

    if (loadProblem) ui().openModal({ title: loadProblem.title, body: loadProblem.body, actions: [{ label: "Okay", primary: true, cancel: true }] });
    if (offline) welcomeHome(offline);
    announceNews();
    checkMoveLink();
    window.addEventListener("hashchange", checkMoveLink);

    nextGolden = Date.now() + 60000 + Math.random() * 90000;
    lastFrame = performance.now();
    setInterval(frame, 50);
  }

  // Small debug hook for the browser console and tests
  window.penguinIdle = {
    get state() { return S(); },
    engine: E, data: PI.data, fmt,
    fishPerSecond: () => E.fishPerSecond(),
    spawnGolden: () => ui().spawnGolden(),
    encodeSave: () => E.encodeSave(), decodeSave: str => E.decodeSave(str), save: () => E.save(),
    moveCode: () => packMove(E.transferJSON()),
  };

  init();
})(window.PI = window.PI || {});
