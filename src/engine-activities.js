/* Penguin Idle — Engine Activities: Campfire Kettle Cooking & Deep-Sea Diving.
 * Computes recipe costs, duration, active simmering bonuses,
 * and deep-sea diving expeditions with 3-star relic discovery progression.
 */
(function (PI) {
  "use strict";

  const D = PI.data;
  const E = () => PI.engine;
  const S = () => PI.engine.state;
  const M = () => PI.engine.M;
  const bus = () => PI.engine.bus;
  const now = () => PI.engine.now();

  // ---------- Campfire Cooking ----------
  function recipeCost(r) {
    if (!r) return Infinity;
    const base = Math.max(r.minCost, Math.round(E().fishPerSecond(false) * 60 * r.costMins));
    const m = M();
    return Math.max(r.minCost, Math.round(base * (m && m.cookingCostMult ? m.cookingCostMult : 1)));
  }

  function recipeUnlocked(r) {
    if (!r) return false;
    return (S().lifetimeFish || 0) >= (r.unlockLifetime || 0);
  }

  function activeDish() {
    const s = S();
    if (!s.cooking || !s.cooking.id || s.cooking.until <= now()) return null;
    const r = D.COOKING_RECIPE_BY_ID[s.cooking.id];
    if (!r) return null;
    const remaining = Math.max(0, (s.cooking.until - now()) / 1000);
    return {
      ...r,
      remaining,
      startedAt: s.cooking.startedAt,
      until: s.cooking.until,
      frac: Math.max(0, Math.min(1, remaining / r.duration)),
    };
  }

  function cookRecipe(id, origin = null) {
    const r = D.COOKING_RECIPE_BY_ID[id];
    if (!r || !recipeUnlocked(r)) return false;
    const cost = recipeCost(r);
    const s = S();
    if (s.fish < cost) return false;
    s.fish -= cost;
    const t = now();
    const m = M();
    const durMult = m && m.cookingDurationMult ? m.cookingDurationMult : 1;
    s.cooking = { id: r.id, until: t + (r.duration * durMult) * 1000, startedAt: t };
    s.stats.dishesCooked = (s.stats.dishesCooked || 0) + 1;
    E().recompute();
    bus().emit("structure");
    bus().emit("dishCooked", { recipe: r, cost, until: s.cooking.until, origin });
    if (E().checkAchievements) E().checkAchievements();
    return true;
  }

  // ---------- The Ice Hole & Deep-Sea Diving ----------
  const diveSpotUnlocked = spot => (S().lifetimeFish || 0) >= (spot.unlockLifetime || 0);

  function activeDive() {
    const s = S();
    if (!s.dive || !s.dive.spotId) return null;
    const spot = D.DIVE_SPOT_BY_ID[s.dive.spotId];
    if (!spot) return null;
    const t = now();
    const ready = s.dive.ready || (s.dive.until > 0 && s.dive.until <= t);
    const remaining = Math.max(0, Math.ceil((s.dive.until - t) / 1000));
    return {
      spot,
      spotId: s.dive.spotId,
      startedAt: s.dive.startedAt,
      until: s.dive.until,
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
    const m = M();
    const durMult = m && m.diveDurationMult ? m.diveDurationMult : 1;
    const s = S();
    s.dive = { spotId, startedAt: t, until: t + (spot.duration * durMult) * 1000, ready: false };
    if (E().save) E().save();
    bus().emit("structure");
    bus().emit("diveStarted", { spot, auto });
    return true;
  }

  function claimDive(auto = false) {
    const active = activeDive();
    if (!active || !active.ready) return null;
    const s = S();
    if (!s.relics) s.relics = {};
    const pool = active.spot.relics || [];
    const unowned = pool.filter(id => !s.relics[id]);
    let picked = null;
    let bonusFish = 0;
    if (unowned.length > 0) {
      picked = unowned[Math.floor(Math.random() * unowned.length)];
      s.relics[picked] = 1;
    } else {
      const unmaxed = pool.filter(id => (s.relics[id] || 0) < 3);
      if (unmaxed.length > 0) {
        picked = unmaxed[Math.floor(Math.random() * unmaxed.length)];
        s.relics[picked] = (s.relics[picked] || 0) + 1;
      } else {
        bonusFish = Math.max(500, Math.round(E().fishPerSecond() * 900));
        s.fish += bonusFish;
        s.runFish += bonusFish;
        s.lifetimeFish += bonusFish;
      }
    }
    s.stats.divesCompleted = (s.stats.divesCompleted || 0) + 1;
    s.dive = { spotId: "", startedAt: 0, until: 0, ready: false };
    E().recompute();
    if (E().checkAchievements) E().checkAchievements();
    if (E().save) E().save();
    const relic = picked ? D.RELIC_BY_ID[picked] : null;
    const level = picked ? s.relics[picked] : 0;
    const result = { spot: active.spot, relic, level, bonusFish, auto };
    bus().emit("structure");
    bus().emit("relicFound", result);
    return result;
  }

  const relicLevel = id => (S().relics && S().relics[id]) || 0;

  const activities = {
    recipeCost,
    recipeUnlocked,
    activeDish,
    cookRecipe,
    diveSpotUnlocked,
    activeDive,
    startDive,
    claimDive,
    relicLevel,
  };

  PI.engineActivities = activities;

  // Delegate on PI.engine
  PI.engine = PI.engine || {};
  Object.assign(PI.engine, activities);
})(typeof window !== "undefined" ? (window.PI = window.PI || {}) : (globalThis.PI = globalThis.PI || {}));
