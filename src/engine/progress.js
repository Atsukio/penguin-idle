/* Penguin Idle engine: memories (achievements) and shore passport stamps.
 * Moved verbatim from engine.js; shared state is read through S() and M().
 * Loads in the browser and in Node (tools/load-engine.js). */
(function (PI) {
  "use strict";

  const E = PI.engine;
  const D = PI.data;
  const { ACHIEVEMENTS, SHORE_BY_ID, totalColony } = PI.data;
  const S = () => E.state;
  const { now, bus, recompute, pendingFeathers } = E;
  // ---------- Achievements ----------
  // Progress of one memory as { cur, goal, kind, frac }, or null if it is a one-off goal
  function memoryProgress(a) {
    if (!a.prog) return null;
    const [cur, goal, kind] = a.prog(S(), E);
    return { cur: Math.min(cur, goal), goal, kind, frac: Math.max(0, Math.min(1, cur / goal)) };
  }
  // Locked memories that have a progress bar, closest to done first
  function nearestMemories(limit = 3, minFrac = 0) {
    return ACHIEVEMENTS.filter(a => a.prog && !S().achievements.includes(a.id))
      .map(a => ({ a, ...memoryProgress(a) })).filter(m => m.frac >= minFrac && m.frac < 1)
      .sort((x, y) => y.frac - x.frac).slice(0, limit);
  }
  // Called when the player leaves the Memories tab: the New markers go away
  function clearNewMemories() { S().achNew = []; }
  function checkAchievements() {
    const fresh = ACHIEVEMENTS.filter(a => !S().achievements.includes(a.id) && a.check(S(), E));
    if (!fresh.length) return [];
    fresh.forEach(a => { S().achievements.push(a.id); S().achDates[a.id] = now(); S().achNew.push(a.id); });
    recompute();
    bus.emit("structure");
    bus.emit("achievements", fresh);
    return fresh;
  }

  // ---------- Shore Passport Stamps ----------
  function passportProgress(stampId) {
    const stamp = D.PASSPORT_STAMP_BY_ID[stampId];
    if (!stamp) return null;
    const done = (S().shoreStamps || []).includes(stampId);
    let cur = 0;
    const target = stamp.target;
    if (done) {
      cur = target;
    } else if (S().migrations < 1) {
      cur = 0;
    } else {
      if (stampId === "home") cur = S().shore === "home" ? totalColony(S()) : 0;
      else if (stampId === "krillbay") cur = S().shore === "krillbay" ? (S().buildings.krill || 0) : 0;
      else if (stampId === "sunnycove") cur = S().stats.sunnyCatches || 0;
      else if (stampId === "blizzard") cur = S().shore === "blizzard" ? pendingFeathers() : (S().stats.blizzardMigrateFeathers || 0);
      else if (stampId === "aurorafields") cur = S().shore === "aurorafields" ? (S().buildings.aurora || 0) : 0;
      else if (stampId === "quiethollow") cur = S().stats.quietSeconds || 0;
      else if (stampId === "harbour") cur = S().shore === "harbour" ? totalColony(S()) : 0;
      else if (stampId === "rookery") cur = S().shore === "rookery" ? Object.values(S().research).reduce((a, b) => a + b, 0) : 0;
    }
    const frac = done ? 1 : Math.max(0, Math.min(1, cur / target));
    return { cur, target, done, frac, time: stamp.time || false };
  }

  function checkPassportStamps() {
    if (S().migrations < 1) return [];
    const currentShore = S().shore;
    if (!currentShore || (S().shoreStamps || []).includes(currentShore)) return [];
    const p = passportProgress(currentShore);
    if (p && p.cur >= p.target) {
      if (!S().shoreStamps) S().shoreStamps = [];
      if (!S().shoreStampDates) S().shoreStampDates = {};
      S().shoreStamps.push(currentShore);
      S().shoreStampDates[currentShore] = now();
      recompute();
      const stamp = D.PASSPORT_STAMP_BY_ID[currentShore];
      bus.emit("structure");
      bus.emit("passportStamp", { stamp, shore: SHORE_BY_ID[currentShore] });
      checkAchievements();
      return [currentShore];
    }
    return [];
  }


  const api = { memoryProgress, nearestMemories, clearNewMemories, checkAchievements, passportProgress, checkPassportStamps };
  PI.engineProgress = api;
  Object.assign(E, api);
})(typeof globalThis !== "undefined" ? (globalThis.PI = globalThis.PI || {}) : (window.PI = window.PI || {}));
