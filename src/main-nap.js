/* Penguin Idle — Main Nap & Power: Napping mode, Bedtime timers and Battery Saver. */
(function (PI) {
  "use strict";

  const E = () => PI.engine, ui = () => PI.ui, fmt = PI.fmt;
  const S = () => PI.engine.state;
  const $ = id => document.getElementById(id);
  const setText = (el, v) => { if (el.textContent !== v) el.textContent = v; };

  // ---------- Nap mode and the battery saver ----------
  const LOOP_MS = { play: 50, saver: 250, nap: 1000 };
  let loopTimer = 0, loopMs = 0;
  function setLoopRate(frameFn) {
    const fn = frameFn || (PI.main && PI.main.frame);
    const ms = PI.napping ? LOOP_MS.nap : PI.powerSaving ? LOOP_MS.saver : LOOP_MS.play;
    if (ms === loopMs) return;
    loopMs = ms;
    clearInterval(loopTimer);
    if (fn) loopTimer = setInterval(fn, ms);
  }

  let batteryLow = false;
  let sleepyHours = false;
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

  let nap = null;
  function isBedtime(date = new Date()) {
    const b = S().settings.bedtime;
    if (b === "off") return false;
    const [from, to] = b.split("-").map(Number), h = date.getHours();
    return from > to ? h >= from || h < to : h >= from && h < to;
  }

  function bedtimeIn(date = new Date()) {
    const b = S().settings.bedtime;
    if (b === "off") return null;
    const from = Number(b.split("-")[0]) * 60, nowMin = date.getHours() * 60 + date.getMinutes();
    return (from - nowMin + 1440) % 1440;
  }

  const WIND_DOWN = 15;
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
  const LOOKOUT_SAVES = 3;
  let lastInput = Date.now();
  ["pointerdown", "pointermove", "keydown", "wheel", "touchstart"].forEach(ev =>
    document.addEventListener(ev, () => { lastInput = Date.now(); }, { passive: true, capture: true }));

  document.addEventListener("keydown", e => {
    if (!PI.napping) return;
    if (e.target === $("napWake") && (e.key === "Enter" || e.key === " ")) return;
    e.preventDefault();
    e.stopImmediatePropagation();
  }, true);

  function drawNapPenguin() {
    $("napSvg").innerHTML = $("penguinSvg").innerHTML.replace(/id="([^"]+)"/g, 'id="nap-$1"').replace(/url\(#([^)]+)\)/g, "url(#nap-$1)");
  }

  function napTick() {
    if (!nap) return;
    const t = Date.now();
    const hoursBefore = Math.floor(S().stats.napSeconds / 3600);
    S().stats.napSeconds += Math.min(5, (t - nap.last) / 1000);
    E().addNapTime(Math.min(5, (t - nap.last) / 1000));
    const hours = Math.min(PI.data.NAP_STARS, Math.floor(S().stats.napSeconds / 3600)), stars = S().napStars;
    if (hours > hoursBefore) { while (stars.length < hours - 1) stars.push(0); if (stars.length < hours) stars.push(t); }
    nap.last = t;
    const secs = (t - nap.at) / 1000;
    setText($("napFish"), fmt(Math.floor(S().fish)));
    setText($("napFps"), fmt(E().fishPerSecond()));
    setText($("napFor"), secs < 60 ? "a moment" : PI.fmtTime(secs));
    const now = E().now();
    const left = ms => (ms >= 60000 ? `${Math.ceil(ms / 60000)}m` : `${Math.ceil(ms / 1000)}s`);
    const streak = E().napStreakNow();
    const html = `<span class="buff nap-bonus">💤 Nap bonus +${Math.round((E().napMult() - 1) * 100)}%</span>` +
      (streak ? `<span class="buff nap-bonus">😴 Nap streak: day ${streak}</span>` : "") +
      S().buffs.filter(b => b.until > now).map(b => `<span class="buff">${b.name} ×${b.mult} · ${left(b.until - now)}</span>`).join("");
    if ($("napBuffs").innerHTML !== html) $("napBuffs").innerHTML = html;
    $("napMoon").classList.toggle("hidden", S().stats.napSeconds < PI.data.NAP_STARS * 3600);
    const title = `💤 ${fmt(Math.floor(S().fish))} fish · Penguin Idle`;
    if (document.title !== title) document.title = title;
  }

  function startNap() {
    if (PI.napping) return;
    PI.fx.Sound.play("yawn");
    PI.napping = true;
    E().setNapping(true);
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
    E().save();
  }

  function wake() {
    if (!PI.napping) return;
    napTick();
    const slept = (Date.now() - nap.at) / 1000, caught = S().lifetimeFish - nap.fish;
    const bonus = S().stats.napBonusFish - nap.bonus, saved = nap.saved;
    PI.napping = false;
    E().setNapping(false);
    nap = null;
    lastInput = Date.now();
    document.documentElement.classList.remove("napping");
    $("napScreen").classList.add("hidden");
    $("napSvg").innerHTML = "";
    const ctx = PI.fx.Sound.ctx;
    if (ctx && ctx.state === "suspended") ctx.resume().catch(() => {});
    setLoopRate();
    if (PI.main && PI.main.resetLastFrame) PI.main.resetLastFrame();
    PI.fx.Particles.start();
    ui().refreshStructure();
    ui().slowTick();
    ui().tick();
    $("bigPenguin").focus({ preventScroll: true, focusVisible: false });
    const golden = slept >= GOLDEN_WAITS && !E().M.noGolden, rush = golden && slept >= 3600;
    if (golden) {
      ui().spawnGolden(rush ? "rush" : null);
      if (PI.main && PI.main.setNextGolden) PI.main.setNextGolden(Date.now() + E().goldenDelay());
    }
    const NAMES = { lucky: "Lucky Catch", rush: "Cocoa Rush", flurry: "Flipper Flurry", aurora: "Aurora Blessing", rainbow: "Rainbow Frenzy", glacier: "Glacier Freeze", feathered: "Moult Bounty" };
    const kept = [];
    for (let i = 0; i < saved; i++) kept.push(NAMES[E().goldenEffect({}, true, null, true)]);
    if (slept >= 30 && (caught > 0 || golden || saved)) {
      const row = (k, v) => `<dt>${k}</dt><dd>${v}</dd>`;
      ui().toast(`<div class="wake-card"><b>☀️ Good morning!</b><dl>` + row("Slept", PI.fmtTime(slept)) + row("Caught", `🐟 ${fmt(caught)}`) +
        (bonus >= 1 ? row("Nap bonus", `🐟 +${fmt(bonus)}`) : "") + `</dl>` +
        (saved ? `<p>📯 Lookout Lumi kept ${saved === 1 ? "a golden fish" : `${saved} golden fish`} for you: ${[...new Set(kept)].map(k => { const n = kept.filter(x => x === k).length; return n > 1 ? `${n}× ${k}` : k; }).join(", ")}.</p>` : "") +
        (rush ? "<p>🌟 After that long sleep, a golden fish is waiting with a Cocoa Rush!</p>" : golden ? "<p>🌟 A golden fish waited for you!</p>" : "") +
        `</div>`, 9000);
    }
    ui().afterNap();
    E().checkAchievements();
    E().save();
  }

  PI.mainNap = {
    LOOP_MS,
    get loopMs() { return loopMs; },
    setLoopRate,
    watchBattery,
    applyPower,
    isBedtime,
    bedtimeIn,
    windDown,
    drawNapPenguin,
    napTick,
    startNap,
    wake,
    get nap() { return nap; },
    get lastInput() { return lastInput; },
    set lastInput(v) { lastInput = v; },
    LOOKOUT_SAVES,
  };
})(window.PI = window.PI || {});
