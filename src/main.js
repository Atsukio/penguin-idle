/* Penguin Idle — startup, game loop, settings, hotkeys and the offline app (service worker). */
(function (PI) {
  "use strict";

  const E = PI.engine, ui = () => PI.ui, fmt = PI.fmt;
  const S = () => E.state;
  const $ = id => document.getElementById(id);
  const nap = () => PI.mainNap;
  const dialogs = () => PI.mainDialogs;

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
    if (PI.fx.Sound.ctx) { PI.fx.Music.set(st.music); PI.fx.Music.setVolume(); }
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
    $("optHideDone").checked = !!st.hideDone;
    $("optTextSize").value = String(st.textSize);
    $("optBatterySaver").value = st.batterySaver;
    $("optAutoNap").value = String(st.autoNap);
    $("optBedtime").value = st.bedtime;
    nap().applyPower();
    PI.fx.Particles.start();
  }

  function updateMusicBtn() {
    const on = S().settings.music, btn = $("musicBtn");
    btn.setAttribute("aria-pressed", String(on));
    btn.classList.toggle("off", !on);
    btn.title = on ? `Now playing: ${PI.fx.Music.label()} lofi. Click to mute (Shift+M).` : "Music is off. Click to play some lofi (Shift+M).";
  }

  function toggleMusic() {
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
    $("optShake").addEventListener("change", () => PI.fx.Shake.add(0.5));
    bind("optReduceMotion", "reduceMotion", el => el.checked, () => ui().refreshStructure());
    bind("optParticles", "particles", el => el.checked);
    bind("optCursor", "cozyCursor", el => el.checked);
    bind("optScientific", "scientific", el => el.checked, () => ui().refreshStructure());
    bind("optHoldToPat", "holdToPat", el => el.checked);
    bind("optHideDone", "hideDone", el => el.checked, () => ui().renderTab(true));
    $("whatsNewBtn").addEventListener("click", () => dialogs().openWhatsNew());
    $("moveBtn").addEventListener("click", () => dialogs().openMove());
    bind("optTextSize", "textSize", el => Number(el.value));
    bind("optBatterySaver", "batterySaver", el => el.value);
    bind("optAutoNap", "autoNap", el => Number(el.value));
    bind("optBedtime", "bedtime", el => el.value);
    $("napBtn").addEventListener("click", () => nap().startNap());
    $("napWake").addEventListener("click", () => nap().wake());
    $("napScreen").addEventListener("click", e => { if (e.target !== $("napWake")) $("napWake").focus({ preventScroll: true, focusVisible: false }); });
  }

  // ---------- Hotkeys ----------
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
      else if (k === "z" && !e.shiftKey) { nap().startNap(); e.preventDefault(); }
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
    if (!("serviceWorker" in navigator) || !/^https?:$/.test(location.protocol)) return;
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
  const ASLEEP_AFTER = 120;

  function catchUp() {
    const away = (Date.now() - S().lastTick) / 1000;
    if (away > ASLEEP_AFTER) {
      const offline = E.applyOffline();
      if (offline) dialogs().welcomeHome(offline);
      E.save();
    } else if (away > 1) {
      E.gain(E.fishPerSecond(false) * away);
      S().lastTick = Date.now();
    }
    lastFrame = performance.now();
  }

  function frame() {
    if (Date.now() - S().lastTick > 1000 + nap().loopMs) catchUp();
    const now = performance.now();
    const dt = Math.min(5, (now - lastFrame) / 1000);
    lastFrame = now;
    E.tick(dt);
    if (PI.fx.Music.on && PI.fx.Sound.ctx && PI.fx.Sound.ctx.state === "running") S().stats.musicSeconds += dt;
    if (Date.now() >= nextGolden) {
      if (!document.hidden && !PI.napping) ui().spawnGolden();
      else if (PI.napping && nap().nap && E.helperOn("lookout") && !E.M.noGolden && nap().nap.saved < nap().LOOKOUT_SAVES) nap().nap.saved++;
      nextGolden = Date.now() + E.goldenDelay();
    }
    uiTimer += dt; slowTimer += dt; saveTimer += dt; minuteTimer += dt;
    if (uiTimer >= 0.1) { uiTimer = 0; if (PI.napping) nap().napTick(); else ui().tick(); }
    if (slowTimer >= 1) {
      slowTimer = 0;
      E.checkAchievements();
      if (!PI.napping) ui().slowTick();
      nap().windDown();
      const idleMins = Math.min(S().settings.autoNap || Infinity, nap().isBedtime() ? 1 : Infinity);
      if (idleMins !== Infinity && !PI.napping && !document.hidden && Date.now() - nap().lastInput >= idleMins * 60000) nap().startNap();
    }
    if (minuteTimer >= 60) { minuteTimer = 0; E.recompute(); if (E.ensureLetters()) ui().toast("💌 New penguin letters have arrived!"); }
    if (saveTimer >= 15) { saveTimer = 0; E.save(); }
  }

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) { E.save(); return; }
    catchUp();
  });
  window.addEventListener("beforeunload", () => E.save());

  function init() {
    const params = new URLSearchParams(location.search);
    if (params.has("season")) E.setSeasonOverride(params.get("season") || null);
    const loadProblem = E.load();
    PI.fmtOptions.scientific = S().settings.scientific;
    const offline = loadProblem && loadProblem.kind === "newer" ? null : E.applyOffline();
    E.ensureLetters();

    PI.fx.init();
    PI.penguin.init();
    ui().init();
    bindSettings();
    applySettings();
    dialogs().bindSaves();
    bindHotkeys();
    setupPWA();

    const unlockAudio = e => {
      if (S().settings.sound && S().settings.ambience) PI.fx.Sound.setAmbience(true);
      else if (PI.fx.Sound.ctx) PI.fx.Sound.ensure();
      const aboutMusic = (e.target && e.target.closest && e.target.closest("#musicBtn")) || (e.key && e.key.toLowerCase() === "m" && e.shiftKey);
      if (S().settings.music && !aboutMusic) PI.fx.Music.start();
      document.removeEventListener("pointerdown", unlockAudio);
      document.removeEventListener("keydown", unlockAudio);
    };
    document.addEventListener("pointerdown", unlockAudio);
    document.addEventListener("keydown", unlockAudio);

    $("bigPenguin").focus({ preventScroll: true, focusVisible: false });

    if (loadProblem) ui().openModal({ title: loadProblem.title, body: loadProblem.body, actions: [{ label: "Okay", primary: true, cancel: true }] });
    if (offline) dialogs().welcomeHome(offline);
    dialogs().announceNews();
    dialogs().checkMoveLink();
    window.addEventListener("hashchange", () => dialogs().checkMoveLink());

    nextGolden = Date.now() + 60000 + Math.random() * 90000;
    lastFrame = performance.now();
    nap().setLoopRate(frame);
    nap().watchBattery();
  }

  PI.main = {
    applySettings,
    frame,
    resetLastFrame: () => { lastFrame = performance.now(); },
    setNextGolden: v => { nextGolden = v; },
  };

  // Small debug hook for the browser console and tests
  window.penguinIdle = {
    get state() { return S(); },
    engine: E, data: PI.data, fmt,
    fishPerSecond: () => E.fishPerSecond(),
    spawnGolden: () => ui().spawnGolden(),
    encodeSave: () => E.encodeSave(), decodeSave: str => E.decodeSave(str), save: () => E.save(),
    moveCode: () => dialogs().packMove(E.transferJSON()),
    nap: {
      start: () => nap().startNap(),
      wake: () => nap().wake(),
      get on() { return !!PI.napping; },
      idleFor: ms => { nap().lastInput = Date.now() - ms; },
      sleptFor: ms => { if (nap().nap) nap().nap.at -= ms; },
      isBedtime: d => nap().isBedtime(d),
      bedtimeIn: d => nap().bedtimeIn(d),
      windDown: d => nap().windDown(d),
      goldenNow: () => { nextGolden = 0; },
    },
    get loopMs() { return nap().loopMs; },
  };

  init();
})(window.PI = window.PI || {});
