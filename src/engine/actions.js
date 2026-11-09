/* Penguin Idle engine: colony purchases, research, heirlooms, helpers and migration.
 * Moved verbatim from engine.js; shared state is read through S() and M().
 * Loads in the browser and in Node (tools/load-engine.js). */
(function (PI) {
  "use strict";

  const E = PI.engine;
  const D = PI.data;
  const { B_BY_ID, UP_BY_ID, R_BY_ID, H_BY_ID, HELPER_BY_ID, SHORE_BY_ID, FOREMAN_STRATEGY_BY_ID, SHOPKEEPER_STRATEGY_BY_ID } = PI.data;
  const S = () => E.state;
  const M = () => E.M;
  const { now, bus, has, milestonesReached, nodeLevel, nodeCost, nodeReqsMet, spendableFeathers, helpersSpentOn, researchLevel, researchCost, researchUnlocked, upgradeCost, recompute, costOf, pendingFeathers, availableUpgrades, availableShores, manualPatTimes, checkAchievements, checkPassportStamps } = E;
  const save = () => (E.save ? E.save() : false);
  function buyBuilding(id, n = 1, origin = null, quiet = false) {
    const b = B_BY_ID[id];
    if (!b || n < 1) return false;
    const cost = costOf(b, S().buildings[id], n);
    if (S().fish < cost) return false;
    const before = milestonesReached(S().buildings[id]);
    S().fish -= cost;
    S().buildings[id] += n;
    S().stats.buildingsBought += n;
    const gained = milestonesReached(S().buildings[id]) - before;
    recompute();
    if (!quiet) {
      bus.emit("structure");
      bus.emit("buyBuilding", { id, n, origin });
    }
    if (gained > 0) bus.emit("milestone", { b, mult: Math.pow(M().milestoneMult, gained), origin, quiet });
    checkPassportStamps();
    return true;
  }

  function buyUpgrade(id, origin = null, quiet = false) {
    const u = UP_BY_ID[id];
    if (!u || has(id) || !u.unlocked(S())) return false;
    const cost = upgradeCost(u);
    if (S().fish < cost) return false;
    S().fish -= cost;
    S().upgrades.push(id);
    S().stats.upgradesBought++;
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
      if (S().fish < upgradeCost(u)) break;   // sorted by cost, so nothing later is affordable
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
    if (S().fish < cost) return false;
    S().fish -= cost;
    S().research[id] = L + 1;
    S().stats.researchBought++;
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
    S().feathersSpent += cost;
    S().heritage[id] = L + 1;
    recompute();
    bus.emit("structure");
    bus.emit("learnNode", { n, level: L + 1, origin });
    return true;
  }

  function refundTree() {
    S().heritage = {};
    S().feathersSpent = helpersSpentOn(S().helpers);   // helpers aren't refunded, only the tree
    recompute();
    bus.emit("structure");
    bus.emit("respec");
  }

  function hireHelper(id, origin = null) {
    const h = HELPER_BY_ID[id];
    if (!h || id in S().helpers || spendableFeathers() < h.cost) return false;
    S().feathersSpent += h.cost;
    S().helpers[id] = true;
    bus.emit("structure");
    bus.emit("hireHelper", { h, origin });
    return true;
  }

  function toggleHelper(id) {
    if (!(id in S().helpers)) return;
    S().helpers[id] = !S().helpers[id];
    bus.emit("structure");
  }

  function setForemanStrategy(id) {
    if (!FOREMAN_STRATEGY_BY_ID[id]) return false;
    S().foremanStrategy = id;
    save();
    bus.emit("foremanStrategy", id);
    bus.emit("structure");
    return true;
  }

  function setShopkeeperStrategy(id) {
    if (!SHOPKEEPER_STRATEGY_BY_ID[id]) return false;
    S().shopkeeperStrategy = id;
    save();
    bus.emit("shopkeeperStrategy", id);
    bus.emit("structure");
    return true;
  }

  function setDiverStrategy(id) {
    if (!D.DIVER_STRATEGY_BY_ID[id]) return false;
    S().diverStrategy = id;
    save();
    bus.emit("diverStrategy", id);
    bus.emit("structure");
    return true;
  }

  function doMigrate(shoreId = "home", auto = false) {
    const gainF = pendingFeathers();
    if (gainF < 1) return false;
    const shore = availableShores().find(sh => sh.id === shoreId) || SHORE_BY_ID.home;
    const prevShore = S().shore;
    if (prevShore === "blizzard") {
      S().stats.blizzardMigrateFeathers = Math.max(S().stats.blizzardMigrateFeathers || 0, gainF);
      if (gainF >= 15 && !(S().shoreStamps || []).includes("blizzard")) {
        if (!S().shoreStamps) S().shoreStamps = [];
        if (!S().shoreStampDates) S().shoreStampDates = {};
        S().shoreStamps.push("blizzard");
        S().shoreStampDates.blizzard = now();
        const stamp = D.PASSPORT_STAMP_BY_ID.blizzard;
        bus.emit("passportStamp", { stamp, shore: SHORE_BY_ID.blizzard });
        checkAchievements();
      }
    }
    S().feathersEarned += gainF;
    S().bonusFeathers = 0;
    S().migrations++;
    const keep = S().upgrades.filter(id => {
      const [b, t] = id.split("_");
      return B_BY_ID[b] && Number(t) < M().keepTiers;
    });
    S().fish = M().startFish;
    S().runFish = 0;
    S().buildings = { ...M().start };
    S().upgrades = keep;
    S().research = {};
    S().buffs = [];
    S().shore = shore.id;
    if (!S().shoresVisited.includes(shore.id)) S().shoresVisited.push(shore.id);
    S().stats.runStartedAt = now();
    manualPatTimes.length = 0;
    recompute();
    bus.emit("structure");
    bus.emit("migrate", { feathers: S().feathersEarned, gained: gainF, shore, auto });
    return true;
  }

  function setNextShore(id) {
    if (availableShores().some(sh => sh.id === id)) { S().nextShore = id; bus.emit("structure"); }
  }


  const api = { buyBuilding, buyUpgrade, buyAllUpgrades, buyResearch, learnNode, refundTree, hireHelper, toggleHelper, setForemanStrategy, setShopkeeperStrategy, setDiverStrategy, doMigrate, setNextShore };
  PI.engineActions = api;
  Object.assign(E, api);
})(typeof globalThis !== "undefined" ? (globalThis.PI = globalThis.PI || {}) : (window.PI = window.PI || {}));
