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
      sound: true, volume: 0.5, ambience: false,
      shake: 0.6, reduceMotion: prefersReducedMotion, textSize: 1,
    };
  }

  function freshStats() {
    return {
      clicks: 0, clickFish: 0, goldenClicks: 0, bigCatches: 0, longestAway: 0,
      buildingsBought: 0, upgradesBought: 0, researchBought: 0, lettersClaimed: 0, outfitChanges: 0, seasonalCatches: 0,
      startedAt: now(), runStartedAt: now(),
    };
  }

  function freshState() {
    return {
      fish: 0, runFish: 0, lifetimeFish: 0,
      buildings: Object.fromEntries(BUILDINGS.map(b => [b.id, 0])),
      upgrades: [], achievements: [],
      feathersEarned: 0, feathersSpent: 0,
      heritage: {},        // heirloom id -> level
      research: {},        // workshop id -> level (reset on migration)
      helpers: {},         // helper id -> true (on) / false (off); a key means it's hired
      shore: "home", nextShore: "home", shoresVisited: ["home"],
      cosmetics: { hat: "coral", scarf: "coral", item: "mug" },
      seasonalUnlocks: [], // season ids where a golden fish was caught
      letters: { day: "", list: [], bonus: false },
      history: [],         // [timestamp, fish per second] samples for the Stats graph
      migrations: 0,
      buffs: [],
      stats: freshStats(),
      settings: defaultSettings(),
      lastTick: now(),
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
  }

  function recompute() {
    const m = {
      building: Object.fromEntries(BUILDINGS.map(b => [b.id, 1])),
      click: 1, clickFps: 0, global: 1, goldenFreq: 1, goldenDur: 1,
      luckyMult: 1, rushMult: 7, critChance: 0, critMult: 10, costMult: 1, upgradeCost: 1, researchCost: 1,
      offlineEff: 0.25, offlineMult: 1, offlineCapH: 24, autoRate: 0, achBonus: ACH_BONUS, featherPer: FEATHER_BONUS,
      milestoneMult: 2, synergy: 1, featherGain: 1, keepTiers: 0, startFish: 0, aurora: false, noGolden: false,
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

  function buffMult(type) {
    const t = now();
    let k = 1;
    for (const b of S.buffs) if (b.type === type && b.until > t) k *= b.mult;
    return k;
  }
  const fishPerSecond = (withBuffs = true) => (withBuffs ? Math.min(MAX, M.baseFps * buffMult("prod")) : M.baseFps);
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
  const buildingVisible = (b, i) => S.buildings[b.id] > 0 || i === 0 || S.buildings[BUILDINGS[i - 1].id] > 0 || S.runFish >= b.baseCost * 0.5;

  // Cube root (as in Cookie Clicker): doubling your feathers takes 8× the fish, so later runs lengthen
  // instead of collapsing to zero. A square root let feathers compound into a runaway.
  const featherTotalFor = lifetime => Math.floor(Math.cbrt(lifetime / FEATHER_SCALE) * M.featherGain);
  const pendingFeathers = () => Math.max(0, featherTotalFor(S.lifetimeFish) - S.feathersEarned);
  const nextFeatherAt = () => Math.pow((featherTotalFor(S.lifetimeFish) + 1) / M.featherGain, 3) * FEATHER_SCALE;
  const availableUpgrades = () => UPGRADES.filter(u => !has(u.id) && u.unlocked(S)).sort((a, b) => upgradeCost(a) - upgradeCost(b));
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

  function clickPenguin(pos, auto = false) {
    let p = clickPower();
    const crit = Math.random() < M.critChance;   // Big Catch
    if (crit) { p *= M.critMult; S.stats.bigCatches++; }
    gain(p);
    if (auto) return p;
    S.stats.clicks++;
    S.stats.clickFish = Math.min(MAX, S.stats.clickFish + p);
    bus.emit("click", { amount: p, x: pos && pos.x, y: pos && pos.y, crit });
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

  function doMigrate(shoreId = "home", auto = false) {
    const gainF = pendingFeathers();
    if (gainF < 1) return false;
    const shore = availableShores().find(sh => sh.id === shoreId) || SHORE_BY_ID.home;
    S.feathersEarned += gainF;
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

  // ---------- Golden fish ----------
  const goldenDelay = () => (120 + Math.random() * 180) * 1000 / M.goldenFreq;

  function addBuff(type, name, mult, ms) {
    const until = now() + ms;
    const existing = S.buffs.find(b => b.name === name && b.until > now());
    if (existing) { existing.until = Math.max(existing.until, until); existing.mult = Math.max(existing.mult, mult); }
    else S.buffs.push({ type, name, mult, until });
  }

  function goldenEffect(pos = {}, auto = false) {
    S.stats.goldenClicks++;
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
    const roll = Math.random();
    let msg, kind;
    if (M.aurora && roll < 0.08) {
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
    bus.emit("golden", { msg, kind, auto, x: pos.x, y: pos.y });
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
    S.letters = { day, list, bonus: false };
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

  function claimLetterBonus(origin = null) {
    if (S.letters.bonus || !S.letters.list.length || !S.letters.list.every(l => l.claimed)) return false;
    S.letters.bonus = true;
    const secs = Math.round(180 * M.goldenDur);
    addBuff("prod", "Care Package", 7, secs * 1000);
    bus.emit("letterBonus", { secs, origin });
    bus.emit("buffs");
    bus.emit("letters");
    return true;
  }

  // ---------- Achievements ----------
  function checkAchievements() {
    const fresh = ACHIEVEMENTS.filter(a => !S.achievements.includes(a.id) && a.check(S, E));
    if (!fresh.length) return [];
    fresh.forEach(a => S.achievements.push(a.id));
    recompute();
    bus.emit("structure");
    bus.emit("achievements", fresh);
    return fresh;
  }

  // ---------- Helpers (automation) ----------
  const helperTimers = {};
  function bestBuilding() {
    let best = null, bestScore = Infinity;
    BUILDINGS.forEach((b, i) => {
      if (!buildingVisible(b, i)) return;
      const score = costOf(b, S.buildings[b.id], 1) / Math.max(1e-9, buildingFps(b.id));
      if (score < bestScore) { bestScore = score; best = b; }
    });
    return best;
  }

  function runHelpers(dt) {
    HELPERS.forEach(h => {
      if (!helperOn(h.id)) return;
      helperTimers[h.id] = (helperTimers[h.id] || 0) + dt;
      if (helperTimers[h.id] < h.every) return;
      helperTimers[h.id] = 0;
      let did = 0;
      if (h.id === "shopkeeper") did = buyAllUpgrades(null, true);
      if (h.id === "foreman") {
        for (let k = 0; k < 25; k++) {
          const b = bestBuilding();
          if (!b || !buyBuilding(b.id, 1, null, true)) break;
          did++;
        }
        if (did) bus.emit("structure");
      }
      if (h.id === "tinker") {
        for (let k = 0; k < 5; k++) {
          const r = RESEARCH.filter(x => researchUnlocked(x) && researchLevel(x.id) < x.max)
            .sort((a, b) => researchCost(a, researchLevel(a.id)) - researchCost(b, researchLevel(b.id)))[0];
          if (!r || !buyResearch(r.id, null, true)) break;
          did++;
        }
        if (did) bus.emit("structure");
      }
      if (h.id === "planner" && pendingFeathers() >= Math.max(1, S.feathersEarned)) {
        did = doMigrate(S.nextShore, true) ? 1 : 0;
      }
      if (did) bus.emit("helperAct", { h, count: did });
    });
  }

  // ---------- Per-frame update ----------
  let autoTimer = 0, histTimer = 0;
  function tick(dt) {
    gain(fishPerSecond() * dt);
    if (M.autoRate > 0) {
      autoTimer += dt;
      const step = 1 / M.autoRate;
      while (autoTimer >= step) { autoTimer -= step; clickPenguin(null, true); }
    }
    const t = now();
    if (S.buffs.some(b => b.until <= t)) { S.buffs = S.buffs.filter(b => b.until > t); bus.emit("buffs"); }
    runHelpers(dt);
    histTimer += dt;
    if (histTimer >= 60) {
      histTimer = 0;
      S.history.push([t, fishPerSecond(false)]);
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
    const eff = M.offlineEff * M.offlineMult;
    const earned = fishPerSecond(false) * Math.min(away, cap) * eff;
    S.lastTick = now();
    if (earned <= 0) return null;
    gain(earned);
    return { away, earned, eff, cap };
  }

  // =====================================================================
  // Saves: versioned, migrated step by step, validated field by field
  // =====================================================================

  // Each entry upgrades a save from version N to N+1. Never delete one: old saves walk the whole chain.
  const MIGRATIONS = {
    0: d => d,  // saves made before versioning already have the v1 shape
    1: d => {   // v2: added sound, ambience, shake, reduce-motion and text-size settings
      d.settings = Object.assign(defaultSettings(), d.settings || {});
      return d;
    },
    2: d => {   // v3: heirlooms became a levelled skill tree (list of ids -> {id: level}); added the Workshop
      const h = d.heritage;
      d.heritage = Array.isArray(h) ? Object.fromEntries(h.map(id => [id, 1])) : (h && typeof h === "object" ? h : {});
      d.research = d.research && typeof d.research === "object" ? d.research : {};
      return d;
    },
    3: d => {   // v4: helpers, shores, wardrobe, letters, seasons and production history
      d.helpers = {};
      d.shore = "home";
      d.nextShore = "home";
      d.shoresVisited = ["home"];
      d.cosmetics = { hat: "coral", scarf: "coral", item: "mug" };
      d.seasonalUnlocks = [];
      d.letters = { day: "", list: [], bonus: false };
      d.history = [];
      return d;
    },
  };

  class SaveError extends Error {
    constructor(kind, message) { super(message); this.kind = kind; }
  }

  function hash(str) {   // FNV-1a: detects truncated or edited save text (not anti-cheat)
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return (h >>> 0).toString(36);
  }

  function encodeSave() {
    const { buffs, ...data } = S;   // buffs are short-lived; don't persist them
    const b64 = btoa(unescape(encodeURIComponent(JSON.stringify({ ...data, version: SAVE_VERSION }))));
    return `${b64}.${hash(b64)}`;
  }

  function decodeSave(str) {
    str = String(str || "").trim();
    if (!str) throw new SaveError("empty", "There's no save text.");
    let b64 = str;
    const dot = str.lastIndexOf(".");
    if (dot > 0) {   // v1 saves have no checksum, so it's optional
      b64 = str.slice(0, dot);
      if (hash(b64) !== str.slice(dot + 1)) throw new SaveError("corrupt", "This save text is incomplete or has been changed.");
    }
    let data;
    try { data = JSON.parse(decodeURIComponent(escape(atob(b64)))); }
    catch (e) { throw new SaveError("corrupt", "This save text couldn't be read."); }
    if (!data || typeof data !== "object" || Array.isArray(data)) throw new SaveError("corrupt", "This save text couldn't be read.");
    return validate(migrateSave(data));
  }

  function migrateSave(d) {
    let v = Number.isInteger(d.version) ? d.version : 0;
    if (v > SAVE_VERSION) {
      throw new SaveError("newer", `This save is from a newer version of Penguin Idle (save v${v}, this page v${SAVE_VERSION}). Refresh the page to get the latest version.`);
    }
    while (v < SAVE_VERSION) { d = MIGRATIONS[v](d); v++; d.version = v; }
    return d;
  }

  const num = v => (typeof v === "number" && v >= 0 ? (isFinite(v) ? Math.min(v, MAX) : MAX) : 0);
  const idList = (v, table) => [...new Set(Array.isArray(v) ? v : [])].filter(id => table[id]);
  const obj = v => (v && typeof v === "object" && !Array.isArray(v) ? v : {});

  // Rebuild a clean state from plain data, checking every field rather than trusting the file
  function validate(data) {
    const s = freshState();
    ["fish", "runFish", "lifetimeFish", "feathersEarned", "migrations"].forEach(k => { s[k] = num(data[k]); });
    s.migrations = Math.floor(s.migrations);
    BUILDINGS.forEach(b => { s.buildings[b.id] = Math.floor(num(obj(data.buildings)[b.id])); });
    s.upgrades = idList(data.upgrades, UP_BY_ID);
    const levels = (v, list) => {   // {id: level} limited to known ids and each one's max level
      const out = {}, src = obj(v);
      list.forEach(x => { const L = Math.min(x.max, Math.floor(num(src[x.id]))); if (L > 0 && x.id !== "spirit") out[x.id] = L; });
      return out;
    };
    s.heritage = levels(data.heritage, TREE);
    s.research = levels(data.research, RESEARCH);
    const hIn = obj(data.helpers);
    HELPERS.forEach(h => { if (h.id in hIn) s.helpers[h.id] = hIn[h.id] === true; });
    // Derived from what's owned, not trusted from the file
    s.feathersSpent = treeSpentOn(s.heritage) + helpersSpentOn(s.helpers);
    s.achievements = idList(data.achievements, Object.fromEntries(ACHIEVEMENTS.map(a => [a.id, true])));
    s.shoresVisited = idList(data.shoresVisited, SHORE_BY_ID);
    if (!s.shoresVisited.includes("home")) s.shoresVisited.unshift("home");
    s.shore = SHORE_BY_ID[data.shore] ? data.shore : "home";
    s.nextShore = SHORE_BY_ID[data.nextShore] ? data.nextShore : "home";
    s.seasonalUnlocks = idList(data.seasonalUnlocks, SEASON_BY_ID);
    const cos = obj(data.cosmetics);
    Object.keys(COSMETICS).forEach(slot => { if (COSMETICS[slot].some(c => c.id === cos[slot])) s.cosmetics[slot] = cos[slot]; });
    const L = obj(data.letters);
    if (typeof L.day === "string" && Array.isArray(L.list)) {
      s.letters.day = L.day;
      s.letters.bonus = L.bonus === true;
      s.letters.list = L.list.filter(l => l && LT_BY_ID[l.type]).slice(0, 3).map(l => ({
        type: l.type, target: Math.max(1, num(l.target)), base: num(l.base), claimed: l.claimed === true,
        sender: String(l.sender || "A friend").slice(0, 40), icon: String(l.icon || "🐧").slice(0, 8),
      }));
    }
    s.history = (Array.isArray(data.history) ? data.history : [])
      .filter(p => Array.isArray(p) && p.length === 2).map(([t, v]) => [num(t), num(v)]).slice(-HISTORY_LEN);
    const st = obj(data.stats);
    Object.keys(s.stats).forEach(k => { if (num(st[k]) > 0) s.stats[k] = num(st[k]); });
    const ds = defaultSettings(), inSet = obj(data.settings);
    Object.keys(ds).forEach(k => { if (typeof inSet[k] === typeof ds[k]) s.settings[k] = inSet[k]; });
    s.settings.volume = Math.min(1, Math.max(0, s.settings.volume));
    s.settings.shake = Math.min(1, Math.max(0, s.settings.shake));
    if (!TEXT_SIZES.includes(s.settings.textSize)) s.settings.textSize = 1;
    s.lastTick = num(data.lastTick) || now();
    return s;
  }

  // ---------- Storage (browser only) ----------
  let savingBlocked = false;   // set when the stored save is from a newer version, so we never clobber it
  const storage = () => { try { return typeof localStorage !== "undefined" ? localStorage : null; } catch (e) { return null; } };

  function save() {
    const ls = storage();
    if (savingBlocked || !ls) return false;
    try {
      S.lastTick = now();
      const prev = ls.getItem(SAVE_KEY);
      if (prev) ls.setItem(SAVE_KEY + "_bak", prev);   // keep the last good save
      ls.setItem(SAVE_KEY, encodeSave());
      return true;
    } catch (e) { return false; }
  }

  // Returns {title, body} to show the player if anything went wrong (fail loudly, never silently)
  function load() {
    const ls = storage();
    let raw = null, bak = null;
    if (ls) { try { raw = ls.getItem(SAVE_KEY); bak = ls.getItem(SAVE_KEY + "_bak"); } catch (e) { /* ignore */ } }
    if (!raw && !bak) { recompute(); return null; }
    try {
      S = decodeSave(raw);
      recompute();
      return null;
    } catch (e) {
      if (e.kind === "newer") {
        savingBlocked = true;
        recompute();
        return { kind: "newer", title: "This save is from a newer version", body: `<p>${e.message}</p><p class="muted">Nothing will be saved until you refresh, so your progress is safe.</p>` };
      }
      try {
        S = decodeSave(bak);
        recompute();
        return { kind: "backup", title: "We restored your backup", body: "<p>Your latest save couldn't be read, so we loaded the backup from a few moments earlier.</p>" };
      } catch (e2) {
        try { ls.setItem(SAVE_KEY + "_corrupt", raw || bak); } catch (e3) { /* ignore */ }
        S = freshState();
        recompute();
        return { kind: "corrupt", title: "Your save couldn't be loaded", body: `<p>Sorry! Your save and its backup were both unreadable, so you're starting a fresh colony.</p>
          <p class="muted">A copy of the damaged save was kept in this browser's storage under <code>${SAVE_KEY}_corrupt</code>.</p>` };
      }
    }
  }

  function replaceState(newState) {
    S = newState;
    S.buffs = [];
    S.lastTick = now();
    savingBlocked = false;
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
    state: { get: () => S, enumerable: true },
    M: { get: () => M, enumerable: true },
    savingBlocked: { get: () => savingBlocked, enumerable: true },
  });
  Object.assign(E, {
    MAX, bus, now,
    setSeasonOverride(v) { seasonOverride = v; recompute(); },
    defaultSettings, freshState, recompute, replaceState,
    has, milestonesReached, nodeLevel, nodeCost, nodeReqsMet, spendableFeathers, helperOn,
    researchLevel, researchCost, researchUnlocked, upgradeCost, currentSeason,
    buffMult, fishPerSecond, buildingFps, clickPower, costOf, maxAffordable, buildingVisible,
    featherTotalFor, pendingFeathers, nextFeatherAt, availableUpgrades, availableShores, bestBuilding,
    gain, clickPenguin, buyBuilding, buyUpgrade, buyAllUpgrades, buyResearch, learnNode, refundTree,
    hireHelper, toggleHelper, doMigrate, setNextShore,
    cosmeticItem, cosmeticUnlocked, setOutfit,
    goldenDelay, goldenEffect,
    dayKey, ensureLetters, letterProgress, letterReward, claimLetter, claimLetterBonus,
    checkAchievements, runHelpers, tick, applyOffline,
    encodeSave, decodeSave, save, load, SaveError,
  });
  PI.engine = E;
  PI.bus = bus;
})(typeof globalThis !== "undefined" ? (globalThis.PI = globalThis.PI || {}) : (window.PI = window.PI || {}));
