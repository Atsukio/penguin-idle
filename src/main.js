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
    $("optHideDone").checked = !!st.hideDone;
    $("optTextSize").value = String(st.textSize);
    $("optBatterySaver").value = st.batterySaver;
    $("optAutoNap").value = String(st.autoNap);
    $("optBedtime").value = st.bedtime;
    applyPower();
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
    bind("optHideDone", "hideDone", el => el.checked, () => ui().renderTab(true));
    $("whatsNewBtn").addEventListener("click", openWhatsNew);
    $("moveBtn").addEventListener("click", openMove);
    bind("optTextSize", "textSize", el => Number(el.value));
    bind("optBatterySaver", "batterySaver", el => el.value);
    bind("optAutoNap", "autoNap", el => Number(el.value));
    bind("optBedtime", "bedtime", el => el.value);
    $("napBtn").addEventListener("click", () => startNap());
    $("napWake").addEventListener("click", wake);
    // A stray tap on the dark screen keeps focus on the button, so Enter still wakes
    $("napScreen").addEventListener("click", e => { if (e.target !== $("napWake")) $("napWake").focus({ preventScroll: true, focusVisible: false }); });
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
  // Notes are plain lines; a line starting "## " starts a new group with that heading
  function newsNotes(notes) {
    const groups = [];
    notes.forEach(n => {
      if (n.startsWith("## ")) groups.push({ head: n.slice(3), items: [] });
      else (groups[groups.length - 1] || groups[groups.push({ head: "", items: [] }) - 1]).items.push(n);
    });
    return groups.map(g => `${g.head ? `<h4 class="news-head">${esc(g.head)}</h4>` : ""}<ul>${g.items.map(n => `<li>${esc(n)}</li>`).join("")}</ul>`).join("");
  }
  function openWhatsNew() {
    const seen = S().seenVersion;
    const entry = (c, open) => `<details class="news"${open ? " open" : ""}>
        <summary><b>${esc(c.version)}</b> · ${esc(c.title)} <small class="muted">${fmtDate(c.date)}</small>${isNew(c, seen) ? ' <span class="pill">New</span>' : ""}</summary>
        ${newsNotes(c.notes)}</details>`;
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
      else if (k === "z" && !e.shiftKey) { startNap(); e.preventDefault(); }
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

  // ---------- Nap mode and the battery saver ----------
  // Napping hides the game behind a dark, nearly still screen: no weather, scenery, chats or golden fish, the
  // sound is suspended, and the loop slows to once a second. The colony fishes at full pace the whole time.
  // The battery saver is lighter: the weather and scenery rest and the loop runs 4 times a second.
  const LOOP_MS = { play: 50, saver: 250, nap: 1000 };
  let loopTimer = 0, loopMs = 0;
  function setLoopRate() {
    const ms = PI.napping ? LOOP_MS.nap : PI.powerSaving ? LOOP_MS.saver : LOOP_MS.play;
    if (ms === loopMs) return;
    loopMs = ms;
    clearInterval(loopTimer);
    loopTimer = setInterval(frame, ms);
  }

  // Auto: on while the device is unplugged and below 20%. Only Chrome-family browsers tell pages about the battery.
  let batteryLow = false;
  let sleepyHours = false;   // bedtime, or the wind-down just before it
  function watchBattery() {
    if (!navigator.getBattery) return;
    navigator.getBattery().then(b => {
      const check = () => { batteryLow = !b.charging && b.level <= 0.2; applyPower(); };
      b.addEventListener("chargingchange", check);
      b.addEventListener("levelchange", check);
      check();
    }).catch(() => {});
  }
  function applyPower() {
    const mode = S().settings.batterySaver, on = mode === "on" || (mode === "auto" && (batteryLow || sleepyHours));
    const changed = on !== !!PI.powerSaving;
    PI.powerSaving = on;
    document.documentElement.classList.toggle("power-saver", on);
    setLoopRate();
    if (changed && PI.fx.Particles.canvas) { PI.fx.Particles.resize(); PI.fx.Particles.start(); }
  }

  let nap = null;   // { at, last, fish } while napping
  function isBedtime(date = new Date()) {
    const b = S().settings.bedtime;
    if (b === "off") return false;
    const [from, to] = b.split("-").map(Number), h = date.getHours();
    return from > to ? h >= from || h < to : h >= from && h < to;
  }
  // Minutes until bedtime starts (null with bedtime off)
  function bedtimeIn(date = new Date()) {
    const b = S().settings.bedtime;
    if (b === "off") return null;
    const from = Number(b.split("-")[0]) * 60, nowMin = date.getHours() * 60 + date.getMinutes();
    return (from - nowMin + 1440) % 1440;
  }
  const WIND_DOWN = 15;   // minutes before bedtime when the colony gets sleepy
  let yawnedOn = "";
  function windDown(date = new Date()) {
    const m = bedtimeIn(date), soon = m !== null && m > 0 && m <= WIND_DOWN;
    document.documentElement.classList.toggle("bedtime-soon", soon && !PI.napping);
    const sleepy = soon || isBedtime(date);
    if (sleepy !== sleepyHours) { sleepyHours = sleepy; applyPower(); }
    const day = date.toDateString();
    if (soon && !PI.napping && yawnedOn !== day && PI.penguin.say(["*yawn* Bedtime soon…", "Getting sleepy… 🌙", "Nearly bedtime, everyone!"][Math.floor(Math.random() * 3)], true)) yawnedOn = day;
    return soon;
  }
  const GOLDEN_WAITS = 180;
  const LOOKOUT_SAVES = 3;   // golden fish Lookout Lumi can keep for you during one nap   // seconds of napping before a golden fish waits for you
  let lastInput = Date.now();
  ["pointerdown", "pointermove", "keydown", "wheel", "touchstart"].forEach(ev =>
    document.addEventListener(ev, () => { lastInput = Date.now(); }, { passive: true, capture: true }));
  // While napping, keys do nothing except press the Wake up button (Enter/Space with it focused)
  document.addEventListener("keydown", e => {
    if (!PI.napping) return;
    if (e.target === $("napWake") && (e.key === "Enter" || e.key === " ")) return;
    e.preventDefault();
    e.stopImmediatePropagation();
  }, true);

  // The big penguin, in its current outfit, fast asleep (ids renamed so the copy's gradients don't clash)
  function drawNapPenguin() {
    $("napSvg").innerHTML = $("penguinSvg").innerHTML.replace(/id="([^"]+)"/g, 'id="nap-$1"').replace(/url\(#([^)]+)\)/g, "url(#nap-$1)");
  }
  function napTick() {
    if (!nap) return;
    const t = Date.now();
    const hoursBefore = Math.floor(S().stats.napSeconds / 3600);
    S().stats.napSeconds += Math.min(5, (t - nap.last) / 1000);
    E.addNapTime(Math.min(5, (t - nap.last) / 1000));
    const hours = Math.min(PI.data.NAP_STARS, Math.floor(S().stats.napSeconds / 3600)), stars = S().napStars;
    if (hours > hoursBefore) { while (stars.length < hours - 1) stars.push(0); if (stars.length < hours) stars.push(t); }
    nap.last = t;
    const secs = (t - nap.at) / 1000;
    setText($("napFish"), fmt(Math.floor(S().fish)));
    setText($("napFps"), fmt(E.fishPerSecond()));
    setText($("napFor"), secs < 60 ? "a moment" : PI.fmtTime(secs));
    // The nap bonus, then any boosts still running (a minute's precision is plenty on this screen)
    const now = E.now();
    const left = ms => (ms >= 60000 ? `${Math.ceil(ms / 60000)}m` : `${Math.ceil(ms / 1000)}s`);
    const streak = E.napStreakNow();
    const html = `<span class="buff nap-bonus">💤 Nap bonus +${Math.round((E.napMult() - 1) * 100)}%</span>` +
      (streak ? `<span class="buff nap-bonus">😴 Nap streak: day ${streak}</span>` : "") +
      S().buffs.filter(b => b.until > now).map(b => `<span class="buff">${b.name} ×${b.mult} · ${left(b.until - now)}</span>`).join("");
    if ($("napBuffs").innerHTML !== html) $("napBuffs").innerHTML = html;
    $("napMoon").classList.toggle("hidden", S().stats.napSeconds < PI.data.NAP_STARS * 3600);
    const title = `💤 ${fmt(Math.floor(S().fish))} fish · Penguin Idle`;
    if (document.title !== title) document.title = title;
  }
  const setText = (el, v) => { if (el.textContent !== v) el.textContent = v; };

  function startNap() {
    if (PI.napping) return;
    PI.fx.Sound.play("yawn");   // a little yawn, then the sound sleeps too
    PI.napping = true;
    E.setNapping(true);
    nap = { at: Date.now(), last: Date.now(), fish: S().lifetimeFish, bonus: S().stats.napBonusFish, saved: 0 };
    ui().closeSheet();
    ui().hideTooltip();
    PI.fx.Particles.clear();
    drawNapPenguin();
    document.documentElement.classList.add("napping");
    $("napScreen").classList.remove("hidden");
    $("napWake").focus({ preventScroll: true, focusVisible: false });
    const ctx = PI.fx.Sound.ctx;
    if (ctx) setTimeout(() => { if (PI.napping && ctx.state === "running") ctx.suspend().catch(() => {}); }, 900);
    setLoopRate();
    napTick();
    E.save();
  }

  function wake() {
    if (!PI.napping) return;
    napTick();
    const slept = (Date.now() - nap.at) / 1000, caught = S().lifetimeFish - nap.fish;
    const bonus = S().stats.napBonusFish - nap.bonus, saved = nap.saved;
    PI.napping = false;
    E.setNapping(false);
    nap = null;
    lastInput = Date.now();
    document.documentElement.classList.remove("napping");
    $("napScreen").classList.add("hidden");
    $("napSvg").innerHTML = "";
    const ctx = PI.fx.Sound.ctx;
    if (ctx && ctx.state === "suspended") ctx.resume().catch(() => {});
    setLoopRate();
    lastFrame = performance.now();
    PI.fx.Particles.start();
    ui().refreshStructure();
    ui().slowTick();
    ui().tick();
    $("bigPenguin").focus({ preventScroll: true, focusVisible: false });
    // Golden fish don't swim past a sleeping colony; after a proper nap one waits to say good morning
    const golden = slept >= GOLDEN_WAITS && !E.M.noGolden, rush = golden && slept >= 3600;
    if (golden) { ui().spawnGolden(rush ? "rush" : null); nextGolden = Date.now() + E.goldenDelay(); }
    const NAMES = { lucky: "Lucky Catch", rush: "Cocoa Rush", flurry: "Flipper Flurry", aurora: "Aurora Blessing", rainbow: "Rainbow Frenzy", glacier: "Glacier Freeze", feathered: "Moult Bounty" };
    const kept = [];
    for (let i = 0; i < saved; i++) kept.push(NAMES[E.goldenEffect({}, true, null, true)]);
    if (slept >= 30 && (caught > 0 || golden || saved)) {
      const row = (k, v) => `<dt>${k}</dt><dd>${v}</dd>`;
      ui().toast(`<div class="wake-card"><b>☀️ Good morning!</b><dl>` + row("Slept", PI.fmtTime(slept)) + row("Caught", `🐟 ${fmt(caught)}`) +
        (bonus >= 1 ? row("Nap bonus", `🐟 +${fmt(bonus)}`) : "") + `</dl>` +
        (saved ? `<p>📯 Lookout Lumi kept ${saved === 1 ? "a golden fish" : `${saved} golden fish`} for you: ${[...new Set(kept)].map(k => { const n = kept.filter(x => x === k).length; return n > 1 ? `${n}× ${k}` : k; }).join(", ")}.</p>` : "") +
        (rush ? "<p>🌟 After that long sleep, a golden fish is waiting with a Cocoa Rush!</p>" : golden ? "<p>🌟 A golden fish waited for you!</p>" : "") +
        `</div>`, 9000);
    }
    ui().afterNap();
    E.checkAchievements();
    E.save();
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
    // Residents you named come first; the rest have their cute default names
    const own = shuffled(E.playerNames());
    const friends = [...own, ...shuffled(E.residentNames().filter(n => !own.includes(n)))].slice(0, 2);
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
             ${offline.away > offline.cap ? `<p class="muted">Time away counts for up to ${offline.cap / 3600} hours.</p>` : ""}
             <p class="muted">${offline.firstWeek
               ? "Away for under a week fishes at 50% pace before upgrades. Away a week or more drops it to 25%. Coming back resets it."
               : "Away a week or more, so the pace was 25% before upgrades. Coming back resets it to 50%."}</p>`,
      actions: [{ label: "Cozy!", primary: true, cancel: true,
        onClick: () => setTimeout(() => PI.penguin.say(["Welcome back! We missed you!", "You're home! We saved you some fish.", "There you are! The fire's still warm."][Math.floor(Math.random() * 3)], true), 300) }],
    });
  }
  let welcomeModal = null;

  // Timer-driven (not requestAnimationFrame) so the colony keeps fishing in background tabs
  function frame() {
    if (Date.now() - S().lastTick > 1000 + loopMs) catchUp();
    const now = performance.now();
    const dt = Math.min(5, (now - lastFrame) / 1000);
    lastFrame = now;
    E.tick(dt);
    if (PI.fx.Music.on && PI.fx.Sound.ctx && PI.fx.Sound.ctx.state === "running") S().stats.musicSeconds += dt;
    if (Date.now() >= nextGolden) {
      if (!document.hidden && !PI.napping) ui().spawnGolden();
      else if (PI.napping && nap && E.helperOn("lookout") && !E.M.noGolden && nap.saved < LOOKOUT_SAVES) nap.saved++;   // Lumi keeps watch
      nextGolden = Date.now() + E.goldenDelay();
    }
    uiTimer += dt; slowTimer += dt; saveTimer += dt; minuteTimer += dt;
    if (uiTimer >= 0.1) { uiTimer = 0; if (PI.napping) napTick(); else ui().tick(); }
    if (slowTimer >= 1) {
      slowTimer = 0;
      E.checkAchievements();
      if (!PI.napping) ui().slowTick();
      windDown();
      const idleMins = Math.min(S().settings.autoNap || Infinity, isBedtime() ? 1 : Infinity);   // at bedtime, a minute left alone is enough
      if (idleMins !== Infinity && !PI.napping && !document.hidden && Date.now() - lastInput >= idleMins * 60000) startNap();
    }
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
    setLoopRate();
    watchBattery();
  }

  // Small debug hook for the browser console and tests
  window.penguinIdle = {
    get state() { return S(); },
    engine: E, data: PI.data, fmt,
    fishPerSecond: () => E.fishPerSecond(),
    spawnGolden: () => ui().spawnGolden(),
    encodeSave: () => E.encodeSave(), decodeSave: str => E.decodeSave(str), save: () => E.save(),
    moveCode: () => packMove(E.transferJSON()),
    nap: { start: startNap, wake, get on() { return !!PI.napping; }, idleFor: ms => { lastInput = Date.now() - ms; }, sleptFor: ms => { if (nap) nap.at -= ms; }, isBedtime, bedtimeIn, windDown, goldenNow: () => { nextGolden = 0; } },
    get loopMs() { return loopMs; },
  };

  init();
})(window.PI = window.PI || {});
