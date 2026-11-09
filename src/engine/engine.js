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

  function buyBuilding(id, n = 1, origin = null, quiet = false) {
    const b = B_BY_ID[id];
    if (!b || n < 1) return false;
    const cost = costOf(b, S.buildings[id], n);
    if (S.fish < cost) return false;
    const before = milestonesReached(S.buildings[id]);
    S.fish -= cost;
    S.buildings[id] += n;
    S.stats.buildingsBought += n;
    const gained = milestonesReached(S.buildings[id]) - before;
    recompute();
    if (!quiet) {
      bus.emit("structure");
      bus.emit("buyBuilding", { id, n, origin });
    }
    if (gained > 0) bus.emit("milestone", { b, mult: Math.pow(M.milestoneMult, gained), origin, quiet });
    checkPassportStamps();
    return true;
  }

  function buyUpgrade(id, origin = null, quiet = false) {
    const u = UP_BY_ID[id];
    if (!u || has(id) || !u.unlocked(S)) return false;
    const cost = upgradeCost(u);
    if (S.fish < cost) return false;
    S.fish -= cost;
    S.upgrades.push(id);
    S.stats.upgradesBought++;
    recompute();
    if (!quiet) {
      bus.emit("structure");
      bus.emit("buyUpgrade", { u, origin });
    }
    return true;
  }

  function buyAllUpgrades(origin = null, quiet = false) {
    let count = 0;
    for (const u of availableUpgrades()) {
      if (S.fish < upgradeCost(u)) break;   // sorted by cost, so nothing later is affordable
      if (buyUpgrade(u.id, null, true)) count++;
    }
    if (count) {
      bus.emit("structure");
      if (!quiet) bus.emit("buyAll", { count, origin });
    }
    return count;
  }

  function buyResearch(id, origin = null, quiet = false) {
    const r = R_BY_ID[id], L = researchLevel(id);
    if (!r || L >= r.max || !researchUnlocked(r)) return false;
    const cost = researchCost(r, L);
    if (S.fish < cost) return false;
    S.fish -= cost;
    S.research[id] = L + 1;
    S.stats.researchBought++;
    recompute();
    if (!quiet) {
      bus.emit("structure");
      bus.emit("buyResearch", { r, level: L + 1, origin });
    }
    checkPassportStamps();
    return true;
  }

  function learnNode(id, origin = null) {
    const n = H_BY_ID[id], L = nodeLevel(id);
    if (!n || id === "spirit" || L >= n.max || !nodeReqsMet(n)) return false;
    const cost = nodeCost(n, L);
    if (spendableFeathers() < cost) return false;
    S.feathersSpent += cost;
    S.heritage[id] = L + 1;
    recompute();
    bus.emit("structure");
    bus.emit("learnNode", { n, level: L + 1, origin });
    return true;
  }

  function refundTree() {
    S.heritage = {};
    S.feathersSpent = helpersSpentOn(S.helpers);   // helpers aren't refunded, only the tree
    recompute();
    bus.emit("structure");
    bus.emit("respec");
  }

  function hireHelper(id, origin = null) {
    const h = HELPER_BY_ID[id];
    if (!h || id in S.helpers || spendableFeathers() < h.cost) return false;
    S.feathersSpent += h.cost;
    S.helpers[id] = true;
    bus.emit("structure");
    bus.emit("hireHelper", { h, origin });
    return true;
  }

  function toggleHelper(id) {
    if (!(id in S.helpers)) return;
    S.helpers[id] = !S.helpers[id];
    bus.emit("structure");
  }

  function setForemanStrategy(id) {
    if (!FOREMAN_STRATEGY_BY_ID[id]) return false;
    S.foremanStrategy = id;
    save();
    bus.emit("foremanStrategy", id);
    bus.emit("structure");
    return true;
  }

  function setShopkeeperStrategy(id) {
    if (!SHOPKEEPER_STRATEGY_BY_ID[id]) return false;
    S.shopkeeperStrategy = id;
    save();
    bus.emit("shopkeeperStrategy", id);
    bus.emit("structure");
    return true;
  }

  function setDiverStrategy(id) {
    if (!D.DIVER_STRATEGY_BY_ID[id]) return false;
    S.diverStrategy = id;
    save();
    bus.emit("diverStrategy", id);
    bus.emit("structure");
    return true;
  }

  function doMigrate(shoreId = "home", auto = false) {
    const gainF = pendingFeathers();
    if (gainF < 1) return false;
    const shore = availableShores().find(sh => sh.id === shoreId) || SHORE_BY_ID.home;
    const prevShore = S.shore;
    if (prevShore === "blizzard") {
      S.stats.blizzardMigrateFeathers = Math.max(S.stats.blizzardMigrateFeathers || 0, gainF);
      if (gainF >= 15 && !(S.shoreStamps || []).includes("blizzard")) {
        if (!S.shoreStamps) S.shoreStamps = [];
        if (!S.shoreStampDates) S.shoreStampDates = {};
        S.shoreStamps.push("blizzard");
        S.shoreStampDates.blizzard = now();
        const stamp = D.PASSPORT_STAMP_BY_ID.blizzard;
        bus.emit("passportStamp", { stamp, shore: SHORE_BY_ID.blizzard });
        checkAchievements();
      }
    }
    S.feathersEarned += gainF;
    S.bonusFeathers = 0;
    S.migrations++;
    const keep = S.upgrades.filter(id => {
      const [b, t] = id.split("_");
      return B_BY_ID[b] && Number(t) < M.keepTiers;
    });
    S.fish = M.startFish;
    S.runFish = 0;
    S.buildings = { ...M.start };
    S.upgrades = keep;
    S.research = {};
    S.buffs = [];
    S.shore = shore.id;
    if (!S.shoresVisited.includes(shore.id)) S.shoresVisited.push(shore.id);
    S.stats.runStartedAt = now();
    manualPatTimes.length = 0;
    recompute();
    bus.emit("structure");
    bus.emit("migrate", { feathers: S.feathersEarned, gained: gainF, shore, auto });
    return true;
  }

  function setNextShore(id) {
    if (availableShores().some(sh => sh.id === id)) { S.nextShore = id; bus.emit("structure"); }
  }

  // ---------- Wardrobe ----------
  const cosmeticItem = (slot, id) => COSMETICS[slot].find(c => c.id === id) || COSMETICS[slot][0];
  const cosmeticUnlocked = (slot, id) => { const c = COSMETICS[slot].find(x => x.id === id); return !!c && c.need(S); };
  function setOutfit(slot, id) {
    if (!COSMETICS[slot] || !cosmeticUnlocked(slot, id) || S.cosmetics[slot] === id) return false;
    S.cosmetics[slot] = id;
    S.stats.outfitChanges++;
    bus.emit("outfit", { slot, id });
    return true;
  }

  // ---------- Nap streak ----------
  const NAP_STREAK_SECS = 300;   // a nap day needs this much napping
  function addNapTime(secs, date = new Date(now())) {
    const ns = S.napStreak, today = dayKey(date);
    if (ns.day !== today) { ns.day = today; ns.secs = 0; }
    ns.secs += secs;
    if (ns.secs < NAP_STREAK_SECS || ns.last === today) return false;
    const gap = ns.last ? daysBetween(ns.last, today) : 0;
    if (gap === 1) ns.count++;
    else if (gap === 2 && graceFree(today)) { ns.count++; ns.grace = dayKey(new Date(date.getFullYear(), date.getMonth(), date.getDate() - 1)); }
    else ns.count = 1;
    ns.last = today;
    const before = ns.best;
    ns.best = Math.max(ns.best, ns.count);
    bus.emit("napStreak", { count: ns.count, best: ns.best, mask: before < 7 && ns.best >= 7 });
    return true;
  }
  // A streak survives one missed day a week: a gap of two days is fine if no day was forgiven in the last 7
  const keyDate = k => { const [y, m, d] = k.split("-").map(Number); return new Date(y, m - 1, d); };
  const daysBetween = (a, b) => Math.round((keyDate(b) - keyDate(a)) / 86400000);
  const graceFree = today => !S.napStreak.grace || daysBetween(S.napStreak.grace, today) >= 7;
  const napStreakNow = (date = new Date(now())) => {
    const ns = S.napStreak;
    if (!ns.last) return 0;
    const today = dayKey(date), gap = daysBetween(ns.last, today);
    return gap <= 1 || (gap === 2 && graceFree(today)) ? ns.count : 0;
  };

  // ---------- Resident names ----------
  const NAME_SLOTS = 6;
  const cleanName = v => String(v == null ? "" : v).replace(/[\u0000-\u001f\u007f<>]/g, "").replace(/\s+/g, " ").trim().slice(0, 16);
  function setName(i, name) {
    if (!(i >= 0 && i < NAME_SLOTS)) return false;
    const n = cleanName(name);
    while (S.names.length <= i) S.names.push("");
    if (S.names[i] === n) return false;
    S.names[i] = n;
    while (S.names.length && !S.names[S.names.length - 1]) S.names.pop();
    ensureDefaultNames();
    bus.emit("names");
    return true;
  }
  // Every slot has a cute default, kept in the save so residents don't change names on a reload.
  const randomCuteName = (avoid = []) => {
    const pool = D.CUTE_NAMES.filter(n => !avoid.includes(n));
    return (pool.length ? pool : D.CUTE_NAMES)[Math.floor(Math.random() * (pool.length || D.CUTE_NAMES.length))];
  };
  function ensureDefaultNames() {
    const d = S.defaultNames;
    for (let i = 0; i < NAME_SLOTS; i++) {
      if (d[i] && !d.slice(0, i).includes(d[i]) && !S.names.includes(d[i])) continue;   // no two residents share a name
      d[i] = randomCuteName([...d.slice(0, i), ...S.names]);
    }
    d.length = NAME_SLOTS;
  }
  // A fresh cute name for slot i, different from every name already in use
  const suggestName = i => randomCuteName([...S.names, ...S.defaultNames, S.names[i]]);
  // Slot by slot: the player's name if they gave one, otherwise the default
  const residentNames = () => Array.from({ length: NAME_SLOTS }, (_, i) => S.names[i] || S.defaultNames[i]).filter(Boolean);
  const playerNames = () => S.names.filter(Boolean);

  // ---------- Golden fish ----------
  const goldenDelay = () => (120 + Math.random() * 180) * 1000 / M.goldenFreq;

  function rollGoldenVariant() {
    const r = Math.random();
    const b = (M && M.exoticChanceBonus) || 0;
    if (r < 0.05 + b * 0.3) return "feathered";
    if (r < 0.20 + b * 0.7) return "glacier";
    if (r < 0.35 + b) return "rainbow";
    return "golden";
  }

  function addBuff(type, name, mult, ms) {
    const until = now() + ms;
    const existing = S.buffs.find(b => b.name === name && b.until > now());
    if (existing) { existing.until = Math.max(existing.until, until); existing.mult = Math.max(existing.mult, mult); }
    else S.buffs.push({ type, name, mult, until });
  }

  function goldenEffect(pos = {}, auto = false, force = null, quiet = false, variant = null) {
    S.stats.goldenClicks++;
    if (!variant) variant = force === "rush" ? "golden" : (force && ["rainbow", "glacier", "feathered", "golden"].includes(force) ? force : rollGoldenVariant());
    if (variant !== "golden") S.stats.exoticCatches = (S.stats.exoticCatches || 0) + 1;
    if (S.shore === "sunnycove") {
      S.stats.sunnyCatches = (S.stats.sunnyCatches || 0) + 1;
      checkPassportStamps();
    }

    const season = M.season;
    if (season) {
      S.stats.seasonalCatches++;
      if (!S.seasonalUnlocks.includes(season.id)) {
        S.seasonalUnlocks.push(season.id);
        const [slot, id] = season.cosmetic;
        bus.emit("seasonUnlock", { season, item: cosmeticItem(slot, id) });
      }
    }
    const d = M.goldenDur;
    const secs = base => Math.round(base * d);
    let msg, kind;

    if (variant === "rainbow") {
      kind = "rainbow";
      addBuff("prod", "Rainbow Frenzy", 5, secs(25) * 1000);
      addBuff("click", "Bubble Tap", 10, secs(25) * 1000);
      msg = `🌈 <b>Rainbow Frenzy!</b> A splash of color: production ×5 and pat power ×10 for ${secs(25)}s!`;
    } else if (variant === "glacier") {
      kind = "glacier";
      const nowMs = now();
      const activeBuffs = S.buffs.filter(b => b.until > nowMs);
      if (activeBuffs.length > 0) {
        const ext = secs(25) * 1000;
        activeBuffs.forEach(b => { b.until += ext; });
        msg = `❄️ <b>Glacier Freeze!</b> Time stops on the ice: all active buffs extended by +${secs(25)}s!`;
      } else {
        addBuff("prod", "Glacier Surge", 12, secs(30) * 1000);
        msg = `❄️ <b>Glacier Surge!</b> Crisp polar wind: production ×12 for ${secs(30)}s!`;
      }
    } else if (variant === "feathered") {
      kind = "feathered";
      S.bonusFeathers = (S.bonusFeathers || 0) + 1;
      const amount = Math.max(10, fishPerSecond(false) * 600 * M.luckyMult);
      gain(amount);
      msg = `🪶 <b>Moult Bounty!</b> A rare golden feather (+1 pending feather) and +${fmt(amount)} fish!`;
    } else {
      const roll = force === "rush" ? 0.5 : Math.random();
      if (M.aurora && roll < 0.08 && !force) {
        kind = "aurora";
        addBuff("prod", "Aurora Blessing", 50, secs(30) * 1000);
        msg = `<b>Aurora Blessing!</b> The sky lights up: production ×50 for ${secs(30)}s`;
      } else if (roll < 0.45) {
        kind = "lucky";
        const amount = (Math.min(S.fish * 0.15, fishPerSecond(false) * 600) + 13) * M.luckyMult;
        gain(amount);
        msg = `<b>Lucky Catch!</b> +${fmt(amount)} fish`;
      } else if (roll < 0.85) {
        kind = "rush";
        addBuff("prod", "Cocoa Rush", M.rushMult, secs(77) * 1000);
        msg = `<b>Cocoa Rush!</b> Everyone's warmed up: production ×${M.rushMult} for ${secs(77)}s`;
      } else {
        kind = "flurry";
        addBuff("click", "Flipper Flurry", 77, secs(13) * 1000);
        msg = `<b>Flipper Flurry!</b> Pats are ×77 for ${secs(13)}s`;
      }
    }
    bus.emit("golden", { msg, kind, variant, auto, quiet, x: pos.x, y: pos.y });
    bus.emit("buffs");
    return kind;
  }

  // ---------- Penguin letters ----------
  function dayKey(date = new Date(now())) {
    const p = n => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
  }
  function seededRng(str) {
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) { h = Math.imul(h ^ str.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
    return () => {   // mulberry32
      h = (h + 0x6D2B79F5) | 0;
      let t = Math.imul(h ^ (h >>> 15), 1 | h);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const statValue = stat => (stat === "lifetimeFish" ? S.lifetimeFish : S.stats[stat] || 0);
  const letterProgress = l => Math.min(l.target, Math.max(0, statValue(LT_BY_ID[l.type].stat) - l.base));
  const letterReward = () => Math.max(100, fishPerSecond(false) * 900);   // 15 minutes of production

  function ensureLetters(date = new Date(now())) {
    const day = dayKey(date);
    if (S.letters.day === day) return false;
    const rng = seededRng(`${day}:${S.stats.startedAt}`);
    const pool = LETTER_TYPES.filter(t => !t.available || t.available(S));
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    const list = pool.slice(0, 3).map(t => {
      let target = Math.round(t.range[0] + rng() * (t.range[1] - t.range[0]));
      if (t.fishMinutes) target = Math.max(500, Math.round(fishPerSecond(false) * 60 * target));
      const [sender, icon] = LETTER_SENDERS[Math.floor(rng() * LETTER_SENDERS.length)];
      return { type: t.id, target, base: statValue(t.stat), claimed: false, sender, icon };
    });
    // Save the letters: a letter from yesterday that was never answered stays open for one more day, marked late
    const yesterday = dayKey(new Date(date.getFullYear(), date.getMonth(), date.getDate() - 1));
    const carried = S.letters.day === yesterday ? S.letters.list.filter(l => !l.claimed && !l.late).map(l => ({ ...l, late: true })) : [];
    S.letters = { day, list: [...carried, ...list], bonus: false };
    bus.emit("letters");
    return true;
  }

  function claimLetter(i, origin = null) {
    const l = S.letters.list[i];
    if (!l || l.claimed || letterProgress(l) < l.target) return false;
    l.claimed = true;
    const reward = letterReward();
    gain(reward);
    S.stats.lettersClaimed++;
    bus.emit("letterClaimed", { l, reward, origin });
    bus.emit("letters");
    return true;
  }

  // The care package counts today's three letters only; late letters from yesterday don't block it
  const todaysLetters = () => S.letters.list.filter(l => !l.late);
  function claimLetterBonus(origin = null) {
    const today = todaysLetters();
    if (S.letters.bonus || !today.length || !today.every(l => l.claimed)) return false;
    S.letters.bonus = true;
    const secs = Math.round(180 * M.goldenDur);
    addBuff("prod", "Care Package", 7, secs * 1000);
    bus.emit("letterBonus", { secs, origin });
    bus.emit("buffs");
    bus.emit("letters");
    return true;
  }

  // Seconds until the daily letters reset (the next local midnight, the same day boundary dayKey uses)
  function secsToNewDay(date = new Date(now())) {
    const next = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
    return Math.max(0, (next - date) / 1000);
  }

  // ---------- Achievements ----------
  // Progress of one memory as { cur, goal, kind, frac }, or null if it is a one-off goal
  function memoryProgress(a) {
    if (!a.prog) return null;
    const [cur, goal, kind] = a.prog(S, E);
    return { cur: Math.min(cur, goal), goal, kind, frac: Math.max(0, Math.min(1, cur / goal)) };
  }
  // Locked memories that have a progress bar, closest to done first
  function nearestMemories(limit = 3, minFrac = 0) {
    return ACHIEVEMENTS.filter(a => a.prog && !S.achievements.includes(a.id))
      .map(a => ({ a, ...memoryProgress(a) })).filter(m => m.frac >= minFrac && m.frac < 1)
      .sort((x, y) => y.frac - x.frac).slice(0, limit);
  }
  // Called when the player leaves the Memories tab: the New markers go away
  function clearNewMemories() { S.achNew = []; }
  function checkAchievements() {
    const fresh = ACHIEVEMENTS.filter(a => !S.achievements.includes(a.id) && a.check(S, E));
    if (!fresh.length) return [];
    fresh.forEach(a => { S.achievements.push(a.id); S.achDates[a.id] = now(); S.achNew.push(a.id); });
    recompute();
    bus.emit("structure");
    bus.emit("achievements", fresh);
    return fresh;
  }

  // ---------- Shore Passport Stamps ----------
  function passportProgress(stampId) {
    const stamp = D.PASSPORT_STAMP_BY_ID[stampId];
    if (!stamp) return null;
    const done = (S.shoreStamps || []).includes(stampId);
    let cur = 0;
    const target = stamp.target;
    if (done) {
      cur = target;
    } else if (S.migrations < 1) {
      cur = 0;
    } else {
      if (stampId === "home") cur = S.shore === "home" ? totalColony(S) : 0;
      else if (stampId === "krillbay") cur = S.shore === "krillbay" ? (S.buildings.krill || 0) : 0;
      else if (stampId === "sunnycove") cur = S.stats.sunnyCatches || 0;
      else if (stampId === "blizzard") cur = S.shore === "blizzard" ? pendingFeathers() : (S.stats.blizzardMigrateFeathers || 0);
      else if (stampId === "aurorafields") cur = S.shore === "aurorafields" ? (S.buildings.aurora || 0) : 0;
      else if (stampId === "quiethollow") cur = S.stats.quietSeconds || 0;
      else if (stampId === "harbour") cur = S.shore === "harbour" ? totalColony(S) : 0;
      else if (stampId === "rookery") cur = S.shore === "rookery" ? Object.values(S.research).reduce((a, b) => a + b, 0) : 0;
    }
    const frac = done ? 1 : Math.max(0, Math.min(1, cur / target));
    return { cur, target, done, frac, time: stamp.time || false };
  }

  function checkPassportStamps() {
    if (S.migrations < 1) return [];
    const currentShore = S.shore;
    if (!currentShore || (S.shoreStamps || []).includes(currentShore)) return [];
    const p = passportProgress(currentShore);
    if (p && p.cur >= p.target) {
      if (!S.shoreStamps) S.shoreStamps = [];
      if (!S.shoreStampDates) S.shoreStampDates = {};
      S.shoreStamps.push(currentShore);
      S.shoreStampDates[currentShore] = now();
      recompute();
      const stamp = D.PASSPORT_STAMP_BY_ID[currentShore];
      bus.emit("structure");
      bus.emit("passportStamp", { stamp, shore: SHORE_BY_ID[currentShore] });
      checkAchievements();
      return [currentShore];
    }
    return [];
  }

  // ---------- Campfire Cooking ----------
  function recipeCost(r) {
    if (!r) return Infinity;
    const base = Math.max(r.minCost, Math.round(fishPerSecond(false) * 60 * r.costMins));
    return Math.max(r.minCost, Math.round(base * (M && M.cookingCostMult ? M.cookingCostMult : 1)));
  }

  function recipeUnlocked(r) {
    if (!r) return false;
    return S.lifetimeFish >= (r.unlockLifetime || 0);
  }

  function activeDish() {
    if (!S.cooking || !S.cooking.id || S.cooking.until <= now()) return null;
    const r = D.COOKING_RECIPE_BY_ID[S.cooking.id];
    if (!r) return null;
    const remaining = Math.max(0, (S.cooking.until - now()) / 1000);
    return {
      ...r,
      remaining,
      startedAt: S.cooking.startedAt,
      until: S.cooking.until,
      frac: Math.max(0, Math.min(1, remaining / r.duration)),
    };
  }

  function cookRecipe(id, origin = null) {
    const r = D.COOKING_RECIPE_BY_ID[id];
    if (!r || !recipeUnlocked(r)) return false;
    const cost = recipeCost(r);
    if (S.fish < cost) return false;
    S.fish -= cost;
    const t = now();
    const durMult = M && M.cookingDurationMult ? M.cookingDurationMult : 1;
    S.cooking = { id: r.id, until: t + (r.duration * durMult) * 1000, startedAt: t };
    S.stats.dishesCooked = (S.stats.dishesCooked || 0) + 1;
    recompute();
    bus.emit("structure");
    bus.emit("dishCooked", { recipe: r, cost, until: S.cooking.until, origin });
    checkAchievements();
    return true;
  }

  // ---------- The Ice Hole & Deep-Sea Diving ----------
  const diveSpotUnlocked = spot => (S.lifetimeFish || 0) >= (spot.unlockLifetime || 0);

  function activeDive() {
    if (!S.dive || !S.dive.spotId) return null;
    const spot = D.DIVE_SPOT_BY_ID[S.dive.spotId];
    if (!spot) return null;
    const t = now();
    const ready = S.dive.ready || (S.dive.until > 0 && S.dive.until <= t);
    const remaining = Math.max(0, Math.ceil((S.dive.until - t) / 1000));
    return {
      spot,
      spotId: S.dive.spotId,
      startedAt: S.dive.startedAt,
      until: S.dive.until,
      ready,
      remaining,
      totalDuration: spot.duration,
      progress: Math.min(1, Math.max(0, 1 - remaining / spot.duration)),
    };
  }

  function startDive(spotId, auto = false) {
    const spot = D.DIVE_SPOT_BY_ID[spotId];
    if (!spot || !diveSpotUnlocked(spot)) return false;
    if (activeDive()) return false;
    const t = now();
    const durMult = M && M.diveDurationMult ? M.diveDurationMult : 1;
    S.dive = { spotId, startedAt: t, until: t + (spot.duration * durMult) * 1000, ready: false };
    save();
    bus.emit("structure");
    bus.emit("diveStarted", { spot, auto });
    return true;
  }

  function claimDive(auto = false) {
    const active = activeDive();
    if (!active || !active.ready) return null;
    if (!S.relics) S.relics = {};
    const pool = active.spot.relics || [];
    const unowned = pool.filter(id => !S.relics[id]);
    let picked = null;
    let bonusFish = 0;
    if (unowned.length > 0) {
      picked = unowned[Math.floor(Math.random() * unowned.length)];
      S.relics[picked] = 1;
    } else {
      const unmaxed = pool.filter(id => (S.relics[id] || 0) < 3);
      if (unmaxed.length > 0) {
        picked = unmaxed[Math.floor(Math.random() * unmaxed.length)];
        S.relics[picked] = (S.relics[picked] || 0) + 1;
      } else {
        // All relics in this dive spot are 3-star: give generous bonus fish
        bonusFish = Math.max(500, Math.round(fishPerSecond() * 900));
        S.fish += bonusFish;
        S.runFish += bonusFish;
        S.lifetimeFish += bonusFish;
      }
    }
    S.stats.divesCompleted = (S.stats.divesCompleted || 0) + 1;
    S.dive = { spotId: "", startedAt: 0, until: 0, ready: false };
    recompute();
    checkAchievements();
    save();
    const relic = picked ? D.RELIC_BY_ID[picked] : null;
    const level = picked ? S.relics[picked] : 0;
    const result = { spot: active.spot, relic, level, bonusFish, auto };
    bus.emit("structure");
    bus.emit("relicFound", result);
    return result;
  }

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
    MAX, bus, now,
    setSeasonOverride(v) { seasonOverride = v; recompute(); },
    defaultSettings, freshState, recompute, replaceState, treeSpentOn, helpersSpentOn,
    has, milestonesReached, nodeLevel, nodeCost, nodeReqsMet, spendableFeathers, helperOn,
    researchLevel, researchCost, researchUnlocked, upgradeCost, currentSeason,
    buffMult, setNapping, napMult, fishPerSecond, buildingFps, clickPower, costOf, maxAffordable, previewBuy, buildingVisible,
    featherTotalFor, pendingFeathers, nextFeatherAt, availableUpgrades, availableShores, bestBuilding,
    gain, clickPenguin, patsPerSecond, warmthLevel, WARMTH_BONUS, buyBuilding, buyUpgrade, buyAllUpgrades, buyResearch, learnNode, refundTree,
    hireHelper, toggleHelper, setForemanStrategy, foremanStrategy: () => S.foremanStrategy || "impact",
    setShopkeeperStrategy, shopkeeperStrategy: () => S.shopkeeperStrategy || "impact",
    setDiverStrategy, diverStrategy: () => S.diverStrategy || "hunter", diverPickSpot, doMigrate, setNextShore,
    cosmeticItem, cosmeticUnlocked, setOutfit, addNapTime, napStreakNow,
    NAME_SLOTS, cleanName, setName, residentNames, playerNames, suggestName, ensureDefaultNames,
    goldenDelay, goldenEffect, rollGoldenVariant,
    dayKey, ensureLetters, letterProgress, todaysLetters, letterReward, claimLetter, claimLetterBonus,
    checkAchievements, clearNewMemories, runHelpers, tick, applyOffline,
    passportProgress, checkPassportStamps,
    recipeCost, recipeUnlocked, activeDish, cookRecipe,
    diveSpotUnlocked, activeDive, startDive, claimDive, relicLevel,
    nextGoal, memoryProgress, nearestMemories, secsToNewDay,
  });
  PI.engine = E;
  PI.bus = bus;
})(typeof globalThis !== "undefined" ? (globalThis.PI = globalThis.PI || {}) : (window.PI = window.PI || {}));
