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
    document.documentElement.style.fontSize = `${st.textSize * 100}%`;
    PI.fx.Sound.setVolume();
    if (PI.fx.Sound.ctx || !st.ambience) PI.fx.Sound.setAmbience(st.ambience && st.sound);
    if (PI.fx.Sound.ctx) { PI.fx.Music.set(st.music); PI.fx.Music.setVolume(); }   // before the first click, audio isn't allowed yet
    $("optSound").checked = st.sound;
    $("optMusic").checked = st.music;
    $("optMusicVolume").value = st.musicVolume;
    $("optVolume").value = st.volume;
    $("optAmbience").checked = st.ambience;
    $("optShake").value = st.shake;
    $("optReduceMotion").checked = st.reduceMotion;
    $("optParticles").checked = st.particles;
    $("optScientific").checked = st.scientific;
    $("optTextSize").value = String(st.textSize);
    PI.fx.Particles.start();
  }

  function bindSettings() {
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
    bind("optScientific", "scientific", el => el.checked, () => ui().refreshStructure());
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

  // ---------- Hotkeys (ignored while typing or when a dialog is open) ----------
  function bindHotkeys() {
    const TABS = ["colony", "workshop", "heritage", "home", "achievements", "stats"];
    document.addEventListener("keydown", e => {
      if (e.ctrlKey || e.metaKey || e.altKey || ui().modalOpen) return;
      if (e.target.closest("input, textarea, select")) return;
      const k = e.key.toLowerCase();
      if (/^[1-6]$/.test(k)) { ui().selectTab(TABS[Number(k) - 1], true); e.preventDefault(); }
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

  function welcomeHome(offline) {
    if (welcomeModal && document.contains(welcomeModal.wrap)) welcomeModal.cancel();   // after several sleeps, show only the latest
    welcomeModal = ui().openModal({
      title: "Welcome home!",
      body: `<p>You were away for <b>${PI.fmtTime(offline.away)}</b>. The colony kept the fire going and fished at ${Math.round(offline.eff * 100)}% pace,
             catching <b>🐟 ${fmt(offline.earned)}</b>.</p>
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
    const unlockAudio = () => {
      if (S().settings.sound && S().settings.ambience) PI.fx.Sound.setAmbience(true);
      else if (PI.fx.Sound.ctx) PI.fx.Sound.ensure();
      if (S().settings.music) PI.fx.Music.start();
      document.removeEventListener("pointerdown", unlockAudio);
      document.removeEventListener("keydown", unlockAudio);
    };
    document.addEventListener("pointerdown", unlockAudio);
    document.addEventListener("keydown", unlockAudio);

    // Every screen opens with something focused; focusVisible:false hides the ring until the keyboard is used
    $("bigPenguin").focus({ preventScroll: true, focusVisible: false });

    if (loadProblem) ui().openModal({ title: loadProblem.title, body: loadProblem.body, actions: [{ label: "Okay", primary: true, cancel: true }] });
    if (offline) welcomeHome(offline);

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
  };

  init();
})(window.PI = window.PI || {});
