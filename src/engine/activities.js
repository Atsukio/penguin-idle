/* Penguin Idle engine: campfire cooking and deep-sea diving.
 * Moved verbatim from engine.js; shared state is read through S() and M().
 * Loads in the browser and in Node (tools/load-engine.js). */
(function (PI) {
  "use strict";

  const E = PI.engine;
  const D = PI.data;
  const S = () => E.state;
  const M = () => E.M;
  const { now, bus, recompute, fishPerSecond, checkAchievements } = E;
  const save = () => (E.save ? E.save() : false);
  // ---------- Campfire Cooking ----------
  function recipeCost(r) {
    if (!r) return Infinity;
    const base = Math.max(r.minCost, Math.round(fishPerSecond(false) * 60 * r.costMins));
    return Math.max(r.minCost, Math.round(base * (M() && M().cookingCostMult ? M().cookingCostMult : 1)));
  }

  function recipeUnlocked(r) {
    if (!r) return false;
    return S().lifetimeFish >= (r.unlockLifetime || 0);
  }

  function activeDish() {
    if (!S().cooking || !S().cooking.id || S().cooking.until <= now()) return null;
    const r = D.COOKING_RECIPE_BY_ID[S().cooking.id];
    if (!r) return null;
    const remaining = Math.max(0, (S().cooking.until - now()) / 1000);
    return {
      ...r,
      remaining,
      startedAt: S().cooking.startedAt,
      until: S().cooking.until,
      frac: Math.max(0, Math.min(1, remaining / r.duration)),
    };
  }

  function cookRecipe(id, origin = null) {
    const r = D.COOKING_RECIPE_BY_ID[id];
    if (!r || !recipeUnlocked(r)) return false;
    const cost = recipeCost(r);
    if (S().fish < cost) return false;
    S().fish -= cost;
    const t = now();
    const durMult = M() && M().cookingDurationMult ? M().cookingDurationMult : 1;
    S().cooking = { id: r.id, until: t + (r.duration * durMult) * 1000, startedAt: t };
    S().stats.dishesCooked = (S().stats.dishesCooked || 0) + 1;
    recompute();
    bus.emit("structure");
    bus.emit("dishCooked", { recipe: r, cost, until: S().cooking.until, origin });
    checkAchievements();
    return true;
  }

  // ---------- The Ice Hole & Deep-Sea Diving ----------
  const diveSpotUnlocked = spot => (S().lifetimeFish || 0) >= (spot.unlockLifetime || 0);

  function activeDive() {
    if (!S().dive || !S().dive.spotId) return null;
    const spot = D.DIVE_SPOT_BY_ID[S().dive.spotId];
    if (!spot) return null;
    const t = now();
    const ready = S().dive.ready || (S().dive.until > 0 && S().dive.until <= t);
    const remaining = Math.max(0, Math.ceil((S().dive.until - t) / 1000));
    return {
      spot,
      spotId: S().dive.spotId,
      startedAt: S().dive.startedAt,
      until: S().dive.until,
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
    const durMult = M() && M().diveDurationMult ? M().diveDurationMult : 1;
    S().dive = { spotId, startedAt: t, until: t + (spot.duration * durMult) * 1000, ready: false };
    save();
    bus.emit("structure");
    bus.emit("diveStarted", { spot, auto });
    return true;
  }

  function claimDive(auto = false) {
    const active = activeDive();
    if (!active || !active.ready) return null;
    if (!S().relics) S().relics = {};
    const pool = active.spot.relics || [];
    const unowned = pool.filter(id => !S().relics[id]);
    let picked = null;
    let bonusFish = 0;
    if (unowned.length > 0) {
      picked = unowned[Math.floor(Math.random() * unowned.length)];
      S().relics[picked] = 1;
    } else {
      const unmaxed = pool.filter(id => (S().relics[id] || 0) < 3);
      if (unmaxed.length > 0) {
        picked = unmaxed[Math.floor(Math.random() * unmaxed.length)];
        S().relics[picked] = (S().relics[picked] || 0) + 1;
      } else {
        // All relics in this dive spot are 3-star: give generous bonus fish
        bonusFish = Math.max(500, Math.round(fishPerSecond() * 900));
        S().fish += bonusFish;
        S().runFish += bonusFish;
        S().lifetimeFish += bonusFish;
      }
    }
    S().stats.divesCompleted = (S().stats.divesCompleted || 0) + 1;
    S().dive = { spotId: "", startedAt: 0, until: 0, ready: false };
    recompute();
    checkAchievements();
    save();
    const relic = picked ? D.RELIC_BY_ID[picked] : null;
    const level = picked ? S().relics[picked] : 0;
    const result = { spot: active.spot, relic, level, bonusFish, auto };
    bus.emit("structure");
    bus.emit("relicFound", result);
    return result;
  }


  const api = { recipeCost, recipeUnlocked, activeDish, cookRecipe, diveSpotUnlocked, activeDive, startDive, claimDive };
  PI.engineActivities = api;
  Object.assign(E, api);
})(typeof globalThis !== "undefined" ? (globalThis.PI = globalThis.PI || {}) : (window.PI = window.PI || {}));
