/* Penguin Idle — helper automation AI.
 * Algorithms and heuristics for Foreman Pip, Shopkeeper Barnaby, and Diver Marina.
 * Loads in both browser and Node environments.
 */
(function (PI) {
  "use strict";

  const D = PI.data, E = PI.engine;
  const S = () => E.state;
  const M = () => E.M;
  const { BUILDINGS, RESEARCH, HELPERS } = D;

  function diverPickSpot() {
    const strat = S().diverStrategy || "hunter";
    const available = D.DIVE_SPOTS.filter(s => E.diveSpotUnlocked(s));
    if (!available.length) return null;

    if (strat === "shallow") return available.some(s => s.id === "shallow") ? "shallow" : available[0].id;
    if (strat === "cavern") return available.some(s => s.id === "cavern") ? "cavern" : available[available.length - 1].id;
    if (strat === "abyss") return available.some(s => s.id === "abyss") ? "abyss" : available[available.length - 1].id;
    if (strat === "deepest") return available[available.length - 1].id;

    // Default: "hunter" (finds spot with most unowned/unmaxed relics)
    let bestSpot = available[available.length - 1];
    let bestUnmaxed = -1;
    for (const spot of available) {
      const pool = spot.relics || [];
      const unmaxedCount = pool.filter(rId => E.relicLevel(rId) < 3).length;
      if (unmaxedCount > bestUnmaxed) {
        bestUnmaxed = unmaxedCount;
        bestSpot = spot;
      }
    }
    return bestSpot.id;
  }

  function bestBuilding() {
    let best = null, bestScore = Infinity;
    BUILDINGS.forEach((b, i) => {
      if (!E.buildingVisible(b, i)) return;
      const score = E.costOf(b, S().buildings[b.id], 1) / Math.max(1e-9, E.buildingFps(b.id));
      if (score < bestScore) { bestScore = score; best = b; }
    });
    return best;
  }

  function buildingDeltaFps(b) {
    const owned = S().buildings[b.id] || 0;
    const currentUnitFps = M().bFps[b.id];
    const nextOwned = owned + 1;
    const msCrossed = E.milestonesReached(nextOwned) > E.milestonesReached(owned);
    if (msCrossed) {
      return currentUnitFps * (M().milestoneMult * nextOwned - owned);
    }
    return currentUnitFps;
  }

  function upgradeDeltaFps(u) {
    if (!u) return 0;
    if (u.kind === "building" && u.building) {
      return (M().bFps[u.building] || 0) * (S().buildings[u.building] || 0);
    }
    if (u.kind === "synergy" && u.pair) {
      const [a, b] = u.pair;
      const aBoost = 0.02 * Math.min(100, S().buildings[b] || 0) * (M().synergy || 1);
      const bBoost = 0.005 * Math.min(100, S().buildings[a] || 0) * (M().synergy || 1);
      return ((M().bFps[a] || 0) * (S().buildings[a] || 0) * aBoost) +
             ((M().bFps[b] || 0) * (S().buildings[b] || 0) * bBoost);
    }
    if (u.kind === "global" && u.pct) {
      return E.fishPerSecond(false) * (u.pct / 100);
    }
    if (u.kind === "scrapbook") {
      const per = [0.005, 0.01, 0.02][u.id.split("_")[1]] || 0.01;
      return E.fishPerSecond(false) * per * S().achievements.length;
    }
    return 1e-4;
  }

  // Shopkeeper Pip: picks upgrades based on player strategy ("impact" [default], "efficiency", "cheapest")
  const SHOPKEEPER_SAVE_SECS = 30;
  function shopkeeperPick() {
    const strat = S().shopkeeperStrategy || "impact";
    const available = E.availableUpgrades();
    if (!available.length) return null;

    if (strat === "cheapest") {
      const first = available[0];
      return S().fish >= E.upgradeCost(first) ? first : null;
    }

    if (strat === "efficiency") {
      let best = null, bestScore = Infinity;
      let aff = null, affScore = Infinity;
      for (const u of available) {
        const cost = E.upgradeCost(u);
        const delta = upgradeDeltaFps(u);
        const score = cost / Math.max(1e-9, delta);
        if (score < bestScore) { bestScore = score; best = u; }
        if (cost <= S().fish && score < affScore) { affScore = score; aff = u; }
      }
      if (!best || best === aff) return aff;
      const gap = E.upgradeCost(best) - S().fish;
      return gap / Math.max(1e-9, E.fishPerSecond(false)) <= SHOPKEEPER_SAVE_SECS ? null : aff;
    }

    // Default: "impact" (prioritizes raw highest boost to total production)
    let best = null, bestDelta = -1;
    let aff = null, affDelta = -1;
    for (const u of available) {
      const cost = E.upgradeCost(u);
      const delta = upgradeDeltaFps(u);
      if (delta > bestDelta) { bestDelta = delta; best = u; }
      if (cost <= S().fish && delta > affDelta) { affDelta = delta; aff = u; }
    }
    if (!best || best === aff) return aff;
    const gap = E.upgradeCost(best) - S().fish;
    return gap / Math.max(1e-9, E.fishPerSecond(false)) <= SHOPKEEPER_SAVE_SECS ? null : aff;
  }

  // Foreman Waddles: picks colony members based on the player's chosen strategy
  const FOREMAN_SAVE_SECS = 30;
  function foremanPick() {
    const strat = S().foremanStrategy || "impact";
    if (strat === "cheapest") {
      let cheap = null, minCost = Infinity;
      BUILDINGS.forEach((b, i) => {
        if (!E.buildingVisible(b, i)) return;
        const cost = E.costOf(b, S().buildings[b.id], 1);
        if (cost <= S().fish && cost < minCost) { minCost = cost; cheap = b; }
      });
      return cheap;
    }

    if (strat === "efficiency" || strat === "balanced") {
      let best = null, bestScore = Infinity, aff = null, affScore = Infinity;
      BUILDINGS.forEach((b, i) => {
        if (!E.buildingVisible(b, i)) return;
        const cost = E.costOf(b, S().buildings[b.id], 1);
        const score = cost / Math.max(1e-9, E.buildingFps(b.id));
        if (score < bestScore) { bestScore = score; best = b; }
        if (cost <= S().fish && score < affScore) { affScore = score; aff = b; }
      });
      if (!best || best === aff) return aff;
      const gap = E.costOf(best, S().buildings[best.id], 1) - S().fish;
      return gap / Math.max(1e-9, E.fishPerSecond(false)) <= FOREMAN_SAVE_SECS ? null : aff;
    }

    // Default: "impact"
    let best = null, bestDelta = -1;
    let aff = null, affDelta = -1;
    BUILDINGS.forEach((b, i) => {
      if (!E.buildingVisible(b, i)) return;
      const cost = E.costOf(b, S().buildings[b.id], 1);
      const delta = buildingDeltaFps(b);
      if (delta > bestDelta) { bestDelta = delta; best = b; }
      if (cost <= S().fish && delta > affDelta) { affDelta = delta; aff = b; }
    });
    if (!best || best === aff) return aff;
    const gap = E.costOf(best, S().buildings[best.id], 1) - S().fish;
    return gap / Math.max(1e-9, E.fishPerSecond(false)) <= FOREMAN_SAVE_SECS ? null : aff;
  }

  const helperTimers = {};
  function runHelpers(dt) {
    HELPERS.forEach(h => {
      if (!E.helperOn(h.id)) return;
      helperTimers[h.id] = (helperTimers[h.id] || 0) + dt;
      if (helperTimers[h.id] < h.every) return;
      helperTimers[h.id] = 0;
      let did = 0;
      if (h.id === "shopkeeper") {
        for (let k = 0; k < 10; k++) {
          const u = shopkeeperPick();
          if (!u || !E.buyUpgrade(u.id, null, true)) break;
          did++;
        }
        if (did) E.bus.emit("structure");
      }
      if (h.id === "foreman") {
        for (let k = 0; k < 25; k++) {
          const b = foremanPick();
          if (!b || !E.buyBuilding(b.id, 1, null, true)) break;
          did++;
        }
        if (did) E.bus.emit("structure");
      }
      if (h.id === "tinker") {
        for (let k = 0; k < 5; k++) {
          const r = RESEARCH.filter(x => E.researchUnlocked(x) && E.researchLevel(x.id) < x.max)
            .sort((a, b) => E.researchCost(a, E.researchLevel(a.id)) - E.researchCost(b, E.researchLevel(b.id)))[0];
          if (!r || !E.buyResearch(r.id, null, true)) break;
          did++;
        }
        if (did) E.bus.emit("structure");
      }
      if (h.id === "planner" && E.pendingFeathers() >= Math.max(1, S().feathersEarned)) {
        did = E.doMigrate(S().nextShore, true) ? 1 : 0;
      }
      if (h.id === "diver") {
        const active = E.activeDive ? E.activeDive() : null;
        if (active && active.ready) {
          E.claimDive(true);
          did++;
        }
        if (E.activeDive && !E.activeDive()) {
          const spotId = diverPickSpot();
          if (spotId && E.startDive(spotId, true)) {
            did++;
          }
        }
      }
      if (did) E.bus.emit("helperAct", { h, count: did });
    });
  }

  Object.assign(E, {
    diverPickSpot,
    bestBuilding,
    buildingDeltaFps,
    upgradeDeltaFps,
    shopkeeperPick,
    foremanPick,
    runHelpers,
  });

  PI.helpers = {
    diverPickSpot,
    bestBuilding,
    buildingDeltaFps,
    upgradeDeltaFps,
    shopkeeperPick,
    foremanPick,
    runHelpers,
  };
})(typeof globalThis !== "undefined" ? (globalThis.PI = globalThis.PI || {}) : (window.PI = window.PI || {}));
