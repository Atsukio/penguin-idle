/* Penguin Idle — Engine Math: Modifiers, production rates, purchase costs & feather scaling. */
(function (PI) {
  "use strict";

  const D = PI.data;
  const {
    BUILDINGS, UPGRADES, UP_BY_ID, RESEARCH, TREE, HELPERS,
    SHORES, SHORE_BY_ID, SEASONS, SEASON_BY_ID, MILESTONES, COST_GROWTH,
    FEATHER_SCALE, FEATHER_BONUS, ACH_BONUS, NAP_BONUS,
  } = D;

  const MAX = 1e300;
  const E = () => PI.engine;
  const S = () => PI.engine.state;
  const now = () => PI.engine.now();

  let M = null;
  let seasonOverride;
  let napping = false;
  let previewCache = null;

  const has = id => S().upgrades.includes(id);
  const milestonesReached = n => MILESTONES.filter(x => n >= x).length;
  const nodeLevel = id => (id === "spirit" ? 1 : S().heritage[id] || 0);
  const nodeCost = (n, L) => Math.round(n.cost * Math.pow(n.growth, L));
  const nodeReqsMet = n => (!n.requires || n.requires.every(r => nodeLevel(r) > 0)) &&
                           (!n.requiresAny || n.requiresAny.some(r => nodeLevel(r) > 0));
  const spendableFeathers = () => Math.max(0, S().feathersEarned - S().feathersSpent);
  function treeSpentOn(heritage) {
    let total = 0;
    TREE.forEach(n => { for (let l = 0; l < (heritage[n.id] || 0); l++) total += nodeCost(n, l); });
    return total;
  }
  const helpersSpentOn = helpers => HELPERS.reduce((a, h) => a + (h.id in helpers ? h.cost : 0), 0);
  const helperOn = id => S().helpers[id] === true;

  const researchLevel = id => S().research[id] || 0;
  const researchCost = (r, L) => r.cost * Math.pow(r.growth, L) * (M ? M.researchCost : 1);
  const researchUnlocked = r => S().runFish >= r.unlockAt || researchLevel(r.id) > 0;
  const upgradeCost = u => u.cost * (M ? M.upgradeCost : 1);

  function currentSeason(date = new Date(now())) {
    if (seasonOverride !== undefined) return seasonOverride ? SEASON_BY_ID[seasonOverride] || null : null;
    const md = (date.getMonth() + 1) * 100 + date.getDate();
    return SEASONS.find(se => {
      const a = se.from[0] * 100 + se.from[1], b = se.to[0] * 100 + se.to[1];
      return a <= b ? md >= a && md <= b : md >= a || md <= b;
    }) || null;
  }

  function setSeasonOverride(v) { seasonOverride = v; recompute(); }

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
    if (E().ensureDefaultNames) E().ensureDefaultNames();
    const s = S();
    const m = {
      building: Object.fromEntries(BUILDINGS.map(b => [b.id, 1])),
      click: 1, clickFps: 0, global: 1, goldenFreq: 1, goldenDur: 1,
      luckyMult: 1, rushMult: 7, critChance: 0, critMult: 10, costMult: 1, upgradeCost: 1, researchCost: 1,
      offlineEff: 0.25, offlineMult: 1, offlineCapH: 24, autoRate: 0, achBonus: ACH_BONUS, featherPer: FEATHER_BONUS,
      milestoneMult: 2, synergy: 1, featherGain: 1, napMult: 1 + NAP_BONUS, keepTiers: 0, startFish: 0, aurora: false, noGolden: false,
      start: Object.fromEntries(BUILDINGS.map(b => [b.id, 0])),
    };
    TREE.forEach(n => { const L = nodeLevel(n.id); if (L > 0) n.apply(m, L, s); });
    RESEARCH.forEach(r => { const L = researchLevel(r.id); if (L > 0) r.apply(m, L, s); });
    s.upgrades.forEach(id => UP_BY_ID[id] && UP_BY_ID[id].apply(m, s));
    m.shore = SHORE_BY_ID[s.shore] || SHORE_BY_ID.home;
    m.season = currentSeason();
    applyMods(m, m.shore.mods);
    if (m.season) applyMods(m, m.season.mods);
    BUILDINGS.forEach(b => { m.building[b.id] *= Math.pow(m.milestoneMult, milestonesReached(s.buildings[b.id])); });
    const stampsCount = (s.shoreStamps || []).length;
    if (stampsCount > 0) m.global *= (1 + 0.015 * stampsCount);
    if ((s.shoreStamps || []).includes("home")) m.warmthBonusExtra = 0.05;
    if ((s.shoreStamps || []).includes("krillbay")) m.building.krill *= 1.1;
    if ((s.shoreStamps || []).includes("sunnycove")) m.goldenDur *= 1.1;
    if ((s.shoreStamps || []).includes("blizzard")) m.featherGain *= 1.05;
    if ((s.shoreStamps || []).includes("aurorafields")) m.building.aurora *= 1.1;
    if ((s.shoreStamps || []).includes("quiethollow")) m.napMult += 0.05;
    if ((s.shoreStamps || []).includes("harbour")) m.costMult *= 0.97;
    if ((s.shoreStamps || []).includes("rookery")) m.researchCost *= 0.95;
    const curDish = s.cooking && s.cooking.id ? D.COOKING_RECIPE_BY_ID[s.cooking.id] : null;
    if (curDish && s.cooking.until > now()) {
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
    if (s.relics) {
      const relL = id => s.relics[id] || 0;
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
    m.goldenFreq = Math.min(4, m.goldenFreq);
    m.goldenDur = Math.min(4, m.goldenDur);
    m.luckyMult = Math.min(4, m.luckyMult);
    m.offlineEff = Math.min(1.5, m.offlineEff);
    m.feather = 1 + s.feathersEarned * m.featherPer;
    m.ach = 1 + s.achievements.length * m.achBonus;
    m.bFps = {};
    let total = 0;
    BUILDINGS.forEach(b => {
      const v = Math.min(MAX, b.baseFps * m.building[b.id] * m.global * m.feather * m.ach);
      m.bFps[b.id] = v;
      total += v * s.buildings[b.id];
    });
    m.baseFps = Math.min(MAX, total);
    M = m;
  }

  const setNapping = on => { napping = !!on; };
  const napMult = () => (M ? M.napMult : 1);

  function buffMult(type) {
    const t = now();
    let k = 1;
    for (const b of S().buffs) if (b.type === type && b.until > t) k *= b.mult;
    return k;
  }

  const fishPerSecond = (withBuffs = true) => (withBuffs ? Math.min(MAX, (M ? M.baseFps : 0) * buffMult("prod") * (napping ? M.napMult : 1)) : (M ? M.baseFps : 0));
  const buildingFps = id => (M ? M.bFps[id] : 0);
  const clickPower = () => Math.min(MAX, ((M ? M.click * M.feather : 1) + fishPerSecond() * (M ? M.clickFps : 0)) * buffMult("click"));

  function costOf(b, owned, n) {
    const first = b.baseCost * Math.pow(COST_GROWTH, owned) * (M ? M.costMult : 1);
    return first * (Math.pow(COST_GROWTH, n) - 1) / (COST_GROWTH - 1);
  }
  function maxAffordable(b) {
    const first = b.baseCost * Math.pow(COST_GROWTH, S().buildings[b.id]) * (M ? M.costMult : 1);
    return Math.max(0, Math.floor(Math.log(S().fish * (COST_GROWTH - 1) / first + 1) / Math.log(COST_GROWTH)));
  }

  function previewBuy(id, n) {
    const owned = S().buildings[id];
    if (previewCache && previewCache.m === M && previewCache.id === id && previewCache.n === n && previewCache.owned === owned) return previewCache.out;
    const before = M;
    S().buildings[id] = owned + n;
    let after;
    try { recompute(); after = M; } finally { S().buildings[id] = owned; M = before; }
    const out = {
      owned: owned + n,
      each: after.bFps[id], total: after.bFps[id] * (owned + n),
      fps: after.baseFps, fpsGain: after.baseFps - before.baseFps,
      milestones: milestonesReached(owned + n) - milestonesReached(owned),
    };
    previewCache = { m: before, id, n, owned, out };
    return out;
  }

  const buildingVisible = (b, i) => S().buildings[b.id] > 0 || i === 0 || S().buildings[BUILDINGS[i - 1].id] > 0 || S().runFish >= b.baseCost * 0.5;
  const featherTotalFor = lifetime => Math.floor(Math.cbrt(Math.max(0, lifetime) / FEATHER_SCALE) * (M ? M.featherGain : 1));
  const pendingFeathers = () => Math.max(0, featherTotalFor(S().lifetimeFish) - S().feathersEarned + (S().bonusFeathers || 0));
  const nextFeatherAt = () => Math.pow((Math.max(featherTotalFor(S().lifetimeFish), S().feathersEarned) + 1) / (M ? M.featherGain : 1), 3) * FEATHER_SCALE;
  const availableUpgrades = () => UPGRADES.filter(u => !has(u.id) && u.unlocked(S())).sort((a, b) => upgradeCost(a) - upgradeCost(b));

  function nextGoal() {
    const opts = [];
    let mystery = false;
    BUILDINGS.forEach((b, i) => {
      const cost = costOf(b, S().buildings[b.id], 1);
      if (buildingVisible(b, i)) opts.push({ kind: "building", id: b.id, icon: b.icon, name: b.name, cost });
      else if (!mystery) { mystery = true; opts.push({ kind: "building", id: b.id, icon: "❔", name: "a new colony member", cost }); }
    });
    availableUpgrades().slice(0, 12).forEach(u => opts.push({ kind: "upgrade", id: u.id, icon: u.icon, name: u.name, cost: upgradeCost(u) }));
    const waiting = opts.filter(o => o.cost > S().fish).sort((a, b) => a.cost - b.cost);
    const goal = waiting[0];
    if (!goal) return null;
    const need = goal.cost - S().fish, fps = fishPerSecond();
    return { ...goal, need, secs: fps > 0 ? need / fps : null };
  }

  const availableShores = () => SHORES.filter(sh => S().migrations + 1 >= sh.unlockAt);

  const math = {
    get M() { return M; },
    has,
    milestonesReached,
    nodeLevel,
    nodeCost,
    nodeReqsMet,
    spendableFeathers,
    treeSpentOn,
    helpersSpentOn,
    helperOn,
    researchLevel,
    researchCost,
    researchUnlocked,
    upgradeCost,
    currentSeason,
    setSeasonOverride,
    applyMods,
    recompute,
    setNapping,
    napMult,
    buffMult,
    fishPerSecond,
    buildingFps,
    clickPower,
    costOf,
    maxAffordable,
    previewBuy,
    buildingVisible,
    featherTotalFor,
    pendingFeathers,
    nextFeatherAt,
    availableUpgrades,
    nextGoal,
    availableShores,
  };

  PI.engineMath = math;
  PI.engine = PI.engine || {};
  Object.assign(PI.engine, math);
  Object.defineProperty(PI.engine, "M", { get: () => M, enumerable: true, configurable: true });
})(typeof window !== "undefined" ? (window.PI = window.PI || {}) : (globalThis.PI = globalThis.PI || {}));
