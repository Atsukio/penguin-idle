/* Penguin Idle — game engine: state, maths, actions and saves.
 * No DOM access, so it also runs in Node for the balance simulator and data checks.
 * Every action changes state and then emits an event on PI.bus; the UI and effects listen.
 */
(function (PI) {
  "use strict";

  const D = PI.data, fmt = PI.fmt;
  const {
    BUILDINGS, B_BY_ID, UPGRADES, UP_BY_ID, RESEARCH, R_BY_ID, TREE, H_BY_ID, ACHIEVEMENTS,
    HELPERS, HELPER_BY_ID, SHORES, SHORE_BY_ID, SEASONS, SEASON_BY_ID, COSMETICS, LETTER_TYPES, LETTER_SENDERS,
    MILESTONES, COST_GROWTH, FEATHER_SCALE, FEATHER_BONUS, ACH_BONUS, SAVE_KEY, SAVE_VERSION, TEXT_SIZES, totalColony,
    GAME_VERSION, NAP_BONUS, BEDTIMES, NAP_STARS,
    FOREMAN_STRATEGIES, FOREMAN_STRATEGY_BY_ID,
    SHOPKEEPER_STRATEGIES, SHOPKEEPER_STRATEGY_BY_ID,
  } = D;

  const MAX = 1e300;   // hard ceiling so numbers never overflow to Infinity (which JSON would save as null)
  const HISTORY_LEN = 240;
  const LT_BY_ID = Object.fromEntries(LETTER_TYPES.map(t => [t.id, t]));
  const hasWindow = typeof window !== "undefined";
  const prefersReducedMotion = hasWindow && !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

  const E = {};
  E.clock = null;   // the simulator swaps this for a fake clock
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
      batterySaver: "auto",   // "auto" (when the battery is low), "on" or "off"
      autoNap: 0,             // nap by itself after this many idle minutes (0 = never)
      bedtime: "off",         // "start-end" hours when the colony naps after a minute left alone, e.g. "22-7"
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
      achDates: {},        // memory id -> when it was collected (ms); memories from older saves have no date
      achNew: [],          // memories collected since the Memories tab was last left (they show as New)
      feathersEarned: 0, feathersSpent: 0, bonusFeathers: 0,
      heritage: {},        // heirloom id -> level
      research: {},        // workshop id -> level (reset on migration)
      helpers: {},         // helper id -> true (on) / false (off); a key means it's hired
      foremanStrategy: "impact",
      shopkeeperStrategy: "impact",
      diverStrategy: "hunter",
      shore: "home", nextShore: "home", shoresVisited: ["home"],
      shoreStamps: [],     // shore ids whose passport expedition challenges are complete
      shoreStampDates: {}, // shore id -> ms when stamped
      cooking: { id: "", until: 0, startedAt: 0 }, // active dish simmering in the campfire kettle
      dive: { spotId: "", startedAt: 0, until: 0, ready: false }, // active deep-sea dive
      relics: {},          // relicId -> level (1..3)
      cosmetics: { hat: "coral", scarf: "coral", item: "mug" },
      names: [],           // names the player gave colony residents (up to NAME_SLOTS; "" = an unnamed slot)
      defaultNames: [],    // a cute name per slot for residents the player hasn't named (filled in by ensureDefaultNames)
      seasonalUnlocks: [], // season ids where a golden fish was caught
      napStars: [],        // when each napped hour was finished (0 = before stars were dated)
      napStreak: { day: "", secs: 0, last: "", count: 0, best: 0, grace: "" },   // today's nap time, days in a row with a proper nap, the last forgiven day
      letters: { day: "", list: [], bonus: false },
      history: [],         // [timestamp, fish per second, 1 if napping] samples for the Stats graph
      migrations: 0,
      buffs: [],
      stats: freshStats(),
      settings: defaultSettings(),
      lastTick: now(),
      seenVersion: GAME_VERSION,   // the newest What's new entry this player has seen; new players start up to date
    };
  }

  let S = freshState();
  let M = null;
  let seasonOverride;   // undefined = use the real date; null = no season; id = force that season

  // ---------- Helpers for tree / workshop / helpers ----------
  const has = id => S.upgrades.includes(id);
  const milestonesReached = n => MILESTONES.filter(x => n >= x).length;
  const nodeLevel = id => (id === "spirit" ? 1 : S.heritage[id] || 0);
  const nodeCost = (n, L) => Math.round(n.cost * Math.pow(n.growth, L));
  const nodeReqsMet = n => (!n.requires || n.requires.every(r => nodeLevel(r) > 0)) &&
                           (!n.requiresAny || n.requiresAny.some(r => nodeLevel(r) > 0));
  const spendableFeathers = () => Math.max(0, S.feathersEarned - S.feathersSpent);
  function treeSpentOn(heritage) {
    let total = 0;
    TREE.forEach(n => { for (let l = 0; l < (heritage[n.id] || 0); l++) total += nodeCost(n, l); });
    return total;
  }
  const helpersSpentOn = helpers => HELPERS.reduce((a, h) => a + (h.id in helpers ? h.cost : 0), 0);
  const helperOn = id => S.helpers[id] === true;

  const researchLevel = id => S.research[id] || 0;
  const researchCost = (r, L) => r.cost * Math.pow(r.growth, L) * M.researchCost;
  const researchUnlocked = r => S.runFish >= r.unlockAt || researchLevel(r.id) > 0;
  const upgradeCost = u => u.cost * M.upgradeCost;

  function currentSeason(date = new Date(now())) {
    if (seasonOverride !== undefined) return seasonOverride ? SEASON_BY_ID[seasonOverride] || null : null;
    const md = (date.getMonth() + 1) * 100 + date.getDate();
    return SEASONS.find(se => {
      const a = se.from[0] * 100 + se.from[1], b = se.to[0] * 100 + se.to[1];
      return a <= b ? md >= a && md <= b : md >= a || md <= b;
    }) || null;
  }

  // ---------- The modifier object: every bonus folded into one place ----------
  function applyMods(m, mods) {
    if (!mods) return;
    if (mods.building) Object.entries(mods.building).forEach(([id, k]) => { m.building[id] *= k; });
    ["global", "click", "goldenFreq", "goldenDur", "luckyMult", "costMult", "upgradeCost", "researchCost", "featherGain"]
      .forEach(k => { if (mods[k]) m[k] *= mods[k]; });
    if (mods.offline) m.offlineMult *= mods.offline;
    if (mods.noGolden) m.noGolden = true;
    if (mods.critChance) m.critChance += mods.critChance;
    if (mods.napMult) m.napMult += mods.napMult;
    if (mods.warmthRate) m.warmthRate = (m.warmthRate || 1) * mods.warmthRate;
  }

  function recompute() {
    ensureDefaultNames();   // every load, import and reset passes through here
    const m = {
      building: Object.fromEntries(BUILDINGS.map(b => [b.id, 1])),
      click: 1, clickFps: 0, global: 1, goldenFreq: 1, goldenDur: 1,
      luckyMult: 1, rushMult: 7, critChance: 0, critMult: 10, costMult: 1, upgradeCost: 1, researchCost: 1,
      offlineEff: 0.25, offlineMult: 1, offlineCapH: 24, autoRate: 0, achBonus: ACH_BONUS, featherPer: FEATHER_BONUS,
      milestoneMult: 2, synergy: 1, featherGain: 1, napMult: 1 + NAP_BONUS, keepTiers: 0, startFish: 0, aurora: false, noGolden: false,
      start: Object.fromEntries(BUILDINGS.map(b => [b.id, 0])),
    };
    TREE.forEach(n => { const L = nodeLevel(n.id); if (L > 0) n.apply(m, L, S); });
    RESEARCH.forEach(r => { const L = researchLevel(r.id); if (L > 0) r.apply(m, L, S); });
    S.upgrades.forEach(id => UP_BY_ID[id] && UP_BY_ID[id].apply(m, S));   // after research: synergies read m.synergy
    m.shore = SHORE_BY_ID[S.shore] || SHORE_BY_ID.home;
    m.season = currentSeason();
    applyMods(m, m.shore.mods);
    if (m.season) applyMods(m, m.season.mods);
    BUILDINGS.forEach(b => { m.building[b.id] *= Math.pow(m.milestoneMult, milestonesReached(S.buildings[b.id])); });
    const stampsCount = (S.shoreStamps || []).length;
    if (stampsCount > 0) m.global *= (1 + 0.015 * stampsCount);
    if ((S.shoreStamps || []).includes("home")) m.warmthBonusExtra = 0.05;
    if ((S.shoreStamps || []).includes("krillbay")) m.building.krill *= 1.1;
    if ((S.shoreStamps || []).includes("sunnycove")) m.goldenDur *= 1.1;
    if ((S.shoreStamps || []).includes("blizzard")) m.featherGain *= 1.05;
    if ((S.shoreStamps || []).includes("aurorafields")) m.building.aurora *= 1.1;
    if ((S.shoreStamps || []).includes("quiethollow")) m.napMult += 0.05;
    if ((S.shoreStamps || []).includes("harbour")) m.costMult *= 0.97;
    if ((S.shoreStamps || []).includes("rookery")) m.researchCost *= 0.95;
    const curDish = S.cooking && S.cooking.id ? D.COOKING_RECIPE_BY_ID[S.cooking.id] : null;
    if (curDish && S.cooking.until > now()) {
      if (m.cookingEffectMult && m.cookingEffectMult > 1) {
        const boosted = {};
        if (curDish.mods.global) boosted.global = 1 + (curDish.mods.global - 1) * m.cookingEffectMult;
        if (curDish.mods.click) boosted.click = 1 + (curDish.mods.click - 1) * m.cookingEffectMult;
        if (curDish.mods.goldenFreq) boosted.goldenFreq = 1 + (curDish.mods.goldenFreq - 1) * m.cookingEffectMult;
        if (curDish.mods.critChance) boosted.critChance = curDish.mods.critChance * m.cookingEffectMult;
        if (curDish.mods.luckyMult) boosted.luckyMult = 1 + (curDish.mods.luckyMult - 1) * m.cookingEffectMult;
        if (curDish.mods.offline) boosted.offline = 1 + (curDish.mods.offline - 1) * m.cookingEffectMult;
        if (curDish.mods.warmthRate) boosted.warmthRate = 1 + (curDish.mods.warmthRate - 1) * m.cookingEffectMult;
        if (curDish.mods.costMult) boosted.costMult = 1 - (1 - curDish.mods.costMult) * m.cookingEffectMult;
        if (curDish.mods.upgradeCost) boosted.upgradeCost = 1 - (1 - curDish.mods.upgradeCost) * m.cookingEffectMult;
        applyMods(m, boosted);
      } else {
        applyMods(m, curDish.mods);
      }
    }
    if (S.relics) {
      const relL = id => S.relics[id] || 0;
      const relicK = L => (L === 1 ? 1 : L === 2 ? 1.5 : 2);
      if (relL("spiral") > 0) m.clickFps += 0.005 * relicK(relL("spiral"));
      if (relL("coral") > 0) m.goldenDur *= (1 + 0.10 * relicK(relL("coral")));
      if (relL("pearl") > 0) m.global *= (1 + 0.03 * relicK(relL("pearl")));
      if (relL("sextant") > 0) m.featherGain *= (1 + 0.05 * relicK(relL("sextant")));
      if (relL("anchor") > 0) m.costMult *= (1 - 0.05 * relicK(relL("anchor")));
      if (relL("geode") > 0) m.critMult *= (1 + 0.25 * relicK(relL("geode")));
      if (relL("whistle") > 0) m.warmthBonusExtra = (m.warmthBonusExtra || 0) + 0.05 * relicK(relL("whistle"));
      if (relL("diadem") > 0) m.global *= (1 + 0.05 * relicK(relL("diadem")));
    }
    m.critChance = Math.min(0.25, m.critChance);
    m.goldenFreq = Math.min(4, m.goldenFreq);   // caps keep golden fish a treat rather than a firehose
    m.goldenDur = Math.min(4, m.goldenDur);
    m.luckyMult = Math.min(4, m.luckyMult);
    m.offlineEff = Math.min(1.5, m.offlineEff);
    m.feather = 1 + S.feathersEarned * m.featherPer;
    m.ach = 1 + S.achievements.length * m.achBonus;
    // Cache production so the per-frame maths is a lookup, not a recalculation
    m.bFps = {};
    let total = 0;
    BUILDINGS.forEach(b => {
      const v = Math.min(MAX, b.baseFps * m.building[b.id] * m.global * m.feather * m.ach);
      m.bFps[b.id] = v;
      total += v * S.buildings[b.id];
    });
    m.baseFps = Math.min(MAX, total);
    M = m;
  }

  // While the colony naps it fishes a little faster: a reward for giving up pats and golden fish
  let napping = false;
  const setNapping = on => { napping = !!on; };
  const napMult = () => M.napMult;

  function buffMult(type) {
    const t = now();
    let k = 1;
    for (const b of S.buffs) if (b.type === type && b.until > t) k *= b.mult;
    return k;
  }
  const fishPerSecond = (withBuffs = true) => (withBuffs ? Math.min(MAX, M.baseFps * buffMult("prod") * (napping ? M.napMult : 1)) : M.baseFps);
  const buildingFps = id => M.bFps[id];
  // The feather bonus applies to the base pat only: fishPerSecond() already includes it,
  // and applying it twice made patting income grow with feathers² (a runaway the simulator caught).
  const clickPower = () => Math.min(MAX, (M.click * M.feather + fishPerSecond() * M.clickFps) * buffMult("click"));

  function costOf(b, owned, n) {
    const first = b.baseCost * Math.pow(COST_GROWTH, owned) * M.costMult;
    return first * (Math.pow(COST_GROWTH, n) - 1) / (COST_GROWTH - 1);
  }
  function maxAffordable(b) {
    const first = b.baseCost * Math.pow(COST_GROWTH, S.buildings[b.id]) * M.costMult;
    return Math.max(0, Math.floor(Math.log(S.fish * (COST_GROWTH - 1) / first + 1) / Math.log(COST_GROWTH)));
  }
  // What buying n more of a colony member would do, including milestones and synergies.
  // It recomputes with the extra members, reads the numbers, then puts everything back.
  let previewCache = null;
  function previewBuy(id, n) {
    const owned = S.buildings[id];
    if (previewCache && previewCache.m === M && previewCache.id === id && previewCache.n === n && previewCache.owned === owned) return previewCache.out;
    const before = M;
    S.buildings[id] = owned + n;
    let after;
    try { recompute(); after = M; } finally { S.buildings[id] = owned; M = before; }
    const out = {
      owned: owned + n,
      each: after.bFps[id], total: after.bFps[id] * (owned + n),
      fps: after.baseFps, fpsGain: after.baseFps - before.baseFps,
      milestones: milestonesReached(owned + n) - milestonesReached(owned),
    };
    previewCache = { m: before, id, n, owned, out };
    return out;
  }
  const buildingVisible = (b, i) => S.buildings[b.id] > 0 || i === 0 || S.buildings[BUILDINGS[i - 1].id] > 0 || S.runFish >= b.baseCost * 0.5;

  // Cube root (as in Cookie Clicker): doubling your feathers takes 8× the fish, so later runs lengthen
  // instead of collapsing to zero. A square root let feathers compound into a runaway.
  const featherTotalFor = lifetime => Math.floor(Math.cbrt(Math.max(0, lifetime) / FEATHER_SCALE) * M.featherGain);
  const pendingFeathers = () => Math.max(0, featherTotalFor(S.lifetimeFish) - S.feathersEarned + (S.bonusFeathers || 0));
  // Aim past the feathers already earned: after a run with a higher feather rate (Blizzard Pass), the
  // lifetime total can sit below feathersEarned, and the target would otherwise creep up with no feather.
  const nextFeatherAt = () => Math.pow((Math.max(featherTotalFor(S.lifetimeFish), S.feathersEarned) + 1) / M.featherGain, 3) * FEATHER_SCALE;
  const availableUpgrades = () => UPGRADES.filter(u => !has(u.id) && u.unlocked(S)).sort((a, b) => upgradeCost(a) - upgradeCost(b));
  // The cheapest colony member or upgrade you can't afford yet: what you're saving up for
  function nextGoal() {
    const opts = [];
    let mystery = false;   // the next undiscovered member stays a surprise
    BUILDINGS.forEach((b, i) => {
      const cost = costOf(b, S.buildings[b.id], 1);
      if (buildingVisible(b, i)) opts.push({ kind: "building", id: b.id, icon: b.icon, name: b.name, cost });
      else if (!mystery) { mystery = true; opts.push({ kind: "building", id: b.id, icon: "❔", name: "a new colony member", cost }); }
    });
    availableUpgrades().slice(0, 12).forEach(u => opts.push({ kind: "upgrade", id: u.id, icon: u.icon, name: u.name, cost: upgradeCost(u) }));
    const waiting = opts.filter(o => o.cost > S.fish).sort((a, b) => a.cost - b.cost);
    const goal = waiting[0];
    if (!goal) return null;
    const need = goal.cost - S.fish, fps = fishPerSecond();
    return { ...goal, need, secs: fps > 0 ? need / fps : null };
  }

  const availableShores = () => SHORES.filter(sh => S.migrations + 1 >= sh.unlockAt);

  // =====================================================================
  // Actions
  // =====================================================================

  function gain(n) {
    if (!(n > 0)) return;
    S.fish = Math.min(MAX, S.fish + n);
    S.runFish = Math.min(MAX, S.runFish + n);
    S.lifetimeFish = Math.min(MAX, S.lifetimeFish + n);
  }

  // Warmth: keep patting and the penguin glows. Each pat in a row warms it (up to +WARMTH_BONUS on pats),
  // and it cools a couple of seconds after you stop. It isn't saved: it's a moment, not a chore.
  const WARMTH_PATS = 50, WARMTH_GAP = 2000, WARMTH_BONUS = 0.25;
  const warmth = { count: 0, last: 0 };
  const warmthLevel = () => (warmth.count > 0 && now() - warmth.last <= WARMTH_GAP ? Math.min(1, warmth.count / WARMTH_PATS) : 0);
  const warmthMult = () => 1 + (WARMTH_BONUS + (M && M.warmthBonusExtra ? M.warmthBonusExtra : 0)) * warmthLevel();

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
    const auto = (M && M.autoRate) ? M.autoRate : 0;
    return manualPatTimes.length + auto;
  }

  // how: "tap" (click, key or press), "rub" (stroking it) or "hold" (pressing and holding)
  function clickPenguin(pos, auto = false, how = "tap") {
    let p = clickPower();
    if (!auto) {
      recordManualPat();
      const t = now();
      if (t - warmth.last > WARMTH_GAP) warmth.count = 0;
      const before = warmthLevel();
      warmth.count += (M && M.warmthRate ? M.warmthRate : 1);
      warmth.last = t;
      p *= warmthMult();
      if (before < 1 && warmthLevel() >= 1) bus.emit("toasty", {});
    }
    const crit = Math.random() < M.critChance;   // Big Catch
    if (crit) { p *= M.critMult; S.stats.bigCatches++; }
    gain(p);
    if (auto) return p;
    S.stats.clicks++;
    S.stats.clickFish = Math.min(MAX, S.stats.clickFish + p);
    if (how === "rub") S.stats.rubPats++;
    bus.emit("click", { amount: p, x: pos && pos.x, y: pos && pos.y, crit, how });
    return p;
  }

  // ---------- Colony purchases, research, heirlooms, helpers and migration: src/engine/actions.js ----------

  // ---------- Wardrobe, nap streaks, resident names, golden fish and penguin letters: src/engine/events.js ----------
  function ensureDefaultNames(...args) { return E.ensureDefaultNames(...args); }

  // ---------- Memories (achievements) and shore passport stamps: src/engine/progress.js ----------
  function checkPassportStamps(...args) { return E.checkPassportStamps(...args); }

  // ---------- Campfire cooking and deep-sea diving: src/engine/activities.js ----------
  function activeDive(...args) { return E.activeDive(...args); }
  function startDive(...args) { return E.startDive(...args); }
  function claimDive(...args) { return E.claimDive(...args); }

  const relicLevel = id => (S.relics && S.relics[id]) || 0;

  // Helper automation AI lives in src/engine/helpers.js (PI.helpers / PI.engine)
  const diverPickSpot = () => (E.diverPickSpot ? E.diverPickSpot() : null);
  const bestBuilding = () => (E.bestBuilding ? E.bestBuilding() : null);
  const runHelpers = dt => (E.runHelpers ? E.runHelpers(dt) : false);

  // ---------- Per-frame update ----------
  let autoTimer = 0, histTimer = 0, napMinute = false;
  function tick(dt) {
    const fps = fishPerSecond();
    gain(fps * dt);
    if (napping) { S.stats.napBonusFish += fps * dt * (1 - 1 / M.napMult); napMinute = true; }
    if (M.autoRate > 0) {
      autoTimer += dt;
      const step = 1 / M.autoRate;
      while (autoTimer >= step) { autoTimer -= step; clickPenguin(null, true); }
    }
    const t = now();
    if (S.buffs.some(b => b.until <= t)) { S.buffs = S.buffs.filter(b => b.until > t); bus.emit("buffs"); }
    if (S.cooking && S.cooking.id && S.cooking.until <= t) {
      const finishedDish = D.COOKING_RECIPE_BY_ID[S.cooking.id];
      S.cooking = { id: "", until: 0, startedAt: 0 };
      recompute();
      bus.emit("structure");
      bus.emit("dishFinished", { recipe: finishedDish });
    }
    if (S.dive && S.dive.spotId && S.dive.until <= t && !S.dive.ready) {
      S.dive.ready = true;
      bus.emit("structure");
      bus.emit("diveReady", { spot: D.DIVE_SPOT_BY_ID[S.dive.spotId] });
    }
    if (S.shore === "quiethollow") S.stats.quietSeconds = (S.stats.quietSeconds || 0) + dt;
    checkPassportStamps();
    runHelpers(dt);
    histTimer += dt;
    if (histTimer >= 60) {
      histTimer = 0;
      S.history.push(napMinute ? [t, fishPerSecond(false), 1] : [t, fishPerSecond(false)]);   // 1 = napped that minute
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
    const cap = M.offlineCapH * 3600;
    // Pace is set by the whole absence since the last visit: 50% for the first week away, 25% after that.
    // Upgrades add to the base pace and Quiet Hollow doubles the total.
    const firstWeek = away < 7 * 86400;
    if (firstWeek && away >= 86400) S.stats.homecomings += 1;   // a day or more away, back before the first week is up
    if (S.shore === "quiethollow") S.stats.quietSeconds = (S.stats.quietSeconds || 0) + Math.min(away, 3600);
    if (helperOn("diver") && away >= 60) {
      let simAway = Math.min(away, cap);
      for (let cycles = 0; cycles < 10; cycles++) {
        const active = activeDive();
        if (active && active.ready) {
          claimDive(true);
        }
        if (!activeDive()) {
          const spotId = diverPickSpot();
          if (!spotId) break;
          const spot = D.DIVE_SPOT_BY_ID[spotId];
          const dur = spot.duration * (M && M.diveDurationMult ? M.diveDurationMult : 1);
          if (simAway >= dur) {
            simAway -= dur;
            startDive(spotId, true);
            S.dive.until = now() - simAway * 1000;
            S.dive.ready = true;
          } else {
            startDive(spotId, true);
            S.dive.until = now() + (dur - simAway) * 1000;
            break;
          }
        } else {
          break;
        }
      }
    }
    const eff = (M.offlineEff + (firstWeek ? 0.25 : 0)) * M.offlineMult;
    const earned = fishPerSecond(false) * Math.min(away, cap) * eff;
    S.lastTick = now();
    if (earned <= 0) return null;
    gain(earned);
    return { away, earned, eff, cap, firstWeek };
  }

  // =====================================================================
  // Saves: moved to src/engine/save.js (PI.save / PI.engine)
  // =====================================================================
  const save = () => (E.save ? E.save() : false);

  function replaceState(newState) {
    S = newState;
    S.buffs = [];
    S.lastTick = now();
    manualPatTimes.length = 0;
    if (E.savingBlocked !== undefined) E.savingBlocked = false;
    recompute();
    bus.emit("stateReplaced");
    bus.emit("structure");
    save();
  }

  // =====================================================================
  // Public API
  // =====================================================================
  // Live getters (Object.assign would copy their values once, so define them properly)
  Object.defineProperties(E, {
    state: { get: () => S, set: v => { S = v; }, enumerable: true },
    M: { get: () => M, enumerable: true },
  });
  Object.assign(E, {
    MAX, bus, now, manualPatTimes,
    setSeasonOverride(v) { seasonOverride = v; recompute(); },
    defaultSettings, freshState, recompute, replaceState, treeSpentOn, helpersSpentOn,
    has, milestonesReached, nodeLevel, nodeCost, nodeReqsMet, spendableFeathers, helperOn,
    researchLevel, researchCost, researchUnlocked, upgradeCost, currentSeason,
    buffMult, setNapping, napMult, fishPerSecond, buildingFps, clickPower, costOf, maxAffordable, previewBuy, buildingVisible,
    featherTotalFor, pendingFeathers, nextFeatherAt, availableUpgrades, availableShores, bestBuilding,
    gain, clickPenguin, patsPerSecond, warmthLevel, WARMTH_BONUS,
    foremanStrategy: () => S.foremanStrategy || "impact",
    shopkeeperStrategy: () => S.shopkeeperStrategy || "impact",
    diverStrategy: () => S.diverStrategy || "hunter", diverPickSpot,
    runHelpers, tick, applyOffline, relicLevel, nextGoal,
    // Forwarders to the split-out modules (each module replaces these with its own functions)
    ensureDefaultNames, checkPassportStamps, activeDive, startDive, claimDive,
  });
  PI.engine = E;
  PI.bus = bus;
})(typeof globalThis !== "undefined" ? (globalThis.PI = globalThis.PI || {}) : (window.PI = window.PI || {}));
