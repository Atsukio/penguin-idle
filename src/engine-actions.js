/* Penguin Idle — Engine Actions: Colony purchases, research, heirloom learning, helpers & migration. */
(function (PI) {
  "use strict";

  const D = PI.data;
  const E = () => PI.engine;
  const S = () => PI.engine.state;
  const bus = () => PI.engine.bus;
  const now = () => PI.engine.now();

  function buyBuilding(id, n = 1, origin = null, quiet = false) {
    const b = D.B_BY_ID[id];
    if (!b || n < 1) return false;
    const cost = E().costOf(b, S().buildings[id], n);
    if (S().fish < cost) return false;
    const before = E().milestonesReached(S().buildings[id]);
    S().fish -= cost;
    S().buildings[id] += n;
    S().stats.buildingsBought += n;
    const gained = E().milestonesReached(S().buildings[id]) - before;
    E().recompute();
    if (!quiet) {
      bus().emit("structure");
      bus().emit("buyBuilding", { id, n, origin });
    }
    if (gained > 0) bus().emit("milestone", { b, mult: Math.pow(E().M.milestoneMult, gained), origin, quiet });
    E().checkPassportStamps();
    return true;
  }

  function buyUpgrade(id, origin = null, quiet = false) {
    const u = D.UP_BY_ID[id];
    if (!u || E().has(id) || !u.unlocked(S())) return false;
    const cost = E().upgradeCost(u);
    if (S().fish < cost) return false;
    S().fish -= cost;
    S().upgrades.push(id);
    S().stats.upgradesBought++;
    E().recompute();
    if (!quiet) {
      bus().emit("structure");
      bus().emit("buyUpgrade", { u, origin });
    }
    return true;
  }

  function buyAllUpgrades(origin = null, quiet = false) {
    let count = 0;
    for (const u of E().availableUpgrades()) {
      if (S().fish < E().upgradeCost(u)) break;
      if (buyUpgrade(u.id, null, true)) count++;
    }
    if (count) {
      bus().emit("structure");
      if (!quiet) bus().emit("buyAll", { count, origin });
    }
    return count;
  }

  function buyResearch(id, origin = null, quiet = false) {
    const r = D.R_BY_ID[id], L = E().researchLevel(id);
    if (!r || L >= r.max || !E().researchUnlocked(r)) return false;
    const cost = E().researchCost(r, L);
    if (S().fish < cost) return false;
    S().fish -= cost;
    S().research[id] = L + 1;
    S().stats.researchBought++;
    E().recompute();
    if (!quiet) {
      bus().emit("structure");
      bus().emit("buyResearch", { r, level: L + 1, origin });
    }
    E().checkPassportStamps();
    return true;
  }

  function learnNode(id, origin = null) {
    const n = D.H_BY_ID[id], L = E().nodeLevel(id);
    if (!n || id === "spirit" || L >= n.max || !E().nodeReqsMet(n)) return false;
    const cost = E().nodeCost(n, L);
    if (E().spendableFeathers() < cost) return false;
    S().feathersSpent += cost;
    S().heritage[id] = L + 1;
    E().recompute();
    bus().emit("structure");
    bus().emit("learnNode", { n, level: L + 1, origin });
    return true;
  }

  function refundTree() {
    S().heritage = {};
    S().feathersSpent = E().helpersSpentOn(S().helpers);
    E().recompute();
    bus().emit("structure");
    bus().emit("respec");
  }

  function hireHelper(id, origin = null) {
    const h = D.HELPER_BY_ID[id];
    if (!h || id in S().helpers || E().spendableFeathers() < h.cost) return false;
    S().feathersSpent += h.cost;
    S().helpers[id] = true;
    bus().emit("structure");
    bus().emit("hireHelper", { h, origin });
    return true;
  }

  function toggleHelper(id) {
    if (!(id in S().helpers)) return;
    S().helpers[id] = !S().helpers[id];
    bus().emit("structure");
  }

  function setForemanStrategy(id) {
    if (!D.FOREMAN_STRATEGY_BY_ID[id]) return false;
    S().foremanStrategy = id;
    E().save();
    bus().emit("foremanStrategy", id);
    bus().emit("structure");
    return true;
  }

  function setShopkeeperStrategy(id) {
    if (!D.SHOPKEEPER_STRATEGY_BY_ID[id]) return false;
    S().shopkeeperStrategy = id;
    E().save();
    bus().emit("shopkeeperStrategy", id);
    bus().emit("structure");
    return true;
  }

  function setDiverStrategy(id) {
    if (!D.DIVER_STRATEGY_BY_ID[id]) return false;
    S().diverStrategy = id;
    E().save();
    bus().emit("diverStrategy", id);
    bus().emit("structure");
    return true;
  }

  function doMigrate(shoreId = "home", auto = false) {
    const gainF = E().pendingFeathers();
    if (gainF < 1) return false;
    const shore = E().availableShores().find(sh => sh.id === shoreId) || D.SHORE_BY_ID.home;
    const prevShore = S().shore;
    if (prevShore === "blizzard") {
      S().stats.blizzardMigrateFeathers = Math.max(S().stats.blizzardMigrateFeathers || 0, gainF);
      if (gainF >= 15 && !(S().shoreStamps || []).includes("blizzard")) {
        if (!S().shoreStamps) S().shoreStamps = [];
        if (!S().shoreStampDates) S().shoreStampDates = {};
        S().shoreStamps.push("blizzard");
        S().shoreStampDates.blizzard = now();
        const stamp = D.PASSPORT_STAMP_BY_ID.blizzard;
        bus().emit("passportStamp", { stamp, shore: D.SHORE_BY_ID.blizzard });
        E().checkAchievements();
      }
    }
    S().feathersEarned += gainF;
    S().bonusFeathers = 0;
    S().migrations++;
    const keep = S().upgrades.filter(id => {
      const [b, t] = id.split("_");
      return D.B_BY_ID[b] && Number(t) < E().M.keepTiers;
    });
    S().fish = E().M.startFish;
    S().runFish = 0;
    S().buildings = { ...E().M.start };
    S().upgrades = keep;
    S().research = {};
    S().buffs = [];
    S().shore = shore.id;
    if (!S().shoresVisited.includes(shore.id)) S().shoresVisited.push(shore.id);
    S().stats.runStartedAt = now();
    if (E().clearManualPats) E().clearManualPats();
    E().recompute();
    bus().emit("structure");
    bus().emit("migrate", { feathers: S().feathersEarned, gained: gainF, shore, auto });
    return true;
  }

  function setNextShore(id) {
    if (E().availableShores().some(sh => sh.id === id)) { S().nextShore = id; bus().emit("structure"); }
  }

  const actions = {
    buyBuilding,
    buyUpgrade,
    buyAllUpgrades,
    buyResearch,
    learnNode,
    refundTree,
    hireHelper,
    toggleHelper,
    setForemanStrategy,
    setShopkeeperStrategy,
    setDiverStrategy,
    doMigrate,
    setNextShore,
  };

  PI.engineActions = actions;
  PI.engine = PI.engine || {};
  Object.assign(PI.engine, actions);
})(typeof window !== "undefined" ? (window.PI = window.PI || {}) : (globalThis.PI = globalThis.PI || {}));
