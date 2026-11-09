/* Penguin Idle — game engine: state, maths, actions and saves.
 * No DOM access, so it also runs in Node for the balance simulator and data checks.
 * Every action changes state and then emits an event on PI.bus; the UI and effects listen.
 */
(function (PI) {
  "use strict";

  const D = PI.data;
  const { BUILDINGS, GAME_VERSION } = D;
  const MAX = 1e300;
  const HISTORY_LEN = 240;
  const hasWindow = typeof window !== "undefined";
  const prefersReducedMotion = hasWindow && !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

  const E = PI.engine || {};
  E.clock = null;
  const now = () => (E.clock ? E.clock() : Date.now());

  // ---------- Event bus ----------
  const bus = {
    handlers: {},
    on(evt, fn) { (this.handlers[evt] = this.handlers[evt] || []).push(fn); },
    emit(evt, data) { (this.handlers[evt] || []).forEach(fn => fn(data)); },
  };

  // ---------- State ----------
  function defaultSettings() {
    return {
      particles: true, scientific: false,
      sound: true, volume: 0.5, ambience: false, music: true, musicVolume: 0.5,
      shake: 0.6, reduceMotion: prefersReducedMotion, textSize: 1, cozyCursor: true, holdToPat: true, hideDone: false,
      batterySaver: "auto",
      autoNap: 0,
      bedtime: "off",
    };
  }

  function freshStats() {
    return {
      clicks: 0, clickFish: 0, goldenClicks: 0, exoticCatches: 0, bigCatches: 0, longestAway: 0, homecomings: 0,
      buildingsBought: 0, upgradesBought: 0, researchBought: 0, lettersClaimed: 0, outfitChanges: 0, seasonalCatches: 0,
      deliveries: 0, musicSeconds: 0, propLooks: 0, rubPats: 0, napSeconds: 0, napBonusFish: 0,
      sunnyCatches: 0, quietSeconds: 0, blizzardMigrateFeathers: 0, dishesCooked: 0, divesCompleted: 0,
      startedAt: now(), runStartedAt: now(),
    };
  }

  function freshState() {
    return {
      fish: 0, runFish: 0, lifetimeFish: 0,
      buildings: Object.fromEntries(BUILDINGS.map(b => [b.id, 0])),
      upgrades: [], achievements: [],
      achDates: {},
      achNew: [],
      feathersEarned: 0, feathersSpent: 0, bonusFeathers: 0,
      heritage: {},
      research: {},
      helpers: {},
      foremanStrategy: "impact",
      shopkeeperStrategy: "impact",
      diverStrategy: "hunter",
      shore: "home", nextShore: "home", shoresVisited: ["home"],
      shoreStamps: [],
      shoreStampDates: {},
      cooking: { id: "", until: 0, startedAt: 0 },
      dive: { spotId: "", startedAt: 0, until: 0, ready: false },
      relics: {},
      cosmetics: { hat: "coral", scarf: "coral", item: "mug" },
      names: [],
      defaultNames: [],
      seasonalUnlocks: [],
      napStars: [],
      napStreak: { day: "", secs: 0, last: "", count: 0, best: 0, grace: "" },
      letters: { day: "", list: [], bonus: false },
      history: [],
      migrations: 0,
      buffs: [],
      stats: freshStats(),
      settings: defaultSettings(),
      lastTick: now(),
      seenVersion: GAME_VERSION,
    };
  }

  let S = freshState();

  function gain(n) {
    if (!(n > 0)) return;
    S.fish = Math.min(MAX, S.fish + n);
    S.runFish = Math.min(MAX, S.runFish + n);
    S.lifetimeFish = Math.min(MAX, S.lifetimeFish + n);
  }

  function addBuff(type, name, mult, ms) {
    const until = now() + ms;
    const existing = S.buffs.find(b => b.name === name && b.until > now());
    if (existing) { existing.until = Math.max(existing.until, until); existing.mult = Math.max(existing.mult, mult); }
    else S.buffs.push({ type, name, mult, until });
  }

  // ---------- Warmth and patting ----------
  const WARMTH_PATS = 50, WARMTH_GAP = 2000, WARMTH_BONUS = 0.25;
  const warmth = { count: 0, last: 0 };
  const warmthLevel = () => (warmth.count > 0 && now() - warmth.last <= WARMTH_GAP ? Math.min(1, warmth.count / WARMTH_PATS) : 0);
  const warmthMult = () => 1 + (WARMTH_BONUS + (E.M && E.M.warmthBonusExtra ? E.M.warmthBonusExtra : 0)) * warmthLevel();

  const manualPatTimes = [];
  function recordManualPat(t = now()) {
    manualPatTimes.push(t);
    const cutoff = t - 1000;
    while (manualPatTimes.length && manualPatTimes[0] < cutoff) manualPatTimes.shift();
    if (manualPatTimes.length > 200) manualPatTimes.splice(0, manualPatTimes.length - 200);
  }

  function patsPerSecond() {
    const t = now();
    const cutoff = t - 1000;
    while (manualPatTimes.length && manualPatTimes[0] < cutoff) manualPatTimes.shift();
    const auto = (E.M && E.M.autoRate) ? E.M.autoRate : 0;
    return manualPatTimes.length + auto;
  }

  function clickPenguin(pos, auto = false, how = "tap") {
    let p = E.clickPower();
    if (!auto) {
      recordManualPat();
      const t = now();
      if (t - warmth.last > WARMTH_GAP) warmth.count = 0;
      const before = warmthLevel();
      warmth.count += (E.M && E.M.warmthRate ? E.M.warmthRate : 1);
      warmth.last = t;
      p *= warmthMult();
      if (before < 1 && warmthLevel() >= 1) bus.emit("toasty", {});
    }
    const crit = Math.random() < (E.M ? E.M.critChance : 0);
    if (crit) { p *= (E.M ? E.M.critMult : 10); S.stats.bigCatches++; }
    gain(p);
    if (auto) return p;
    S.stats.clicks++;
    S.stats.clickFish = Math.min(MAX, S.stats.clickFish + p);
    if (how === "rub") S.stats.rubPats++;
    bus.emit("click", { amount: p, x: pos && pos.x, y: pos && pos.y, crit, how });
    return p;
  }

  // ---------- Per-frame update ----------
  let autoTimer = 0, histTimer = 0, napMinute = false;
  function tick(dt) {
    const fps = E.fishPerSecond();
    gain(fps * dt);
    if (PI.napping && E.M) { S.stats.napBonusFish += fps * dt * (1 - 1 / E.M.napMult); napMinute = true; }
    if (E.M && E.M.autoRate > 0) {
      autoTimer += dt;
      const step = 1 / E.M.autoRate;
      while (autoTimer >= step) { autoTimer -= step; clickPenguin(null, true); }
    }
    const t = now();
    if (S.buffs.some(b => b.until <= t)) { S.buffs = S.buffs.filter(b => b.until > t); bus.emit("buffs"); }
    if (S.cooking && S.cooking.id && S.cooking.until <= t) {
      const finishedDish = D.COOKING_RECIPE_BY_ID[S.cooking.id];
      S.cooking = { id: "", until: 0, startedAt: 0 };
      E.recompute();
      bus.emit("structure");
      bus.emit("dishFinished", { recipe: finishedDish });
    }
    if (S.dive && S.dive.spotId && S.dive.until <= t && !S.dive.ready) {
      S.dive.ready = true;
      bus.emit("structure");
      bus.emit("diveReady", { spot: D.DIVE_SPOT_BY_ID[S.dive.spotId] });
    }
    if (S.shore === "quiethollow") S.stats.quietSeconds = (S.stats.quietSeconds || 0) + dt;
    E.checkPassportStamps();
    if (E.runHelpers) E.runHelpers(dt);
    histTimer += dt;
    if (histTimer >= 60) {
      histTimer = 0;
      S.history.push(napMinute ? [t, E.fishPerSecond(false), 1] : [t, E.fishPerSecond(false)]);
      napMinute = false;
      if (S.history.length > HISTORY_LEN) S.history.splice(0, S.history.length - HISTORY_LEN);
    }
    S.lastTick = t;
  }

  // ---------- Offline progress ----------
  function applyOffline() {
    const away = (now() - S.lastTick) / 1000;
    if (away < 60) return null;
    S.stats.longestAway = Math.max(S.stats.longestAway, away);
    const cap = (E.M ? E.M.offlineCapH : 24) * 3600;
    const firstWeek = away < 7 * 86400;
    if (firstWeek && away >= 86400) S.stats.homecomings += 1;
    if (S.shore === "quiethollow") S.stats.quietSeconds = (S.stats.quietSeconds || 0) + Math.min(away, 3600);
    if (E.helperOn("diver") && away >= 60 && E.diverPickSpot) {
      let simAway = Math.min(away, cap);
      for (let cycles = 0; cycles < 10; cycles++) {
        const active = E.activeDive();
        if (active && active.ready) E.claimDive(true);
        if (!E.activeDive()) {
          const spotId = E.diverPickSpot();
          if (!spotId) break;
          const spot = D.DIVE_SPOT_BY_ID[spotId];
          const dur = spot.duration * (E.M && E.M.diveDurationMult ? E.M.diveDurationMult : 1);
          if (simAway >= dur) {
            simAway -= dur;
            E.startDive(spotId, true);
            S.dive.until = now() - simAway * 1000;
            S.dive.ready = true;
          } else {
            E.startDive(spotId, true);
            S.dive.until = now() + (dur - simAway) * 1000;
            break;
          }
        } else {
          break;
        }
      }
    }
    const eff = ((E.M ? E.M.offlineEff : 0.25) + (firstWeek ? 0.25 : 0)) * (E.M ? E.M.offlineMult : 1);
    const earned = E.fishPerSecond(false) * Math.min(away, cap) * eff;
    S.lastTick = now();
    if (earned <= 0) return null;
    gain(earned);
    return { away, earned, eff, cap, firstWeek };
  }

  function replaceState(newState) {
    S = newState;
    S.buffs = [];
    S.lastTick = now();
    manualPatTimes.length = 0;
    if (E.savingBlocked !== undefined) E.savingBlocked = false;
    E.recompute();
    bus.emit("stateReplaced");
    bus.emit("structure");
    if (E.save) E.save();
  }

  // Live state property
  Object.defineProperty(E, "state", { get: () => S, set: v => { S = v; }, enumerable: true, configurable: true });

  // Core methods
  Object.assign(E, {
    MAX, bus, now,
    defaultSettings, freshState, replaceState,
    gain, addBuff, clickPenguin, patsPerSecond, warmthLevel, WARMTH_BONUS,
    clearManualPats: () => { manualPatTimes.length = 0; },
    tick, applyOffline,
    foremanStrategy: () => S.foremanStrategy || "impact",
    shopkeeperStrategy: () => S.shopkeeperStrategy || "impact",
    diverStrategy: () => S.diverStrategy || "hunter",
  });

  PI.engine = E;
  PI.bus = bus;
})(typeof globalThis !== "undefined" ? (globalThis.PI = globalThis.PI || {}) : (window.PI = window.PI || {}));
